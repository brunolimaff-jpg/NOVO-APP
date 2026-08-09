/**
 * BRU-33 — Testes obrigatórios do resolver canônico (HOLD do Planejador).
 *
 * - filial NUNCA é promovida a matriz por heurística (caso Scheffer);
 * - rootCnpj correto; headOffice preservado; directPjPartners preservados
 *   (CNPJ completo de 14 dígitos); qsaPeople sem CPF;
 * - regressão Scheffer: 04.733.767/0001-80 = Filial + headOffice
 *   04.733.767/0014-03 + SCHEFFER PARTICIPACOES S/A (PJ).
 * Todos com fetch mockado — REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCanonicalFromBrasilApi,
  resolveCanonicalAccount,
  type BrasilApiCadastro,
} from '../../../../services/llm/gold/canonical/canonical-resolver';

const after = afterEach;

function makeCad(overrides: Partial<BrasilApiCadastro> = {}): BrasilApiCadastro {
  return {
    cnpj: '04.733.767/0001-80',
    razao_social: 'SCHEFFER & CIA LTDA',
    identificador_matriz_filial: 2,
    qsa: [
      { nome_socio: 'SCHEFFER PARTICIPACOES S/A', qualificacao_socio: 'Sócio', cnpj_cpf_do_socio: '11.021.773/0001-70' },
      { nome_socio: 'ELIZEU ZULMAR MAGGI SCHEFFER', qualificacao_socio: 'Sócio-Administrador', cnpj_cpf_do_socio: '***.123.456-**' },
    ],
    ...overrides,
  };
}

const SCHEFFER_MATRIZ: BrasilApiCadastro = {
  cnpj: '04.733.767/0014-03',
  razao_social: 'SCHEFFER & CIA LTDA',
  identificador_matriz_filial: 1,
  qsa: [],
};

function mockFetchCnpjData(cadByCnpj: Record<string, BrasilApiCadastro>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const cnpj = url.match(/\/cnpj\/v1\/(\d{14})/)?.[1] ?? url.match(/\/cnpj\/(\d{14})/)?.[1] ?? '';
      const cad = cadByCnpj[cnpj];
      if (!cad) return { ok: false, status: 404 };
      return { ok: true, status: 200, json: async () => cad };
    }),
  );
}

after(() => {
  vi.unstubAllGlobals();
});

describe('buildCanonicalFromBrasilApi — determinístico', () => {
  it('filial NÃO é promovida a matriz por heurística (0001 != Matriz — caso Scheffer)', () => {
    const canonical = buildCanonicalFromBrasilApi(makeCad(), 'SCHEFFER & CIA LTDA');
    expect(canonical.establishmentType).toBe('Filial');
    expect(canonical.rootCnpj).toBe('04733767');
  });

  it('matriz real é preservada como Matriz', () => {
    const canonical = buildCanonicalFromBrasilApi(makeCad({ identificador_matriz_filial: 1 }), 'X LTDA');
    expect(canonical.establishmentType).toBe('Matriz');
  });

  it('rootCnpj = 8 primeiros dígitos do CNPJ', () => {
    const canonical = buildCanonicalFromBrasilApi(makeCad(), 'X LTDA');
    expect(canonical.rootCnpj).toBe('04733767');
  });

  it('directPjPartners preserva CNPJ completo de 14 dígitos', () => {
    const canonical = buildCanonicalFromBrasilApi(makeCad(), 'X LTDA');
    expect(canonical.directPjPartners).toEqual([
      { legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' },
    ]);
  });

  it('qsaPeople contém pessoas físicas SEM CPF (mapa de acesso)', () => {
    const canonical = buildCanonicalFromBrasilApi(makeCad(), 'X LTDA');
    expect(canonical.qsaPeople).toEqual([
      { name: 'ELIZEU ZULMAR MAGGI SCHEFFER', role: 'Sócio-Administrador' },
    ]);
    expect(JSON.stringify(canonical.qsaPeople)).not.toContain('123');
  });

  it('legalName usa razao_social; fallback para companyName quando ausente', () => {
    const withRazao = buildCanonicalFromBrasilApi(makeCad(), 'FALLBACK');
    expect(withRazao.legalName).toBe('SCHEFFER & CIA LTDA');
    const semRazao = buildCanonicalFromBrasilApi(makeCad({ razao_social: undefined }), 'FALLBACK LTDA');
    expect(semRazao.legalName).toBe('FALLBACK LTDA');
  });
});

describe('resolveCanonicalAccount — head office (fetch mockado)', () => {
  it('Filial sem dado de matriz na fonte → headOffice null (sem heurística de sufixo)', async () => {
    mockFetchCnpjData({
      '04733767000180': makeCad(),
    });
    const canonical = await resolveCanonicalAccount('04.733.767/0001-80', 'SCHEFFER & CIA LTDA');
    expect(canonical).not.toBeNull();
    expect(canonical!.establishmentType).toBe('Filial');
    expect(canonical!.headOfficeCnpj).toBeNull();
    expect(canonical!.headOfficeLegalName).toBeNull();
  });

  it('headOffice PRESERVADO quando a fonte fornece o CNPJ da matriz', async () => {
    mockFetchCnpjData({
      '04733767000180': makeCad({ headOfficeCnpj: '04.733.767/0014-03' }),
    });
    const canonical = await resolveCanonicalAccount('04.733.767/0001-80', 'SCHEFFER & CIA LTDA');
    expect(canonical!.headOfficeCnpj).toBe('04.733.767/0014-03');
    expect(canonical!.establishmentType).toBe('Filial');
  });

  it('regressão Scheffer: filial NÃO promovida + directPjPartners preservados', async () => {
    mockFetchCnpjData({
      '04733767000180': makeCad(),
    });
    const canonical = await resolveCanonicalAccount('04.733.767/0001-80', 'SCHEFFER & CIA LTDA');
    expect(canonical).not.toBeNull();
    expect(canonical!.establishmentType).toBe('Filial');
    expect(canonical!.rootCnpj).toBe('04733767');
    expect(canonical!.directPjPartners).toEqual([
      { legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' },
    ]);
    // CPF mascarado nunca vaza
    expect(JSON.stringify(canonical!.qsaPeople)).not.toContain('123');
  });

  it('matriz fica com headOffice null', async () => {
    mockFetchCnpjData({
      '04733767001403': SCHEFFER_MATRIZ,
    });
    const canonical = await resolveCanonicalAccount('04.733.767/0014-03', 'SCHEFFER & CIA LTDA');
    expect(canonical!.establishmentType).toBe('Matriz');
    expect(canonical!.headOfficeCnpj).toBeNull();
  });

  it('CNPJ não resolvível → null (fail-closed, não lança)', async () => {
    mockFetchCnpjData({});
    const canonical = await resolveCanonicalAccount('99.999.999/0001-99', 'X LTDA');
    expect(canonical).toBeNull();
  });
});
