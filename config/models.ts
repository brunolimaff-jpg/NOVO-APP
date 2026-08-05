const DEFAULT_LLM_MODEL_ID = 'scout-router';

/**
 * Intenções neutras de modelo — NUNCA nomes concretos de provedor no cliente.
 * A resolução para modelos concretos acontece exclusivamente no servidor
 * (utils/llm/modelRouter.ts).
 */
export const MODEL_IDS = {
  router: DEFAULT_LLM_MODEL_ID,
  tactical: 'scout-tactical',
  deepChat: 'scout-deep-chat',
  deepResearch: 'scout-deep-research',
} as const;

export type LlmModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

export const ROUTER_MODEL_ID = MODEL_IDS.router;
export const TACTICAL_MODEL_ID = MODEL_IDS.tactical;
export const DEEP_CHAT_MODEL_ID = MODEL_IDS.deepChat;
export const STABLE_RESEARCH_MODEL_ID = MODEL_IDS.deepResearch;
export const LOADING_CURIOSITY_MODEL_ID = MODEL_IDS.router;

export interface MainChatModelSelectionInput {
  isDeepDive: boolean;
  isMegaPromptMessage: boolean;
  shouldForceDirectAnswer: boolean;
}

export function selectMainChatModelId({
  isDeepDive,
  isMegaPromptMessage,
  shouldForceDirectAnswer,
}: MainChatModelSelectionInput): LlmModelId {
  if (isDeepDive || isMegaPromptMessage) return STABLE_RESEARCH_MODEL_ID;
  if (shouldForceDirectAnswer) return TACTICAL_MODEL_ID;
  return DEEP_CHAT_MODEL_ID;
}
