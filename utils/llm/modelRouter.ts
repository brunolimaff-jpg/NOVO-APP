import { EXPERIMENT_MODELS, getVariantForModel } from './modelCatalog.js';
import type { ExperimentConfig, ExperimentMode, ExperimentSelection } from './types.js';

type Environment = Record<string, string | undefined>;

/**
 * Lê env: parâmetro explícito (testes/server) → VITE_* (browser) → process.env.
 *
 * ATENÇÃO: Quando chamada sem argumentos no browser, VITE_LLM_ALLOWLIST é
 * exposta no bundle JavaScript. A autenticação server-side (_experiment-auth.ts)
 * é authoritative e não depende deste valor. O client-side é apenas gate visual.
 */
function readConfigEnv(key: string, env?: Environment): string | undefined {
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

function parseExperimentMode(value: string | undefined): ExperimentMode {
  return value === 'fixed' || value === 'random' ? value : 'off';
}

export function getExperimentConfig(env?: Environment): ExperimentConfig {
  const provider = readConfigEnv('LLM_PROVIDER', env) === 'litellm' ? 'litellm' : 'gemini';
  const experimentMode = parseExperimentMode(readConfigEnv('LLM_EXPERIMENT_MODE', env));
  const experimentModels = parseCsv(readConfigEnv('LLM_EXPERIMENT_MODELS', env));
  const models = experimentModels.length > 0 ? experimentModels : [...EXPERIMENT_MODELS];

  return {
    enabled: provider === 'litellm' && experimentMode !== 'off',
    provider,
    experimentMode,
    experimentId: readConfigEnv('LLM_EXPERIMENT_ID', env) ?? 'litellm_3_modelos_v2',
    defaultModel: readConfigEnv('LLM_MODEL_DEFAULT', env) ?? models[0] ?? EXPERIMENT_MODELS[0],
    experimentModels: models,
    trafficSplit: parseTrafficSplit(readConfigEnv('LLM_EXPERIMENT_TRAFFIC_SPLIT', env), models.length),
    allowlist: parseCsv(readConfigEnv('LLM_ALLOWLIST', env)).map(email => email.toLowerCase()),
    fallbackEnabled: readConfigEnv('LLM_FALLBACK_ENABLED', env) !== 'false',
    litellmBaseUrl: readConfigEnv('LITELLM_BASE_URL', env) ?? '',
    previewLocalAuth: readConfigEnv('LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH', env) === 'true',
  };
}

export function isOperatorAllowed(
  operatorEmail: string | null | undefined,
  config: ExperimentConfig = getExperimentConfig(),
): boolean {
  // Fail closed: the experiment is unavailable until at least one email is explicitly allowlisted.
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

// ═══════════════════════════════════════════════════════════════════════════════
// HYBRID_MODEL_MAP — Pipeline híbrido por módulo
// Todos os módulos → Haiku 4.5 (custo mínimo, alta velocidade)
// ═══════════════════════════════════════════════════════════════════════════════

export const HYBRID_MODEL_MAP: Record<string, string> = {
  'teia-societaria': 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
  operacao: 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'tech-stack': 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'riscos-compliance': 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'radar-expansao': 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'rh-sindicatos': 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
  decisores: 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'caminho-venda': 'bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
};

export function isHybridPipelineEnabled(env?: Environment): boolean {
  return readConfigEnv('HYBRID_PIPELINE_ENABLED', env) === 'true';
}

export interface SelectExperimentModelInput {
  config?: ExperimentConfig;
  seed?: number;
  moduleName?: string;
}

export function selectExperimentModel(input: SelectExperimentModelInput = {}): ExperimentSelection | null {
  const config = input.config ?? getExperimentConfig();
  if (!config.enabled) return null;

  // Pipeline híbrido: se moduleName definido E hybrid ativo, usa modelo do mapa
  if (input.moduleName && isHybridPipelineEnabled()) {
    const hybridModel = HYBRID_MODEL_MAP[input.moduleName];
    if (hybridModel) {
      return {
        model: hybridModel,
        variant: getVariantForModel(hybridModel),
        experimentId: config.experimentId,
        provider: 'litellm',
      };
    }
  }

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
