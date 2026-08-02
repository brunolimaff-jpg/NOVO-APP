import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
const runtimeMock = vi.hoisted(() => vi.fn());
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const DOSSIER_ID = '22222222-2222-4222-8222-222222222222';
const OPERATOR_ID = 'operator-123';
const OTHER_OPERATOR_ID = 'operator-other';

vi.mock('../../api/_dossier-runtime-orchestrator.js', async () => ({
  ...(await vi.importActual<typeof import('../../api/_dossier-runtime-orchestrator.js')>('../../api/_dossier-runtime-orchestrator.js')),
  runDossierRuntime: runtimeMock,
}));

import handler from '../../api/dossier.js';
import { DossierRuntimeError } from '../../api/_dossier-runtime-orchestrator.js';

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
      operator_id: OPERATOR_ID,
      status: 'COMPLETED',
    }),
  };
}

function successfulDossierContentResponse(content = '# Dossiê\nConteúdo do dossiê persistido.') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id: DOSSIER_ID,
      operator_id: OPERATOR_ID,
      content: { messages: [{ sender: 'bot', text: content }] },
    }),
  };
}

function failedDossierContentResponse(content: unknown = null) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: DOSSIER_ID, operator_id: OPERATOR_ID, content }),
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

describe('POST /api/dossier', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    runtimeMock.mockReset();
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.LITELLM_BASE_URL = 'https://litellm.internal';
    process.env.LITELLM_API_KEY = 'litellm-key';
    process.env.LITELLM_DOSSIER_MODEL = 'scout-dossier-generate';
    process.env.LITELLM_MAX_RETRIES = '0';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.LITELLM_DOSSIER_MODEL;
    delete process.env.LITELLM_DOSSIER_CHAT_MODEL;
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
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    });
    expect(res.body).not.toHaveProperty('usage.promptTokenCount');
    expect(res.headers.get('x-request-id')).toBe('req-dossier-1234');

    const liteLlmCall = fetchMock.mock.calls[3];
    expect(fetchMock.mock.calls[2]?.[0]).toContain(`id=eq.${DOSSIER_ID}`);
    expect(fetchMock.mock.calls[2]?.[0]).toContain(`operator_id=eq.${OPERATOR_ID}`);
    expect(fetchMock.mock.calls[2]?.[0]).toContain('select=id,operator_id,content');
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

  it('normaliza finishReason ausente para o contrato de sucesso', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(successfulDossierContentResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'Resposta sem motivo explícito.' } }],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
          }),
      });
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: 'COMPLETED',
      finishReason: 'unknown',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
    });
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

  it('encaminha generate autenticado ao runtime server-owned e não aceita autoridade do cliente', async () => {
    runtimeMock.mockResolvedValueOnce({
      runId: RUN_ID,
      dossierId: RUN_ID,
      text: 'Dossiê concluído no servidor.',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      finishReason: 'stop',
      status: 'COMPLETED',
      attemptNo: 1,
      pipelineVersion: 'dossier-server-pipeline.v1',
    });
    fetchMock.mockResolvedValueOnce(successfulAuthResponse());
    const req = new MockRequest();
    req.body = generateBody({ operatorId: 'client-operator', leaseOwner: 'client-owner', model: 'client-model' });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'COMPLETED', text: 'Dossiê concluído no servidor.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(runtimeMock).toHaveBeenCalledOnce();
    const [auth, input] = runtimeMock.mock.calls[0];
    expect(auth).toMatchObject({ url: 'https://project.supabase.co', anonKey: 'anon-key', token: 'user-token' });
    expect(input).toMatchObject({ runId: RUN_ID, companyName: 'Empresa Teste', context: 'Contexto comercial permitido.' });
    expect(input).not.toHaveProperty('operatorId');
    expect(input).not.toHaveProperty('leaseOwner');
    expect(input).not.toHaveProperty('model');
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it('mapeia cancelamento terminal confirmado para status CANCELLED', async () => {
    runtimeMock.mockRejectedValueOnce(new DossierRuntimeError('RUN_CANCEL_REQUESTED', 'cancelado', 409, 'cancel', false, true));
    fetchMock.mockResolvedValueOnce(successfulAuthResponse());
    const req = new MockRequest();
    req.body = generateBody();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ status: 'CANCELLED', error: { code: 'RUN_CANCEL_REQUESTED', stage: 'request', retryable: false } });
  });

  it('propaga abort da conexão para o runtime sem iniciar gateway client-side', async () => {
    runtimeMock.mockImplementationOnce((_auth: unknown, input: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      input.signal.addEventListener('abort', () => reject(new DossierRuntimeError('REQUEST_ABORTED', 'Request cancelled', 499, 'request', false)), { once: true });
    }));
    fetchMock.mockResolvedValueOnce(successfulAuthResponse());
    const req = new MockRequest();
    req.body = generateBody();
    const res = new MockResponse();

    const pending = handler(req as never, res as never);
    await vi.waitFor(() => expect(runtimeMock).toHaveBeenCalledOnce());
    req.emit('aborted');
    await pending;

    expect(res.statusCode).toBe(499);
    expect(res.body).toMatchObject({ status: 'FAILED', error: { code: 'REQUEST_ABORTED', stage: 'request', retryable: false } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejeita evidence inválida antes de autenticar e antes do runtime', async () => {
    const req = new MockRequest();
    req.body = generateBody({ evidence: { version: 'invalid' } });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'INVALID_REQUEST', stage: 'validation', retryable: false } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runtimeMock).not.toHaveBeenCalled();
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
      status: 'FAILED',
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
      status: 'FAILED',
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

  it('rejeita chat quando o run não fornece operator_id server-side', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulRunResponse('COMPLETED', { dossier_id: DOSSIER_ID }));
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({
      error: { code: 'INTERNAL_ERROR', stage: 'ownership', retryable: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejeita conteúdo de dossiê pertencente a outro operador antes do LiteLLM', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: DOSSIER_ID,
          operator_id: OTHER_OPERATOR_ID,
          content: { messages: [{ sender: 'bot', text: 'conteúdo cruzado' }] },
        }),
      });
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'DOSSIER_CONTENT_UNAVAILABLE', stage: 'ownership' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejeita contexto persistido acima de 200 mil caracteres antes do LiteLLM', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(successfulDossierContentResponse('d'.repeat(200_000)));
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE', stage: 'validation', retryable: false },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejeita agregado server-side acima de 240 mil caracteres antes do LiteLLM', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce(successfulDossierContentResponse('d'.repeat(199_980)));
    const req = new MockRequest();
    req.body = {
      ...(req.body as object),
      message: 'm'.repeat(20_000),
      history: [
        { role: 'user', content: 'h'.repeat(11_000) },
        { role: 'assistant', content: 'h'.repeat(11_000) },
      ],
    };
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE', stage: 'validation', retryable: false },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
