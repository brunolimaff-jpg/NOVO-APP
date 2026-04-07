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
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';

function getApiKeys(): string[] {
  const primary = process.env.GEMINI_API_KEY;
  const fallback = process.env.GEMINI_API_KEY_FALLBACK;
  const keys = [primary, fallback].filter((key): key is string => Boolean(key));

  if (keys.length === 0) {
    throw new Error('Missing required env var: GEMINI_API_KEY');
  }

  return keys;
}

function isQuotaExhausted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|check quota|rate.?limit/i.test(message) || /"code"\s*:\s*429/.test(message);
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
    const message = error.message;
    if (/"code"\s*:\s*429/.test(message) || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(message)) return 429;
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
): Promise<VercelResponse> {
  switch (body.action) {
    case 'health': {
      const response = await ai.models.generateContent({
        model: DEFAULT_GEMINI_MODEL,
        contents: 'Responda apenas: OK',
        config: { temperature: 0, maxOutputTokens: 10 },
      });

      const text = response.text || '';
      return res.status(200).json({ ok: /ok/i.test(text), text });
    }

    case 'generateContent': {
      const model = body.model ?? DEFAULT_GEMINI_MODEL;
      const contents = body.contents;
      if (!contents) {
        return res.status(400).json({ error: 'Missing contents' });
      }

      const configIn = (body.config ?? {}) as Record<string, unknown>;
      const genConfig: Record<string, unknown> = {
        temperature: toNumberSafe(configIn.temperature, 0.2),
        maxOutputTokens: toNumberSafe(configIn.maxOutputTokens, 65536),
      };

      if (typeof configIn.responseMimeType === 'string') genConfig.responseMimeType = configIn.responseMimeType;
      if (typeof configIn.systemInstruction === 'string') genConfig.systemInstruction = configIn.systemInstruction;
      if (Array.isArray(configIn.tools)) genConfig.tools = configIn.tools;

      const response = await ai.models.generateContent({
        model,
        contents,
        config: genConfig,
      });

      return res.status(200).json({
        text: response.text || '',
        candidates: response.candidates || [],
      });
    }

    case 'chatSendMessage': {
      const model = body.model ?? DEFAULT_GEMINI_MODEL;
      const systemInstruction = body.systemInstruction ?? '';
      const history = normalizeHistory(body.history);
      const message = body.message;
      const useGrounding = body.useGrounding ?? true;
      const thinkingMode = body.thinkingMode ?? false;

      const runChat = async (withGrounding: boolean) => {
        const chat = ai.chats.create({
          model,
          history,
          config: {
            systemInstruction,
            temperature: thinkingMode ? 0.1 : 0.15,
            maxOutputTokens: 65536,
            tools: withGrounding ? [{ googleSearch: {} }] : undefined,
          },
        });

        const timeout = withGrounding ? CHAT_TIMEOUT_MS : LONG_CHAT_TIMEOUT_MS;
        return withTimeout(
          chat.sendMessage({ message }),
          timeout,
          withGrounding ? 'chat-with-grounding' : 'chat-no-grounding',
        );
      };

      let response;
      let groundingActivated = useGrounding;

      try {
        response = await runChat(useGrounding);
      } catch (primaryError) {
        if (!useGrounding) throw primaryError;

        console.warn(
          '[GeminiProxy] Grounding falhou, acionando fallback sem grounding:',
          primaryError instanceof Error ? primaryError.message : String(primaryError),
        );
        groundingActivated = false;
        response = await runChat(false);
      }

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingUsed = groundingActivated && groundingChunks.length > 0;

      return res.status(200).json({
        text: response.text || '',
        groundingChunks,
        groundingUsed,
      });
    }

    default:
      return res.status(400).json({ error: 'Unsupported action' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = GeminiRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const keys = getApiKeys();
    let lastError: unknown;

    for (let i = 0; i < keys.length; i++) {
      try {
        const ai = new GoogleGenAI({ apiKey: keys[i] });
        return await executeGeminiAction(ai, body, res);
      } catch (error: unknown) {
        const hasNextKey = i < keys.length - 1;
        if (isQuotaExhausted(error) && hasNextKey) {
          console.warn(`[GeminiProxy] Chave ${i + 1} com cota esgotada, tentando chave de fallback...`);
          lastError = error;
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Gemini API proxy error:', message);
    const httpStatus = extractGeminiHttpStatus(error);
    return res.status(httpStatus).json({ error: 'Gemini proxy failed', detail: message });
  }
}
