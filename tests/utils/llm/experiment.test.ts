import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSupabaseAuthHeadersMock = vi.hoisted(() => vi.fn());
const refreshSupabaseAuthHeadersMock = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/supabaseClient.js', () => ({
  getSupabaseAuthHeaders: getSupabaseAuthHeadersMock,
  refreshSupabaseAuthHeaders: refreshSupabaseAuthHeadersMock,
}));

describe('utils/llm/experiment', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSupabaseAuthHeadersMock.mockResolvedValue({ Authorization: 'Bearer token-1' });
    refreshSupabaseAuthHeadersMock.mockResolvedValue({ Authorization: 'Bearer token-2' });
    vi.unstubAllGlobals();
  });

  it('renova auth uma vez em 401 e repete finalize com keepalive', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const { finalizeExperimentRun } = await import('../../../utils/llm/experiment');

    await finalizeExperimentRun(
      { id: 'run-1', runToken: 'run-token', status: 'success' },
      { authHeaders: { Authorization: 'Bearer stale' } },
    );

    expect(getSupabaseAuthHeadersMock).not.toHaveBeenCalled();
    expect(refreshSupabaseAuthHeadersMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      keepalive: true,
      headers: expect.objectContaining({ Authorization: 'Bearer token-2' }),
    });
  });

  it('segundo 401 vazio após refresh falha sem tentar parsear body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    const { finalizeExperimentRun } = await import('../../../utils/llm/experiment');

    await expect(
      finalizeExperimentRun(
        { id: 'run-1', runToken: 'run-token', status: 'completed' },
        { authHeaders: { Authorization: 'Bearer stale' } },
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(refreshSupabaseAuthHeadersMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('timeout agregado também limita refresh de sessão', async () => {
    refreshSupabaseAuthHeadersMock.mockReturnValueOnce(new Promise<Record<string, string>>(() => undefined));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }));
    const { finalizeExperimentRun } = await import('../../../utils/llm/experiment');

    await expect(
      finalizeExperimentRun(
        { id: 'run-1', runToken: 'run-token', status: 'completed' },
        { authHeaders: { Authorization: 'Bearer stale' }, timeoutMs: 10 },
      ),
    ).rejects.toThrow('timed out');
    expect(refreshSupabaseAuthHeadersMock).toHaveBeenCalledTimes(1);
  });

  it('reutiliza os headers do createRun no finalizeRun', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'run-1', runToken: 'token-run-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { createExperimentRun, finalizeExperimentRun } = await import('../../../utils/llm/experiment');

    const run = await createExperimentRun({
      experimentId: 'exp-1',
      selectedModel: 'oracle/xai.grok-4-fast-reasoning',
      provider: 'litellm',
      runId: 'waterfall-1',
      operatorEmail: 'bruno.ferreira@senior.com.br',
      promptVersion: 'prompt-v1',
      codeVersion: 'code-v1',
    });

    await finalizeExperimentRun(
      {
        id: run.id,
        runToken: run.runToken,
        status: 'success',
        operatorEmail: 'bruno.ferreira@senior.com.br',
        reportChars: 38871,
      },
      { authHeaders: run.authHeaders },
    );

    expect(getSupabaseAuthHeadersMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-1',
      }),
    });
  });

  it('repete finalize uma vez em erro transitório', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const { finalizeExperimentRun } = await import('../../../utils/llm/experiment');

    await finalizeExperimentRun(
      { id: 'run-1', runToken: 'token', status: 'completed' },
      { authHeaders: { Authorization: 'Bearer token-1' } },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
