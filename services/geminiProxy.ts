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

/** Resposta do endpoint chatSendMessage.
 *  groundingUsed: true  → grounding ativo e com evidências (fontes retornadas).
 *  groundingUsed: false → grounding inativo, falhou silenciosamente (fallback)
 *                         ou ativo mas sem chunks — resposta pode não estar ancorada.
 */
interface GeminiChatResponse {
  text: string;
  groundingChunks?: unknown[];
  /** Indica se o grounding foi efetivamente utilizado nesta resposta. */
  groundingUsed: boolean;
}

interface GeminiHealthResponse {
  ok: boolean;
  text?: string;
}

const LOCAL_DEV_GEMINI_PROXY_URL =
  import.meta.env.VITE_GEMINI_PROXY_URL || 'https://scoutagro.vercel.app/api/gemini';
// O serverless usa 55s para chat normal e até 180s para investigações pesadas.
// Frontend dá margem de 210s para cobrir o cenário mais longo + overhead de rede.
const GEMINI_PROXY_TIMEOUT_MS = Number(import.meta.env.VITE_GEMINI_PROXY_TIMEOUT_MS || 210000);

export function resolveGeminiApiEndpoint(
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : '',
  isDev: boolean = import.meta.env.DEV,
): string {
  const isLocalDevHost = hostname === 'localhost' || hostname === '127.0.0.1';
  return isDev && isLocalDevHost ? LOCAL_DEV_GEMINI_PROXY_URL : '/api/gemini';
}

const GEMINI_API_ENDPOINT = resolveGeminiApiEndpoint();

async function callGeminiApi<TResponse>(
  payload: GeminiGenerateRequest | GeminiChatRequest | GeminiHealthRequest,
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
    response = await fetch(GEMINI_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error: unknown) {
    if (timedOut) {
      scoutDiag.error('GeminiProxy', 'timeout no proxy', { timeoutMs, endpoint: GEMINI_API_ENDPOINT });
      throw new Error(`Gemini proxy timeout after ${timeoutMs}ms`);
    }
    scoutDiag.error('GeminiProxy', 'falha de rede ou abort no fetch', {
      endpoint: GEMINI_API_ENDPOINT,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', forwardAbort);
  }

  if (!response.ok) {
    const text = await response.text();
    scoutDiag.error('GeminiProxy', 'resposta HTTP não OK', {
      status: response.status,
      endpoint: GEMINI_API_ENDPOINT,
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
  return callGeminiApi<GeminiGenerateResponse>({ action: 'generateContent', ...params }, signal);
}

export async function proxyChatSendMessage(
  params: Omit<GeminiChatRequest, 'action'>,
  signal?: AbortSignal
): Promise<GeminiChatResponse> {
  return callGeminiApi<GeminiChatResponse>({ action: 'chatSendMessage', ...params }, signal);
}

export async function proxyGeminiHealth(signal?: AbortSignal): Promise<GeminiHealthResponse> {
  return callGeminiApi<GeminiHealthResponse>({ action: 'health' }, signal);
}
