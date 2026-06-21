import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const fromMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const singleMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: fromMock,
    auth: { getUser: getUserMock },
  })),
}));

function makeMockReq(body: Record<string, unknown>) {
  return {
    method: 'POST',
    body,
    headers: { authorization: 'Bearer valid-user-jwt' },
  };
}

function runToken(id: string): string {
  return createHmac('sha256', 'test-svc-role-key').update(`${id}:auth-user-1`).digest('hex');
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
    setHeader: () => res,
    send: (body: unknown) => {
      state.body = body;
      return res;
    },
  };

  return { res, state };
}

describe('api/llm-experiment', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: (req: any, res: any) => Promise<any>;

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-svc-role-key';
    process.env.LLM_PROVIDER = 'litellm';
    process.env.LLM_ALLOWLIST = 'bruno@senior.com.br';

    fromMock.mockImplementation(() => ({
      insert: insertMock,
      update: updateMock,
    }));

    insertMock.mockReturnValue({
      select: selectMock,
    });
    selectMock.mockReturnValue({
      single: singleMock,
    });
    updateMock.mockReturnValue({
      eq: eqMock,
    });
    eqMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({
      data: { user: { id: 'auth-user-1', email: 'bruno@senior.com.br' } },
      error: null,
    });

    const mod = await import('../../api/llm-experiment.js');
    handler = mod.default;
  });

  afterAll(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_ALLOWLIST;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockImplementation(() => ({
      insert: insertMock,
      update: updateMock,
    }));
    insertMock.mockReturnValue({ select: selectMock });
    selectMock.mockReturnValue({ single: singleMock });
    updateMock.mockReturnValue({ eq: eqMock });
    eqMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({
      data: { user: { id: 'auth-user-1', email: 'bruno@senior.com.br' } },
      error: null,
    });
  });

  it('rejeita método não suportado', async () => {
    const { res, state } = makeMockRes();
    await handler({ method: 'DELETE' }, res);
    expect(state.statusCode).toBe(405);
  });

  it('GET report — retorna markdown vazio', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });
    fromMock.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({ order: orderMock }),
    }));

    const { res, state } = makeMockRes();
    await handler(
      { method: 'GET', query: { format: 'markdown' }, headers: { authorization: 'Bearer valid-user-jwt' } },
      res,
    );
    expect(state.statusCode).toBe(200);
    expect(String(state.body)).toContain('LLM Experiment Report');
  });

  it('createRun — retorna id', async () => {
    singleMock.mockResolvedValue({ data: { id: 'run-uuid-1' }, error: null });

    const { res, state } = makeMockRes();
    await handler(
      makeMockReq({
        action: 'createRun',
        experimentId: 'litellm_3_modelos_v1',
        selectedModel: 'huawei/deepseek-r1-250528',
        provider: 'litellm',
        runId: 'wf-123',
        promptVersion: 'v1',
        codeVersion: 'abc123',
        operatorEmail: 'bruno@senior.com.br',
      }),
      res,
    );

    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ id: 'run-uuid-1', runToken: runToken('run-uuid-1') });
    expect(insertMock).toHaveBeenCalled();
  });

  it('createRun — valida campos obrigatórios', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ action: 'createRun', operatorEmail: 'bruno@senior.com.br' }), res);
    expect(state.statusCode).toBe(400);
    expect((state.body as { error: string }).error).toContain('experimentId');
  });

  it('finalizeRun — atualiza status', async () => {
    const { res, state } = makeMockRes();
    await handler(
      makeMockReq({
        action: 'finalizeRun',
        id: 'run-uuid-1',
        status: 'success',
        runToken: runToken('run-uuid-1'),
        structuralScore: 90,
        totalCostUsd: 0.12,
        operatorEmail: 'bruno@senior.com.br',
      }),
      res,
    );

    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith('id', 'run-uuid-1');
  });

  it('finalizeRun — exige id e status', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ action: 'finalizeRun', operatorEmail: 'bruno@senior.com.br' }), res);
    expect(state.statusCode).toBe(400);
  });

  it('rejeita action inválida', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ action: 'unknown', operatorEmail: 'bruno@senior.com.br' }), res);
    expect(state.statusCode).toBe(400);
  });

  it('rejeita sessão ausente mesmo quando o body contém email allowlisted', async () => {
    const { res, state } = makeMockRes();
    await handler(
      { method: 'POST', headers: {}, body: { action: 'createRun', operatorEmail: 'bruno@senior.com.br' } },
      res,
    );
    expect(state.statusCode).toBe(401);
  });

  it('rejeita token de run que não pertence ao usuário autenticado', async () => {
    const { res, state } = makeMockRes();
    await handler(
      makeMockReq({ action: 'finalizeRun', id: 'run-uuid-1', runToken: 'invalid', status: 'success' }),
      res,
    );
    expect(state.statusCode).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
