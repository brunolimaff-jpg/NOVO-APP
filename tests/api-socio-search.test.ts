import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeCnpj } from '../utils/cnpj';

const performWebSearchMock = vi.hoisted(() => vi.fn());
const searchConsultasocioDirectMock = vi.hoisted(() => vi.fn());
const lookupCnpjMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/documentExtractor', async () => {
  const actual = await vi.importActual<typeof import('../utils/documentExtractor')>('../utils/documentExtractor');
  return {
    ...actual,
    performWebSearch: performWebSearchMock,
    searchConsultasocioDirect: searchConsultasocioDirectMock,
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

function buildValidCnpj(index: number): string {
  const base = String(100000000001 + index).padStart(12, '0');
  const calcDigit = (value: string, factors: number[]): number => {
    const total = value.split('').reduce((sum, char, idx) => sum + Number(char) * factors[idx], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const firstDigit = calcDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calcDigit(`${base}${firstDigit}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${firstDigit}${secondDigit}`;
}

function formatTestCnpj(cnpj: string): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

describe('api/socio-search', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    performWebSearchMock.mockReset();
    searchConsultasocioDirectMock.mockReset();
    lookupCnpjMock.mockReset();
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    searchConsultasocioDirectMock.mockResolvedValue(null);
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
      '"Guilherme M. Scheffer" "Scheffer & Cia Ltda" socio',
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

  it('nao promove CNPJ de perfil do socio para grupo so porque a raiz aparece no mesmo bloco', async () => {
    performWebSearchMock.mockResolvedValueOnce([
      'Título: Guilherme M. Scheffer - Econodata',
      'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
      'Resumo: Guilherme M. Scheffer também desempenha função na Scheffer & Cia Ltda. Empresas em que Guilherme é listado: Agropecuaria Scheffer LTDA CNPJ 09.567.366/0001-11.',
      '---',
    ].join('\n'));
    lookupCnpjMock.mockResolvedValueOnce({
      cnpj: '09567366000111',
      companyName: 'AGROPECUARIA SCHEFFER LTDA',
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
    expect(response.payload).toMatchObject({
      companies: [
        expect.objectContaining({
          name: 'AGROPECUARIA SCHEFFER LTDA',
          cnpj: '09567366000111',
          relationshipScope: 'partner_other_cnpj',
          rootContext: false,
          confidence: 'strong',
          evidenceType: 'qsa',
        }),
      ],
    });
  });

  it('extrai varios CNPJs da pagina de perfil do socio mesmo quando o snippet ja tem um CNPJ', async () => {
    const pageCompanies = [
      ['Agropecuaria Scheffer LTDA', '09.567.366/0001-11'],
      ['Scheffer Comercial Atacadista de Produtos Agricolas LTDA', formatTestCnpj(buildValidCnpj(1))],
      ['Associacao Scheffer de Lazer e Convivencia Familiar', formatTestCnpj(buildValidCnpj(2))],
      ['Fazenda Independente Scheffer LTDA', formatTestCnpj(buildValidCnpj(3))],
      ['Sementes Scheffer LTDA', formatTestCnpj(buildValidCnpj(4))],
      ['Transportes Scheffer LTDA', formatTestCnpj(buildValidCnpj(5))],
    ];
    const pageHtml = `<html><body>${pageCompanies
      .map(([name, cnpj]) => `<section>${name} Ativa Socio Administrador CNPJ ${cnpj} Setor Cultivo de soja</section>`)
      .join('\n')}</body></html>`;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => pageHtml,
    } as Response);
    performWebSearchMock
      .mockResolvedValueOnce([
        'Título: Guilherme M. Scheffer - Econodata',
        'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
        'Resumo: Guilherme M. Scheffer também desempenha função na Scheffer & Cia Ltda. Empresas em que Guilherme é listado: Agropecuaria Scheffer LTDA CNPJ 09.567.366/0001-11.',
        '---',
      ].join('\n'))
      .mockResolvedValue('Nenhum resultado encontrado.');
    lookupCnpjMock.mockImplementation(async (cnpj: string) => ({
      cnpj,
      companyName: pageCompanies.find(([, listedCnpj]) => normalizeCnpj(listedCnpj) === normalizeCnpj(cnpj))?.[0],
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Sócio-administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
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
    expect(fetchSpy).toHaveBeenCalledWith('https://consultasocio.com/q/sa/guilherme-m-scheffer', expect.any(Object));
    const payload = response.payload as {
      companies: Array<{
        name: string;
        cnpj: string;
        rawCnpjLabel?: string;
        relationshipScope: string;
        rootContext: boolean;
        validationStatus?: string;
      }>;
      diagnostics?: { cnpjsEnriched?: number };
    };
    expect(payload.companies).toHaveLength(6);
    expect(payload.companies).toEqual(expect.arrayContaining(
      pageCompanies.slice(0, 5).map(([name, cnpj]) => expect.objectContaining({
        name,
        cnpj: normalizeCnpj(cnpj),
        relationshipScope: 'partner_other_cnpj',
        rootContext: false,
      })),
    ));
    expect(payload.companies.at(-1)).toMatchObject({
      name: pageCompanies.at(-1)?.[0],
      cnpj: normalizeCnpj(pageCompanies.at(-1)?.[1] || ''),
      rawCnpjLabel: `${pageCompanies.at(-1)?.[1]}*`,
      relationshipScope: 'unconfirmed',
      validationStatus: 'pending',
      rootContext: false,
    });
    expect(payload.diagnostics).toMatchObject({
      cnpjsEnriched: 5,
    });
  });

  it('extrai varios CNPJs da mesma pagina de perfil do socio e retorna excedentes sem lookup como pendentes', async () => {
    const profileCnpjs = Array.from({ length: 7 }, (_, index) => formatTestCnpj(buildValidCnpj(index + 10)));
    performWebSearchMock.mockResolvedValueOnce([
      'Título: Guilherme M. Scheffer - Consulta Sócio',
      'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
      `Resumo: Guilherme M. Scheffer consta no quadro societário de Cia Ltda CNPJ ${profileCnpjs[0]}.`,
      '---',
    ].join('\n'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => [
        'Empresas em que Guilherme M. Scheffer aparece:',
        `Agropecuaria Norte LTDA CNPJ ${profileCnpjs[0]}`,
        `Agropecuaria Norte LTDA CNPJ ${profileCnpjs[1]}`,
        `Fazenda Leste LTDA CNPJ ${profileCnpjs[2]}`,
        `Armazens Serra LTDA CNPJ ${profileCnpjs[3]}`,
        `Transportes Oeste LTDA CNPJ ${profileCnpjs[4]}`,
        `Bio Insumos Vale LTDA CNPJ ${profileCnpjs[5]}`,
        `Trading Centro LTDA CNPJ ${profileCnpjs[6]}`,
      ].join('\n'),
    } as Response);
    lookupCnpjMock.mockImplementation(async (cnpj: string) => ({
      cnpj,
      companyName: `Empresa Oficial ${cnpj.slice(0, 2)} LTDA`,
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Sócio-administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
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
    const payload = response.payload as {
      companies: Array<{
        cnpj: string;
        name: string;
        rawCnpjLabel?: string;
        relationshipScope: string;
        rootContext: boolean;
        validationStatus?: string;
      }>;
      diagnostics?: { pagesFetched?: number; cnpjsEnriched?: number };
    };

    expect(globalThis.fetch).toHaveBeenCalledWith('https://consultasocio.com/q/sa/guilherme-m-scheffer', expect.any(Object));
    expect(lookupCnpjMock).toHaveBeenCalledTimes(5);
    expect(payload.diagnostics).toMatchObject({ pagesFetched: 1, cnpjsEnriched: 5 });
    expect(payload.companies.map(company => company.cnpj)).toEqual(profileCnpjs.map(normalizeCnpj));
    expect(payload.companies.slice(0, 5).every(company => company.relationshipScope === 'partner_other_cnpj')).toBe(true);
    expect(payload.companies.slice(5).every(company => company.relationshipScope === 'unconfirmed')).toBe(true);
    expect(payload.companies.slice(5).every(company => company.validationStatus === 'pending')).toBe(true);
    expect(payload.companies.every(company => company.rootContext === false)).toBe(true);
    expect(payload.companies.map(company => company.name)).not.toContain('Cia Ltda');
    expect(payload.companies.at(-1)?.name).toBe('Trading Centro LTDA');
    expect(payload.companies.at(-1)?.rawCnpjLabel).toBe(`${profileCnpjs.at(-1)}*`);
  });

  it('substitui nome truncado por fallback de CNPJ quando lookup oficial nao enriquece', async () => {
    const validCnpj = buildValidCnpj(30);
    const formattedCnpj = formatTestCnpj(validCnpj);
    performWebSearchMock.mockResolvedValueOnce([
      'Título: Guilherme M. Scheffer - Consulta Sócio',
      'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
      `Resumo: Guilherme M. Scheffer consta no quadro societário de Cia Ltda CNPJ ${formattedCnpj}.`,
      '---',
    ].join('\n'));
    lookupCnpjMock.mockRejectedValue(new Error('official lookup timeout'));

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
      companies: [
        expect.objectContaining({
          cnpj: validCnpj,
          name: `Empresa CNPJ ${formattedCnpj}`,
          rawCnpjLabel: `${formattedCnpj}*`,
          relationshipScope: 'unconfirmed',
          validationStatus: 'pending',
          confidence: 'weak',
        }),
      ],
    });
    expect(JSON.stringify(response.payload)).not.toContain('"name":"Cia Ltda"');
  });

  it('retorna CNPJ textual sem validacao oficial como pendente e nao confirmado', async () => {
    const validCnpj = buildValidCnpj(32);
    const formattedCnpj = formatTestCnpj(validCnpj);
    performWebSearchMock.mockResolvedValueOnce([
      'Título: Guilherme M. Scheffer - Consulta Sócio',
      'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
      `Resumo: Guilherme M. Scheffer consta no quadro societário de Condominio Rural X CNPJ ${formattedCnpj}.`,
      '---',
    ].join('\n'));
    lookupCnpjMock.mockRejectedValue(new Error('official lookup timeout'));

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
      companies: [
        expect.objectContaining({
          cnpj: validCnpj,
          rawCnpjLabel: `${formattedCnpj}*`,
          validationStatus: 'pending',
          relationshipScope: 'unconfirmed',
          rootContext: false,
          confidence: 'weak',
        }),
      ],
    });
  });

  it('substitui nome oficial truncado por razao inferida do bloco do CNPJ', async () => {
    const validCnpj = buildValidCnpj(31);
    const formattedCnpj = formatTestCnpj(validCnpj);
    performWebSearchMock.mockResolvedValueOnce([
      'Título: Guilherme M. Scheffer - Consulta Sócio',
      'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
      `Resumo: Guilherme M. Scheffer consta no quadro societário de Agropecuaria Norte LTDA CNPJ ${formattedCnpj}.`,
      '---',
    ].join('\n'));
    lookupCnpjMock.mockResolvedValueOnce({
      cnpj: validCnpj,
      companyName: 'Cia Ltda',
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
    expect(response.payload).toMatchObject({
      companies: [
        expect.objectContaining({
          cnpj: validCnpj,
          name: 'Agropecuaria Norte LTDA',
          relationshipScope: 'partner_other_cnpj',
        }),
      ],
    });
    expect(JSON.stringify(response.payload)).not.toContain('"name":"Cia Ltda"');
  });

  it('diagnostica busca sem resultado diferente de falha de busca', async () => {
    performWebSearchMock
      .mockResolvedValueOnce('Nenhum resultado encontrado.')
      .mockResolvedValueOnce(null)
      .mockResolvedValue('Nenhum resultado encontrado.');

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
      degraded: true,
      diagnostics: expect.objectContaining({
        searchNoResultCount: 5,
        searchFailureCount: 3,
      }),
    });
  });

  it('sinaliza truncamento quando a fonte tem mais CNPJs validos que o limite de retorno', async () => {
    const cnpjList = Array.from({ length: 62 }, (_, index) => {
      return [`Empresa ${index + 1} LTDA`, formatTestCnpj(buildValidCnpj(index + 100))] as const;
    });
    performWebSearchMock.mockResolvedValueOnce([
      'Título: Guilherme M. Scheffer - Consulta Sócio',
      'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
      `Resumo: Guilherme M. Scheffer consta como sócio administrador. ${cnpjList.map(([name, cnpj]) => `${name} CNPJ ${cnpj}`).join(' ')}`,
      '---',
    ].join('\n'));
    lookupCnpjMock.mockRejectedValue(new Error('official lookup timeout'));

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
    const payload = response.payload as {
      companies: Array<{ cnpj: string }>;
      degraded?: boolean;
      diagnostics?: { totalCnpjsFound?: number; truncated?: boolean; truncatedReason?: string };
    };
    expect(payload.companies).toHaveLength(60);
    expect(payload.degraded).toBe(true);
    expect(payload.diagnostics).toMatchObject({
      totalCnpjsFound: 62,
      truncated: true,
      truncatedReason: 'company_limit',
    });
  });

  it('rejeita CNPJ com digito verificador invalido quando o lookup oficial nao confirma', async () => {
    performWebSearchMock.mockResolvedValueOnce([
      'Título: Guilherme M. Scheffer - Consulta Sócio',
      'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
      'Resumo: Guilherme M. Scheffer consta como sócio administrador de Cia Ltda CNPJ 11.111.111/0001-11.',
      '---',
    ].join('\n'));
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
    expect(response.payload).toMatchObject({
      companies: [],
      rejected: [expect.objectContaining({ reason: expect.stringMatching(/CNPJ valido|fonte societaria/i) })],
    });
    expect(lookupCnpjMock).not.toHaveBeenCalled();
  });

  it('rejeita CNPJ enriquecido quando o QSA oficial nao contem o socio pesquisado', async () => {
    const validCnpj = buildValidCnpj(500);
    const formattedCnpj = formatTestCnpj(validCnpj);
    performWebSearchMock
      .mockResolvedValueOnce('Nenhum resultado encontrado.')
      .mockResolvedValueOnce([
        'Título: Guilherme M. Scheffer - quadro societário',
        'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
        `Resumo: Guilherme M. Scheffer aparece perto da Fazenda Homonima LTDA CNPJ ${formattedCnpj}.`,
        '---',
      ].join('\n'))
      .mockResolvedValue('Nenhum resultado encontrado.');
    lookupCnpjMock.mockResolvedValueOnce({
      cnpj: validCnpj,
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
    const validCnpj = buildValidCnpj(501);
    const formattedCnpj = formatTestCnpj(validCnpj);
    performWebSearchMock
      .mockResolvedValueOnce('Nenhum resultado encontrado.')
      .mockResolvedValueOnce([
        'Título: João Silva - quadro societário',
        'URL: https://consultasocio.com/q/sa/joao-silva',
        `Resumo: João Silva aparece no quadro societário da Agro Silva LTDA CNPJ ${formattedCnpj}.`,
        '---',
      ].join('\n'))
      .mockResolvedValue('Nenhum resultado encontrado.');
    lookupCnpjMock.mockResolvedValueOnce({
      cnpj: validCnpj,
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
          expect.stringContaining('socio'),
          expect.stringContaining('cnpj'),
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
    expect(upsertBody.id).toContain('socio-search:v6-pending-cnpj-diagnostics::04733767000180::guilherme m scheffer');
    expect(upsertBody.operator_id).toBe('server:socio-search');
    expect(new Date(upsertBody.expires_at).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it('roda todas as queries, abre paginas candidatas e enriquece CNPJ brasileiro via lookup oficial', async () => {
    const validCnpj = buildValidCnpj(200);
    const formattedCnpj = formatTestCnpj(validCnpj);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => `<html><body>Guilherme M. Scheffer aparece com Scheffer & Cia Ltda na Agropecuaria Scheffer CNPJ ${formattedCnpj}.</body></html>`,
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
      cnpj: validCnpj,
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
    expect(lookupCnpjMock).toHaveBeenCalledWith(validCnpj, expect.objectContaining({
      maxSources: 1,
      timeoutMs: expect.any(Number),
    }));
    expect(response.payload).toMatchObject({
      companies: [
        expect.objectContaining({
          name: 'Agropecuaria Scheffer Ltda',
          cnpj: validCnpj,
          role: 'Cultivo de soja',
          confidence: 'strong',
          evidenceType: 'qsa',
          sourceDepth: 'cnpj_lookup',
        }),
      ],
      diagnostics: expect.objectContaining({
        queriesRun: expect.arrayContaining([
          expect.stringContaining('consultasocio.com'),
          expect.stringContaining('socio'),
          expect.stringContaining('cnpj'),
        ]),
        pagesFetched: expect.any(Number),
        rejectedCount: expect.any(Number),
      }),
    });
  });

  it('limita enriquecimentos globais para preservar budget da serverless', async () => {
    const blocks = Array.from({ length: 12 }, (_, index) => {
      const cnpj = formatTestCnpj(buildValidCnpj(index + 300));
      const suffix = String(index + 1).padStart(3, '0');
      return [
        `Título: Fazenda ${suffix} de Guilherme M. Scheffer`,
        'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
        `Resumo: Guilherme M. Scheffer consta como sócio administrador da Fazenda ${suffix} CNPJ ${cnpj}.`,
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
    expect(performWebSearchMock).toHaveBeenCalledTimes(6);
    expect(response.payload).toMatchObject({
      companies: expect.arrayContaining([
        expect.objectContaining({
          relationshipScope: 'partner_other_cnpj',
        }),
      ]),
      diagnostics: expect.objectContaining({
        cnpjsEnriched: 5,
        totalCnpjsFound: 12,
      }),
    });
  });

  it('limita tentativas globais mesmo quando lookup oficial falha', async () => {
    const blocks = Array.from({ length: 12 }, (_, index) => {
      const cnpj = formatTestCnpj(buildValidCnpj(index + 400));
      const suffix = String(index + 1).padStart(3, '0');
      return [
        `Título: Fazenda ${suffix} de Guilherme M. Scheffer`,
        'URL: https://consultasocio.com/q/sa/guilherme-m-scheffer',
        `Resumo: Guilherme M. Scheffer consta como sócio administrador da Fazenda ${suffix} CNPJ ${cnpj}.`,
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
    expect(performWebSearchMock).toHaveBeenCalledTimes(6);
    expect(response.payload).toMatchObject({
      companies: expect.arrayContaining([
        expect.objectContaining({
          relationshipScope: 'unconfirmed',
          validationStatus: 'pending',
          confidence: 'weak',
        }),
      ]),
      diagnostics: expect.objectContaining({
        totalCnpjsFound: 12,
      }),
    });
  });
});
