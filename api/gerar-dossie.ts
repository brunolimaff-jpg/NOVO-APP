import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { extractHttpStatus, getApiKeys, isQuotaExhausted, toNumberSafe, DEFAULT_GEMINI_MODEL } from './_shared/gemini-helpers';


const DossieRequestSchema = z.object({
  model: z.string().min(1).max(200).optional(),
  contents: z.unknown(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const config = {
  runtime: 'nodejs',
};

export const maxDuration = 300;

const DEFAULT_MODEL = DEFAULT_GEMINI_MODEL;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = DossieRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { model, contents, config: configIn = {} } = parsed.data;
  if (!contents) {
    return res.status(400).json({ error: 'Missing contents' });
  }

  const genConfig: Record<string, unknown> = {
    temperature: toNumberSafe(configIn.temperature, 0.2),
    maxOutputTokens: toNumberSafe(configIn.maxOutputTokens, 65536),
  };

  if (typeof configIn.responseMimeType === 'string') genConfig.responseMimeType = configIn.responseMimeType;
  if (typeof configIn.systemInstruction === 'string') genConfig.systemInstruction = configIn.systemInstruction;
  if (Array.isArray(configIn.tools)) genConfig.tools = configIn.tools;

  const keys = getApiKeys();
  let lastError: unknown;

  for (let i = 0; i < keys.length; i++) {
    try {
      const ai = new GoogleGenAI({ apiKey: keys[i] });
      const response = await ai.models.generateContent({
        model: model ?? DEFAULT_MODEL,
        contents,
        config: genConfig,
      });

      return res.status(200).json({
        text: response.text || '',
        candidates: response.candidates || [],
      });
    } catch (error: unknown) {
      const hasNextKey = i < keys.length - 1;
      if (isQuotaExhausted(error) && hasNextKey) {
        console.warn(`[GerarDossie] Chave ${i + 1} com cota esgotada, tentando chave de fallback...`);
        lastError = error;
        continue;
      }

      lastError = error;
      break;
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'Unknown error';
  console.error('[GerarDossie] Falha total na geracao do dossie:', message);
  return res.status(extractHttpStatus(lastError)).json({
    error: 'Falha ao gerar dossie. Tente novamente em instantes.',
    detail: message,
  });
}
