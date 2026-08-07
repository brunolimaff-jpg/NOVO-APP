import { describe, expect, it } from 'vitest';
import type { CanonicalAccount, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';

/**
 * T4 — Entity/Semantic Gold Verifier (TDD).
 * Barreira final sobre o Gold Brief: extração estruturada de entidades
 * (CNPJ normalizado), nunca regex de proximidade. NÃO reexecuta o sanitizer.
 */

const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [{ name: 'ELIZEU ZULMAR MAGGI SCHEFFER', role: 'Sócio-Administrador' }],
};

function safePack(): SafeFindingPack {
  return {
    module: 'gold-compact',
    accountIdentity: {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      conflicts: [],
    },
    facts: [],
    relationships: [
      {
        id: 'r1',
        entity: 'SCHEFFER & CIA LTDA',
        relatedEntity: 'EMPRESA LATERAL LTDA',
        relationType: 'partner_other_cnpj',
        status: 'Pista inicial',
        source: 'socio-search',
      },
    ],
    technologySignals: [],
    people: [
      {
        id: 'p1',
        personName: 'ELIZEU ZULMAR MAGGI SCHEFFER',
        role: 'Sócio (QSA)',
        roleBasis: 'qsa',
        status: 'Confirmado',
        source: 'QSA oficial',
      },
    ],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    discardedClaims: [],
    sanitized: true,
    sanitizerEvents: [],
    originalPack: undefined as never,
  };
}

describe('EntityAwareGoldVerifier', () => {
  it('reprova /0001-80 classificado como Matriz (tipo cadastral invertido)', () => {
    const gold = [
      '# Gold Brief',
      'SCHEFFER & CIA LTDA (CNPJ 04.733.767/0001-80) é a matriz do grupo.',
      'A matriz está em Cuiabá e a operação em Sapezal.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'WRONG_ESTABLISHMENT_TYPE')).toBe(true);
  });

  it('reprova /0014-03 classificado como Filial (matriz/filial invertida)', () => {
    const gold = [
      '# Gold Brief',
      'A filial 04.733.767/0014-03 concentra a sede administrativa.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'WRONG_ESTABLISHMENT_TYPE')).toBe(true);
  });

  it('não gera falso positivo quando /0001-80 e /0014-03 coexistem com tipos corretos', () => {
    const gold = [
      '# Gold Brief',
      'SCHEFFER & CIA LTDA (04.733.767/0001-80) é filial em Sapezal; a matriz é a inscrição 04.733.767/0014-03 em Cuiabá.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.filter((h) => h.code === 'WRONG_ESTABLISHMENT_TYPE')).toHaveLength(0);
  });

  it('reprova CNPJ inventado', () => {
    const gold = [
      '# Gold Brief',
      'A controlada 99.999.999/0001-00 atua no segmento de fertilizantes.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'INVENTED_CNPJ')).toBe(true);
  });

  it('reprova lateral promovida a grupo no Gold', () => {
    const gold = [
      '# Gold Brief',
      'EMPRESA LATERAL LTDA integra o grupo econômico Scheffer.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'LATERAL_PROMOTED')).toBe(true);
  });

  it('reprova ausência convertida em gap no Gold final', () => {
    const gold = [
      '# Gold Brief',
      'Há um gap de WMS confirmado na operação logística da conta.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'NEGATIVE_EVIDENCE_AS_GAP')).toBe(true);
  });

  it('reprova ausência convertida em tecnologia inexistente no Gold final', () => {
    const gold = [
      '# Gold Brief',
      'A empresa não possui WMS e não possui TMS na operação.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'NEGATIVE_EVIDENCE_AS_ABSENCE')).toBe(true);
  });

  it('reprova QSA convertido em decisor funcional no Gold final', () => {
    const gold = [
      '# Gold Brief',
      'O CFO do grupo é ELIZEU ZULMAR MAGGI SCHEFFER.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'QSA_AS_DECISOR')).toBe(true);
  });

  it('reprova produto/capacidade não sustentada no Gold final', () => {
    const gold = [
      '# Gold Brief',
      'A conta tem capacidade estática de 1 milhão de toneladas por ano.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('reprova relação societária direta invertida (conta participa da holding)', () => {
    const gold = ['# Gold Brief', 'SCHEFFER & CIA LTDA participa do capital de SCHEFFER PARTICIPACOES S/A.'].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'RELATIONSHIP_INVERTED')).toBe(true);
  });

  it('aceita relação direta na direção correta (holding participa da conta)', () => {
    const gold = ['# Gold Brief', 'SCHEFFER PARTICIPACOES S/A participa do capital de SCHEFFER & CIA LTDA.'].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.filter((h) => h.code === 'RELATIONSHIP_INVERTED')).toHaveLength(0);
  });

  it('passa Gold limpo (caso feliz Scheffer)', () => {
    const gold = [
      '# Gold Brief',
      'SCHEFFER & CIA LTDA (04.733.767/0001-80) é filial em Sapezal/MT; a matriz é 04.733.767/0014-03 em Cuiabá.',
      'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A (11.021.773/0001-70).',
      'A tecnologia que suporta a logística não foi identificada no recorte.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(true);
    expect(result.hardFails).toHaveLength(0);
  });
});
