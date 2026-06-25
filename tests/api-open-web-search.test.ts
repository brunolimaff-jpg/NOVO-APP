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

function braveResponse(results: Array<{ title: string; url: string; description?: string }>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      web: {
        results: results.map(result => ({
          description: result.description ?? 'Resumo publico do resultado.',
          ...result,
        })),
      },
    }),
  } as Response;
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

    await handler(
      {
        method: 'POST',
        body: { query: 'Grupo Piccini RRP Energia Tapurah' },
      } as VercelRequest,
      response.res,
    );

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      content: expect.stringContaining('Grupo Piccini abre usina'),
      source: 'DuckDuckGo (fallback)',
      degraded: false,
      sources: [],
      providerStatus: expect.arrayContaining([{ provider: 'duckduckgo', ok: true }]),
    });
    expect(fetch).toHaveBeenCalled(); // Brave tentado primeiro, sem resultado → DuckDuckGo
    expect(performWebSearchMock).toHaveBeenCalledWith('Grupo Piccini RRP Energia Tapurah');
  });

  it('usa Brave quando a chave existe e pelo menos um resultado passa pela curadoria', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
    vi.mocked(fetch).mockResolvedValueOnce(
      braveResponse([
        {
          title: 'Scheffer amplia operacao agricola',
          url: 'https://www.scheffer.agr.br/noticias/operacao',
          description: 'Grupo Scheffer informa expansao de fazendas e biofabricas.',
        },
      ]),
    );

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler(
      {
        method: 'POST',
        body: { query: '"Scheffer" hectares fazendas' },
      } as VercelRequest,
      response.res,
    );

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      source: 'Brave Search API',
      degraded: false,
      sources: [
        expect.objectContaining({
          title: 'Scheffer amplia operacao agricola',
          provider: 'brave',
        }),
      ],
      providerStatus: expect.arrayContaining([{ provider: 'brave', ok: true }]),
      _debug: expect.objectContaining({
        hasBraveKey: true,
        braveAttempted: true,
      }),
    });
    expect(performWebSearchMock).not.toHaveBeenCalled();
  });

  it('aciona fallback Brave sem operadores -site quando a variante inicial zera a curadoria', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        braveResponse([
          {
            title: 'Lista telefonica Scheffer',
            url: 'https://apontador.com.br/scheffer',
          },
        ]),
      )
      .mockResolvedValueOnce(
        braveResponse([
          {
            title: 'Scheffer relatorio de sustentabilidade',
            url: 'https://www.scheffer.agr.br/sustentabilidade',
            description: 'Dados institucionais do Grupo Scheffer.',
          },
        ]),
      );

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler(
      {
        method: 'POST',
        body: { query: '"Scheffer" produção agrícola -site:apontador.com.br' },
      } as VercelRequest,
      response.res,
    );

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      source: 'Brave Search API',
      sources: [expect.objectContaining({ url: 'https://www.scheffer.agr.br/sustentabilidade' })],
      _debug: expect.objectContaining({
        brave: expect.objectContaining({
          queryVariant: 'without_negative_site',
        }),
      }),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondUrl = String(vi.mocked(fetch).mock.calls[1]?.[0]);
    expect(decodeURIComponent(secondUrl)).not.toContain('-site:apontador.com.br');
  });

  it('retorna diagnóstico explícito quando Brave tem resultados mas todos são filtrados', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
    performWebSearchMock.mockResolvedValueOnce(null);
    vi.mocked(fetch)
      .mockResolvedValueOnce(braveResponse([{ title: 'Lista 1', url: 'https://apontador.com.br/a' }]))
      .mockResolvedValueOnce(braveResponse([{ title: 'Lista 2', url: 'https://listamais.com.br/b' }]))
      .mockResolvedValueOnce(braveResponse([{ title: 'Lista 3', url: 'https://telelistas.net/c' }]));

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler(
      {
        method: 'POST',
        body: { query: '"Scheffer" telefone endereço' },
      } as VercelRequest,
      response.res,
    );

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      content: '',
      degraded: true,
      detail: expect.stringContaining('BRAVE_RESULTS_FILTERED_OUT'),
      providerStatus: expect.arrayContaining([
        expect.objectContaining({ provider: 'brave', ok: false, reason: 'BRAVE_RESULTS_FILTERED_OUT' }),
      ]),
      _debug: expect.objectContaining({
        brave: expect.objectContaining({
          emptyReason: 'BRAVE_RESULTS_FILTERED_OUT',
          blockedByDomainCount: expect.any(Number),
          sampleDomains: expect.arrayContaining(['apontador.com.br']),
        }),
      }),
    });
  });

  it('bloqueia por domínio real da URL sem falso positivo em título ou hostname parecido', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
    vi.mocked(fetch).mockResolvedValueOnce(
      braveResponse([
        { title: 'Lista bloqueada', url: 'https://www.apontador.com.br/scheffer' },
        {
          title: 'Empresa cita Apontador apenas no título',
          url: 'https://notapontador.com.br/scheffer',
          description: 'Conteúdo permitido apesar do texto parecido.',
        },
      ]),
    );

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler(
      {
        method: 'POST',
        body: { query: '"Scheffer" fontes publicas' },
      } as VercelRequest,
      response.res,
    );

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      source: 'Brave Search API',
      sources: [expect.objectContaining({ url: 'https://notapontador.com.br/scheffer' })],
      _debug: expect.objectContaining({
        brave: expect.objectContaining({
          blockedByDomainCount: 1,
          afterFinalLimitCount: 1,
        }),
      }),
    });
  });

  it('deduplica resultados parecidos mantendo pelo menos um resultado útil', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-key';
    vi.mocked(fetch).mockResolvedValueOnce(
      braveResponse([
        {
          title: 'Scheffer sustentabilidade',
          url: 'https://www.scheffer.agr.br/sustentabilidade?utm_source=brave',
        },
        {
          title: 'Scheffer sustentabilidade',
          url: 'https://www.scheffer.agr.br/sustentabilidade?utm_source=outro',
        },
      ]),
    );

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler(
      {
        method: 'POST',
        body: { query: '"Scheffer" sustentabilidade' },
      } as VercelRequest,
      response.res,
    );

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      source: 'Brave Search API',
      sources: [expect.objectContaining({ title: 'Scheffer sustentabilidade' })],
      _debug: expect.objectContaining({
        brave: expect.objectContaining({
          afterDedupCount: 1,
          afterFinalLimitCount: 1,
        }),
      }),
    });
  });

  it('não registra chave Brave, Authorization ou Bearer nos logs estruturados', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'super-secret-brave-key';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(fetch).mockResolvedValueOnce(
      braveResponse([
        {
          title: 'Scheffer fonte publica',
          url: 'https://www.scheffer.agr.br/fonte',
        },
      ]),
    );

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler(
      {
        method: 'POST',
        body: { query: '"Scheffer" fonte publica' },
      } as VercelRequest,
      response.res,
    );

    const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .map(call => call.map(value => (typeof value === 'string' ? value : JSON.stringify(value))).join(' '))
      .join('\n');

    expect(logged).not.toContain('super-secret-brave-key');
    expect(logged).not.toMatch(/Authorization|Bearer/i);
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('retorna 200 degradado quando nenhum provedor encontra resultado', async () => {
    performWebSearchMock.mockResolvedValueOnce(null);

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler(
      {
        method: 'POST',
        body: { query: 'consulta sem resultado' },
      } as VercelRequest,
      response.res,
    );

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

    await handler(
      {
        method: 'POST',
        body: { url: 'https://example.com/page' },
      } as VercelRequest,
      response.res,
    );

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

    await handler(
      {
        method: 'POST',
        body: {},
      } as VercelRequest,
      response.res,
    );

    expect(response.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(performWebSearchMock).not.toHaveBeenCalled();
  });

  it('retorna providerStatus degradado quando DuckDuckGo falha', async () => {
    performWebSearchMock.mockRejectedValueOnce(new Error('Search failed: 503'));

    const { default: handler } = await import('../api/open-web-search');
    const response = makeResponse();

    await handler(
      {
        method: 'POST',
        body: { query: 'Grupo Piccini' },
      } as VercelRequest,
      response.res,
    );

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      content: '',
      source: 'OpenWebSearch/Degraded',
      degraded: true,
      detail: 'Search failed: 503',
      providerStatus: expect.arrayContaining([{ provider: 'duckduckgo', ok: false, reason: 'unknown' }]),
    });
  });
});
