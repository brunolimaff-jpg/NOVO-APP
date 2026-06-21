import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getExperimentConfig,
  isOperatorAllowed,
  selectExperimentModel,
  shouldCreateExperimentRun,
} from '../../../utils/llm/modelRouter.js';
import type { ExperimentConfig } from '../../../utils/llm/types.js';

function litellmEnv(overrides: Record<string, string> = {}): Record<string, string | undefined> {
  return {
    LLM_PROVIDER: 'litellm',
    LLM_EXPERIMENT_MODE: 'fixed',
    LLM_MODEL_DEFAULT: 'huawei/deepseek-v4-flash',
    LLM_ALLOWLIST: 'bruno@senior.com.br',
    LLM_EXPERIMENT_ID: 'litellm_3_modelos_v2',
    ...overrides,
  };
}

describe('getExperimentConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('default gemini desabilita experimento', () => {
    const config = getExperimentConfig({});
    expect(config.provider).toBe('gemini');
    expect(config.enabled).toBe(false);
  });

  it('litellm fixed habilita experimento', () => {
    const config = getExperimentConfig(litellmEnv());
    expect(config.enabled).toBe(true);
    expect(config.experimentMode).toBe('fixed');
  });

  it('sem env explícito lê VITE_LLM_* no browser', () => {
    vi.stubEnv('VITE_LLM_PROVIDER', 'litellm');
    vi.stubEnv('VITE_LLM_EXPERIMENT_MODE', 'fixed');
    vi.stubEnv('VITE_LLM_ALLOWLIST', 'bruno@senior.com.br');
    const config = getExperimentConfig();
    expect(config.enabled).toBe(true);
    expect(config.allowlist).toContain('bruno@senior.com.br');
  });
});

describe('selectExperimentModel', () => {
  it('mode off retorna null', () => {
    const config = getExperimentConfig({ LLM_PROVIDER: 'gemini', LLM_EXPERIMENT_MODE: 'off' });
    expect(selectExperimentModel({ config })).toBeNull();
  });

  it('mode fixed retorna DeepSeek V3.2', () => {
    const config = getExperimentConfig(litellmEnv({ LLM_MODEL_DEFAULT: 'huawei/deepseek-v3.2' }));
    const selection = selectExperimentModel({ config, seed: 1 });
    expect(selection?.model).toBe('huawei/deepseek-v3.2');
    expect(selection?.variant).toBe('D');
  });

  it('mode fixed retorna V4 Flash', () => {
    const config = getExperimentConfig(litellmEnv({ LLM_MODEL_DEFAULT: 'huawei/deepseek-v4-flash' }));
    const selection = selectExperimentModel({ config, seed: 1 });
    expect(selection?.model).toBe('huawei/deepseek-v4-flash');
    expect(selection?.variant).toBe('B');
  });

  it('mode fixed retorna Grok 4.1 Fast', () => {
    const config = getExperimentConfig(litellmEnv({ LLM_MODEL_DEFAULT: 'oracle/xai.grok-4-1-fast-non-reasoning' }));
    const selection = selectExperimentModel({ config, seed: 1 });
    expect(selection?.model).toBe('oracle/xai.grok-4-1-fast-non-reasoning');
    expect(selection?.variant).toBe('E');
  });

  it('mode random distribui entre 3 modelos', () => {
    const config = getExperimentConfig(
      litellmEnv({
        LLM_EXPERIMENT_MODE: 'random',
        LLM_EXPERIMENT_MODELS: 'huawei/deepseek-v4-flash,huawei/deepseek-v3.2,oracle/xai.grok-4-1-fast-non-reasoning',
        LLM_EXPERIMENT_TRAFFIC_SPLIT: '33,33,34',
      }),
    );

    const models = new Set<string>();
    for (let seed = 0; seed < 100; seed += 1) {
      const selection = selectExperimentModel({ config, seed });
      if (selection) models.add(selection.model);
    }

    expect(models.size).toBe(3);
  });

  it('seed determinístico retorna mesmo modelo', () => {
    const config = getExperimentConfig(
      litellmEnv({
        LLM_EXPERIMENT_MODE: 'random',
        LLM_EXPERIMENT_MODELS: 'huawei/deepseek-v4-flash,huawei/deepseek-v3.2,oracle/xai.grok-4-1-fast-non-reasoning',
      }),
    );

    const first = selectExperimentModel({ config, seed: 42 });
    const second = selectExperimentModel({ config, seed: 42 });
    expect(first?.model).toBe(second?.model);
  });
});

describe('isOperatorAllowed', () => {
  const config: ExperimentConfig = {
    enabled: true,
    provider: 'litellm',
    experimentMode: 'fixed',
    experimentId: 'test',
    defaultModel: 'huawei/deepseek-r1-250528',
    experimentModels: [],
    trafficSplit: [],
    allowlist: ['bruno@senior.com.br'],
    fallbackEnabled: true,
    litellmBaseUrl: '',
    previewLocalAuth: false,
  };

  it('allowlist vazia nega todos', () => {
    expect(isOperatorAllowed('bruno@senior.com.br', { ...config, allowlist: [] })).toBe(false);
  });

  it('email na allowlist permite', () => {
    expect(isOperatorAllowed('bruno@senior.com.br', config)).toBe(true);
  });

  it('email fora da allowlist nega', () => {
    expect(isOperatorAllowed('outro@senior.com.br', config)).toBe(false);
  });

  it('case insensitive', () => {
    expect(isOperatorAllowed('Bruno@Senior.COM.BR', config)).toBe(true);
  });

  it('null email nega', () => {
    expect(isOperatorAllowed(null, config)).toBe(false);
  });
});

describe('shouldCreateExperimentRun', () => {
  it('fixed e random criam run', () => {
    expect(shouldCreateExperimentRun(getExperimentConfig(litellmEnv({ LLM_EXPERIMENT_MODE: 'fixed' })))).toBe(true);
    expect(shouldCreateExperimentRun(getExperimentConfig(litellmEnv({ LLM_EXPERIMENT_MODE: 'random' })))).toBe(true);
  });

  it('off não cria run', () => {
    expect(shouldCreateExperimentRun(getExperimentConfig({ LLM_PROVIDER: 'gemini' }))).toBe(false);
  });
});
