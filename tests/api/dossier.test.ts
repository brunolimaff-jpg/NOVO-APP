import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const DOSSIER_ID = '22222222-2222-4222-8222-222222222222';

import handler from '../../api/dossier.js';

class MockRequest extends EventEmitter {
  method = 'POST';
  headers: Record<string, string> = { authorization: 'Bearer user-token' };
  body: unknown = {
    action: 'chat',
    runId: RUN_ID,
    dossierId: DOSSIER_ID,
    message: 'Qual é o principal risco?',
    dossierContext: 'O risco declarado é concentração em um único cliente.',
    history: [],
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

function successfulAuthResponse() {
  return { ok: true, status: 200, json: async () => ({ id: 'user-123456' }) };
}

function successfulLiteLLMResponse(text = 'O principal risco é a concentração.') {
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

function successfulOwnershipResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      run_id: RUN_ID,
      dossier_id: DOSSIER_ID,
      status: 'COMPLETED',
    }),
  };
}

function successfulDossierContentResponse(content = '# Dossiê\nConteúdo do dossiê persistido.') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: DOSSIER_ID, content: { messages: [{ sender: 'bot', text: content }] } }),
  };
}

function failedDossierContentResponse(content: unknown = null) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: DOSSIER_ID, content }),
  };
}

function generateBody(extra: Record<string, unknown> = {}) {
  return {
    action: 'generate',
    runId: RUN_ID,
    companyName: 'Empresa Teste',
    context: 'Contexto comercial permitido.',
    ...extra,
  };
}

function successfulRunResponse(status: string, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ run_id: RUN_ID, status, ...extra }),
  };
}

function rpcName(url: unknown): string | undefined {
  return String(url).match(/\/rpc\/([^?]+)/)?.[1];
}

