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

// FORÇANDO 1.5 FLASH COMO ÚNICO E PRINCIPAL PARA TESTE DE ESTABILIDADE
const MODEL_CASCADING_ORDER = [
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';

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

function toNumberSafe(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeHistory(
  input: Array<{ role: 'user' | 'model'; text: string }> | undefined,
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  if (!input) return [];
  return input
    .map((item) => ({ role: item.role, parts: [{ text: item.text }] }))
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
  }
  const err = error as Record<string, unknown>;
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 600) return err.status;
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) return err.statusCode;
  return 500;
}

type ParsedBody = z.infer<typeof GeminiRequestSchema>;

async function executeGeminiAction(
  ai: GoogleGenAI,
  body: ParsedBody,
  res: VercelResponse,
  modelOverride?: string
): Promise<VercelResponse> {
  switch (body.action) {
    case 'health': {
      const response = await ai.models.generateContent({
        model: modelOverride || DEFAULT_GEMINI_MODEL,
        contents: 'Responda apenas: OK',
        config: { temperature: 0, maxOutputTokens: 10 }
      });
      const text = response.text || '';
      return res.status(200).json({ ok: /ok/i.test(text), text });
    }

    case 'generateContent': {
      const model = modelOverride || body.model || DEFAULT_GEMINI_MODEL;
      const response = await ai.models.generateContent({
        model,
        contents: body.contents as any,
        config: {
          temperature: toNumberSafe(body.config?.temperature, 0.2),
          maxOutputTokens: toNumberSafe(body.config?.maxOutputTokens, 65536),
        }
      });
      return res.status(200).json({ text: response.text || '', candidates: response.candidates || [] });
    }

    case 'chatSendMessage': {
      const model = modelOverride || body.model || DEFAULT_GEMINI_MODEL;
      const runChat = async (withGrounding: boolean) => {
        const chat = ai.chats.create({
          model,
          history: normalizeHistory(body.history),
          config: {
            systemInstruction: body.systemInstruction,
            temperature: body.thinkingMode ? 0.1 : 0.15,
            maxOutputTokens: 65536,
            tools: withGrounding ? [{ googleSearch: {} }] : undefined
          }
        });
        const timeout = withGrounding ? CHAT_TIMEOUT_MS : LONG_CHAT_TIMEOUT_MS;
        return withTimeout(chat.sendMessage({ message: body.message }), timeout, 'gemini-call');
      };

      let response;
      let groundingActivated = body.useGrounding ?? true;
      try {
        response = await runChat(groundingActivated);
      } catch (e) {
        if (!groundingActivated) throw e;
        groundingActivated = false;
        response = await runChat(false);
      }

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      return res.status(200).json({
        text: response.text || '',
        groundingChunks,
        groundingUsed: groundingActivated && groundingChunks.length > 0,
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
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request' });

    const body = parsed.data;
    const keys = getApiKeys();
    
    for (const key of keys) {
      const ai = new GoogleGenAI({ apiKey: key });
      for (const modelCandidate of MODEL_CASCADING_ORDER) {
        try {
          return await executeGeminiAction(ai, body, res, modelCandidate);
        } catch (error: unknown) {
          if (isQuotaExhausted(error)) continue;
          throw error;
        }
      }
    }
    return res.status(429).json({ error: 'Cota esgotada.' });
  } catch (error: unknown) {
    return res.status(extractGeminiHttpStatus(error)).json({ error: 'Erro no serviço' });
  }
}
