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
  runId?: string;
  action?: string;
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
  runId?: string;
  action?: string;
  maxRetries?: number;
}

export interface LiteLLMCallResult {
  text: string;
  usage: LiteLLMUsageMetadata;
  finishReason?: string;
  reasoningRemoved: boolean;
  reasoningCharsRemoved: number;
}

export type LiteLLMErrorCode =
  | 'GATEWAY_NOT_CONFIGURED'
  | 'GATEWAY_TIMEOUT'
  | 'GATEWAY_ABORTED'
  | 'GATEWAY_HTTP_ERROR'
  | 'GATEWAY_INVALID_RESPONSE';

export class LiteLLMRequestError extends Error {
  constructor(
    readonly code: LiteLLMErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LiteLLMRequestError';
  }
}

class LiteLLMHttpError extends LiteLLMRequestError {
  constructor(status: number) {
    super('GATEWAY_HTTP_ERROR', `LiteLLM HTTP ${status}`, isRetryableStatus(status), status);
    this.name = 'LiteLLMHttpError';
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function makeGatewayAbortError(): LiteLLMRequestError {
  return new LiteLLMRequestError('GATEWAY_ABORTED', 'LiteLLM request aborted by external signal', false);
}

function makeGatewayTimeoutError(): LiteLLMRequestError {
  return new LiteLLMRequestError('GATEWAY_TIMEOUT', 'LiteLLM request budget exceeded', true);
}

function remainingBudget(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function createAttemptAbortContext(externalSignal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  reason: () => 'external' | 'timeout' | undefined;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let abortReason: 'external' | 'timeout' | undefined;
  const abortExternal = () => {
    abortReason ??= 'external';
    controller.abort();
  };
  if (externalSignal?.aborted) {
    abortExternal();
  } else {
    externalSignal?.addEventListener('abort', abortExternal, { once: true });
  }
  const timeoutId = setTimeout(() => {
    abortReason ??= 'timeout';
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    reason: () => abortReason,
    cleanup: () => {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortExternal);
    },
  };
}

async function waitWithinBudget(delayMs: number, deadline: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw makeGatewayAbortError();
  if (remainingBudget(deadline) <= delayMs) throw makeGatewayTimeoutError();

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(makeGatewayAbortError());
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function withSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw makeGatewayAbortError();
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      cleanup();
      reject(makeGatewayAbortError());
    };
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      value => {
        cleanup();
        resolve(value);
      },
      error => {
        cleanup();
        reject(error);
      },
    );
  });
}

function normalizeLiteLLMError(
  error: unknown,
  abortReason: 'external' | 'timeout' | undefined,
): LiteLLMRequestError {
  if (abortReason === 'timeout') return makeGatewayTimeoutError();
  if (abortReason === 'external') return makeGatewayAbortError();
  if (error instanceof LiteLLMRequestError) return error;
  if (error instanceof SyntaxError || (error instanceof Error && /resposta vazia/i.test(error.message))) {
    return new LiteLLMRequestError(
      'GATEWAY_INVALID_RESPONSE',
      error instanceof Error ? error.message : 'LiteLLM returned an invalid response',
      false,
    );
  }
  if (error instanceof Error && error.name === 'AbortError') return makeGatewayAbortError();
  return new LiteLLMRequestError(
    'GATEWAY_HTTP_ERROR',
    error instanceof Error ? error.message : 'LiteLLM request failed',
    true,
  );
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
  const startedAt = Date.now();
  const baseUrl = env.LITELLM_BASE_URL?.replace(/\/+$/, '');
  const apiKey = env.LITELLM_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new LiteLLMRequestError(
      'GATEWAY_NOT_CONFIGURED',
      'LiteLLM não configurado: LITELLM_BASE_URL e LITELLM_API_KEY são obrigatórios',
      false,
    );
  }

  const legacy = isLegacyInput(input);
  const budgetMs =
    input.timeoutMs ??
    (legacy
      ? resolveLiteLLMClientTimeoutMs(env.VITE_LITELLM_CLIENT_TIMEOUT_MS)
      : resolveLiteLLMRequestBudgetMs(env.LITELLM_REQUEST_TIMEOUT_MS));
  const deadline = Date.now() + budgetMs;
  const requestedRetries = !legacy && input.maxRetries !== undefined
    ? input.maxRetries
    : Number(env.LITELLM_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
  const maxRetries = Number.isInteger(requestedRetries) && requestedRetries >= 0
    ? Math.min(requestedRetries, DEFAULT_MAX_RETRIES)
    : DEFAULT_MAX_RETRIES;
  const configuredDelay = Number(env.LITELLM_RETRY_BASE_DELAY_MS ?? DEFAULT_RETRY_BASE_DELAY_MS);
  const retryDelayMs = Number.isFinite(configuredDelay) && configuredDelay >= 0
    ? configuredDelay
    : DEFAULT_RETRY_BASE_DELAY_MS;
  const messages = buildMessages(input);
  let lastError: LiteLLMRequestError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (input.signal?.aborted) throw makeGatewayAbortError();

    const available = remainingBudget(deadline);
    if (available <= 0) throw makeGatewayTimeoutError();
    const abortContext = createAttemptAbortContext(input.signal, available);

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
          signal: abortContext.signal,
        }),
        abortContext.signal,
      );

      if (!response.ok) {
        await withSignal(response.text().catch(() => ''), abortContext.signal);
        throw new LiteLLMHttpError(response.status);
      }

      const responseBody = await withSignal(response.text(), abortContext.signal);
      let completion: {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      try {
        completion = JSON.parse(responseBody) as typeof completion;
      } catch (error) {
        throw new LiteLLMRequestError(
          'GATEWAY_INVALID_RESPONSE',
          error instanceof Error ? error.message : 'LiteLLM returned invalid JSON',
          false,
        );
      }
      const choice = completion.choices?.[0];
      const rawText = choice?.message?.content ?? '';
      if (!rawText.trim()) {
        throw new LiteLLMRequestError('GATEWAY_INVALID_RESPONSE', 'LiteLLM retornou resposta vazia', false);
      }

      if (legacy) {
        return rawText;
      }

      const normalized = normalizeModelOutput(rawText);
      const result: LiteLLMCallResult = {
        text: normalized.text,
        usage: normalizeUsage(completion.usage),
        finishReason: choice?.finish_reason,
        reasoningRemoved: normalized.reasoningRemoved,
        reasoningCharsRemoved: normalized.reasoningCharsRemoved,
      };
      return result;
    } catch (error) {
      lastError = normalizeLiteLLMError(error, abortContext.reason());
      if (attempt >= maxRetries || !lastError.retryable || lastError.code === 'GATEWAY_TIMEOUT') break;
      await waitWithinBudget(retryDelayMs * 2 ** attempt, deadline, input.signal);
    } finally {
      abortContext.cleanup();
    }
  }

  console.error('[LiteLLM] request failed', {
    correlationId: input.correlationId ?? 'unassigned',
    runId: input.runId ?? 'unassigned',
    action: input.action ?? (isLegacyInput(input) ? 'legacy' : 'unknown'),
    stage: 'gateway',
    durationMs: Date.now() - startedAt,
    errorCode: lastError?.code ?? 'INTERNAL_ERROR',
    errorName: lastError?.name ?? 'Error',
  });
  throw lastError ?? new LiteLLMRequestError('GATEWAY_HTTP_ERROR', 'LiteLLM request failed', true);
}
