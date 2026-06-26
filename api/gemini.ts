import { GoogleGenAI, ThinkingLevel as GeminiSdkThinkingLevel } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { insertDiagnosticsBatch, MAX_EVENTS_PER_BATCH } from '../utils/serverDiagnostics.js';
import { isQuotaExhausted, isBillingOrPermissionDenied } from './_gemini-key-utils.js';
import { applyCors } from './_cors-headers.js';
import { isLiteLLMEnabled, callLiteLLM } from './_llm-client.js';
import { selectModelForModule } from '../utils/llm/modelRouter.js';

const HistoryItemSchema = z.object({
  role: z.enum(['user', 'model']),
  text: z.string(),
});
const ThinkingLevelSchema = z.enum(['low', 'medium', 'high']);

const GeminiRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('health') }),
  z.object({
    action: z.literal('generateContent'),
    model: z.string().min(1).max(200).optional(),
    contents: z.unknown(),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal('createCachedContent'),
    model: z.string().min(1).max(200).optional(),
    systemInstruction: z.string().min(1).max(500000),
    ttl: z.string().max(32).optional(),
    displayName: z.string().max(128).optional(),
    tools: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
  z.object({
    action: z.literal('deleteCachedContent'),
    name: z.string().min(1).max(512),
  }),
  z.object({
    action: z.literal('chatSendMessage'),
    model: z.string().min(1).max(200).optional(),
    systemInstruction: z.string().max(100000).optional(),
    history: z.array(HistoryItemSchema).optional(),
    message: z.string().min(1).max(200000),
    useGrounding: z.boolean().optional(),
    thinkingLevel: ThinkingLevelSchema.optional(),
    thinkingMode: z.boolean().optional(),
    useOpenWebSearch: z.boolean().optional(),
  }),
]);

export const config = {
  runtime: 'nodejs',
};

export const maxDuration = 300;

const CHAT_TIMEOUT_MS = 55_000;
const LONG_CHAT_TIMEOUT_MS = 180_000;
const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';
const INTERNAL_MARKER_REGEX = /\[\[\s*[A-Z_]+\s*:[\s\S]*?\]\]/gi;
const INTERNAL_MARKER_OPEN_TAIL_REGEX = /\[\[\s*[A-Z_]+\s*:[\s\S]*$/i;
const HARD_PROMPT_LEAK_PATTERNS: RegExp[] = [
  /\[\[\s*[A-Z_]+\s*:[\s\S]*?\]\]/i,
  /investigacao_completa_integrada/i,
  /protocolo de investiga[çc][aã]o forense/i,
  /urgente:\s*ignore\s+metadiscuss[õo]es/i,
  /sua miss[aã]o absoluta/i,
  /n[aã]o discuta o funcionamento interno do modelo/i,
];
const SOFT_PROMPT_LEAK_PATTERNS: RegExp[] = [
  /urgente:.*dossi[eê]\s+de\s+agroneg[oó]cio/i,
  /score porta.*preciso.*cnpj/i,
  /execute um dossi[eê] completo combinando os protocolos/i,
  /priorize objetividade.*fontes audit[aá]veis/i,
];

function stripInternalMarkersLocal(text: string): string {
  return (text || '')
    .replace(INTERNAL_MARKER_REGEX, '')
    .replace(INTERNAL_MARKER_OPEN_TAIL_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\]\s*$/gm, '')
    .trim();
}

function detectPromptLeakIndicatorsLocal(text: string): { detected: boolean; indicators: string[] } {
  const sample = (text || '').trim();
  if (!sample) return { detected: false, indicators: [] };

  const hardHits = HARD_PROMPT_LEAK_PATTERNS.flatMap((pattern, i) => (pattern.test(sample) ? [`hard_${i}`] : []));
  const softHits = SOFT_PROMPT_LEAK_PATTERNS.flatMap((pattern, i) => (pattern.test(sample) ? [`soft_${i}`] : []));
  return {
    detected: hardHits.length > 0 || softHits.length >= 2,
    indicators: [...hardHits, ...softHits],
  };
}

function applyPromptLeakShieldLocal(text: string): {
  text: string;
  blocked: boolean;
  indicators: string[];
} {
  const cleaned = stripInternalMarkersLocal(text || '');
  const sample = cleaned || (text || '').trim();
  const detection = detectPromptLeakIndicatorsLocal(sample);

  if (!detection.detected) {
    return { text: sample, blocked: false, indicators: [] };
  }

  return {
    text: 'Para continuar com segurança na análise, confirme o CNPJ da empresa (14 dígitos).',
    blocked: true,
    indicators: detection.indicators,
  };
}

function isFoundationCacheEnabled(): boolean {
  return getEnvVar('GEMINI_FOUNDATION_CACHE_ENABLED') === '1';
}

function extractUsageMetadata(response: unknown): Record<string, unknown> | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const usageMetadata = (response as { usageMetadata?: unknown }).usageMetadata;
  if (!usageMetadata || typeof usageMetadata !== 'object') return undefined;
  return usageMetadata as Record<string, unknown>;
}

