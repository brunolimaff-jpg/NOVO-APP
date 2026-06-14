import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

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
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('retorna resultado parcial quando uma URL falha', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('falha.test')) {
        throw new Error('upstream timeout');
      }

      return {
        status: 200,
      } as Response;
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
