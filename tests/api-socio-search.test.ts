import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const performWebSearchMock = vi.hoisted(() => vi.fn());
const lookupCnpjMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/documentExtractor', async () => {
  const actual = await vi.importActual<typeof import('../utils/documentExtractor')>('../utils/documentExtractor');
  return {
    ...actual,
    performWebSearch: performWebSearchMock,
  };
});

vi.mock('../lib/cnpjLookup', () => ({
  lookupCnpj: lookupCnpjMock,
}));

function makeResponse() {
  let statusCode = 0;
  let payload: unknown;
  const headers = new Map<string, string>();
  const res = {
    setHeader: (name: string, value: string) => {
      headers.set(name, value);
    },
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
    headers,
  };
}

describe('api/socio-search', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    performWebSearchMock.mockReset();
    lookupCnpjMock.mockReset();
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    lookupCnpjMock.mockRejectedValue(new Error('cnpj lookup not mocked'));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch not mocked'));
  });

  it('retorna empresas fortes e remove CPF completo do snippet', async () => {
    performWebSearchMock.mockResolvedValueOnce([
      'Título: Scheffer Colombia S.A.S. importações',
      'URL: https://www.veritradecorp.com/es/COLOMBIA/importaciones-y-exportaciones-scheffer-colombia-sas/NIT-901352572',
      'Resumo: Guilherme M. Scheffer aparece ligado à Scheffer Colombia S.A.S. CPF 123.456.789-00 e SCHEFFER & CIA LTDA exportou para a empresa.',
      '---',
    ].join('\n'));

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04.733.767/0001-80',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      degraded: false,
      companies: [
        expect.objectContaining({
          name: 'Scheffer Colombia S.A.S.',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        }),
      ],
    });
    expect(JSON.stringify(response.payload)).not.toContain('123.456.789-00');
    expect(JSON.stringify(response.payload)).toContain('CPF xxx.xxx.789-xx');
  });

  it('rejeita homonimo fraco sem contexto do grupo', async () => {
    performWebSearchMock.mockResolvedValueOnce([
      'Título: João Scheffer abre empresa de tecnologia',
      'URL: https://example.com/homonimo',
      'Resumo: Pessoa sem conexão com Scheffer & Cia Ltda, agro ou CNPJ raiz.',
      '---',
    ].join('\n'));

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      companies: [],
      rejected: [expect.objectContaining({ reason: expect.stringMatching(/homon/i) })],
    });
  });

  it('rejeita match por nome em dominio forte quando falta contexto do grupo', async () => {
    performWebSearchMock.mockResolvedValueOnce([
      'Título: Guilherme M. Scheffer - quadro societário',
      'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
      'Resumo: Guilherme M. Scheffer consta como sócio de outra empresa sem contexto do grupo analisado.',
      '---',
    ].join('\n'));

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      companies: [],
      rejected: [expect.objectContaining({ reason: expect.stringMatching(/homon/i) })],
    });
  });

  it('retorna CNPJ valido do socio mesmo sem contexto da matriz como outro CNPJ do socio', async () => {
    performWebSearchMock
      .mockResolvedValueOnce('Nenhum resultado encontrado.')
      .mockResolvedValueOnce([
        'Título: Guilherme M. Scheffer - quadro societário',
        'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
        'Resumo: Guilherme M. Scheffer consta como sócio administrador da Fazenda Independente LTDA CNPJ 12.345.678/0001-95.',
        '---',
      ].join('\n'))
      .mockResolvedValue('Nenhum resultado encontrado.');
    lookupCnpjMock.mockResolvedValueOnce({
      cnpj: '12345678000195',
      companyName: 'Fazenda Independente LTDA',
      city: 'Sapezal',
      state: 'MT',
      cnaeDescricao: 'Cultivo de soja',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Sócio-administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(performWebSearchMock).toHaveBeenCalledWith(
      'site:consultasocio.com/q/sa "Guilherme M. Scheffer"',
      expect.objectContaining({ count: 10 }),
    );
    expect(response.payload).toMatchObject({
      companies: [
        expect.objectContaining({
          name: 'Fazenda Independente LTDA',
          cnpj: '12345678000195',
          relationshipScope: 'partner_other_cnpj',
          rootContext: false,
          confidence: 'strong',
          evidenceType: 'qsa',
        }),
      ],
    });
  });

  it('rejeita CNPJ enriquecido quando o QSA oficial nao contem o socio pesquisado', async () => {
    performWebSearchMock
      .mockResolvedValueOnce('Nenhum resultado encontrado.')
      .mockResolvedValueOnce([
        'Título: Guilherme M. Scheffer - quadro societário',
        'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
        'Resumo: Guilherme M. Scheffer aparece perto da Fazenda Homonima LTDA CNPJ 98.765.432/0001-10.',
        '---',
      ].join('\n'))
      .mockResolvedValue('Nenhum resultado encontrado.');
    lookupCnpjMock.mockResolvedValueOnce({
      cnpj: '98765432000110',
      companyName: 'Fazenda Homonima LTDA',
      city: 'Sapezal',
      state: 'MT',
      cnaeDescricao: 'Cultivo de soja',
      qsa: [
        {
          name: 'Joao da Silva',
          role: 'Sócio-administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      companies: [],
      rejected: [
        expect.objectContaining({
          reason: expect.stringMatching(/QSA oficial nao confirma o socio/i),
        }),
      ],
    });
  });

  it('rejeita homonimo de QSA quando nome curto bate so por primeiro e ultimo nome', async () => {
    performWebSearchMock
      .mockResolvedValueOnce('Nenhum resultado encontrado.')
      .mockResolvedValueOnce([
        'Título: João Silva - quadro societário',
        'URL: https://consultasocio.com/q/sa/joao-silva',
        'Resumo: João Silva aparece no quadro societário da Agro Silva LTDA CNPJ 11.222.333/0001-44.',
        '---',
      ].join('\n'))
      .mockResolvedValue('Nenhum resultado encontrado.');
    lookupCnpjMock.mockResolvedValueOnce({
      cnpj: '11222333000144',
      companyName: 'Agro Silva LTDA',
      qsa: [
        {
          name: 'João Pereira Silva',
          role: 'Sócio-administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'João Silva',
        rootCompanyName: 'Empresa Raiz Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      companies: [],
      rejected: [
        expect.objectContaining({
          reason: expect.stringMatching(/QSA oficial nao confirma o socio/i),
        }),
      ],
    });
  });

  it('usa cache para repetir a mesma busca sem novo scraping', async () => {
    performWebSearchMock.mockResolvedValue([
      'Título: Agropecuária Scheffer',
      'URL: https://example.com/agropecuaria-scheffer',
      'Resumo: Guilherme M. Scheffer e Scheffer & Cia Ltda aparecem no contexto societário da Agropecuária Scheffer.',
      '---',
    ].join('\n'));

    const { default: handler } = await import('../api/socio-search');

    const first = makeResponse();
    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, first.res);

    const second = makeResponse();
    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, second.res);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(performWebSearchMock).toHaveBeenCalledTimes(6);
    expect(second.payload).toMatchObject({
      cached: true,
      diagnostics: expect.objectContaining({ cacheSource: 'memory' }),
    });
  });

  it('continua pesquisando em producao quando cache persistente nao esta configurado', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    performWebSearchMock.mockResolvedValue([
      'Título: Scheffer Colombia S.A.S. importações',
      'URL: https://www.veritradecorp.com/es/COLOMBIA/importaciones-y-exportaciones-scheffer-colombia-sas/NIT-901352572',
      'Resumo: Guilherme M. Scheffer aparece ligado à Scheffer Colombia S.A.S. e SCHEFFER & CIA LTDA exportou para a empresa.',
      '---',
    ].join('\n'));

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      companies: [expect.objectContaining({ name: 'Scheffer Colombia S.A.S.' })],
      degraded: false,
      cached: false,
      diagnostics: expect.objectContaining({
        queriesRun: expect.arrayContaining([
          expect.stringContaining('consultasocio.com'),
          expect.stringContaining('holding'),
          expect.stringContaining('S.A.S.'),
        ]),
        cacheSource: 'none',
      }),
    });
    expect(performWebSearchMock).toHaveBeenCalledTimes(6);
  });

  it('ignora chave anon publica para cache server-side mas nao bloqueia busca viva', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('page fetch not mocked'));
    performWebSearchMock.mockResolvedValue([
      'Título: Scheffer Colombia S.A.S. importações',
      'URL: https://www.veritradecorp.com/es/COLOMBIA/importaciones-y-exportaciones-scheffer-colombia-sas/NIT-901352572',
      'Resumo: Guilherme M. Scheffer aparece ligado à Scheffer Colombia S.A.S. e SCHEFFER & CIA LTDA exportou para a empresa.',
      '---',
    ].join('\n'));

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      companies: [expect.objectContaining({ name: 'Scheffer Colombia S.A.S.' })],
      degraded: false,
      cached: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(performWebSearchMock).toHaveBeenCalledTimes(6);
  });

  it('serve resultado vivo em producao mesmo quando cache persistente nao aceita gravacao', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secret');
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response);
    performWebSearchMock.mockResolvedValue([
      'Título: Scheffer Colombia S.A.S. importações',
      'URL: https://www.veritradecorp.com/es/COLOMBIA/importaciones-y-exportaciones-scheffer-colombia-sas/NIT-901352572',
      'Resumo: Guilherme M. Scheffer aparece ligado à Scheffer Colombia S.A.S. e SCHEFFER & CIA LTDA exportou para a empresa.',
      '---',
    ].join('\n'));

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      companies: [expect.objectContaining({ name: 'Scheffer Colombia S.A.S.' })],
      degraded: false,
      cached: false,
    });
    expect(fetchSpy).toHaveBeenCalled();
    expect(performWebSearchMock).toHaveBeenCalledTimes(6);
  });

  it('em producao usa cache volatil como fallback depois da primeira busca viva', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secret');
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response);
    performWebSearchMock.mockResolvedValue([
      'Título: Scheffer Colombia S.A.S. importações',
      'URL: https://www.veritradecorp.com/es/COLOMBIA/importaciones-y-exportaciones-scheffer-colombia-sas/NIT-901352572',
      'Resumo: Guilherme M. Scheffer aparece ligado à Scheffer Colombia S.A.S. e SCHEFFER & CIA LTDA exportou para a empresa.',
      '---',
    ].join('\n'));

    const { default: handler } = await import('../api/socio-search');
    const first = makeResponse();
    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, first.res);

    const second = makeResponse();
    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, second.res);

    expect(first.payload).toMatchObject({ companies: [expect.objectContaining({ name: 'Scheffer Colombia S.A.S.' })] });
    expect(second.payload).toMatchObject({
      companies: [expect.objectContaining({ name: 'Scheffer Colombia S.A.S.' })],
      degraded: false,
      cached: true,
      diagnostics: expect.objectContaining({ cacheSource: 'memory' }),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(performWebSearchMock).toHaveBeenCalledTimes(6);
  });

  it('le cache persistente antes de rodar scraping', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secret');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ([{
        result: {
          companies: [{
            name: 'Scheffer Colombia S.A.S.',
            country: 'CO',
            partnerName: 'Guilherme M. Scheffer',
            sourceUrl: 'https://example.com/colombia',
            sourceTitle: 'Fonte cache',
            snippet: 'Scheffer & Cia Ltda e Guilherme M. Scheffer aparecem no contexto.',
            confidence: 'strong',
            evidenceType: 'registry',
          }],
          rejected: [],
          degraded: false,
          cached: false,
        },
      }]),
    } as Response);

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({ cached: true, companies: [expect.objectContaining({ name: 'Scheffer Colombia S.A.S.' })] });
    expect(fetchSpy).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'GET' }));
    expect(performWebSearchMock).not.toHaveBeenCalled();
  });

  it('grava cache persistente com expiracao de pelo menos 7 dias', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secret');
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);
    performWebSearchMock.mockResolvedValue([
      'Título: Scheffer Colombia S.A.S. importações',
      'URL: https://www.veritradecorp.com/es/COLOMBIA/importaciones-y-exportaciones-scheffer-colombia-sas/NIT-901352572',
      'Resumo: Guilherme M. Scheffer aparece ligado à Scheffer Colombia S.A.S. e SCHEFFER & CIA LTDA exportou para a empresa.',
      '---',
    ].join('\n'));

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const upsertBody = JSON.parse(String((fetchSpy.mock.calls[1][1] as any).body));
    expect(upsertBody.id).toContain('socio-search:v2-all-partner-cnpjs::04733767000180::guilherme m scheffer');
    expect(upsertBody.operator_id).toBe('server:socio-search');
    expect(new Date(upsertBody.expires_at).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it('roda todas as queries, abre paginas candidatas e enriquece CNPJ brasileiro via lookup oficial', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<html><body>Guilherme M. Scheffer aparece com Scheffer & Cia Ltda na Agropecuaria Scheffer CNPJ 00.111.222/0001-33.</body></html>',
    } as Response);
    performWebSearchMock
      .mockResolvedValueOnce([
        'Título: Resultado genérico Scheffer',
        'URL: https://example.com/generico',
        'Resumo: Guilherme M. Scheffer e Scheffer & Cia Ltda aparecem em resultado superficial.',
        '---',
      ].join('\n'))
      .mockResolvedValueOnce([
        'Título: Agropecuaria Scheffer QSA',
        'URL: https://example.com/agropecuaria-scheffer',
        'Resumo: Guilherme M. Scheffer aparece no quadro societário do grupo Scheffer.',
        '---',
      ].join('\n'))
      .mockResolvedValueOnce('Nenhum resultado encontrado.');
    lookupCnpjMock.mockResolvedValueOnce({
      cnpj: '00111222000133',
      companyName: 'Agropecuaria Scheffer Ltda',
      city: 'Sapezal',
      state: 'MT',
      cnaeDescricao: 'Cultivo de soja',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Sócio-administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(performWebSearchMock).toHaveBeenCalledTimes(6);
    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/generico', expect.any(Object));
    expect(lookupCnpjMock).toHaveBeenCalledWith('00111222000133', expect.objectContaining({
      maxSources: 1,
      timeoutMs: expect.any(Number),
    }));
    expect(response.payload).toMatchObject({
      companies: [
        expect.objectContaining({
          name: 'Agropecuaria Scheffer Ltda',
          cnpj: '00111222000133',
          role: 'Cultivo de soja',
          confidence: 'strong',
          evidenceType: 'qsa',
          sourceDepth: 'cnpj_lookup',
        }),
      ],
      diagnostics: expect.objectContaining({
        queriesRun: expect.arrayContaining([
          expect.stringContaining('consultasocio.com'),
          expect.stringContaining('holding'),
          expect.stringContaining('S.A.S.'),
        ]),
        pagesFetched: expect.any(Number),
        rejectedCount: expect.any(Number),
      }),
    });
  });

  it('limita enriquecimentos globais para preservar budget da serverless', async () => {
    const blocks = Array.from({ length: 12 }, (_, index) => {
      const suffix = String(index + 1).padStart(3, '0');
      return [
        `Título: Fazenda ${suffix} de Guilherme M. Scheffer`,
        'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
        `Resumo: Guilherme M. Scheffer consta como sócio administrador da Fazenda ${suffix} CNPJ 00.111.${suffix}/0001-33.`,
        '---',
      ].join('\n');
    }).join('\n');
    performWebSearchMock.mockResolvedValue(blocks);
    lookupCnpjMock.mockImplementation(async (cnpj: string) => ({
      cnpj,
      companyName: `Fazenda ${cnpj.slice(5, 8)} LTDA`,
      qsa: [],
    }));

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(lookupCnpjMock).toHaveBeenCalledTimes(5);
    expect(performWebSearchMock).toHaveBeenCalledTimes(1);
    expect(response.payload).toMatchObject({
      companies: expect.arrayContaining([
        expect.objectContaining({ relationshipScope: 'partner_other_cnpj' }),
      ]),
      diagnostics: expect.objectContaining({
        cnpjsEnriched: 5,
      }),
    });
  });

  it('limita tentativas globais mesmo quando lookup oficial falha', async () => {
    const blocks = Array.from({ length: 12 }, (_, index) => {
      const suffix = String(index + 1).padStart(3, '0');
      return [
        `Título: Fazenda ${suffix} de Guilherme M. Scheffer`,
        'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
        `Resumo: Guilherme M. Scheffer consta como sócio administrador da Fazenda ${suffix} CNPJ 00.222.${suffix}/0001-44.`,
        '---',
      ].join('\n');
    }).join('\n');
    performWebSearchMock.mockResolvedValue(blocks);
    lookupCnpjMock.mockRejectedValue(new Error('official source timeout'));

    const { default: handler } = await import('../api/socio-search');
    const response = makeResponse();

    await handler({
      method: 'POST',
      body: {
        socioName: 'Guilherme M. Scheffer',
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
      },
    } as VercelRequest, response.res);

    expect(response.statusCode).toBe(200);
    expect(lookupCnpjMock).toHaveBeenCalledTimes(5);
    expect(performWebSearchMock).toHaveBeenCalledTimes(1);
  });
});