function extractGeminiText(response: unknown): string {
  if (!response || typeof response !== 'object') return '';

  const directText = (response as { text?: unknown }).text;
  if (typeof directText === 'string' && directText.trim()) return directText;

  const candidates = (response as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return '';

  return candidates
    .flatMap(candidate => {
      const parts = (candidate as { content?: { parts?: unknown } })?.content?.parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map(part => (typeof (part as { text?: unknown })?.text === 'string' ? (part as { text: string }).text : ''))
    .filter(Boolean)
    .join('');
}

const getEnvVar = (name: string): string | undefined => {
  try {
    return typeof process !== 'undefined' ? process.env[name] : undefined;
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

function toNumberSafe(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeHistory(
  input: Array<{ role: 'user' | 'model'; text: string }> | undefined,
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  if (!input) return [];

  return input
    .map(item => ({ role: item.role, parts: [{ text: item.text }] }))
    .filter(msg => msg.parts[0].text.trim().length > 0);
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
type ThinkingLevelInput = z.infer<typeof ThinkingLevelSchema>;

function resolveThinkingLevel(thinkingLevel?: ThinkingLevelInput, thinkingMode?: boolean): ThinkingLevelInput {
  if (thinkingLevel) return thinkingLevel;
  if (thinkingMode === true) return 'high';
  if (thinkingMode === false) return 'low';
  return 'high';
}

function toSdkThinkingLevel(thinkingLevel: ThinkingLevelInput): GeminiSdkThinkingLevel {
  if (thinkingLevel === 'low') return GeminiSdkThinkingLevel.LOW;
  if (thinkingLevel === 'medium') return GeminiSdkThinkingLevel.MEDIUM;
  return GeminiSdkThinkingLevel.HIGH;
}

async function executeGeminiAction(ai: GoogleGenAI, body: ParsedBody, res: VercelResponse): Promise<VercelResponse> {
  switch (body.action) {
    case 'health': {
      const response = await ai.models.generateContent({
        model: DEFAULT_GEMINI_MODEL,
        contents: 'Responda apenas: OK',
        config: { temperature: 0, maxOutputTokens: 10 },
      });

      const text = extractGeminiText(response);
      return res.status(200).json({ ok: /ok/i.test(text), text });
    }

    case 'generateContent': {
      const modelFromClient = typeof body.model === 'string' ? body.model : undefined;
      const contents = body.contents;
      const cfg = (body.config ?? {}) as Record<string, unknown>;

      // Extrai nome do modulo das contents para roteamento server-side
      const contentsStr =
        typeof contents === 'string'
          ? contents
          : Array.isArray(contents)
            ? (contents as Array<{ text?: string }>).map(c => c?.text || '').join(' ')
            : '';
      const srvModuleMatch = contentsStr.match(/bloco de (.+?) com extrema/i);
      const srvModuleName = srvModuleMatch?.[1]?.trim() || null;

      const hasCachedContent = typeof cfg.cachedContent === 'string';
      const hasSystemInstr = typeof cfg.systemInstruction === 'string';
      const hasGrounding =
        Array.isArray(cfg.tools) &&
        cfg.tools.some((t: unknown) => t && typeof t === 'object' && 'googleSearch' in (t as Record<string, unknown>));

      // ── LiteLLM branch ──
      // cachedContent sem systemInstruction = foundation cache ativo (recurso Gemini,
      // nao texto). LiteLLM nao suporta — delegamos ao Gemini.
      // tools com googleSearch = grounding pedido. LiteLLM nao suporta googleSearch
      // nativo — delegamos ao Gemini.
      if (isLiteLLMEnabled() && !(hasCachedContent && !hasSystemInstr) && !hasGrounding) {
        try {
          const sysInstr = hasSystemInstr ? (cfg.systemInstruction as string) : undefined;
          const msgs: Array<{ role: string; content: string }> = [];
          if (sysInstr) msgs.push({ role: 'system', content: sysInstr });

          const userContent =
            typeof contents === 'string'
              ? contents
              : Array.isArray(contents)
                ? contents
                    .map(c => {
                      if (typeof c === 'string') return c;
                      if (c && typeof c === 'object') {
                        if (typeof (c as Record<string, unknown>).text === 'string')
                          return (c as Record<string, unknown>).text;
                        const parts = (c as Record<string, unknown>).parts;
                        if (Array.isArray(parts)) {
                          return parts
                            .map(p =>
                              p && typeof p === 'object' && typeof (p as Record<string, unknown>).text === 'string'
                                ? (p as Record<string, unknown>).text
                                : '',
                            )
                            .filter(Boolean)
                            .join('\n');
                        }
                      }
                      return JSON.stringify(c);
                    })
                    .join('\n')
                : JSON.stringify(contents);
          msgs.push({ role: 'user', content: userContent });

          const resolvedModel = selectModelForModule(srvModuleName || '');
          const temperature = typeof cfg.temperature === 'number' ? cfg.temperature : undefined;
          const maxTokens = typeof cfg.maxOutputTokens === 'number' ? cfg.maxOutputTokens : undefined;
          // tools (grounding) nao suportado via LiteLLM — sprint futura

          const text = await callLiteLLM({
            model: resolvedModel,
            messages: msgs,
            temperature: temperature,
            maxTokens: maxTokens,
          });
          return res.status(200).json({ text });
        } catch (err) {
          console.error('LiteLLM call failed:', err);
          return res
            .status(500)
            .json({ error: 'LLM call failed', message: err instanceof Error ? err.message : 'Unknown' });
        }
      }

      const model = modelFromClient ?? DEFAULT_GEMINI_MODEL;
      const srvRunId = `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

      if (srvModuleName) {
        void insertDiagnosticsBatch({ runId: srvRunId, route: '/api/gemini', events: [] }, [
          {
            at: new Date().toISOString(),
            t: Date.now(),
            runId: srvRunId,
            area: 'ServerWaterfall',
            event: 'module:start',
            severity: 'info',
            payload: { module: srvModuleName, model },
          },
        ]);
      }

      if (!contents) {
        return res.status(400).json({ error: 'Missing contents' });
      }

      const configIn = (body.config ?? {}) as Record<string, unknown>;
      const genConfig: Record<string, unknown> = {
        temperature: toNumberSafe(configIn.temperature, 0.2),
        maxOutputTokens: toNumberSafe(configIn.maxOutputTokens, 65536),
      };

      if (typeof configIn.responseMimeType === 'string') genConfig.responseMimeType = configIn.responseMimeType;
      if (typeof configIn.cachedContent === 'string') {
        genConfig.cachedContent = configIn.cachedContent;
        if (configIn.systemInstruction !== undefined) {
          console.warn('[GeminiProxy] cachedContent ignorou systemInstruction no generateContent');
        }
        if (Array.isArray(configIn.tools) && configIn.tools.length > 0) {
          console.warn(
            '[GeminiProxy] cachedContent ignorou tools no generateContent; use tools em createCachedContent',
          );
        }
        if (configIn.toolConfig !== undefined) {
          console.warn('[GeminiProxy] cachedContent ignorou toolConfig no generateContent');
        }
      } else {
        if (typeof configIn.systemInstruction === 'string') {
          genConfig.systemInstruction = configIn.systemInstruction;
        }
        if (Array.isArray(configIn.tools)) genConfig.tools = configIn.tools;
        if (configIn.toolConfig !== undefined) genConfig.toolConfig = configIn.toolConfig;
      }

      const response = await ai.models.generateContent({
        model,
        contents,
        config: genConfig,
      });

      if (srvModuleName) {
        void insertDiagnosticsBatch({ runId: srvRunId, route: '/api/gemini', events: [] }, [
          {
            at: new Date().toISOString(),
            t: Date.now(),
            runId: srvRunId,
            area: 'ServerWaterfall',
            event: 'module:end',
            severity: 'info',
            payload: { module: srvModuleName, model },
          },
        ]);
      }

      return res.status(200).json({
        text: extractGeminiText(response),
        candidates: response.candidates || [],
        usageMetadata: extractUsageMetadata(response),
      });
    }

    case 'createCachedContent': {
      if (!isFoundationCacheEnabled()) {
        return res.status(403).json({ error: 'Foundation cache disabled' });
      }

      const model = body.model ?? DEFAULT_GEMINI_MODEL;
      const cacheConfig: Record<string, unknown> = {
        displayName: body.displayName ?? 'scout360-waterfall-foundation',
        systemInstruction: body.systemInstruction,
        ttl: body.ttl ?? '600s',
      };
      if (Array.isArray(body.tools) && body.tools.length > 0) {
        cacheConfig.tools = body.tools;
      }
      const cache = await ai.caches.create({
        model,
        config: cacheConfig,
      });

      return res.status(200).json({
        name: cache.name,
        expireTime: cache.expireTime,
        usageMetadata: extractUsageMetadata(cache),
      });
    }

    case 'deleteCachedContent': {
      if (!isFoundationCacheEnabled()) {
        return res.status(403).json({ error: 'Foundation cache disabled' });
      }

      await ai.caches.delete({ name: body.name });
      return res.status(200).json({ ok: true });
    }

    case 'chatSendMessage': {
      const model = body.model ?? DEFAULT_GEMINI_MODEL;
      const systemInstruction = body.systemInstruction ?? '';
      const history = normalizeHistory(body.history);
      const message = body.message;
      const useGrounding = body.useGrounding ?? true;
      const resolvedThinkingLevel = resolveThinkingLevel(body.thinkingLevel, body.thinkingMode);
      const sdkThinkingLevel = toSdkThinkingLevel(resolvedThinkingLevel);
      const useOpenWebSearch = body.useOpenWebSearch ?? false;

      const openWebSearchTool = {
        functionDeclarations: [
          {
            name: 'performWebSearch',
            description:
              'Realiza busca na web ou extrai conteúdo de uma URL específica usando múltiplos motores de busca gratuitos. Útil para obter informações atualizadas, notícias, ou extrair texto de páginas para análise.',
            parameters: {
              type: 'OBJECT',
              properties: {
                query: { type: 'STRING', description: 'O termo de busca para a pesquisa na web.' },
                url: { type: 'STRING', description: 'A URL completa para extrair conteúdo diretamente.' },
              },
            },
          },
        ],
      };

      const runChat = async (withGrounding: boolean) => {
        const activeTools: Array<Record<string, unknown>> = [];
        if (withGrounding) activeTools.push({ googleSearch: {} });
        if (useOpenWebSearch) activeTools.push(openWebSearchTool);

        const chat = ai.chats.create({
          model,
          history,
          config: {
            systemInstruction,
            temperature: resolvedThinkingLevel === 'high' ? 0.1 : 0.15,
            maxOutputTokens: 65536,
            thinkingConfig: {
              thinkingLevel: sdkThinkingLevel,
            },
            tools: activeTools.length > 0 ? activeTools : undefined,
          },
        });

        const timeout = withGrounding ? CHAT_TIMEOUT_MS : LONG_CHAT_TIMEOUT_MS;
        const res = await withTimeout(
          chat.sendMessage({ message }),
          timeout,
          withGrounding ? 'chat-with-grounding' : 'chat-no-grounding',
        );

        return { chat, response: res };
      };

      let response: Awaited<ReturnType<typeof runChat>>['response'];
      let chatSession: Awaited<ReturnType<typeof runChat>>['chat'];
      let groundingActivated = useGrounding;

      try {
        const chatData = await runChat(useGrounding);
        response = chatData.response;
        chatSession = chatData.chat;

        // Loop para processar Function Calls (suporta múltiplas chamadas e encadeamento)
        let maxIterations = 3;
        while (response.functionCalls && response.functionCalls.length > 0 && maxIterations > 0) {
          maxIterations--;
          console.warn(`[Gemini] Turno de Function Call (${response.functionCalls.length} chamadas)`);

          const functionResponses: Array<{
            functionResponse: {
              name: string;
              response: Record<string, unknown>;
            };
          }> = [];

          for (const call of response.functionCalls) {
            if (call.name === 'performWebSearch') {
              const args = call.args as { query?: string; url?: string };
              try {
                const origin = getEnvVar('VERCEL_URL') ? `https://${getEnvVar('VERCEL_URL')}` : 'http://localhost:3000';
                const toolResponse = await fetch(`${origin}/api/open-web-search`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(args),
                  signal: AbortSignal.timeout(30_000),
                });
                const toolResult = await toolResponse.json().catch(() => null);
                if (!toolResponse.ok) {
                  const toolError =
                    typeof toolResult?.error === 'string'
                      ? toolResult.error
                      : `Open Web Search HTTP ${toolResponse.status}`;
                  throw new Error(toolError);
                }

                functionResponses.push({
                  functionResponse: {
                    name: call.name,
                    response: { result: toolResult },
                  },
                });
              } catch (toolError) {
                console.error(`[OpenWebSearch] Falha:`, toolError);
                const message =
                  toolError instanceof Error ? toolError.message : 'Failed to perform web search/extraction.';
                functionResponses.push({
                  functionResponse: {
                    name: call.name,
                    response: { error: message },
                  },
                });
              }
            }
          }

          if (functionResponses.length > 0) {
            // Envia TODAS as respostas de funções em uma única mensagem (Batching)
            const sendFunctionResponses = chatSession.sendMessage as unknown as (
              message: typeof functionResponses,
            ) => Promise<typeof response>;
            response = await withTimeout(
              sendFunctionResponses(functionResponses),
              CHAT_TIMEOUT_MS,
              'function-call-response',
            );
          } else {
            break; // Nenhuma chamada reconhecida
          }
        }
      } catch (primaryError) {
        if (!useGrounding) throw primaryError;
        console.warn('[GeminiProxy] Falha no Grounding/Tool, acionando fallback:', primaryError);
        groundingActivated = false;
        const fallbackData = await runChat(false);
        response = fallbackData.response;
      }

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingUsed = groundingActivated && groundingChunks.length > 0;
      const responseText = extractGeminiText(response);
      const leakShieldResult = applyPromptLeakShieldLocal(responseText);
      if (leakShieldResult.blocked) {
        console.warn('[PromptLeakShield][api/gemini] resposta bloqueada', {
          action: body.action,
          model,
          indicators: leakShieldResult.indicators,
        });
      }

      return res.status(200).json({
        text: leakShieldResult.text,
        groundingChunks,
        groundingUsed,
      });
    }

    default:
      return res.status(400).json({ error: 'Unsupported action' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── recordDiagnostics: early return antes de qualquer validação Gemini ──
  if (req.body?.action === 'recordDiagnostics') {
    const body = req.body as {
      runId?: string;
      sessionId?: string;
      operatorId?: string;
      environment?: string;
      appVersion?: string;
      route?: string;
      userAgent?: string;
      events?: unknown[];
    };

    if (!body.runId || !Array.isArray(body.events) || body.events.length === 0) {
      return res.status(400).json({ error: 'Missing runId or events' });
    }

    const events = body.events.slice(0, MAX_EVENTS_PER_BATCH) as unknown as Parameters<
      typeof insertDiagnosticsBatch
    >[1];

    const result = await insertDiagnosticsBatch(
      {
        runId: body.runId,
        sessionId: body.sessionId,
        operatorId: body.operatorId,
        environment: body.environment,
        appVersion: body.appVersion,
        route: body.route,
        userAgent: body.userAgent,
        events,
      },
      events,
    );

    if (result.error && result.error === 'Supabase not configured') {
      return res.status(200).json({ inserted: 0, degraded: true, reason: result.error });
    }

    return res.status(result.error ? 500 : 200).json(result);
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
        if ((isQuotaExhausted(error) || isBillingOrPermissionDenied(error)) && hasNextKey) {
          console.warn(`[GeminiProxy] Chave ${i + 1} com erro (quota/billing), tentando fallback...`);
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
