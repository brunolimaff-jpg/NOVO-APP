import type { ModelCatalogEntry } from './types.js';

export const EXPERIMENT_MODELS = [
  'oracle/xai.grok-4-1-fast-non-reasoning',
  'huawei/deepseek-v3.2',
  'oracle/xai.grok-4-fast-reasoning',
  'oracle/xai.grok-4.20-0309-reasoning',
] as const;

export type ExperimentModelId = (typeof EXPERIMENT_MODELS)[number];

export const FALLBACK_MODEL = 'gemini-3-flash-preview';

export const MODEL_CATALOG: Record<string, ModelCatalogEntry> = {
  'huawei/deepseek-r1-250528': {
    id: 'huawei/deepseek-r1-250528',
    variant: 'A',
    displayName: 'DeepSeek R1',
    inputPricePerMillion: 0.54,
    outputPricePerMillion: 2.16,
    reasoning: true,
  },
  'huawei/deepseek-v4-flash': {
    id: 'huawei/deepseek-v4-flash',
    variant: 'B',
    displayName: 'DeepSeek V4 Flash (deprecated — timeout)',
    inputPricePerMillion: 0.14,
    outputPricePerMillion: 0.27,
    reasoning: true,
  },
  'huawei/deepseek-v3.2': {
    id: 'huawei/deepseek-v3.2',
    variant: 'D',
    displayName: 'DeepSeek V3.2',
    inputPricePerMillion: 0.27,
    outputPricePerMillion: 0.4,
    reasoning: false,
  },
  'oracle/xai.grok-4-1-fast-non-reasoning': {
    id: 'oracle/xai.grok-4-1-fast-non-reasoning',
    variant: 'E',
    displayName: 'Grok 4.1 Fast',
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 0.5,
    reasoning: false,
  },
  'oracle/xai.grok-4-fast-reasoning': {
    id: 'oracle/xai.grok-4-fast-reasoning',
    variant: 'F',
    displayName: 'Grok 4 Fast Reasoning',
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 0.5,
    reasoning: true,
  },
  'oracle/xai.grok-4.20-0309-reasoning': {
    id: 'oracle/xai.grok-4.20-0309-reasoning',
    variant: 'G',
    displayName: 'Grok 4.20 Reasoning (0309)',
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 0.5,
    reasoning: true,
  },
  'bedrock/moonshot.kimi-k2-thinking': {
    id: 'bedrock/moonshot.kimi-k2-thinking',
    variant: 'C',
    displayName: 'Kimi K2 Thinking',
    inputPricePerMillion: 0.6,
    outputPricePerMillion: 2.5,
    reasoning: true,
  },
  [FALLBACK_MODEL]: {
    id: FALLBACK_MODEL,
    variant: 'fallback',
    displayName: 'Gemini Flash Preview',
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    reasoning: false,
  },
};

export function getModelCatalogEntry(modelId: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG[modelId];
}

export function getVariantForModel(modelId: string): string {
  return MODEL_CATALOG[modelId]?.variant ?? 'unknown';
}
