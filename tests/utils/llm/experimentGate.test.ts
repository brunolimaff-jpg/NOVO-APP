import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock('../../../utils/diagnosticLog', () => ({
  scoutDiag: {
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('resolveLiteLLMExperimentGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_LLM_PROVIDER', 'litellm');
    vi.stubEnv('VITE_LLM_EXPERIMENT_MODE', 'fixed');
    vi.stubEnv('VITE_LLM_ALLOWLIST', 'bruno@senior.com.br');
    vi.resetModules();
  });

  it('fecha gate sem sessão Supabase Auth', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    const { resolveLiteLLMExperimentGate } = await import('../../../utils/llm/experimentGate');
    const gate = await resolveLiteLLMExperimentGate('bruno@senior.com.br');
    expect(gate.llmEnabled).toBe(false);
    expect(gate.reason).toBe('no_supabase_session');
  });

  it('fecha gate para guest mesmo com email local na allowlist', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    const { resolveLiteLLMExperimentGate } = await import('../../../utils/llm/experimentGate');
    const gate = await resolveLiteLLMExperimentGate('bruno@senior.com.br');
    expect(gate.llmEnabled).toBe(false);
    expect(gate.hasSupabaseSession).toBe(false);
  });

  it('abre gate com sessão Supabase e email na allowlist', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token',
          user: { email: 'bruno@senior.com.br' },
        },
      },
      error: null,
    });
    const { resolveLiteLLMExperimentGate } = await import('../../../utils/llm/experimentGate');
    const gate = await resolveLiteLLMExperimentGate('outro@local.com');
    expect(gate.llmEnabled).toBe(true);
    expect(gate.operatorEmail).toBe('bruno@senior.com.br');
  });

  it('prefere email Supabase sobre email local para allowlist', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token',
          user: { email: 'outro@senior.com.br' },
        },
      },
      error: null,
    });
    const { resolveLiteLLMExperimentGate } = await import('../../../utils/llm/experimentGate');
    const gate = await resolveLiteLLMExperimentGate('bruno@senior.com.br');
    expect(gate.llmEnabled).toBe(false);
    expect(gate.reason).toBe('operator_not_allowed');
    expect(gate.operatorEmail).toBe('outro@senior.com.br');
  });
});
