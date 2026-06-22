import type { LiteLLMUsageMetadata, NormalizeModelOutputResult } from '../utils/llm/types.js';

type Environment = Record<string, string | undefined>;

const DEFAULT_LITELLM_REQUEST_TIMEOUT_MS = 55_000;
const MAX_LITELLM_REQUEST_TIMEOUT_MS = 55_000;
const DEFAULT_LITELLM_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;

class LiteLLMHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function remainingBudget(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

async function waitWithinBudget(delayMs: number, deadline: number, signal?: AbortSignal): Promise<void> {
  const available = remainingBudget(deadline);
  if (available <= delayMs) throw new Error('LiteLLM total request budget exceeded');

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(new Error('Aborted'));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

async function withDeadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error('LiteLLM total request budget exceeded');
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('LiteLLM total request budget exceeded')), {
        once: true,
      });
    }),
  ]);
}

const REASONING_PREFIXES = [
  /^let me analyze[\s\S]*?(?=\n#|\[\[PORTA|\{)/i,
  /^vou analisar[\s\S]*?(?=\n#|\[\[PORTA|\{)/i,
  /^i(?:'|')?ll analyze[\s\S]*?(?=\n#|\[\[PORTA|\{)/i,
];

export function isLiteLLMEnabled(env: Environment = process.env): boolean {
  return env.LLM_PROVIDER === 'litellm' && Boolean(env.LITELLM_API_KEY) && Boolean(env.LITELLM_BASE_URL);
}

export function isFallbackEnabled(env: Environment = process.env): boolean {
  return env.LLM_FALLBACK_ENABLED !== 'false';
}

export function resolveLiteLLMRequestBudgetMs(rawValue?: string): number {
  const configured = Number(rawValue ?? DEFAULT_LITELLM_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_LITELLM_REQUEST_TIMEOUT_MS;
  return Math.min(configured, MAX_LITELLM_REQUEST_TIMEOUT_MS);
}

function stripClosedTag(text: string, tag: string): { text: string; removedChars: number } {
  const regex = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi');
  const before = text.length;
  const cleaned = text.replace(regex, '').trim();
  return { text: cleaned, removedChars: before - cleaned.length };
}

function stripUnclosedTag(text: string, tag: string): { text: string; removedChars: number } {
  const openIndex = text.search(new RegExp(`<${tag}>`, 'i'));
  if (openIndex < 0) return { text, removedChars: 0 };

  const afterOpen = text.slice(openIndex);
  if (new RegExp(`</${tag}>`, 'i').test(afterOpen)) {
    return { text, removedChars: 0 };
  }

  const markerOffset = afterOpen.search(/\n#+\s|\[\[PORTA|\{/);
  if (markerOffset > 0) {
    const cleaned = `${text.slice(0, openIndex)}${afterOpen.slice(markerOffset)}`.trimStart();
    return { text: cleaned, removedChars: text.length - cleaned.length };
  }

  const regex = new RegExp(`<${tag}>[\\s\\S]*$`, 'i');
  const before = text.length;
  const cleaned = text.replace(regex, '').trim();
  return { text: cleaned, removedChars: before - cleaned.length };
}

function stripReasoningBeforeFirstHeading(text: string): { text: string; removedChars: number } {
  const markerIndex = text.search(/(^|\n)#+\s|\[\[PORTA|\{/);
  if (markerIndex <= 0) return { text, removedChars: 0 };

  const prefix = text.slice(0, markerIndex);
  if (!prefix.trim()) return { text, removedChars: 0 };

  const looksLikeReasoning =
    /<(?:redacted_thinking|reasoning|analysis)>/i.test(prefix) ||
    /^(let me|vou analisar|i(?:'|')?ll analyze)/i.test(prefix.trim());

  if (!looksLikeReasoning) return { text, removedChars: 0 };

  const cleaned = text.slice(markerIndex).trimStart();
  return { text: cleaned, removedChars: prefix.length };
}

function stripExplicitPrefixes(text: string): { text: string; removedChars: number } {
  let current = text;
  let removedChars = 0;

  for (const regex of REASONING_PREFIXES) {
    const before = current.length;
    current = current.replace(regex, '').trimStart();
    removedChars += before - current.length;
  }

  return { text: current, removedChars };
}

export function normalizeModelOutput(raw: string): NormalizeModelOutputResult {
  let text = raw ?? '';
  let reasoningCharsRemoved = 0;

  const layers: Array<(input: string) => { text: string; removedChars: number }> = [
    input => stripClosedTag(input, 'redacted_thinking'),
    input => stripClosedTag(input, 'reasoning'),
    input => stripClosedTag(input, 'analysis'),
    input => stripUnclosedTag(input, 'redacted_thinking'),
    input => stripUnclosedTag(input, 'reasoning'),
    input => stripUnclosedTag(input, 'analysis'),
    stripReasoningBeforeFirstHeading,
    stripExplicitPrefixes,
  ];

  for (const layer of layers) {
    const result = layer(text);
    text = result.text;
    reasoningCharsRemoved += result.removedChars;
  }

  text = ensureMarkdownStart(text);

  return {
    text,
    reasoningRemoved: reasoningCharsRemoved > 0,
    reasoningCharsRemoved,
  };
}

export function ensureMarkdownStart(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  if (/^#+\s/.test(trimmed) || /\[\[PORTA/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

export function normalizeUsage(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): LiteLLMUsageMetadata {
  return {
    promptTokenCount: usage?.prompt_tokens,
    candidatesTokenCount: usage?.completion_tokens,
    totalTokenCount: usage?.total_tokens,
  };
}

export interface LiteLLMCallInput {
  model: string;
  systemInstruction?: string;
  userContent: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface LiteLLMCallResult {
  text: string;
  usage: LiteLLMUsageMetadata;
  finishReason?: string;
  reasoningRemoved: boolean;
  reasoningCharsRemoved: number;
}

export async function callLiteLLM(input: LiteLLMCallInput, env: Environment = process.env): Promise<LiteLLMCallResult> {
  const baseUrl = env.LITELLM_BASE_URL?.replace(/\/$/, '');
  const apiKey = env.LITELLM_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('LiteLLM não configurado: LITELLM_BASE_URL e LITELLM_API_KEY são obrigatórios');
  }

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (input.systemInstruction) {
    messages.push({ role: 'system', content: input.systemInstruction });
  }
  messages.push({ role: 'user', content: input.userContent });

  const effectiveTimeoutMs = resolveLiteLLMRequestBudgetMs(env.LITELLM_REQUEST_TIMEOUT_MS);

  const deadline = Date.now() + effectiveTimeoutMs;
  const configuredRetries = Number(env.LITELLM_MAX_RETRIES ?? DEFAULT_LITELLM_MAX_RETRIES);
  const maxRetries = Number.isInteger(configuredRetries) && configuredRetries >= 0
    ? Math.min(configuredRetries, DEFAULT_LITELLM_MAX_RETRIES)
    : DEFAULT_LITELLM_MAX_RETRIES;
  const configuredDelay = Number(env.LITELLM_RETRY_BASE_DELAY_MS ?? DEFAULT_RETRY_BASE_DELAY_MS);
  const baseDelayMs = Number.isFinite(configuredDelay) && configuredDelay >= 0
    ? configuredDelay
    : DEFAULT_RETRY_BASE_DELAY_MS;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (input.signal?.aborted) {
      throw new Error('Aborted');
    }

    let attemptTimeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const available = remainingBudget(deadline);
      if (available <= 0) throw new Error('LiteLLM total request budget exceeded');
      const timeoutController = new AbortController();
      attemptTimeoutId = setTimeout(() => timeoutController.abort(), available);
      const signal = input.signal
        ? AbortSignal.any([input.signal, timeoutController.signal])
        : timeoutController.signal;
      const response = await withDeadline(fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: input.model,
          messages,
          temperature: input.temperature ?? 0.1,
          max_tokens: input.maxOutputTokens ?? 8192,
        }),
        signal,
      }), signal);

      if (!response.ok) {
        const errorBody = await withDeadline(response.text().catch(() => ''), signal);
        clearTimeout(attemptTimeoutId);
        throw new LiteLLMHttpError(response.status, `LiteLLM HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const responseBody = await withDeadline(response.text(), signal);
      if (remainingBudget(deadline) <= 0) throw new Error('LiteLLM total request budget exceeded');
      const completion = JSON.parse(responseBody) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const choice = completion.choices?.[0];
      const rawText = choice?.message?.content ?? '';
      const normalized = normalizeModelOutput(rawText);
      clearTimeout(attemptTimeoutId);
      if (!normalized.text.trim()) {
        throw new Error('LiteLLM retornou resposta vazia');
      }

      return {
        text: normalized.text,
        usage: normalizeUsage(completion.usage),
        finishReason: choice?.finish_reason,
        reasoningRemoved: normalized.reasoningRemoved,
        reasoningCharsRemoved: normalized.reasoningCharsRemoved,
      };
    } catch (error) {
      if (attemptTimeoutId) clearTimeout(attemptTimeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));
      const permanentHttpError = error instanceof LiteLLMHttpError && !isRetryableStatus(error.status);
      const retryable = !permanentHttpError && !(error instanceof SyntaxError) && !/resposta vazia/i.test(lastError.message);
      if (attempt >= maxRetries || input.signal?.aborted || !retryable) break;
      await waitWithinBudget(baseDelayMs * Math.pow(2, attempt), deadline, input.signal);
    }
  }

  throw lastError ?? new Error('LiteLLM request failed');
}
