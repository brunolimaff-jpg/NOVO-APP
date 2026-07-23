type Environment = Record<string, string | undefined>;
type LiteLLMRole = 'system' | 'user' | 'assistant';

export interface LiteLLMUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface NormalizeModelOutputResult {
  text: string;
  reasoningRemoved: boolean;
  reasoningCharsRemoved: number;
}

const DEFAULT_REQUEST_BUDGET_MS = 38_000;
const MAX_REQUEST_BUDGET_MS = 180_000;
const DEFAULT_LEGACY_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;

export interface LiteLLMLegacyInput {
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  correlationId?: string;
}

export interface LiteLLMCallInput {
  model: string;
  systemInstruction?: string;
  userContent: string;
  history?: Array<{ role: LiteLLMRole; content: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  correlationId?: string;
}

export interface LiteLLMCallResult {
  text: string;
  usage: LiteLLMUsageMetadata;
  finishReason?: string;
  reasoningRemoved: boolean;
  reasoningCharsRemoved: number;
}

class LiteLLMHttpError extends Error {
  constructor(readonly status: number) {
    super(`LiteLLM HTTP ${status}`);
    this.name = 'LiteLLMHttpError';
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function makeAbortError(message = 'The operation was aborted'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function remainingBudget(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);

  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

async function waitWithinBudget(delayMs: number, deadline: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw makeAbortError();
  if (remainingBudget(deadline) <= delayMs) throw new Error('LiteLLM total request budget exceeded');

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(makeAbortError());
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function withSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw makeAbortError('LiteLLM request budget exceeded or aborted');

  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      signal.addEventListener('abort', () => reject(makeAbortError('LiteLLM request budget exceeded or aborted')), {
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
  if (new RegExp(`</${tag}>`, 'i').test(afterOpen)) return { text, removedChars: 0 };

  const markerOffset = afterOpen.search(/\n#+\s|\[\[PORTA|\{/);
  if (markerOffset > 0) {
    const cleaned = `${text.slice(0, openIndex)}${afterOpen.slice(markerOffset)}`.trimStart();
    return { text: cleaned, removedChars: text.length - cleaned.length };
  }

  const before = text.length;
  const cleaned = text.replace(new RegExp(`<${tag}>[\\s\\S]*$`, 'i'), '').trim();
  return { text: cleaned, removedChars: before - cleaned.length };
}

function stripReasoningBeforeFirstHeading(text: string): { text: string; removedChars: number } {
  const markerIndex = text.search(/(^|\n)#+\s|\[\[PORTA|\{/);
  if (markerIndex <= 0) return { text, removedChars: 0 };

  const prefix = text.slice(0, markerIndex);
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
  return { text, reasoningRemoved: reasoningCharsRemoved > 0, reasoningCharsRemoved };
}

export function ensureMarkdownStart(text: string): string {
  return text.trim();
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

export function isLiteLLMEnabled(env: Environment = process.env): boolean {
  return env.LLM_PROVIDER === 'litellm' && Boolean(env.LITELLM_API_KEY) && Boolean(env.LITELLM_BASE_URL);
}

export function isFallbackEnabled(env: Environment = process.env): boolean {
  return env.LLM_FALLBACK_ENABLED === 'true';
}

export function resolveLiteLLMRequestBudgetMs(rawValue?: string): number {
  const configured = Number(rawValue ?? DEFAULT_REQUEST_BUDGET_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_REQUEST_BUDGET_MS;
  return Math.min(configured, MAX_REQUEST_BUDGET_MS);
}

export function resolveLiteLLMClientTimeoutMs(rawValue?: string): number {
  const configured = Number(rawValue ?? DEFAULT_LEGACY_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_LEGACY_TIMEOUT_MS;
  return Math.min(configured, MAX_REQUEST_BUDGET_MS);
}

function isLegacyInput(input: LiteLLMLegacyInput | LiteLLMCallInput): input is LiteLLMLegacyInput {
  return 'messages' in input;
}

function buildMessages(input: LiteLLMLegacyInput | LiteLLMCallInput): Array<{ role: LiteLLMRole; content: string }> {
  if (isLegacyInput(input)) {
    return input.messages
      .filter(message => ['system', 'user', 'assistant'].includes(message.role))
      .map(message => ({ role: message.role as LiteLLMRole, content: message.content }));
  }

  const messages: Array<{ role: LiteLLMRole; content: string }> = [];
  if (input.systemInstruction) messages.push({ role: 'system', content: input.systemInstruction });
  messages.push(...(input.history ?? []), { role: 'user', content: input.userContent });
  return messages;
}

export function callLiteLLM(input: LiteLLMLegacyInput, env?: Environment): Promise<string>;
// eslint-disable-next-line no-redeclare
export function callLiteLLM(input: LiteLLMCallInput, env?: Environment): Promise<LiteLLMCallResult>;
// eslint-disable-next-line no-redeclare
export async function callLiteLLM(
  input: LiteLLMLegacyInput | LiteLLMCallInput,
  env: Environment = process.env,
): Promise<string | LiteLLMCallResult> {
  const baseUrl = env.LITELLM_BASE_URL?.replace(/\/+$/, '');
  const apiKey = env.LITELLM_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('LiteLLM não configurado: LITELLM_BASE_URL e LITELLM_API_KEY são obrigatórios');
  }

  const legacy = isLegacyInput(input);
  const budgetMs =
    input.timeoutMs ??
    (legacy
      ? resolveLiteLLMClientTimeoutMs(env.VITE_LITELLM_CLIENT_TIMEOUT_MS)
      : resolveLiteLLMRequestBudgetMs(env.LITELLM_REQUEST_TIMEOUT_MS));
  const deadline = Date.now() + budgetMs;
  const configuredRetries = Number(env.LITELLM_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
  const maxRetries = Number.isInteger(configuredRetries) && configuredRetries >= 0
    ? Math.min(configuredRetries, DEFAULT_MAX_RETRIES)
    : DEFAULT_MAX_RETRIES;
  const configuredDelay = Number(env.LITELLM_RETRY_BASE_DELAY_MS ?? DEFAULT_RETRY_BASE_DELAY_MS);
  const retryDelayMs = Number.isFinite(configuredDelay) && configuredDelay >= 0
    ? configuredDelay
    : DEFAULT_RETRY_BASE_DELAY_MS;
  const messages = buildMessages(input);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (input.signal?.aborted) throw makeAbortError();

    const available = remainingBudget(deadline);
    if (available <= 0) throw new Error('LiteLLM total request budget exceeded');
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), available);
    const signal = input.signal ? combineSignals([input.signal, timeoutController.signal]) : timeoutController.signal;

    try {
      const response = await withSignal(
        fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(input.correlationId ? { 'X-Request-ID': input.correlationId } : {}),
          },
          body: JSON.stringify({
            model: input.model,
            messages,
            temperature: input.temperature ?? (legacy ? 0.7 : 0.1),
            max_tokens: legacy ? input.maxTokens ?? 4096 : input.maxOutputTokens ?? 8192,
          }),
          signal,
        }),
        signal,
      );

      if (!response.ok) {
        await withSignal(response.text().catch(() => ''), signal);
        throw new LiteLLMHttpError(response.status);
      }

      const responseBody = await withSignal(response.text(), signal);
      const completion = JSON.parse(responseBody) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const choice = completion.choices?.[0];
      const normalized = normalizeModelOutput(choice?.message?.content ?? '');
      if (!normalized.text) throw new Error('LiteLLM retornou resposta vazia');

      const result: LiteLLMCallResult = {
        text: normalized.text,
        usage: normalizeUsage(completion.usage),
        finishReason: choice?.finish_reason,
        reasoningRemoved: normalized.reasoningRemoved,
        reasoningCharsRemoved: normalized.reasoningCharsRemoved,
      };
      return legacy ? result.text : result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const permanentHttpError = error instanceof LiteLLMHttpError && !isRetryableStatus(error.status);
      const retryable =
        !permanentHttpError &&
        !(error instanceof SyntaxError) &&
        !/resposta vazia/i.test(lastError.message) &&
        lastError.name !== 'AbortError';
      if (attempt >= maxRetries || input.signal?.aborted || !retryable) break;
      await waitWithinBudget(retryDelayMs * 2 ** attempt, deadline, input.signal);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  console.error('[LiteLLM] request failed', {
    correlationId: input.correlationId ?? 'unassigned',
    errorName: lastError?.name ?? 'Error',
  });
  throw lastError ?? new Error('LiteLLM request failed');
}
