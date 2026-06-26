export type LLMProvider = 'litellm' | 'gemini';
export interface LLMRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}
export interface LLMResponse {
  text: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}
export interface LLMError extends Error {
  provider: LLMProvider;
  statusCode?: number;
  isRetryable: boolean;
}
