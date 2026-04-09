import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { performWebSearch, universalExtract } from '../utils/documentExtractor';

/**
 * ARQUITETURA TOTAL SHIELD (V2) — Correção de Escopo e Importação
 * 
 * Mantemos os imports pesados (cheerio, pdf-parse) DENTRO do documentExtractor
 * usando lazy loading, mas o import do utilitário em si é estático para 
 * garantir que o Vercel inclua o arquivo no bundle da função.
 */

// Listeners globais para expor erros fatais
if (typeof process !== 'undefined') {
  process.on('uncaughtException', (err) => console.error('[FATAL] Uncaught Exception:', err));
  process.on('unhandledRejection', (reason) => console.error('[FATAL] Unhandled Rejection:', reason));
}

// --- ESQUEMAS (Fora do handler para evitar recriação e erros de escopo) ---
const HistoryItemSchema = z.object({
  role: z.enum(['user', 'model']),
  text: z.string(),
});

const GeminiRequestSchema = z.object({
  action: z.enum(['health', 'generateContent', 'chatSendMessage']),
  model: z.string().optional(),
  contents: z.any().optional(),
  config: z.record(z.unknown()).optional(),
  history: z.array(HistoryItemSchema).optional(),
  message: z.string().optional(),
  systemInstruction: z.string().optional(),
  useGrounding: z.boolean().optional(),
  thinkingMode: z.boolean().optional(),
  useOpenWebSearch: z.boolean().optional(),
});

// --- FUNÇÕES UTILITÁRIAS (Fora do handler) ---
const getApiKeys = () => {
  const keys = process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
  return keys.split(',').map(k => k.trim()).filter(Boolean);
};

const isQuotaExhausted = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message.toLowerCase() : '';
  return msg.includes('quota') || msg.includes('429') || msg.includes('rate limit');
};

const extractGeminiHttpStatus = (error: unknown): number => {
  const err = error as any;
  if (err?.status && typeof err.status === 'number') return err.status;
  if (err?.statusCode && typeof err.statusCode === 'number') return err.statusCode;
  return 500;
};

const normalizeHistory = (history?: any[]) => {
  if (!history || !Array.isArray(history)) return [];
  return history.map(item => ({
    role: item.role === 'user' ? 'user' : 'model',
    parts: [{ text: item.text || '' }]
  }));
};

// --- HANDLER PRINCIPAL ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const parsed = GeminiRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const keys = getApiKeys();
    if (keys.length === 0) throw new Error("No API keys configured");

    for (let i = 0; i < keys.length; i++) {
      try {
        const ai = new GoogleGenAI({ apiKey: keys[i] });
        
        if (body.action === 'health') {
          const resp = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: 'Responda OK',
            config: { temperature: 0, maxOutputTokens: 10 },
          });
          return res.status(200).json({ ok: true, text: resp.text || '' });
        }

        if (body.action === 'chatSendMessage') {
          const model = body.model || 'gemini-1.5-flash';
          const history = normalizeHistory(body.history);
          const activeTools: any[] = [];
          
          if (body.useGrounding) activeTools.push({ googleSearch: {} });
          if (body.useOpenWebSearch) {
            activeTools.push({
              functionDeclarations: [
                {
                  name: "performWebSearch",
                  description: "Busca na web para obter links sobre um tema.",
                  parameters: {
                    type: "OBJECT",
                    properties: { query: { type: "STRING" } },
                    required: ["query"]
                  }
                },
                {
                  name: "extractDocumentContent",
                  description: "Extrai texto de links web, PDFs ou documentos Word (DOCX).",
                  parameters: {
                    type: "OBJECT",
                    properties: { url: { type: "STRING" } },
                    required: ["url"]
                  }
                }
              ]
            });
          }

          const chat = ai.chats.create({
            model,
            history,
            config: {
              systemInstruction: body.systemInstruction,
              temperature: body.thinkingMode ? 0.1 : 0.15,
              tools: activeTools,
            }
          });

          let response = await chat.sendMessage(body.message || "");
          
          const maxIterations = 5;
          for (let iter = 0; iter < maxIterations; iter++) {
            if (!response.functionCalls || response.functionCalls.length === 0) break;

            const functionResponses: any[] = [];
            for (const call of response.functionCalls) {
              try {
                let toolResult: any;
                if (call.name === "performWebSearch") {
                  toolResult = await performWebSearch((call.args as any).query);
                } else if (call.name === "extractDocumentContent") {
                  const extract = await universalExtract({ url: (call.args as any).url });
                  if (extract.error) throw new Error(extract.error);
                  toolResult = extract.text;
                }

                functionResponses.push({
                  functionResponse: {
                    name: call.name,
                    response: { result: toolResult }
                  }
                });
              } catch (toolErr: any) {
                console.error(`[ToolError] ${call.name}:`, toolErr.message);
                functionResponses.push({
                  functionResponse: {
                    name: call.name,
                    response: { error: toolErr.message }
                  }
                });
              }
            }
            response = await chat.sendMessage(functionResponses);
          }

          return res.status(200).json({
            text: response.text || '',
            groundingUsed: !!response.candidates?.[0]?.groundingMetadata,
            groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
          });
        }

        return res.status(400).json({ error: 'Unsupported action' });

      } catch (error: any) {
        if (isQuotaExhausted(error) && i < keys.length - 1) continue;
        throw error;
      }
    }
  } catch (error: any) {
    const status = extractGeminiHttpStatus(error);
    console.error('[TotalShield] Fatal Error:', error.message, error.stack);
    return res.status(status).json({ 
      error: 'Gemini proxy failed', 
      detail: error.message,
      stack: error.stack
    });
  }
}
