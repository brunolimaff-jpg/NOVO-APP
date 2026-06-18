import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ==============================================================================
// Mocks
// ==============================================================================
const rpcMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: [], error: null }));
const deleteUserMock = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: rpcMock,
    auth: {
      admin: {
        deleteUser: deleteUserMock,
      },
    },
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

describe('cron-email-confirmation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: (req: any, res: any) => Promise<any>;

  beforeAll(async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-svc-role-key';

    const mod = await import('../../api/cron-email-confirmation');
    handler = mod.default;
  });

  afterAll(() => {
    delete process.env.CRON_SECRET;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_DELETE_ENABLED;
    rpcMock.mockResolvedValue({ data: [], error: null });
    deleteUserMock.mockResolvedValue({ error: null });
  });

  it('GET com bearer valido — retorna 200', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq(), res);

    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ cleaned: 0 });
  });

  it('GET sem bearer — retorna 401', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ headers: {} }), res);

    expect(state.statusCode).toBe(401);
    expect(state.body).toMatchObject({ error: 'Unauthorized' });
  });

  it('GET com bearer invalido — retorna 401', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ headers: { authorization: 'Bearer wrong-secret' } }), res);

    expect(state.statusCode).toBe(401);
    expect(state.body).toMatchObject({ error: 'Unauthorized' });
  });

  it('POST (compatibilidade) com bearer valido — retorna 200', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ method: 'POST' }), res);

    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ cleaned: 0 });
  });

  it('PUT — retorna 405', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ method: 'PUT' }), res);

    expect(state.statusCode).toBe(405);
    expect(state.body).toMatchObject({ error: 'Method not allowed' });
  });

  it('DELETE — retorna 405', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ method: 'DELETE' }), res);

    expect(state.statusCode).toBe(405);
    expect(state.body).toMatchObject({ error: 'Method not allowed' });
  });

  it('faz dry-run por padrao sem deletar contas expiradas', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'user-1' }, { id: 'user-2' }],
      error: null,
    });

    const { res, state } = makeMockRes();
    await handler(makeMockReq(), res);

    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ dryRun: true, candidates: 2, cleaned: 0, total: 2 });
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('deleta contas expiradas somente quando habilitado explicitamente', async () => {
    process.env.CRON_DELETE_ENABLED = 'true';
    rpcMock.mockResolvedValue({
      data: [{ id: 'user-1' }, { id: 'user-2' }],
      error: null,
    });

    const { res, state } = makeMockRes();
    await handler(makeMockReq(), res);

    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ dryRun: false, candidates: 2, cleaned: 2, total: 2 });
    expect(deleteUserMock).toHaveBeenCalledTimes(2);
    expect(deleteUserMock).toHaveBeenCalledWith('user-1');
    expect(deleteUserMock).toHaveBeenCalledWith('user-2');
  });

  it('retorna erros parciais em caso de falha de delecao', async () => {
    process.env.CRON_DELETE_ENABLED = 'true';
    rpcMock.mockResolvedValue({
      data: [{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }],
      error: null,
    });
    deleteUserMock
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'Not found' } })
      .mockResolvedValueOnce({ error: { message: 'Already deleted' } });

    const { res, state } = makeMockRes();
    await handler(makeMockReq(), res);

    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({ cleaned: 1, total: 3 });
    expect((state.body as { errors: string[] }).errors).toHaveLength(2);
  });
});
