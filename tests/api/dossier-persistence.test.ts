import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOSSIER_EVIDENCE_CATEGORIES, type DossierEvidenceContract } from '../../shared/dossierGatewayContracts';

const fetchMock = vi.hoisted(() => vi.fn());
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const OPERATOR_ID = 'operator-123';
const SHA256_FIXTURE = `sha256:${'a'.repeat(64)}`;

import handler from '../../api/dossier.js';

class MockRequest extends EventEmitter {
  method = 'POST';
  headers: Record<string, string> = { authorization: 'Bearer user-token' };
  body: unknown = {
    action: 'generate',
    runId: RUN_ID,
    companyName: 'Empresa Teste',
    cnpj: '12345678000195',
    context: 'Contexto comercial permitido.',
  };
}

class MockResponse extends EventEmitter {
  statusCode = 200;
  body: unknown;
  headers = new Map<string, string>();

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(body: unknown) {
    this.body = body;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }
}

function authResponse() {
  return { ok: true, status: 200, json: async () => ({ id: 'user-123456' }) };
}

function runResponse(status: string, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ run_id: RUN_ID, operator_id: OPERATOR_ID, status, ...extra }),
  };
}

function liteLlmResponse(text = '# Dossiê\nConteúdo persistível.') {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }),
  };
}

function persistedDossierResponse(text = '# Dossiê\nConteúdo persistível.') {
  const timestamp = new Date().toISOString();
  return {
    ok: true,
    status: 200,
    json: async () => [{
      id: RUN_ID,
      operator_id: OPERATOR_ID,
      content: {
        id: RUN_ID,
        title: 'Empresa Teste',
        empresaAlvo: 'Empresa Teste',
        cnpj: '12345678000195',
        modoPrincipal: 'investigacao',
        scoreOportunidade: null,
        resumoDossie: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [
          {
            id: `${RUN_ID}:user`,
            sender: 'user',
            text: 'Gere o dossiê de Empresa Teste, CNPJ 12345678000195.',
            timestamp,
          },
          {
            id: `${RUN_ID}:bot`,
            sender: 'bot',
            text,
            timestamp,
            isThinking: false,
            isError: false,
          },
        ],
        gateway: {
          runId: RUN_ID,
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
          finishReason: 'stop',
        },
      },
    }],
  };
}

function rpcName(url: unknown): string | undefined {
  return String(url).match(/\/rpc\/([^?]+)/)?.[1];
}

function evidenceFixture(): DossierEvidenceContract {
  return {
    version: 'dossier-evidence.v1',
    categories: DOSSIER_EVIDENCE_CATEGORIES.map(category => ({
      category,
      present: category === 'empresa' || category === 'crm',
      itemCount: category === 'empresa' || category === 'crm' ? 1 : 0,
      sourceCount: category === 'crm' ? 1 : 0,
    })),
    sanitizedContextDigest: SHA256_FIXTURE,
  };
}

function configureEnvironment() {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.LITELLM_BASE_URL = 'https://litellm.internal';
  process.env.LITELLM_API_KEY = 'litellm-key';
  process.env.LITELLM_DOSSIER_MODEL = 'scout-dossier-generate';
  process.env.LITELLM_MAX_RETRIES = '0';
}

function clearEnvironment() {
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'LITELLM_BASE_URL',
    'LITELLM_API_KEY',
    'LITELLM_DOSSIER_MODEL',
    'LITELLM_MAX_RETRIES',
  ]) delete process.env[key];
}

