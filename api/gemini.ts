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
    useOpenWebSearch: z.boolean().optional(), // Nova flag para a ferramenta OpenWebSearch
  }),
]);

export const config = {
  runtime: 'nodejs',
};

export const maxDuration = 300;

const CHAT_TIMEOUT_MS = 55_000;
const LONG_CHAT_TIMEOUT_MS = 180_000;
const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";

// Fallback manual para process.env caso o TypeScript/Vercel Runtime reclame em modo estrito
const getEnvVar = (name: string): string | undefined => {
  try {
    const proc = (globalThis as any).process;
    return proc?.env?.[name];
  } catch {
    return undefined;
  }
};

function getApiKeys(): string[] {
  const primary = getEnvVar('GEMINI_API_KEY');
  const fallback = getEnvVar('GEMINI_API_KEY_FALLBACK');
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
      const useOpenWebSearch = body.useOpenWebSearch ?? false; // Nova flag para a ferramenta OpenWebSearch

      // Definição da ferramenta OpenWebSearch para o Gemini
      const openWebSearchTool = {
        functionDeclarations: [
          {
            name: "performWebSearch",
            description: "Realiza uma busca na web ou extrai conteúdo de uma URL específica usando múltiplos motores de busca gratuitos (sem API Key). Útil para obter informações atualizadas, notícias, ou extrair texto de páginas para análise. Prioriza extrair conteúdo direto de uma URL se fornecida, caso contrário, realiza uma busca geral.",
            parameters: {
              type: "OBJECT",
              properties: {
                query: {
                  type: "STRING",
                  description: "Opcional. O termo de busca para a pesquisa na web."
                },
                url: {
                  type: "STRING",
                  description: "Opcional. A URL completa (incluindo https://) da página para extrair conteúdo diretamente."
                }
              },
              // Não há \'required\' pois pode ser query OU url
            }
          }
        ]
      };

      const runChat = async (withGrounding: boolean) => {
        const activeTools = [];
        if (withGrounding) activeTools.push({ googleSearch: {} });
        if (useOpenWebSearch) activeTools.push(openWebSearchTool as any); // Cast para ignorar tipo estrito do SDK

        const chat = ai.chats.create({
          model,
          history,
          config: {
            systemInstruction,
            temperature: thinkingMode ? 0.1 : 0.15,
            maxOutputTokens: 65536,
            tools: activeTools.length > 0 ? activeTools : undefined,
          },
        });

        const timeout = withGrounding ? CHAT_TIMEOUT_MS : LONG_CHAT_TIMEOUT_MS;
        const res = await withTimeout(
          chat.sendMessage({ message }),
          timeout,
          withGrounding ? "chat-with-grounding" : "chat-no-grounding",
        );

        return { chat, response: res };
      };

      let response: any;
      let chatSession: any;
      let groundingActivated = useGrounding;

      try {
        const chatData = await runChat(useGrounding);
        response = chatData.response;
        chatSession = chatData.chat;

        // Se o modelo decidiu chamar uma função, nós interceptamos e executamos localmente
        if (response.functionCalls && response.functionCalls.length > 0) {
          console.log("[Gemini] Function Call solicitada:", response.functionCalls[0].name);

          for (const call of response.functionCalls) {
            if (call.name === "performWebSearch") { // Nome da função da ferramenta OpenWebSearch
              const args = call.args as { query?: string; url?: string };
              console.log(`[OpenWebSearch] Executando busca/extração para: ${args.query || args.url}`);

              try {
                // Chamada HTTP para nosso proxy local (Vercel Function)
                const origin = getEnvVar('VERCEL_URL') ? `https://${getEnvVar('VERCEL_URL')}` : "http://localhost:3000";
                const toolResponse = await fetch(`${origin}/api/open-web-search`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(args)
                });

                const toolResult = await toolResponse.json();

                // Retornar o resultado da função para o chat e prosseguir a geração
                response = await chatSession.sendMessage({
                  role: "function",
                  parts: [{
                    functionResponse: {
                      name: call.name,
                      response: { result: toolResult }
                    }
                  }]
                });

              } catch (toolError) {
                console.error(`[OpenWebSearch] Falha ao executar tool:`, toolError);
                // Retornamos um erro suave para o modelo não quebrar e continuar respondendo
                response = await chatSession.sendMessage({
                  role: "function",
                  parts: [{
                    functionResponse: {
                      name: call.name,
                      response: { error: "Failed to perform web search/extraction. Proceed with your existing knowledge." }
                    }
                  }]
                });
              }
            }
          }
        }

      } catch (primaryError) {
        if (!useGrounding) throw primaryError;

        console.warn(
          "[GeminiProxy] Grounding/Tool falhou, acionando fallback sem busca externa:",
          primaryError instanceof Error ? primaryError.message : String(primaryError),
        );
        groundingActivated = false; // Desativa também para ferramenta
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
