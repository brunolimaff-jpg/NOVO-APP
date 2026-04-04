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
  action: 'chatSendMessage';
  model: string;
  systemInstruction: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  message: string;
  useGrounding?: boolean;
  thinkingMode?: boolean;
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

const GEMINI_API_ENDPOINT = resolveGeminiApiEndpoint();
const GERAR_DOSSIE_ENDPOINT = resolveEndpoint('/api/gerar-dossie');

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
      throw new Error(`Gemini proxy timeout after ${timeoutMs}ms`);
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
  return callGeminiApi<GeminiGenerateResponse>(GEMINI_API_ENDPOINT, { action: 'generateContent', ...params }, signal);
}

export async function proxyChatSendMessage(
  params: Omit<GeminiChatRequest, 'action'>,
  signal?: AbortSignal
): Promise<GeminiChatResponse> {
  return callGeminiApi<GeminiChatResponse>(GEMINI_API_ENDPOINT, { action: 'chatSendMessage', ...params }, signal);
}

export async function proxyGeminiHealth(signal?: AbortSignal): Promise<GeminiHealthResponse> {
  return callGeminiApi<GeminiHealthResponse>(GEMINI_API_ENDPOINT, { action: 'health' }, signal);
}

/** Endpoint dedicado para geração de dossiês completos via Gemini generateContent. */
export async function proxyGerarDossie(
  params: Omit<GeminiGenerateRequest, 'action'>,
  signal?: AbortSignal
): Promise<GeminiGenerateResponse> {
  return callGeminiApi<GeminiGenerateResponse>(GERAR_DOSSIE_ENDPOINT, params, signal);
}
