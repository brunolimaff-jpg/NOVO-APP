import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const requestPublicUrlMock = vi.hoisted(() => vi.fn());

vi.mock('../api/_safe-public-request.js', () => ({
  requestPublicUrl: requestPublicUrlMock,
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

      return {
        statusCode: 200,
      };
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

  it('repete com GET quando HEAD nao e aceito', async () => {
    requestPublicUrlMock
      .mockResolvedValueOnce({ statusCode: 405 })
      .mockResolvedValueOnce({ statusCode: 200 });

    const { default: handler } = await import('../api/link-status');
    const response = makeResponse();

    await handler(
      {
        method: 'POST',
        body: { urls: ['https://ok.test/fonte'] },
      } as VercelRequest,
      response.res,
    );

    const [firstCall, secondCall] = requestPublicUrlMock.mock.calls;
    expect(firstCall?.slice(0, 2)).toEqual(['https://ok.test/fonte', 'HEAD']);
    expect(secondCall?.slice(0, 2)).toEqual(['https://ok.test/fonte', 'GET']);
    expect(firstCall?.[2]).toEqual(secondCall?.[2]);
    expect(firstCall?.[2]).toMatchObject({ deadline: expect.any(Number) });
    expect(response.payload).toMatchObject({
      results: { 'https://ok.test/fonte': { status: 'valid', httpStatus: 200 } },
    });
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
});
