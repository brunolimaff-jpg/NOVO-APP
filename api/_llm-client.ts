/**
 * LiteLLM HTTP client for Vercel serverless functions.
 *
 * Encapsulates auth, timeout, and retry logic so callers only need
 * to pass model/prompt parameters.
 */

export interface LiteLLMParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/* ------------------------------------------------------------------ */
/*  Guards                                                            */
/* ------------------------------------------------------------------ */

export function isLiteLLMEnabled(): boolean {
  return process.env.LLM_PROVIDER === 'litellm' && !!process.env.LITELLM_API_KEY && !!process.env.LITELLM_BASE_URL;
}

/* ------------------------------------------------------------------ */
/*  Timeout resolution                                                */
/* ------------------------------------------------------------------ */

export function resolveLiteLLMClientTimeoutMs(): number {
  const raw = process.env.VITE_LITELLM_CLIENT_TIMEOUT_MS;
  if (!raw) return 120_000;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120_000;

  return Math.min(parsed, 180_000);
}

/* ------------------------------------------------------------------ */
/*  Core client                                                       */
/* ------------------------------------------------------------------ */

export async function callLiteLLM(params: LiteLLMParams): Promise<string> {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const apiKey = process.env.LITELLM_API_KEY;
  const timeout = params.timeoutMs ?? resolveLiteLLMClientTimeoutMs();

  if (!baseUrl || !apiKey) {
    throw new Error('LITELLM_BASE_URL and LITELLM_API_KEY must be set');
  }

  const body = {
    model: params.model,
    messages: params.messages,
    max_tokens: params.maxTokens ?? 4096,
    temperature: params.temperature ?? 0.7,
  };

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const maxAttempts = 2;
  const backoffMs = 1_000;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const isRetryable = response.status === 429 || response.status >= 500;
        const err = new Error(`LiteLLM request failed [${response.status}]: ${errorText || response.statusText}`);
        (err as unknown as Record<string, unknown>).isRetryable = isRetryable;
        throw err;
      }

      const data: unknown = await response.json();

      const content = extractContent(data);

      if (content === undefined || content === null) {
        throw new Error('LiteLLM response missing choices[0].message.content');
      }

      return content;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable = (lastError as unknown as Record<string, unknown>).isRetryable ?? true;

      if (attempt < maxAttempts && isRetryable) {
        await sleep(backoffMs);
      } else {
        break;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  const errorMessage = lastError?.message ?? 'Unknown error';
  console.error('[callLiteLLM] all attempts failed:', errorMessage);
  throw new Error(`LiteLLM call failed after ${maxAttempts} attempts: ${errorMessage}`);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractContent(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const obj = data as Record<string, unknown>;
  const choices = obj.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const message = choices[0]?.message;
  if (!message || typeof message !== 'object' || typeof (message as Record<string, unknown>).content !== 'string') {
    return undefined;
  }
  return (message as Record<string, unknown>).content as string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
