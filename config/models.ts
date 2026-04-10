const DEFAULT_GEMINI_MODEL_ID = 'gemini-3.1-pro-preview';

export const MODEL_IDS = {
  router: DEFAULT_GEMINI_MODEL_ID,
  tactical: DEFAULT_GEMINI_MODEL_ID,
  deepChat: DEFAULT_GEMINI_MODEL_ID,
  deepResearch: DEFAULT_GEMINI_MODEL_ID,
} as const;

export type GeminiModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

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
}: MainChatModelSelectionInput): GeminiModelId {
  if (isDeepDive || isMegaPromptMessage) return STABLE_RESEARCH_MODEL_ID;
  if (shouldForceDirectAnswer) return TACTICAL_MODEL_ID;
  return DEEP_CHAT_MODEL_ID;
}
