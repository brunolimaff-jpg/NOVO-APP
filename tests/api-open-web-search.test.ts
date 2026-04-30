import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const performWebSearchMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/documentExtractor', async () => {
  const actual = await vi.importActual<typeof import('../utils/documentExtractor')>('../utils/documentExtractor');
  return {
    ...actual,
    performWebSearch: performWebSearchMock,
  };
});

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

describe('api/open-web-search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.BRAVE_SEARCH_API_KEY;
    vi.spyOn(globalThis, 'fetch').mockReset();
  });

  it('usa Brave Search quando BRAVE_SEARCH_API_KEY está configurada', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: 'Grupo Piccini abre usina',
              url: 'https://example.com/piccini-usina',
              description: 'Investimento em etanol de milho.',
            },
          ],
        },
      }),
    } as Response);

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: { query: 'Grupo Piccini RRP Energia Tapurah' },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      source: 'OpenWebSearch/Brave',
      degraded: false,
      sources: [
        expect.objectContaining({
          title: 'Grupo Piccini abre usina',
          url: 'https://example.com/piccini-usina',
          provider: 'brave',
        }),
      ],
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'api.search.brave.com' }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Subscription-Token': 'brave-key',
        }),
      }),
    );
  });

  it('retorna 200 degradado quando nenhum provedor encontra resultado', async () => {
    performWebSearchMock.mockResolvedValueOnce(null);

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: { query: 'consulta sem resultado' },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      content: '',
      sources: [],
      degraded: true,
    });
  });

  it('classifica Brave 401/403 como unauthorized sem travar o dossiê', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);
    performWebSearchMock.mockResolvedValueOnce(null);

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: { query: 'Grupo Piccini' },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      degraded: true,
      providerStatus: [
        { provider: 'brave', ok: false, reason: 'unauthorized', statusCode: 401 },
        { provider: 'duckduckgo', ok: false },
      ],
    });
  });

  it('classifica Brave 429 como rate_limited/quota_exhausted e cai para DuckDuckGo', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'monthly quota exhausted',
    } as Response);
    performWebSearchMock.mockResolvedValueOnce(
      'Título: Fonte DDG\nURL: https://example.org/fonte\nResumo: fallback\n---',
    );

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: { query: 'Grupo Piccini' },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      source: 'OpenWebSearch/DuckDuckGo',
      providerStatus: [
        { provider: 'brave', ok: false, reason: 'quota_exhausted', statusCode: 429 },
        { provider: 'duckduckgo', ok: true },
      ],
    });
  });

  it('classifica Brave 5xx e usa DuckDuckGo quando disponível', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'upstream unavailable',
    } as Response);
    performWebSearchMock.mockResolvedValueOnce(
      'Título: Fonte DDG\nURL: https://example.org/fonte\nResumo: fallback\n---',
    );

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: { query: 'Grupo Piccini' },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      source: 'OpenWebSearch/DuckDuckGo',
      providerStatus: [
        { provider: 'brave', ok: false, reason: 'server_error', statusCode: 503 },
        { provider: 'duckduckgo', ok: true },
      ],
    });
  });
});
