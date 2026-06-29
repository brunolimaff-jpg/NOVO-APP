import { scoutDiag } from '../utils/diagnosticLog';

type GeminiApiAction = 'generateContent' | 'chatSendMessage' | 'health' | 'createCachedContent' | 'deleteCachedContent';

interface GeminiApiBaseRequest {
  action: GeminiApiAction;
}

interface GeminiGenerateRequest extends GeminiApiBaseRequest {
  action: 'generateContent';
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
  // Cost tracking fields (all optional)
  operatorId?: string;
  operatorEmail?: string;
  operatorSessionId?: string;
  chatSessionId?: string;
  companyCnpj?: string;
  companyName?: string;
  module?: string;
}

interface GeminiChatRequest extends GeminiApiBaseRequest {
  action: 'chatSendMessage';
  model: string;
  systemInstruction: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  message: string;
  useGrounding?: boolean;
  thinkingLevel?: 'low' | 'medium' | 'high';
  thinkingMode?: boolean;
  useOpenWebSearch?: boolean;
  temperature?: number;
  stopSequences?: string[];
  // Cost tracking fields (all optional)
  operatorId?: string;
  operatorEmail?: string;
  operatorSessionId?: string;
  chatSessionId?: string;
  companyCnpj?: string;
  companyName?: string;
  module?: string;
}

interface GeminiHealthRequest extends GeminiApiBaseRequest {
  action: 'health';
}

interface GeminiGenerateResponse {
  text: string;
  candidates?: unknown[];
  usageMetadata?: Record<string, unknown>;
}

interface GeminiCreateCachedContentRequest extends GeminiApiBaseRequest {
  action: 'createCachedContent';
  model: string;
  systemInstruction: string;
  ttl?: string;
  displayName?: string;
  tools?: unknown[];
}

interface GeminiCreateCachedContentResponse {
  name?: string;
  expireTime?: string;
  usageMetadata?: Record<string, unknown>;
}

interface GeminiDeleteCachedContentRequest extends GeminiApiBaseRequest {
  action: 'deleteCachedContent';
  name: string;
}

interface GeminiDeleteCachedContentResponse {
  ok: boolean;
}

export interface GeminiChatResponse {
  text: string;
  groundingChunks?: unknown[];
  /**
   * true  = grounding ativo e retornou chunks concretos.
   * false = fallback silencioso foi acionado (grounding falhou) OU grounding
   *         ativo mas sem chunks relevantes. Ambos os casos exigem aviso visual.
   * Ausente (undefined) quando o campo nao foi retornado pela API (compatibilidade
   * com versoes antigas — tratar como undefined, nao como false).
   */
  groundingUsed?: boolean;
  webVerificationStatus?: 'verified' | 'fallback_verified' | 'unverified' | 'not_applicable';
}

interface GeminiHealthResponse {
  ok: boolean;
  text?: string;
}

const CUSTOM_LLM_PROXY_BASE_URL = (import.meta.env.VITE_GEMINI_PROXY_URL || '')
  .replace(/\/api\/gemini$/, '')
  .replace(/\/$/, '');
// O serverless usa 55s para chat normal e ate 180s para investigacoes pesadas.
// Frontend da margem de 210s para cobrir o cenario mais longo + overhead de rede.
const LLM_PROXY_TIMEOUT_MS = Number(import.meta.env.VITE_LLM_PROXY_TIMEOUT_MS || 210000);

// FIX: resolveEndpoint permanece como função pura — nunca como const de módulo.
// Chamá-la no nível de módulo causaria TDZ quando outro módulo importa llmProxy
// antes que window/import.meta estejam disponíveis no bundle minificado.
function resolveEndpoint(path: string): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalDev = import.meta.env.DEV && (hostname === 'localhost' || hostname === '127.0.0.1');
  if (!isLocalDev) return path;
  return CUSTOM_LLM_PROXY_BASE_URL ? `${CUSTOM_LLM_PROXY_BASE_URL}${path}` : path;
}

export function resolveGeminiApiEndpoint(
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : '',
  isDev: boolean = import.meta.env.DEV,
): string {
  const isLocalDevHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!(isDev && isLocalDevHost)) return '/api/gemini';
  return CUSTOM_LLM_PROXY_BASE_URL ? `${CUSTOM_LLM_PROXY_BASE_URL}/api/gemini` : '/api/gemini';
}

function buildAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted', 'AbortError');
  }
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

async function readResponseText(response: Response, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw buildAbortError();

  let cleanupAbortListener: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    const rejectOnAbort = () => reject(buildAbortError());
    signal.addEventListener('abort', rejectOnAbort, { once: true });
    cleanupAbortListener = () => signal.removeEventListener('abort', rejectOnAbort);
  });

  try {
    return await Promise.race([response.text(), abortPromise]);
  } finally {
    cleanupAbortListener?.();
  }
}

