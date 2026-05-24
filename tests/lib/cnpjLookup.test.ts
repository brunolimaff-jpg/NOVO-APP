import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupCnpj } from '../../lib/cnpjLookup';

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('cnpjLookup qsa mapping', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes BrasilAPI qsa partners from primary source', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        razao_social: 'Empresa Exemplo LTDA',
        municipio: 'Cuiabá',
        uf: 'mt',
        cnae_fiscal: 1234567,
        cnae_fiscal_descricao: 'Cultivo de soja',
        qsa: [
          {
            nome_socio: 'Maria Exemplo',
            qualificacao_socio: 'Sócia-Administradora',
            documento_socio: '***.123.456-**',
          },
        ],
      }));

    const result = await lookupCnpj('11.111.111/0001-11');

    expect(result.qsa).toEqual([
      {
        name: 'Maria Exemplo',
        role: 'Sócia-Administradora',
        document: '***.123.456-**',
        source: 'BrasilAPI',
        confidence: 'official',
      },
    ]);
  });

  it('maps CNPJ.ws socios when BrasilAPI fails first', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({
      razao_social: 'Empresa CNPJ WS',
      estabelecimento: {
        cidade: { nome: 'Sorriso' },
        estado: { sigla: 'MT' },
      },
      socios: [
        {
          nome: 'João Exemplo',
          qualificacao_socio: { descricao: 'Administrador' },
          cpf_cnpj_socio: '***.987.654-**',
        },
      ],
    }));

    const result = await lookupCnpj('22.222.222/0001-22');

    expect(result.qsa).toEqual([
      {
        name: 'João Exemplo',
        role: 'Administrador',
        document: '***.987.654-**',
        source: 'CNPJ.ws',
        confidence: 'official',
      },
    ]);
  });
});
