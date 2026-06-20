import type { ModelCatalogEntry } from './types.js';

export const EXPERIMENT_MODELS = [
  'huawei/deepseek-r1-250528',
  'huawei/deepseek-v4-flash',
  'bedrock/moonshot.kimi-k2-thinking',
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
    displayName: 'DeepSeek V4 Flash',
    inputPricePerMillion: 0.14,
    outputPricePerMillion: 0.27,
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
