import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SafePublicRequestError, type requestPublicUrl } from '../api/_safe-public-request';

const requestPublicUrlMock = vi.hoisted(() => vi.fn<typeof requestPublicUrl>());
const SafePublicRequestErrorMock = vi.hoisted(
  () =>
    class SafePublicRequestErrorMock extends Error {
      constructor(
        readonly code: string,
        message: string,
      ) {
        super(message);
      }
    },
);

vi.mock('../api/_safe-public-request.js', () => ({
  requestPublicUrl: requestPublicUrlMock,
  SAFE_PUBLIC_REQUEST_TIMEOUT_MS: 5000,
  SafePublicRequestError: SafePublicRequestErrorMock,
}));

function makeResponse() {
  let statusCode = 0;
  let payload: unknown;
  const res = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (json: unknown) => {
          payload = json;
          return { code, json };
        },
      };
    },
  } as unknown as VercelResponse;

  return {
    res,
    get statusCode() {
      return statusCode;
    },
    get payload() {
      return payload;
    },
  };
}

describe('api/link-status', () => {
  beforeEach(() => {
    requestPublicUrlMock.mockReset();
    vi.resetModules();
  });

  it('retorna resultado parcial quando uma URL falha', async () => {
    requestPublicUrlMock.mockImplementation(async (url: string) => {
      if (url.includes('falha.test')) {
        throw new Error('upstream timeout');
      }
      return { statusCode: 200 };
    });

    const { default: handler } = await import('../api/link-status');
    const response = makeResponse();

    await handler(
      {
        method: 'POST',
        body: {
          urls: ['https://ok.test/fonte', 'https://falha.test/fonte'],
        },
      } as VercelRequest,
      response.res,
    );

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      results: {
        'https://ok.test/fonte': { status: 'valid', httpStatus: 200 },
        'https://falha.test/fonte': {
          status: 'unknown',
          note: 'Não foi possível validar agora; revisar manualmente.',
        },
      },
    });
  });

  it('preserva fallback de HEAD para GET com o mesmo deadline', async () => {
    requestPublicUrlMock.mockResolvedValueOnce({ statusCode: 405 }).mockResolvedValueOnce({ statusCode: 200 });
    const { default: handler } = await import('../api/link-status');
    const response = makeResponse();

    await handler({ method: 'POST', body: { urls: ['https://ok.test/fonte'] } } as VercelRequest, response.res);

    expect(requestPublicUrlMock.mock.calls[0]?.slice(0, 2)).toEqual(['https://ok.test/fonte', 'HEAD']);
    expect(requestPublicUrlMock.mock.calls[1]?.slice(0, 2)).toEqual(['https://ok.test/fonte', 'GET']);
    expect(requestPublicUrlMock.mock.calls[0]?.[2]).toEqual(requestPublicUrlMock.mock.calls[1]?.[2]);
    expect(response.payload).toMatchObject({ results: { 'https://ok.test/fonte': { status: 'valid', httpStatus: 200 } } });
  });

  it('mantém contrato 405 para métodos não POST', async () => {
    const { default: handler } = await import('../api/link-status');
    const response = makeResponse();

    await handler(
      {
        method: 'GET',
        body: {},
      } as VercelRequest,
      response.res,
    );

    expect(response.statusCode).toBe(405);
    expect(response.payload).toEqual({ error: 'Method not allowed' });
  });

  it('distingue URL inválida ou restrita de falhas transitórias', async () => {
    requestPublicUrlMock.mockRejectedValueOnce(new SafePublicRequestError('restricted_address', 'URL bloqueada.'));
    const { default: handler } = await import('../api/link-status');
    const response = makeResponse();

    await handler({ method: 'POST', body: { urls: ['http://127.0.0.1'] } } as VercelRequest, response.res);

    expect(response.payload).toMatchObject({
      results: { 'http://127.0.0.1': { status: 'unknown', note: 'URL inválida ou restrita para validação.' } },
    });
  });
});
