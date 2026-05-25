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

  it('usa DuckDuckGo mesmo quando BRAVE_SEARCH_API_KEY está configurada', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
    performWebSearchMock.mockResolvedValueOnce(
      'Título: Grupo Piccini abre usina\nURL: https://example.com/piccini-usina\nResumo: Investimento em etanol de milho.\n---',
    );

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: { query: 'Grupo Piccini RRP Energia Tapurah' },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      content: expect.stringContaining('Grupo Piccini abre usina'),
      source: 'OpenWebSearch/DuckDuckGo',
      degraded: false,
      sources: [],
      providerStatus: [
        { provider: 'duckduckgo', ok: true },
      ],
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(performWebSearchMock).toHaveBeenCalledWith('Grupo Piccini RRP Energia Tapurah');
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

  it('aceita URL sem query e extrai HTML diretamente', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><body><main>Conteudo publico da pagina</main></body></html>',
    } as Response);

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: { url: 'https://example.com/page' },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      content: 'Conteudo publico da pagina',
      source: 'OpenWebSearch/URL',
      degraded: false,
      sources: [
        expect.objectContaining({
          title: 'https://example.com/page',
          url: 'https://example.com/page',
          provider: 'url',
        }),
      ],
    });
  });

  it('rejeita request sem query e sem url', async () => {
    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {},
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(performWebSearchMock).not.toHaveBeenCalled();
  });

  it('retorna providerStatus degradado quando DuckDuckGo falha', async () => {
    performWebSearchMock.mockRejectedValueOnce(new Error('Search failed: 503'));

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: { query: 'Grupo Piccini' },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      content: '',
      source: 'OpenWebSearch/DdgDegraded',
      degraded: true,
      detail: 'Search failed: 503',
      providerStatus: [
        { provider: 'duckduckgo', ok: false, reason: 'unknown' },
      ],
    });
  });
});
