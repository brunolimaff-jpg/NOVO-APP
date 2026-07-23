import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

import handler from '../../api/dossier.js';

class MockRequest extends EventEmitter {
  method = 'POST';
  headers: Record<string, string> = { authorization: 'Bearer user-token' };
  body: unknown = {
    action: 'chat',
    runId: '11111111-1111-4111-8111-111111111111',
    dossierId: '22222222-2222-4222-8222-222222222222',
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
      run_id: '11111111-1111-4111-8111-111111111111',
      dossier_id: '22222222-2222-4222-8222-222222222222',
      status: 'COMPLETED',
    }),
  };
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
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.LITELLM_MAX_RETRIES;
  });

  it('exige autenticação Supabase real', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, {}, { action: 'chat' }])('rejeita payload vazio ou incompleto: %j', async body => {
    const req = new MockRequest();
    req.body = body;
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia chat contextual ao LiteLLM sem permitir modelo do cliente', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
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

    const liteLlmCall = fetchMock.mock.calls[2];
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
    fetchMock.mockResolvedValueOnce(successfulAuthResponse()).mockResolvedValueOnce(successfulOwnershipResponse()).mockImplementationOnce(
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
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    req.emit('aborted');
    await pending;

    const liteLlmSignal = fetchMock.mock.calls[2]?.[1]?.signal as AbortSignal;
    expect(liteLlmSignal.aborted).toBe(true);
    expect(res.statusCode).toBe(499);
  });

  it('não expõe detalhe da falha do gateway', async () => {
    fetchMock
      .mockResolvedValueOnce(successfulAuthResponse())
      .mockResolvedValueOnce(successfulOwnershipResponse())
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'segredo upstream' });
    const req = new MockRequest();
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(502);
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