describe('POST /api/dossier', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.LITELLM_BASE_URL = 'https://litellm.internal';
    process.env.LITELLM_API_KEY = 'litellm-key';
    process.env.LITELLM_MAX_RETRIES = '0';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.LITELLM_MAX_RETRIES;
    delete process.env.LITELLM_DOSSIER_TIMEOUT_MS;
  });

  it('exige autenticação Supabase real', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'AUTH_REQUIRED', stage: 'auth', retryable: false } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, {}, { action: 'chat' }])('rejeita payload vazio ou incompleto: %j', async body => {
    const req = new MockRequest();
    req.body = body;
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'INVALID_REQUEST', stage: 'validation' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia chat contextual ao LiteLLM sem permitir modelo do cliente', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(successfulDossierContentResponse())
      .mockResolvedValueOnce(successfulLiteLLMResponse());
    const req = new MockRequest();
    req.headers['x-request-id'] = 'req-dossier-1234';
    req.body = { ...(req.body as object), model: 'modelo-proibido' };
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      text: 'O principal risco é a concentração.',
      correlationId: 'req-dossier-1234',
    });
    expect(res.headers.get('x-request-id')).toBe('req-dossier-1234');

    const liteLlmCall = fetchMock.mock.calls[3];
    expect(liteLlmCall?.[0]).toBe('https://litellm.internal/chat/completions');
    const requestBody = JSON.parse(String(liteLlmCall?.[1]?.body));
    expect(requestBody.model).not.toBe('modelo-proibido');
    expect(requestBody.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user', content: expect.stringContaining('<contexto_dossie>') }),
      ]),
    );
    expect(liteLlmCall?.[1]?.headers).toMatchObject({ 'X-Request-ID': 'req-dossier-1234' });
    expect(liteLlmCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('encadeia AbortSignal até o transporte LiteLLM', async () => {
    fetchMock.mockResolvedValueOnce(successfulAuthResponse()).mockResolvedValueOnce(successfulOwnershipResponse()).mockResolvedValueOnce(successfulDossierContentResponse()).mockImplementationOnce(
      (_url: string, init: NonNullable<Parameters<typeof fetch>[1]>) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener(
            'abort',
            () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        }),
    );
    const req = new MockRequest();
    const res = new MockResponse();

    const pending = handler(req as never, res as never);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    req.emit('aborted');
    await pending;

    const liteLlmSignal = fetchMock.mock.calls[3]?.[1]?.signal as AbortSignal;
    expect(liteLlmSignal.aborted).toBe(true);
    expect(res.statusCode).toBe(499);
    expect(res.body).toMatchObject({ error: { code: 'REQUEST_ABORTED', stage: 'request' } });
  });

  it('não expõe detalhe da falha do gateway', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(successfulDossierContentResponse())
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'segredo upstream' });
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ error: { code: 'GATEWAY_HTTP_ERROR', stage: 'gateway' } });
    expect(JSON.stringify(res.body)).not.toContain('segredo upstream');
  });

  it('nega chat quando o run autenticado não pertence ao dossier', async () => {
    fetchMock.mockResolvedValueOnce(successfulAuthResponse()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        run_id: '11111111-1111-4111-8111-111111111111',
        dossier_id: '33333333-3333-4333-8333-333333333333',
        status: 'COMPLETED',
      }),
    });
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'RUN_NOT_OWNED', stage: 'ownership' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bloqueia duas gerações concorrentes do mesmo run antes do segundo gateway', async () => {
    let leaseHeld = false;
    let finishGateway!: () => void;
    const gatewayPending = new Promise<void>(resolve => {
      finishGateway = resolve;
    });
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return successfulAuthResponse();
      const rpc = rpcName(url);
      if (rpc === 'get_own_dossier_run') return successfulRunResponse('PENDING');
      if (rpc === 'acquire_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        if (leaseHeld) return { ok: true, status: 200, json: async () => null };
        leaseHeld = true;
        return successfulRunResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        const body = JSON.parse(String(init?.body));
        return successfulRunResponse('RUNNING', {
          lease_owner: body.p_lease_owner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'release_dossier_run_lease') {
        leaseHeld = false;
        return successfulRunResponse('RUNNING');
      }
      if (url === 'https://litellm.internal/chat/completions') {
        await gatewayPending;
        return successfulLiteLLMResponse('# Dossiê');
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const firstReq = new MockRequest();
    firstReq.body = generateBody();
    const firstRes = new MockResponse();
    const first = handler(firstReq as never, firstRes as never);
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => url === 'https://litellm.internal/chat/completions')).toHaveLength(1),
    );

    const secondReq = new MockRequest();
    secondReq.body = generateBody();
    const secondRes = new MockResponse();
    await handler(secondReq as never, secondRes as never);
    finishGateway();
    await first;

    expect(firstRes.statusCode).toBe(200);
    expect(secondRes.statusCode).toBe(409);
    expect(secondRes.body).toMatchObject({ error: { code: 'RUN_LEASE_UNAVAILABLE' } });
    expect(fetchMock.mock.calls.filter(([url]) => url === 'https://litellm.internal/chat/completions')).toHaveLength(1);
  });

  it('lease indisponível impede chamada ao LiteLLM', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulRunResponse('PENDING'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null });
    const req = new MockRequest();
    req.body = generateBody();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'RUN_LEASE_UNAVAILABLE' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gera leaseOwner server-side e ignora valor enviado pelo cliente', async () => {
    let acquiredOwner = '';
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return successfulAuthResponse();
      const rpc = rpcName(url);
      if (rpc === 'get_own_dossier_run') return successfulRunResponse('PENDING');
      if (rpc === 'acquire_dossier_run_lease') {
        acquiredOwner = JSON.parse(String(init?.body)).p_lease_owner;
        return successfulRunResponse('RUNNING', {
          lease_owner: acquiredOwner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        return successfulRunResponse('RUNNING', {
          lease_owner: acquiredOwner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'release_dossier_run_lease') {
        expect(JSON.parse(String(init?.body)).p_lease_owner).toBe(acquiredOwner);
        return successfulRunResponse('RUNNING');
      }
      return successfulLiteLLMResponse('# Dossiê');
    });
    const req = new MockRequest();
    req.body = generateBody({ leaseOwner: 'client-controlled' });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(acquiredOwner).toMatch(/^[0-9a-f-]{36}$/);
    expect(acquiredOwner).not.toBe('client-controlled');
  });

  it('heartbeat com cancelamento aborta o gateway, marca CANCELLED e não libera novamente', async () => {
    vi.useFakeTimers();
    let leaseOwner = '';
    let gatewayAborted = false;
    const rpcOrder: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return successfulAuthResponse();
      const rpc = rpcName(url);
      if (rpc === 'get_own_dossier_run') return successfulRunResponse('PENDING');
      if (rpc === 'acquire_dossier_run_lease') {
        leaseOwner = JSON.parse(String(init?.body)).p_lease_owner;
        return successfulRunResponse('RUNNING', {
          lease_owner: leaseOwner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        rpcOrder.push(rpc);
        return successfulRunResponse('CANCEL_REQUESTED', {
          lease_owner: leaseOwner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
          cancel_requested_at: new Date().toISOString(),
        });
      }
      if (rpc === 'mark_dossier_run_cancelled') {
        rpcOrder.push(rpc);
        return successfulRunResponse('CANCELLED', { lease_owner: null, lease_expires_at: null });
      }
      if (rpc === 'release_dossier_run_lease') {
        rpcOrder.push(rpc);
        return successfulRunResponse('CANCELLED');
      }
      if (url === 'https://litellm.internal/chat/completions') {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          signal.addEventListener('abort', () => {
            gatewayAborted = true;
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const req = new MockRequest();
    req.body = generateBody();
    const res = new MockResponse();

    const pending = handler(req as never, res as never);
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;

    expect(gatewayAborted).toBe(true);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'RUN_CANCEL_REQUESTED' } });
    expect(rpcOrder).toEqual(['renew_dossier_run_lease', 'mark_dossier_run_cancelled']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancelamento tardio descarta resposta, marca antes de qualquer liberação e não libera após sucesso', async () => {
    let leaseOwner = '';
    const rpcOrder: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return successfulAuthResponse();
      const rpc = rpcName(url);
      if (rpc === 'get_own_dossier_run') return successfulRunResponse('PENDING');
      if (rpc === 'acquire_dossier_run_lease') {
        leaseOwner = JSON.parse(String(init?.body)).p_lease_owner;
        return successfulRunResponse('RUNNING', {
          lease_owner: leaseOwner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        rpcOrder.push(rpc);
        return successfulRunResponse('CANCEL_REQUESTED', {
          lease_owner: leaseOwner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
          cancel_requested_at: new Date().toISOString(),
        });
      }
      if (rpc === 'mark_dossier_run_cancelled') {
        rpcOrder.push(rpc);
        return successfulRunResponse('CANCELLED', { lease_owner: null, lease_expires_at: null });
      }
      if (rpc === 'release_dossier_run_lease') {
        rpcOrder.push(rpc);
        return successfulRunResponse('CANCELLED');
      }
      if (url === 'https://litellm.internal/chat/completions') return successfulLiteLLMResponse('conteúdo descartado');
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const req = new MockRequest();
    req.body = generateBody();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain('conteúdo descartado');
    expect(rpcOrder).toEqual(['renew_dossier_run_lease', 'mark_dossier_run_cancelled']);
  });

  it('perda tardia da lease descarta resposta do modelo', async () => {
    let leaseOwner = '';
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return successfulAuthResponse();
      const rpc = rpcName(url);
      if (rpc === 'get_own_dossier_run') return successfulRunResponse('PENDING');
      if (rpc === 'acquire_dossier_run_lease') {
        leaseOwner = JSON.parse(String(init?.body)).p_lease_owner;
        return successfulRunResponse('RUNNING', {
          lease_owner: leaseOwner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') return { ok: true, status: 200, json: async () => null };
      if (url === 'https://litellm.internal/chat/completions') return successfulLiteLLMResponse('conteúdo sem lease');
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const req = new MockRequest();
    req.body = generateBody();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'RUN_LEASE_UNAVAILABLE' } });
    expect(JSON.stringify(res.body)).not.toContain('conteúdo sem lease');
  });

  it('se marcar cancelamento falhar, tenta marcar antes de liberar a lease', async () => {
    let leaseOwner = '';
    const rpcOrder: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      if (url.endsWith('/auth/v1/user')) return successfulAuthResponse();
      const rpc = rpcName(url);
      if (rpc === 'get_own_dossier_run') return successfulRunResponse('PENDING');
      if (rpc === 'acquire_dossier_run_lease') {
        leaseOwner = JSON.parse(String(init?.body)).p_lease_owner;
        return successfulRunResponse('RUNNING', {
          lease_owner: leaseOwner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (rpc === 'renew_dossier_run_lease') {
        return successfulRunResponse('CANCEL_REQUESTED', {
          lease_owner: leaseOwner,
          lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
          cancel_requested_at: new Date().toISOString(),
        });
      }
      if (rpc === 'mark_dossier_run_cancelled') {
        rpcOrder.push(rpc);
        return { ok: true, status: 200, json: async () => null };
      }
      if (rpc === 'release_dossier_run_lease') {
        rpcOrder.push(rpc);
        return successfulRunResponse('CANCEL_REQUESTED');
      }
      if (url === 'https://litellm.internal/chat/completions') return successfulLiteLLMResponse('conteúdo descartado');
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const req = new MockRequest();
    req.body = generateBody();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(409);
    expect(rpcOrder).toEqual(['mark_dossier_run_cancelled', 'release_dossier_run_lease']);
  });

  it('retorna contrato estável para abort externo da requisição', async () => {
    fetchMock.mockResolvedValueOnce(successfulAuthResponse()).mockResolvedValueOnce(successfulOwnershipResponse()).mockResolvedValueOnce(successfulDossierContentResponse()).mockImplementationOnce(
      () => new Promise<Response>(() => undefined),
    );
    const req = new MockRequest();
    const res = new MockResponse();

    const pending = handler(req as never, res as never);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    req.emit('aborted');
    await pending;

    expect(res.statusCode).toBe(499);
    expect(res.body).toMatchObject({
      ok: false,
      correlationId: expect.any(String),
      runId: RUN_ID,
      error: { code: 'REQUEST_ABORTED', message: expect.any(String), stage: 'request', retryable: false },
    });
  });

  it('retorna 504/GATEWAY_TIMEOUT para timeout interno do LiteLLM', async () => {
    process.env.LITELLM_DOSSIER_TIMEOUT_MS = '10';
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(successfulDossierContentResponse())
      .mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(504);
    expect(res.body).toMatchObject({ error: { code: 'GATEWAY_TIMEOUT', stage: 'gateway', retryable: true } });
  });

  it('logs correlacionam run e stage sem conteúdo sensível', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(successfulDossierContentResponse())
      .mockResolvedValueOnce(successfulLiteLLMResponse());
    const req = new MockRequest();
    req.headers.authorization = 'Bearer token-super-secreto';
    req.body = { ...(req.body as object), message: 'prompt-super-secreto', dossierContext: 'contexto-super-secreto' };
    const res = new MockResponse();

    await handler(req as never, res as never);

    const serializedLogs = JSON.stringify([...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]);
    expect(serializedLogs).toContain(RUN_ID);
    expect(serializedLogs).toContain('correlationId');
    expect(serializedLogs).toContain('stage');
    expect(serializedLogs).not.toContain('prompt-super-secreto');
    expect(serializedLogs).not.toContain('contexto-super-secreto');
    expect(serializedLogs).not.toContain('token-super-secreto');
    expect(serializedLogs).not.toContain('litellm-key');
  });

  it('rejeita payload agregado excessivo antes de autenticar', async () => {
    const req = new MockRequest();
    req.body = {
      ...(req.body as object),
      history: Array.from({ length: 12 }, () => ({ role: 'user', content: 'h'.repeat(20_000) })),
    };
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE', stage: 'validation', retryable: false } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserva erro operacional do RPC em vez de converter para RUN_NOT_FOUND', async () => {
    fetchMock.mockResolvedValueOnce(successfulAuthResponse()).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ message: 'database unavailable' }),
    });
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ error: { code: 'INTERNAL_ERROR', stage: 'ownership', retryable: true } });
    expect(JSON.stringify(res.body)).not.toContain('database unavailable');
  });

  it('cancelamento solicitado não adquire lease nem chama LiteLLM', async () => {
    fetchMock.mockResolvedValueOnce(successfulAuthResponse()).mockResolvedValueOnce(
      successfulRunResponse('CANCEL_REQUESTED', { cancel_requested_at: new Date().toISOString() }),
    );
    const req = new MockRequest();
    req.body = generateBody();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'RUN_CANCEL_REQUESTED', stage: 'lease' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('remove listeners da requisição e da resposta ao encerrar', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(successfulDossierContentResponse())
      .mockResolvedValueOnce(successfulLiteLLMResponse());
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  it('mantém formato uniforme para falhas estáveis', async () => {
    const req = new MockRequest();
    req.headers = {};
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.body).toEqual({
      ok: false,
      correlationId: expect.any(String),
      runId: RUN_ID,
      error: {
        code: 'AUTH_REQUIRED',
        message: expect.any(String),
        stage: 'auth',
        retryable: false,
      },
    });
  });

  // New tests for server-side dossier context
  it('chat ignora dossierContext enviado pelo cliente e carrega server-side', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(successfulDossierContentResponse('Conteúdo server-side'))
      .mockResolvedValueOnce(successfulLiteLLMResponse());
    const req = new MockRequest();
    req.body = { ...(req.body as object), dossierContext: 'contexto-do-cliente-ignorar' };
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    const liteLlmCall = fetchMock.mock.calls[3];
    const requestBody = JSON.parse(String(liteLlmCall?.[1]?.body));
    // Should contain server-side content, not client-provided
    expect(requestBody.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: expect.stringContaining('Conteúdo server-side') }),
      ]),
    );
    // Should NOT contain client-provided context
    expect(JSON.stringify(requestBody)).not.toContain('contexto-do-cliente-ignorar');
  });

  it('retorna DOSSIER_CONTENT_UNAVAILABLE quando conteúdo persistido ausente', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(failedDossierContentResponse());
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'DOSSIER_CONTENT_UNAVAILABLE', stage: 'ownership', retryable: false } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retorna DOSSIER_CONTENT_UNAVAILABLE quando conteúdo persistido é inválido', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(failedDossierContentResponse({ messages: [{ sender: 'bot' }] }));
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'DOSSIER_CONTENT_UNAVAILABLE' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
