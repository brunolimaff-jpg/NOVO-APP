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
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
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
          evidenceType: 'trade',
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

  it('usa cache para repetir a mesma busca sem novo scraping', async () => {
    performWebSearchMock.mockResolvedValueOnce([
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
    expect(performWebSearchMock).toHaveBeenCalledTimes(1);
    expect(second.payload).toMatchObject({ cached: true });
  });

  it('nao faz scraping em producao quando cache persistente nao esta configurado', async () => {
    vi.stubEnv('NODE_ENV', 'production');

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
    expect(response.payload).toMatchObject({ companies: [], degraded: true, cached: false });
    expect(performWebSearchMock).not.toHaveBeenCalled();
  });

  it('ignora chave anon publica para cache server-side em producao', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

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
    expect(response.payload).toMatchObject({ companies: [], degraded: true, cached: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(performWebSearchMock).not.toHaveBeenCalled();
  });

  it('nao faz scraping em producao quando cache persistente nao aceita gravacao', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'secret');
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
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
    expect(response.payload).toMatchObject({ companies: [], degraded: true, cached: false });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(performWebSearchMock).not.toHaveBeenCalled();
  });

  it('em producao nao usa cache volatil antes de validar cache persistente', async () => {
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
    performWebSearchMock.mockResolvedValueOnce([
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
    expect(second.payload).toMatchObject({ companies: [], degraded: true, cached: false });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(performWebSearchMock).toHaveBeenCalledTimes(1);
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
            evidenceType: 'trade',
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
    performWebSearchMock.mockResolvedValueOnce([
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
    const upsertBody = JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body));
    expect(upsertBody.id).toContain('socio-search:04733767000180::guilherme m scheffer');
    expect(upsertBody.operator_id).toBe('server:socio-search');
    expect(new Date(upsertBody.expires_at).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });
});
