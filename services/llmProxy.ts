import { scoutDiag } from '../utils/diagnosticLog';

type LlmApiAction = 'generateContent' | 'chatSendMessage';

interface LlmApiBaseRequest {
  action: LlmApiAction;
}

interface LlmGenerateRequest extends LlmApiBaseRequest {
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

interface LlmChatRequest extends LlmApiBaseRequest {
  action: 'chatSendMessage';
  model: string;
  systemInstruction: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  message: string;
  thinkingLevel?: 'low' | 'medium' | 'high';
  thinkingMode?: boolean;
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

interface LlmGenerateResponse {
  text: string;
  candidates?: unknown[];
  usageMetadata?: Record<string, unknown>;
}

export interface LlmChatResponse {
  text: string;
  webVerificationStatus?: 'verified' | 'fallback_verified' | 'unverified' | 'not_applicable';
  /** BRU-109 (A): finishReason devolvido pelo /api/llm — o cliente não o
   * expunha; agora permite discriminar truncamento (length) de desobediência
   * ao formato JSON na telemetria estruturada do compact. */
  finishReason?: string;
}

const CUSTOM_LLM_PROXY_BASE_URL = (import.meta.env.VITE_LLM_PROXY_URL || '')
  .replace(/\/api\/llm$/, '')
  .replace(/\/$/, '');
// O serverless usa 55s para chat normal e ate 180s para investigacoes pesadas.
// Frontend da margem de 210s para cobrir o cenario mais longo + overhead de rede.
// PACOTE 1 (SCOUT-V7-GOLD-BUDGET-LAYERED-01, Planejador 2026-08-09): o Gold
// usa override por chamada (270s) via opção timeoutMs — este default de 210s
// permanece para TODOS os consumidores não-Gold.
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

export function resolveLlmApiEndpoint(
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : '',
  isDev: boolean = import.meta.env.DEV,
): string {
  const isLocalDevHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!(isDev && isLocalDevHost)) return '/api/llm';
  return CUSTOM_LLM_PROXY_BASE_URL ? `${CUSTOM_LLM_PROXY_BASE_URL}/api/llm` : '/api/llm';
}

function buildAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted', 'AbortError');
  }
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * BRU-33 — Razão real do abort do signal (semântica abort vs timeout).
 * PRESERVA signal.reason LITERALMENTE (inclusive DOMException TimeoutError/
 * AbortError): no browser, DOMException NÃO é instanceof Error — filtrar por
 * isso recriaria um AbortError genérico e o TimeoutError do deadline Gold
 * (120s) viraria CANCELLED em vez de fallback (gap apontado pelo Planejador
 * 2026-08-09).
 */
function abortReasonOf(signal: AbortSignal): Error {
  return signal.reason != null ? (signal.reason as Error) : buildAbortError();
}

/**
 * BRU-33 — Semântica abort vs timeout (último bloqueador, Planejador
 * 2026-08-09): quando o signal externo aborta com uma RAZÃO (ex.: TimeoutError
 * do deadline Gold de 120s via AbortSignal.timeout), o erro propagado deve
 * PRESERVAR essa razão — TimeoutError deve cair em fallback, e apenas
 * AbortError (user abort) deve virar CANCELLED. Antes, readResponseText
 * recriava tudo como AbortError → o deadline Gold virava CANCELLED.
 */
async function readResponseText(response: Response, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw abortReasonOf(signal);

  let cleanupAbortListener: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    const rejectOnAbort = () => reject(abortReasonOf(signal));
    signal.addEventListener('abort', rejectOnAbort, { once: true });
    cleanupAbortListener = () => signal.removeEventListener('abort', rejectOnAbort);
  });

  try {
    return await Promise.race([response.text(), abortPromise]);
  } finally {
    cleanupAbortListener?.();
  }
}

