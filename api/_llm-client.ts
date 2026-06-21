import type { LiteLLMUsageMetadata, NormalizeModelOutputResult } from '../utils/llm/types.js';
import { withAutoRetry } from '../utils/retry.js';

type Environment = Record<string, string | undefined>;

const DEFAULT_LITELLM_REQUEST_TIMEOUT_MS = 140_000;

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

  const timeoutMs = Number(env.LITELLM_REQUEST_TIMEOUT_MS || DEFAULT_LITELLM_REQUEST_TIMEOUT_MS);
  const effectiveTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_LITELLM_REQUEST_TIMEOUT_MS;

  return withAutoRetry(
    `LiteLLM:${input.model}`,
    async () => {
      const timeoutSignal = AbortSignal.timeout(effectiveTimeoutMs);
      const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
      const response = await fetch(`${baseUrl}/chat/completions`, {
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
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`LiteLLM HTTP ${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const completion = (await response.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const choice = completion.choices?.[0];
      const rawText = choice?.message?.content ?? '';
      const normalized = normalizeModelOutput(rawText);

      return {
        text: normalized.text,
        usage: normalizeUsage(completion.usage),
        finishReason: choice?.finish_reason,
        reasoningRemoved: normalized.reasoningRemoved,
        reasoningCharsRemoved: normalized.reasoningCharsRemoved,
      };
    },
    { maxRetries: 5, baseDelayMs: 2000, maxDelayMs: 30000, abortSignal: input.signal },
  );
}
