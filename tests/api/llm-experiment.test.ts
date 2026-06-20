import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const singleMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: fromMock,
  })),
}));

function makeMockReq(body: Record<string, unknown>) {
  return {
    method: 'POST',
    body,
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

describe('api/llm-experiment', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: (req: any, res: any) => Promise<any>;

  beforeAll(async () => {
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-svc-role-key';

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

    const mod = await import('../../api/llm-experiment.js');
    handler = mod.default;
  });

  afterAll(() => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  });

  it('rejeita método não-POST', async () => {
    const { res, state } = makeMockRes();
    await handler({ method: 'GET' }, res);
    expect(state.statusCode).toBe(405);
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
      }),
      res,
    );

    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ id: 'run-uuid-1' });
    expect(insertMock).toHaveBeenCalled();
  });

  it('createRun — valida campos obrigatórios', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ action: 'createRun' }), res);
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
        structuralScore: 90,
        totalCostUsd: 0.12,
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
    await handler(makeMockReq({ action: 'finalizeRun' }), res);
    expect(state.statusCode).toBe(400);
  });

  it('rejeita action inválida', async () => {
    const { res, state } = makeMockRes();
    await handler(makeMockReq({ action: 'unknown' }), res);
    expect(state.statusCode).toBe(400);
  });
});