async function callLlmApi<TResponse>(
  endpoint: string,
  payload:
    | LlmGenerateRequest
    | LlmChatRequest
    | Record<string, unknown>,
  signal?: AbortSignal,
  timeoutOverrideMs?: number,
): Promise<TResponse> {
  const controller = new AbortController();
  // PACOTE 1 (SCOUT-V7-GOLD-BUDGET-LAYERED-01): timeoutOverrideMs permite o
  // Gold usar 270s por chamada sem alterar o default de 210s dos demais.
  const timeoutMs =
    Number.isFinite(timeoutOverrideMs) && (timeoutOverrideMs as number) > 0
      ? (timeoutOverrideMs as number)
      : Number.isFinite(LLM_PROXY_TIMEOUT_MS) && LLM_PROXY_TIMEOUT_MS > 0
        ? LLM_PROXY_TIMEOUT_MS
        : 90000;
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

  // BRU-33: preserva a RAZÃO do abort externo — se o signal do chamador
  // abortou com TimeoutError (deadline Gold 120s), o fetch rejeita com
  // TimeoutError (→ fallback); se abortou com AbortError (user), idem (→
  // CANCELLED). Sem isso, tudo virava AbortError genérico e o deadline do
  // Gold era interpretado como cancelamento do usuário.
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', forwardAbort, { once: true });

  let response: Response | null = null;
  let responseText: string;
  try {
    // BRU-33: signal JÁ abortado antes da chamada → propaga imediatamente a
    // razão (fetch NÃO inicia). Sem isso, um cancelamento entre etapas do
    // Gold ficaria pendente até o timeout interno do proxy (gap apontado pelo
    // Planejador 2026-08-09).
    if (signal?.aborted) throw abortReasonOf(signal);
    try {
      scoutDiag.info('LlmProxy', 'request:start', {
        endpoint,
        action,
        requestClass,
        timeoutMs,
        clientModel: (payload as Record<string, unknown>).model || 'unknown',
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
            ? `LLM proxy body read timeout after ${timeoutMs}ms`
            : `LLM proxy timeout after ${timeoutMs}ms`,
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

    let actualModel = 'unknown';
    try {
      const parsed = JSON.parse(responseText);
      if (parsed && typeof parsed._model === 'string') actualModel = parsed._model;
    } catch {
      /* ignora — log abaixo executa de qualquer forma */
    }

    scoutDiag.info('LlmProxy', 'response:body-read', {
      endpoint,
      action,
      requestClass,
      status: response.status,
      bodyChars: responseText.length,
      model: actualModel,
    });

    if (!response.ok) {
      scoutDiag.error('LlmProxy', 'resposta HTTP nao OK', {
        status: response.status,
        endpoint,
        action,
        requestClass,
      });
      let structuredError: Record<string, unknown> | undefined;
      try {
        const parsed = JSON.parse(responseText) as { error?: unknown };
        if (parsed?.error && typeof parsed.error === 'object') {
          structuredError = parsed.error as Record<string, unknown>;
        }
      } catch {
        // O body não é necessário para propagar o erro estruturado.
      }
      const proxyError = new Error(`LLM proxy failed (${response.status})`);
      Object.assign(proxyError, {
        status: response.status,
        ...(typeof structuredError?.code === 'string' ? { code: structuredError.code } : {}),
        ...(typeof structuredError?.retryable === 'boolean' ? { retryable: structuredError.retryable } : {}),
      });
      throw proxyError;
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
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('LLM proxy returned invalid JSON', { cause: error });
    }
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export async function proxyGenerateContent(
  params: Omit<LlmGenerateRequest, 'action'>,
  signal?: AbortSignal,
): Promise<LlmGenerateResponse> {
  // endpoint resolvido lazy — sem const de módulo
  const response = await callLlmApi<LlmGenerateResponse & { usage?: Record<string, unknown> }>(
    resolveLlmApiEndpoint(),
    { action: 'generateContent', ...params },
    signal,
  );
  // O endpoint /api/llm retorna `usage` (contrato LiteLLM); o consumidor
  // espera `usageMetadata` — normaliza sem expor o restante da resposta.
  if (response.usage && !response.usageMetadata) {
    return { ...response, usageMetadata: response.usage };
  }
  return response;
}

export interface LlmProxyChatOptions {
  /** PACOTE 1: override do timeout do proxy para esta chamada (ms). Gold usa 270_000. */
  timeoutMs?: number;
}

export async function proxyChatSendMessage(
  params: Omit<LlmChatRequest, 'action'>,
  signal?: AbortSignal,
  options?: LlmProxyChatOptions,
): Promise<LlmChatResponse> {
  // endpoint resolvido lazy — sem const de módulo
  return callLlmApi<LlmChatResponse>(
    resolveLlmApiEndpoint(),
    { action: 'chatSendMessage', ...params },
    signal,
    options?.timeoutMs,
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