async function callGeminiApi<TResponse>(
  endpoint: string,
  payload:
    | GeminiGenerateRequest
    | GeminiChatRequest
    | GeminiHealthRequest
    | GeminiCreateCachedContentRequest
    | GeminiDeleteCachedContentRequest
    | Record<string, unknown>,
  signal?: AbortSignal,
): Promise<TResponse> {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(LLM_PROXY_TIMEOUT_MS) && LLM_PROXY_TIMEOUT_MS > 0 ? LLM_PROXY_TIMEOUT_MS : 90000;
  let timedOut = false;
  const action = typeof payload.action === 'string' ? payload.action : 'unknown';
  const requestClass =
    action === 'generateContent' || action === 'chatSendMessage'
      ? 'ai'
      : action === 'recordDiagnostics'
        ? 'diagnostics'
        : 'control';

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  let response: Response | null = null;
  let responseText: string;
  try {
    try {
      scoutDiag.info('LlmProxy', 'request:start', {
        endpoint,
        action,
        requestClass,
        timeoutMs,
        model: (payload as Record<string, unknown>).model || 'unknown',
      });

      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      responseText = await readResponseText(response, controller.signal);
    } catch (error: unknown) {
      if (timedOut) {
        scoutDiag.error('LlmProxy', 'timeout no proxy', {
          timeoutMs,
          endpoint,
          action,
          requestClass,
          phase: response ? 'body-read' : 'fetch',
        });
        throw new Error(
          response
            ? `Gemini proxy body read timeout after ${timeoutMs}ms`
            : `Gemini proxy timeout after ${timeoutMs}ms`,
          { cause: error },
        );
      }
      scoutDiag.error('LlmProxy', 'falha de rede, abort ou leitura do body', {
        endpoint,
        action,
        requestClass,
        phase: response ? 'body-read' : 'fetch',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    scoutDiag.info('LlmProxy', 'response:body-read', {
      endpoint,
      action,
      requestClass,
      status: response.status,
      bodyChars: responseText.length,
    });

    if (!response.ok) {
      scoutDiag.error('LlmProxy', 'resposta HTTP nao OK', {
        status: response.status,
        endpoint,
        action,
        requestClass,
        bodyPreview: (responseText || '').slice(0, 200),
      });
      throw new Error(`Gemini proxy failed (${response.status}): ${responseText || 'unknown error'}`);
    }

    const trimmedBody = responseText.trim();
    if (!trimmedBody) return {} as TResponse;

    try {
      return JSON.parse(trimmedBody) as TResponse;
    } catch (error: unknown) {
      scoutDiag.error('LlmProxy', 'JSON invalido na resposta do proxy', {
        endpoint,
        action,
        requestClass,
        bodyPreview: trimmedBody.slice(0, 200),
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Gemini proxy returned invalid JSON', { cause: error });
    }
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export async function proxyGenerateContent(
  params: Omit<GeminiGenerateRequest, 'action'>,
  signal?: AbortSignal,
): Promise<GeminiGenerateResponse> {
  // endpoint resolvido lazy — sem const de módulo
  return callGeminiApi<GeminiGenerateResponse>(
    resolveGeminiApiEndpoint(),
    { action: 'generateContent', ...params },
    signal,
  );
}

export async function proxyCreateCachedContent(
  params: Omit<GeminiCreateCachedContentRequest, 'action'>,
  signal?: AbortSignal,
): Promise<GeminiCreateCachedContentResponse> {
  return callGeminiApi<GeminiCreateCachedContentResponse>(
    resolveGeminiApiEndpoint(),
    { action: 'createCachedContent', ...params },
    signal,
  );
}

export async function proxyDeleteCachedContent(
  params: Omit<GeminiDeleteCachedContentRequest, 'action'>,
  signal?: AbortSignal,
): Promise<GeminiDeleteCachedContentResponse> {
  return callGeminiApi<GeminiDeleteCachedContentResponse>(
    resolveGeminiApiEndpoint(),
    { action: 'deleteCachedContent', ...params },
    signal,
  );
}

export async function proxyChatSendMessage(
  params: Omit<GeminiChatRequest, 'action'>,
  signal?: AbortSignal,
): Promise<GeminiChatResponse> {
  // endpoint resolvido lazy — sem const de módulo
  return callGeminiApi<GeminiChatResponse>(
    resolveGeminiApiEndpoint(),
    { action: 'chatSendMessage', ...params },
    signal,
  );
}

export interface OpenWebSearchResponse {
  content?: string;
  source?: string;
  sources?: Array<{ title?: string; url?: string; snippet?: string; provider?: string }>;
  providerStatus?: Array<{
    provider: 'brave' | 'duckduckgo';
    ok: boolean;
    reason?:
      | 'missing_key'
      | 'unauthorized'
      | 'quota_exhausted'
      | 'rate_limited'
      | 'timeout'
      | 'server_error'
      | 'empty_result'
      | 'unknown';
    statusCode?: number;
  }>;
  degraded?: boolean;
  error?: string;
  detail?: string;
}

export async function executeOpenWebSearchTool(query: string, url?: string): Promise<OpenWebSearchResponse> {
  const endpoint = import.meta.env.VITE_OPEN_WEB_SEARCH_URL || '/api/open-web-search';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, url }),
  });
  if (!response.ok) {
    throw new Error(`OpenWebSearch failed: ${response.status}`);
  }
  return response.json();
}

export async function proxyGeminiHealth(signal?: AbortSignal): Promise<GeminiHealthResponse> {
  // endpoint resolvido lazy — sem const de módulo
  return callGeminiApi<GeminiHealthResponse>(resolveGeminiApiEndpoint(), { action: 'health' }, signal);
}

/** Endpoint dedicado para geração de dossiês completos via Gemini generateContent. */
export async function proxyGerarDossie(
  params: Omit<GeminiGenerateRequest, 'action'>,
  signal?: AbortSignal,
): Promise<GeminiGenerateResponse> {
  // FIX: endpoint resolvido lazy dentro da função, não como const de módulo.
  // Previne TDZ "Cannot access '$i' before initialization" em produção.
  return callGeminiApi<GeminiGenerateResponse>(resolveEndpoint('/api/gerar-dossie'), params, signal);
}
