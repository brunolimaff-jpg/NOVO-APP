import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

const HistoryItemSchema = z.object({
  role: z.enum(['user', 'model']),
  text: z.string(),
});

const GeminiRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('health') }),
  z.object({
    action: z.literal('generateContent'),
    model: z.string().min(1).max(200).optional(),
    contents: z.unknown(),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal('chatSendMessage'),
    model: z.string().min(1).max(200).optional(),
    systemInstruction: z.string().max(100000).optional(),
    history: z.array(HistoryItemSchema).optional(),
    message: z.string().min(1).max(200000),
    useGrounding: z.boolean().optional(),
    thinkingMode: z.boolean().optional(),
  }),
]);

export const config = {
  runtime: 'nodejs',
};

export const maxDuration = 300;
const CHAT_TIMEOUT_MS = 55_000;
const LONG_CHAT_TIMEOUT_MS = 180_000;

// Modelos prioritários conforme lista de disponibilidade 2025/2026
const MODEL_CASCADING_ORDER = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

function getApiKeys(): string[] {
  const primary = process.env.GEMINI_API_KEY;
  const fallback = process.env.GEMINI_API_KEY_FALLBACK;
  const keys = [primary, fallback].filter((k): k is string => Boolean(k));
  if (keys.length === 0) throw new Error('Missing required env var: GEMINI_API_KEY');
  return keys;
}

function isQuotaExhausted(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|check quota|rate.?limit/i.test(msg) || /\"code\"\s*:\s*429/.test(msg);
}

function isModelNotFound(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /models\/.*is not found|404|not found/i.test(msg);
}

function toNumberSafe(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeHistory(
  input: Array<{ role: 'user' | 'model'; text: string }> | undefined,
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  if (!input) return [];
  return input
    .map((item) => ({ 
      role: item.role === 'model' ? 'model' : 'user' as any, 
      parts: [{ text: item.text }] 
    }))
    .filter((msg) => msg.parts[0].text.trim().length > 0);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function extractGeminiHttpStatus(error: unknown): number {
  if (error instanceof Error) {
    const msg = error.message;
    if (/\"code\"\s*:\s*429/.test(msg) || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(msg)) return 429;
    if (/404|not found/i.test(msg)) return 404;
  }
  const err = error as Record<string, unknown>;
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 600) return err.status;
  return 500;
}

type ParsedBody = z.infer<typeof GeminiRequestSchema>;

async function executeGeminiAction(
  ai: GoogleGenAI,
  body: ParsedBody,
  res: VercelResponse,
  modelOverride?: string
): Promise<VercelResponse> {
  const selectedModel = modelOverride || body.model || DEFAULT_GEMINI_MODEL;
  console.log(`[GeminiAPI] Executando ${body.action} com modelo: ${selectedModel}`);
  
  switch (body.action) {
    case 'health': {
      const model = ai.getGenerativeModel({ model: selectedModel });
      const response = await model.generateContent('OK');
      return res.status(200).json({ ok: true, text: response.response.text() });
    }

    case 'generateContent': {
      const model = ai.getGenerativeModel({ model: selectedModel });
      const response = await model.generateContent({
        contents: body.contents as any,
        generationConfig: {
          temperature: toNumberSafe(body.config?.temperature, 0.2),
          maxOutputTokens: toNumberSafe(body.config?.maxOutputTokens, 65536),
        }
      });
      return res.status(200).json({ text: response.response.text() });
    }

    case 'chatSendMessage': {
      const model = ai.getGenerativeModel({
        model: selectedModel,
        systemInstruction: body.systemInstruction,
      });

      const chat = model.startChat({
        history: normalizeHistory(body.history),
        generationConfig: {
          temperature: body.thinkingMode ? 0.1 : 0.15,
          maxOutputTokens: 65536,
        },
        tools: body.useGrounding ? [{ googleSearch: {} }] : undefined as any
      });

      const timeout = body.useGrounding ? CHAT_TIMEOUT_MS : LONG_CHAT_TIMEOUT_MS;
      const result = await withTimeout(chat.sendMessage(body.message), timeout, 'gemini-call');
      
      const groundingChunks = result.response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      return res.status(200).json({
        text: result.response.text(),
        groundingChunks,
        groundingUsed: (body.useGrounding ?? true) && groundingChunks.length > 0,
      });
    }

    default:
      return res.status(400).json({ error: 'Unsupported action' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const parsed = GeminiRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });

    const body = parsed.data;
    const keys = getApiKeys();
    let lastError: any = new Error('No models or keys available');

    for (const key of keys) {
      const ai = new GoogleGenAI(key);
      for (const modelCandidate of MODEL_CASCADING_ORDER) {
        try {
          return await executeGeminiAction(ai, body, res, modelCandidate);
        } catch (error: unknown) {
          lastError = error;
          if (isQuotaExhausted(error) || isModelNotFound(error)) {
            console.warn(`[Cascading] Falha no modelo ${modelCandidate}. Tentando próximo...`);
            continue;
          }
          throw error;
        }
      }
    }
    
    const status = extractGeminiHttpStatus(lastError);
    return res.status(status).json({ error: 'Falha na IA', detail: String(lastError) });
  } catch (error: unknown) {
    console.error('[GeminiProxy] Final error:', error);
    return res.status(extractGeminiHttpStatus(error)).json({ error: 'Erro no serviço', detail: String(error) });
  }
}
