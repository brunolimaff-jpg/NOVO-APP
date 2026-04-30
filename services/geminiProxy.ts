import { scoutDiag } from '../utils/diagnosticLog';

type GeminiApiAction = 'generateContent' | 'chatSendMessage' | 'health';

interface GeminiApiBaseRequest {
  action: GeminiApiAction;
}

interface GeminiGenerateRequest extends GeminiApiBaseRequest {
  action: 'generateContent';
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
}

interface GeminiChatRequest extends GeminiApiBaseRequest {
  action: "chatSendMessage";
  model: string;
  systemInstruction: string;
  history: Array<{ role: "user" | "model"; text: string }>;
  message: string;
  useGrounding?: boolean;
  thinkingLevel?: 'low' | 'medium' | 'high';
  thinkingMode?: boolean; // Deprecated: mantido para compatibilidade temporária
  useOpenWebSearch?: boolean; // Novo: para ativar a ferramenta open-web-search
}

interface GeminiHealthRequest extends GeminiApiBaseRequest {
  action: 'health';
}

interface GeminiGenerateResponse {
  text: string;
  candidates?: unknown[];
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

const LOCAL_DEV_BASE_URL =
  (import.meta.env.VITE_GEMINI_PROXY_URL || 'https://scoutagro.vercel.app/api/gemini').replace(/\/api\/gemini$/, '');
// O serverless usa 55s para chat normal e ate 180s para investigacoes pesadas.
// Frontend da margem de 210s para cobrir o cenario mais longo + overhead de rede.
const GEMINI_PROXY_TIMEOUT_MS = Number(import.meta.env.VITE_GEMINI_PROXY_TIMEOUT_MS || 210000);

// FIX: resolveEndpoint permanece como função pura — nunca como const de módulo.
// Chamá-la no nível de módulo causaria TDZ quando outro módulo importa geminiProxy
// antes que window/import.meta estejam disponíveis no bundle minificado.
function resolveEndpoint(path: string): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalDev = import.meta.env.DEV && (hostname === 'localhost' || hostname === '127.0.0.1');
  return isLocalDev ? `${LOCAL_DEV_BASE_URL}${path}` : path;
}

export function resolveGeminiApiEndpoint(
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : '',
  isDev: boolean = import.meta.env.DEV,
): string {
  const isLocalDevHost = hostname === 'localhost' || hostname === '127.0.0.1';
  return isDev && isLocalDevHost ? `${LOCAL_DEV_BASE_URL}/api/gemini` : '/api/gemini';
}

// FIX: removidas as const GEMINI_API_ENDPOINT e GERAR_DOSSIE_ENDPOINT do escopo
// de módulo. Cada função resolve seu endpoint de forma lazy (na primeira chamada),
// garantindo que window e import.meta estejam disponíveis no momento da avaliação.

async function callGeminiApi<TResponse>(
  endpoint: string,
  payload: GeminiGenerateRequest | GeminiChatRequest | GeminiHealthRequest | Record<string, unknown>,
  signal?: AbortSignal
): Promise<TResponse> {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(GEMINI_PROXY_TIMEOUT_MS) && GEMINI_PROXY_TIMEOUT_MS > 0
    ? GEMINI_PROXY_TIMEOUT_MS
    : 90000;
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error: unknown) {
    if (timedOut) {
      scoutDiag.error('GeminiProxy', 'timeout no proxy', { timeoutMs, endpoint });
      throw new Error(`Gemini proxy timeout after ${timeoutMs}ms`, {
        cause: error,
      });
    }
    scoutDiag.error('GeminiProxy', 'falha de rede ou abort no fetch', {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', forwardAbort);
  }

  if (!response.ok) {
    const text = await response.text();
    scoutDiag.error('GeminiProxy', 'resposta HTTP nao OK', {
      status: response.status,
      endpoint,
      bodyPreview: (text || '').slice(0, 200),
    });
    throw new Error(`Gemini proxy failed (${response.status}): ${text || 'unknown error'}`);
  }

  return response.json() as Promise<TResponse>;
}

export async function proxyGenerateContent(
  params: Omit<GeminiGenerateRequest, 'action'>,
  signal?: AbortSignal
): Promise<GeminiGenerateResponse> {
  // endpoint resolvido lazy — sem const de módulo
  return callGeminiApi<GeminiGenerateResponse>(resolveGeminiApiEndpoint(), { action: 'generateContent', ...params }, signal);
}

export async function proxyChatSendMessage(
  params: Omit<GeminiChatRequest, "action">,
  signal?: AbortSignal
): Promise<GeminiChatResponse> {
  // endpoint resolvido lazy — sem const de módulo
  return callGeminiApi<GeminiChatResponse>(resolveGeminiApiEndpoint(), { action: "chatSendMessage", ...params }, signal);
}

export interface OpenWebSearchResponse {
  content?: string;
  source?: string;
  sources?: Array<{ title?: string; url?: string; snippet?: string; provider?: string }>;
  providerStatus?: Array<{
    provider: 'brave' | 'duckduckgo';
    ok: boolean;
    reason?: 'missing_key' | 'unauthorized' | 'quota_exhausted' | 'rate_limited' | 'timeout' | 'server_error' | 'empty_result' | 'unknown';
    statusCode?: number;
  }>;
  degraded?: boolean;
  error?: string;
  detail?: string;
}

export async function executeOpenWebSearchTool(query: string, url?: string): Promise<OpenWebSearchResponse> {
  const endpoint = import.meta.env.VITE_OPEN_WEB_SEARCH_URL || "/api/open-web-search";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, url })
  });
  if (!response.ok) {
    throw new Error(`OpenWebSearch failed: ${response.status}`);
  }
  return response.json();
}

export async function proxyGeminiHealth(signal?: AbortSignal): Promise<GeminiHealthResponse> {
  // endpoint resolvido lazy — sem const de módulo
  return callGeminiApi<GeminiHealthResponse>(resolveGeminiApiEndpoint(), { action: "health" }, signal);
}

/** Endpoint dedicado para geração de dossiês completos via Gemini generateContent. */
export async function proxyGerarDossie(
  params: Omit<GeminiGenerateRequest, 'action'>,
  signal?: AbortSignal
): Promise<GeminiGenerateResponse> {
  // FIX: endpoint resolvido lazy dentro da função, não como const de módulo.
  // Previne TDZ "Cannot access '$i' before initialization" em produção.
  return callGeminiApi<GeminiGenerateResponse>(resolveEndpoint('/api/gerar-dossie'), params, signal);
}
