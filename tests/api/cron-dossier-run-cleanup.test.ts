import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ==============================================================================
// Mocks
// ==============================================================================
const rpcMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: 0, error: null }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
}));

// Env vars precisam estar setadas antes do handler importar
const CRON_SECRET = 'cron-secret-test-123';

function makeMockReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    headers: {
      authorization: `Bearer ${CRON_SECRET}`,
    },
    ...overrides,
  };
}

function makeMockRes() {
  const state = { statusCode: 200, body: null as unknown };

  const res: Record<string, unknown> = {
    status: (code: number) => {
      state.statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      state.body = body;
      return res;
    },
  };

  return { res, state };
}

describe('cron-dossier-run-cleanup', () => {
  let handler: (req: any, res: any) => Promise<any>;

  beforeAll(async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-svc-role-key';

    const mod = await import('../../api/cron-dossier-run-cleanup');
    handler = mod.default;
  });

  afterAll(() => {
    delete process.env.CRON_SECRET;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.CRON_STALE_CLEANUP_ENABLED;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: 0, error: null });
  });

  it('rejeita método não permitido com 405', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ method: 'DELETE' }), res);
    expect(state.statusCode).toBe(405);
    expect(state.body).toEqual({ error: 'Method not allowed' });
  });

  it('rejeita sem CRON_SECRET configurado com 500', async () => {
    delete process.env.CRON_SECRET;
    try {
      const { res, state } = makeMockRes();
      await handler(makeMockReq(), res);
      expect(state.statusCode).toBe(500);
      expect(state.body).toEqual({ error: 'CRON_SECRET not configured' });
    } finally {
      process.env.CRON_SECRET = CRON_SECRET;
    }
  });

  it('rejeita autorização inválida com 401', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ headers: { authorization: 'Bearer wrong-secret' } }), res);
    expect(state.statusCode).toBe(401);
    expect(state.body).toEqual({ error: 'Unauthorized' });
  });

  it('executa dry-run quando CRON_STALE_CLEANUP_ENABLED não está ativo', async () => {
    delete process.env.CRON_STALE_CLEANUP_ENABLED;
    rpcMock.mockResolvedValue({ data: 3, error: null });

    const { res, state } = makeMockRes();
    await handler(makeMockReq(), res);

    expect(rpcMock).toHaveBeenCalledWith('close_stale_dossier_runs', {
      p_stale_after_seconds: 3600,
      p_batch_limit: 50,
      p_dry_run: true,
    });
    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({
      dryRun: true,
      staleAfterSeconds: 3600,
      closed: 3,
    });
  });

  it('executa a limpeza real quando CRON_STALE_CLEANUP_ENABLED=true', async () => {
    process.env.CRON_STALE_CLEANUP_ENABLED = 'true';
    rpcMock.mockResolvedValue({ data: 2, error: null });

    const { res, state } = makeMockRes();
    await handler(makeMockReq({ method: 'POST' }), res);

    expect(rpcMock).toHaveBeenCalledWith('close_stale_dossier_runs', {
      p_stale_after_seconds: 3600,
      p_batch_limit: 50,
      p_dry_run: false,
    });
    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({
      dryRun: false,
      staleAfterSeconds: 3600,
      closed: 2,
    });
  });

  it('retorna 500 com detalhe quando a RPC falha', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const { res, state } = makeMockRes();
    await handler(makeMockReq(), res);

    expect(state.statusCode).toBe(500);
    expect(state.body).toEqual({ error: 'RPC failed', detail: 'boom' });
  });
});