function mockLifecycle(options: {
  calls: string[];
  atomicResponse?: { ok: boolean; status: number; json: () => Promise<unknown> };
  onAtomic?: (body: Record<string, unknown>) => void;
}) {
  fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
    if (url.endsWith('/auth/v1/user')) return authResponse();
    if (url === 'https://litellm.internal/chat/completions') return liteLlmResponse();
    const rpc = rpcName(url);
    if (rpc === 'get_own_dossier_run') return runResponse('PENDING');
    if (rpc === 'acquire_dossier_run_lease') {
      const body = JSON.parse(String(init?.body));
      return runResponse('RUNNING', {
        lease_owner: body.p_lease_owner,
        lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (rpc === 'renew_dossier_run_lease') {
      const body = JSON.parse(String(init?.body));
      return runResponse('RUNNING', {
        lease_owner: body.p_lease_owner,
        lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (rpc === 'persist_and_complete_dossier_run') {
      options.calls.push(rpc);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      options.onAtomic?.(body);
      return options.atomicResponse ?? runResponse('COMPLETED', { dossier_id: RUN_ID });
    }
    if (rpc === 'mark_dossier_run_cancelled') {
      options.calls.push(rpc);
      return runResponse('CANCELLED', { lease_owner: null, lease_expires_at: null });
    }
    if (rpc === 'fail_dossier_run') {
      options.calls.push(rpc);
      return runResponse('FAILED');
    }
    if (rpc === 'release_dossier_run_lease') {
      options.calls.push(rpc);
      return runResponse('RUNNING');
    }
    if (url.includes('/rest/v1/dossies')) throw new Error('generate must not call dossies REST');
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('POST /api/dossier — persistência atômica server-owned', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    configureEnvironment();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearEnvironment();
  });

  it('persiste antes de responder COMPLETED e não usa REST de dossies ou complete separado', async () => {
    const calls: string[] = [];
    let atomicBody: Record<string, unknown> | undefined;
    mockLifecycle({ calls, onAtomic: body => { atomicBody = body; } });

    const res = new MockResponse();
    await handler(new MockRequest() as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      runId: RUN_ID,
      dossierId: RUN_ID,
      status: 'COMPLETED',
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    });
    expect(calls).toEqual(['persist_and_complete_dossier_run']);
    expect(atomicBody).toMatchObject({
      p_run_id: RUN_ID,
      p_dossier_id: RUN_ID,
      p_modo_principal: 'investigacao',
    });
    expect(atomicBody?.p_operator_id).toBeUndefined();
    expect((atomicBody?.p_content as { messages: Array<{ text?: string }> }).messages[1].text).toContain(
      'Conteúdo persistível',
    );
  });

  it('preserva o metadata de evidências no conteúdo persistido sem seus valores sensíveis', async () => {
    const calls: string[] = [];
    let atomicBody: Record<string, unknown> | undefined;
    mockLifecycle({ calls, onAtomic: body => { atomicBody = body; } });
    const req = new MockRequest();
    req.body = { ...req.body as Record<string, unknown>, evidence: evidenceFixture() };

    await handler(req as never, new MockResponse() as never);

    expect((atomicBody?.p_content as { evidence?: DossierEvidenceContract }).evidence).toEqual(evidenceFixture());
    expect(JSON.stringify(atomicBody)).not.toContain('Maria');
  });

  it('rejeita campos extras de evidência antes de chamar gateway ou persistência', async () => {
    const calls: string[] = [];
    mockLifecycle({ calls });
    const req = new MockRequest();
    req.body = {
      ...req.body as Record<string, unknown>,
      evidence: { ...evidenceFixture(), rawSourceText: 'não persistir' },
    };

    const res = new MockResponse();
    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      status: 'FAILED',
      error: { code: 'INVALID_REQUEST', stage: 'validation' },
    });
    expect(calls).toEqual([]);
  });

  it('mapeia cancelamento atômico para CANCELLED sem complete, fail ou release adicional', async () => {
    const calls: string[] = [];
    mockLifecycle({
      calls,
      atomicResponse: {
        ok: false,
        status: 400,
        json: async () => ({ code: 'P0001', message: 'RUN_CANCEL_REQUESTED' }),
      },
    });

    const res = new MockResponse();
    await handler(new MockRequest() as never, res as never);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      ok: false,
      runId: RUN_ID,
      status: 'CANCELLED',
      error: { code: 'RUN_CANCEL_REQUESTED' },
    });
    expect(calls).toEqual(['persist_and_complete_dossier_run', 'mark_dossier_run_cancelled']);
  });

  it('falha de persistência não entrega sucesso e finaliza FAILED', async () => {
    const calls: string[] = [];
    mockLifecycle({
      calls,
      atomicResponse: {
        ok: false,
        status: 503,
        json: async () => ({ code: 'P0001', message: 'upstream unavailable' }),
      },
    });

    const res = new MockResponse();
    await handler(new MockRequest() as never, res as never);

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ ok: false, status: 'FAILED', error: { code: 'PERSISTENCE_FAILED', stage: 'persistence' } });
    expect(calls).toEqual(['persist_and_complete_dossier_run', 'fail_dossier_run']);
  });

  it('interrompe o heartbeat antes da persistência final e não aborta o COMPLETED confirmado', async () => {
    vi.useFakeTimers();
    let renewCalls = 0;
    let persistenceStarted = false;
    let resolvePersistence!: (response: Response) => void;
    const calls: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return authResponse();
      if (url === 'https://litellm.internal/chat/completions') return liteLlmResponse();
      const rpc = rpcName(url);
      if (rpc === 'get_own_dossier_run') return runResponse('PENDING');
      if (rpc === 'acquire_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        renewCalls += 1;
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'persist_and_complete_dossier_run') {
        calls.push(rpc);
        persistenceStarted = true;
        expect((init?.signal as AbortSignal | undefined)?.aborted).toBe(false);
        return new Promise<Response>(resolve => {
          resolvePersistence = resolve;
        });
      }
      if (rpc === 'release_dossier_run_lease') {
        calls.push(rpc);
        return runResponse('RUNNING');
      }
      if (rpc === 'fail_dossier_run') {
        calls.push(rpc);
        return runResponse('FAILED');
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const pending = handler(new MockRequest() as never, new MockResponse() as never);
    await vi.waitFor(() => expect(persistenceStarted).toBe(true));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(renewCalls).toBe(1);

    resolvePersistence(runResponse('COMPLETED', { dossier_id: RUN_ID }) as Response);
    await pending;

    expect(calls).toEqual(['persist_and_complete_dossier_run']);
  });

  it('reconcilia COMPLETED quando a resposta da RPC atômica sofre abort após o commit', async () => {
    let lifecycleReads = 0;
    const rpcCalls: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return authResponse();
      if (url === 'https://litellm.internal/chat/completions') return liteLlmResponse();
      const rpc = rpcName(url);
      if (rpc) rpcCalls.push(rpc);
      if (rpc === 'get_own_dossier_run') {
        lifecycleReads += 1;
        return lifecycleReads === 1
          ? runResponse('PENDING')
          : runResponse('COMPLETED', { dossier_id: RUN_ID });
      }
      if (rpc === 'acquire_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'persist_and_complete_dossier_run') {
        const error = new Error('atomic response lost after commit');
        error.name = 'AbortError';
        throw error;
      }
      if (rpc === 'fail_dossier_run' || rpc === 'release_dossier_run_lease') {
        throw new Error(`Unexpected lifecycle downgrade: ${rpc}`);
      }
      if (url.includes('/rest/v1/dossies')) return persistedDossierResponse();
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const res = new MockResponse();
    await handler(new MockRequest() as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, runId: RUN_ID, dossierId: RUN_ID, status: 'COMPLETED' });
    expect(rpcCalls).toEqual([
      'get_own_dossier_run',
      'acquire_dossier_run_lease',
      'renew_dossier_run_lease',
      'persist_and_complete_dossier_run',
      'get_own_dossier_run',
    ]);
  });

  it('não reconcilia COMPLETED quando o dossiê persistido contém payload concorrente', async () => {
    let lifecycleReads = 0;
    const rpcCalls: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return authResponse();
      if (url === 'https://litellm.internal/chat/completions') return liteLlmResponse();
      const rpc = rpcName(url);
      if (rpc) rpcCalls.push(rpc);
      if (rpc === 'get_own_dossier_run') {
        lifecycleReads += 1;
        return lifecycleReads === 1
          ? runResponse('PENDING')
          : runResponse('COMPLETED', { dossier_id: RUN_ID });
      }
      if (rpc === 'acquire_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'persist_and_complete_dossier_run') {
        const error = new Error('atomic response lost after concurrent commit');
        error.name = 'AbortError';
        throw error;
      }
      if (rpc === 'fail_dossier_run') return runResponse('FAILED');
      if (url.includes('/rest/v1/dossies')) return persistedDossierResponse('# Dossiê concorrente\nOutro payload.');
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const res = new MockResponse();
    await handler(new MockRequest() as never, res as never);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ status: 'FAILED', error: { code: 'INTERNAL_ERROR' } });
    expect(rpcCalls).toEqual([
      'get_own_dossier_run',
      'acquire_dossier_run_lease',
      'renew_dossier_run_lease',
      'persist_and_complete_dossier_run',
      'get_own_dossier_run',
      'fail_dossier_run',
    ]);
  });

  it('não reconcilia conflito explícito como sucesso mesmo se o run já estiver COMPLETED', async () => {
    let lifecycleReads = 0;
    const rpcCalls: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return authResponse();
      if (url === 'https://litellm.internal/chat/completions') return liteLlmResponse();
      const rpc = rpcName(url);
      if (rpc) rpcCalls.push(rpc);
      if (rpc === 'get_own_dossier_run') {
        lifecycleReads += 1;
        return runResponse(lifecycleReads === 1 ? 'PENDING' : 'COMPLETED', { dossier_id: RUN_ID });
      }
      if (rpc === 'acquire_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'persist_and_complete_dossier_run') {
        return {
          ok: false,
          status: 409,
          json: async () => ({ code: 'P0001', message: 'DOSSIER_CONFLICT' }),
        };
      }
      if (rpc === 'fail_dossier_run') return runResponse('FAILED');
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const res = new MockResponse();
    await handler(new MockRequest() as never, res as never);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ status: 'FAILED', error: { code: 'DOSSIER_CONFLICT' } });
    expect(rpcCalls).toEqual([
      'get_own_dossier_run',
      'acquire_dossier_run_lease',
      'renew_dossier_run_lease',
      'persist_and_complete_dossier_run',
      'fail_dossier_run',
    ]);
  });

  it('finaliza cancelamento observado após falha ambígua sem chamar fail_dossier_run', async () => {
    let lifecycleReads = 0;
    const rpcCalls: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return authResponse();
      if (url === 'https://litellm.internal/chat/completions') return liteLlmResponse();
      const rpc = rpcName(url);
      if (rpc) rpcCalls.push(rpc);
      if (rpc === 'get_own_dossier_run') {
        lifecycleReads += 1;
        return lifecycleReads === 1
          ? runResponse('PENDING')
          : runResponse('CANCEL_REQUESTED', { cancel_requested_at: new Date().toISOString() });
      }
      if (rpc === 'acquire_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'persist_and_complete_dossier_run') {
        return {
          ok: false,
          status: 503,
          json: async () => ({ code: 'P0001', message: 'upstream unavailable' }),
        };
      }
      if (rpc === 'mark_dossier_run_cancelled') return runResponse('CANCELLED');
      if (rpc === 'fail_dossier_run') throw new Error('cancelamento pendente não pode virar FAILED');
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const res = new MockResponse();
    await handler(new MockRequest() as never, res as never);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ status: 'CANCELLED', error: { code: 'RUN_CANCEL_REQUESTED' } });
    expect(rpcCalls).toEqual([
      'get_own_dossier_run',
      'acquire_dossier_run_lease',
      'renew_dossier_run_lease',
      'persist_and_complete_dossier_run',
      'get_own_dossier_run',
      'mark_dossier_run_cancelled',
    ]);
  });

  it('reconcilia COMPLETED se fail_dossier_run retornar nulo durante corrida de commit', async () => {
    let lifecycleReads = 0;
    const rpcCalls: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return authResponse();
      if (url === 'https://litellm.internal/chat/completions') return liteLlmResponse();
      const rpc = rpcName(url);
      if (rpc) rpcCalls.push(rpc);
      if (rpc === 'get_own_dossier_run') {
        lifecycleReads += 1;
        if (lifecycleReads === 1) return runResponse('PENDING');
        if (lifecycleReads === 2) return runResponse('RUNNING');
        return runResponse('COMPLETED', { dossier_id: RUN_ID });
      }
      if (rpc === 'acquire_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'persist_and_complete_dossier_run') {
        return {
          ok: false,
          status: 503,
          json: async () => ({ code: 'P0001', message: 'upstream unavailable' }),
        };
      }
      if (rpc === 'fail_dossier_run') return { ok: true, status: 200, json: async () => null };
      if (url.includes('/rest/v1/dossies')) return persistedDossierResponse();
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const res = new MockResponse();
    await handler(new MockRequest() as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'COMPLETED', dossierId: RUN_ID });
    expect(rpcCalls).toEqual([
      'get_own_dossier_run',
      'acquire_dossier_run_lease',
      'renew_dossier_run_lease',
      'persist_and_complete_dossier_run',
      'get_own_dossier_run',
      'fail_dossier_run',
      'get_own_dossier_run',
    ]);
  });

  it('retry do mesmo run não chama gateway nem cria segundo dossiê', async () => {
    const calls: string[] = [];
    let invocation = 0;
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return authResponse();
      if (url === 'https://litellm.internal/chat/completions') return liteLlmResponse();
      const rpc = rpcName(url);
      if (rpc === 'get_own_dossier_run') {
        invocation += 1;
        return invocation === 1
          ? runResponse('PENDING')
          : runResponse('COMPLETED', { dossier_id: RUN_ID });
      }
      if (rpc === 'acquire_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return runResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'persist_and_complete_dossier_run') {
        calls.push(rpc);
        return runResponse('COMPLETED', { dossier_id: RUN_ID });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const firstRes = new MockResponse();
    await handler(new MockRequest() as never, firstRes as never);
    const secondRes = new MockResponse();
    await handler(new MockRequest() as never, secondRes as never);

    expect(firstRes.statusCode).toBe(200);
    expect(secondRes.statusCode).toBe(409);
    expect(secondRes.body).toMatchObject({ status: 'FAILED', error: { code: 'RUN_TERMINAL' } });
    expect(calls).toEqual(['persist_and_complete_dossier_run']);
  });
});
