import { EXPERIMENT_MODELS, getVariantForModel } from './modelCatalog.js';
import type { ExperimentConfig, ExperimentMode, ExperimentSelection } from './types.js';

/** Lê env: parâmetro explícito (testes/server) → VITE_* (browser) → process.env. */
function readConfigEnv(key: string, env?: NodeJS.ProcessEnv): string | undefined {
  if (env && env[key]) {
    return env[key];
  }
  const viteKey = `VITE_${key}`;
  if (!env && typeof import.meta !== 'undefined' && import.meta.env) {
    const viteVal = (import.meta.env as Record<string, string | boolean | undefined>)[viteKey];
    if (typeof viteVal === 'string' && viteVal.length > 0) {
      return viteVal;
    }
  }
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key];
  }
  return undefined;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseTrafficSplit(value: string | undefined, modelCount: number): number[] {
  const parts = parseCsv(value).map(part => Number(part));
  if (parts.length === modelCount && parts.every(n => Number.isFinite(n) && n > 0)) {
    return parts;
  }
  if (modelCount <= 0) return [];
  const even = Math.floor(100 / modelCount);
  const remainder = 100 - even * modelCount;
  return Array.from({ length: modelCount }, (_, index) => even + (index < remainder ? 1 : 0));
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function getExperimentConfig(env: NodeJS.ProcessEnv = process.env): ExperimentConfig {
  const provider = readConfigEnv('LLM_PROVIDER', env) === 'litellm' ? 'litellm' : 'gemini';
  const experimentMode = (readConfigEnv('LLM_EXPERIMENT_MODE', env) ?? 'off') as ExperimentMode;
  const experimentModels = parseCsv(readConfigEnv('LLM_EXPERIMENT_MODELS', env));
  const models = experimentModels.length > 0 ? experimentModels : [...EXPERIMENT_MODELS];

  return {
    enabled: provider === 'litellm' && experimentMode !== 'off',
    provider,
    experimentMode,
    experimentId: readConfigEnv('LLM_EXPERIMENT_ID', env) ?? 'litellm_3_modelos_v1',
    defaultModel: readConfigEnv('LLM_MODEL_DEFAULT', env) ?? models[0] ?? EXPERIMENT_MODELS[0],
    experimentModels: models,
    trafficSplit: parseTrafficSplit(readConfigEnv('LLM_EXPERIMENT_TRAFFIC_SPLIT', env), models.length),
    allowlist: parseCsv(readConfigEnv('LLM_ALLOWLIST', env)).map(email => email.toLowerCase()),
    fallbackEnabled: readConfigEnv('LLM_FALLBACK_ENABLED', env) !== 'false',
    litellmBaseUrl: readConfigEnv('LITELLM_BASE_URL', env) ?? '',
  };
}

export function isOperatorAllowed(
  operatorEmail: string | null | undefined,
  config: ExperimentConfig = getExperimentConfig(),
): boolean {
  if (config.allowlist.length === 0) return false;
  const normalized = normalizeEmail(operatorEmail);
  if (!normalized) return false;
  return config.allowlist.includes(normalized);
}

function pickWeightedModel(models: string[], weights: number[], seed: number): string {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (models.length === 0) return '';
  if (total <= 0) return models[seed % models.length] ?? models[0];

  let cursor = seed % total;
  for (let index = 0; index < models.length; index += 1) {
    const weight = weights[index] ?? 0;
    if (cursor < weight) {
      return models[index] ?? models[0];
    }
    cursor -= weight;
  }

  return models[models.length - 1] ?? models[0];
}

export interface SelectExperimentModelInput {
  config?: ExperimentConfig;
  seed?: number;
}

export function selectExperimentModel(input: SelectExperimentModelInput = {}): ExperimentSelection | null {
  const config = input.config ?? getExperimentConfig();
  if (!config.enabled) return null;

  const seed = input.seed ?? Date.now();
  let model = config.defaultModel;

  if (config.experimentMode === 'random' && config.experimentModels.length > 0) {
    model = pickWeightedModel(config.experimentModels, config.trafficSplit, seed);
  }

  return {
    model,
    variant: getVariantForModel(model),
    experimentId: config.experimentId,
    provider: 'litellm',
  };
}

export function shouldCreateExperimentRun(config: ExperimentConfig = getExperimentConfig()): boolean {
  return config.enabled && (config.experimentMode === 'fixed' || config.experimentMode === 'random');
}
