import { describe, expect, it } from 'vitest';
import {
  DEEP_CHAT_MODEL_ID,
  MODEL_IDS,
  selectMainChatModelId,
  STABLE_RESEARCH_MODEL_ID,
  TACTICAL_MODEL_ID,
} from '../../config/models';

describe('selectMainChatModelId', () => {
  it('returns deep research model for deep dive', () => {
    const model = selectMainChatModelId({
      isDeepDive: true,
      isMegaPromptMessage: false,
      shouldForceDirectAnswer: false,
    });

    expect(model).toBe(STABLE_RESEARCH_MODEL_ID);
  });

  it('returns deep research model for mega prompt', () => {
    const model = selectMainChatModelId({
      isDeepDive: false,
      isMegaPromptMessage: true,
      shouldForceDirectAnswer: true,
    });

    expect(model).toBe(STABLE_RESEARCH_MODEL_ID);
  });

  it('returns tactical model for forced direct answer', () => {
    const model = selectMainChatModelId({
      isDeepDive: false,
      isMegaPromptMessage: false,
      shouldForceDirectAnswer: true,
    });

    expect(model).toBe(TACTICAL_MODEL_ID);
  });

  it('returns deep chat model by default', () => {
    const model = selectMainChatModelId({
      isDeepDive: false,
      isMegaPromptMessage: false,
      shouldForceDirectAnswer: false,
    });

    expect(model).toBe(DEEP_CHAT_MODEL_ID);
  });
});

describe('MODEL_IDS', () => {
  it('keeps same model id across roles', () => {
    expect(MODEL_IDS.router).toBe('gemini-3-flash-preview');
    expect(MODEL_IDS.tactical).toBe(MODEL_IDS.router);
    expect(MODEL_IDS.deepChat).toBe(MODEL_IDS.router);
    expect(MODEL_IDS.deepResearch).toBe(MODEL_IDS.router);
  });
});
