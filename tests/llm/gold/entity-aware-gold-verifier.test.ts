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

describe('EntityAwareGoldVerifier — proveniência real (micro-rodada V5)', () => {
  it('reprova capacidade com autodeclaração textual de fonte SEM fato no pack (bypass bloqueado)', () => {
    const gold = ['# Gold Brief', 'Capacidade de 120 mil sacas, confirmada em laudo oficial.'].join('\n');
    // safePack SEM fato de capacidade (o modelo inventou a evidência no texto)
    const result = verifyGold(gold, canonical, safePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('aceita capacidade quando reconciliada com fato Confirmado + fonte aceitável no pack', () => {
    const pack = safePack();
    pack.facts.push({
      id: 'f-silos',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'Capacidade de armazenagem de 120 mil sacas confirmada em laudo',
      status: 'Confirmado',
      source: 'Laudo técnico',
      kind: 'operation',
    });
    const gold = ['# Gold Brief', 'Capacidade de armazenagem de 120 mil sacas confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.filter((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toHaveLength(0);
  });

  it('reprova capacidade com fato do pack em status não confirmado', () => {
    const pack = safePack();
    pack.facts.push({
      id: 'f-cap',
      entity: 'METALURGICA FERRO FORTE S/A',
      claim: 'Capacidade produtiva de 500 toneladas mensais',
      status: 'Pista inicial',
      source: 'Estimativa de mercado',
      kind: 'metric',
    });
    const gold = ['# Gold Brief', 'Capacidade produtiva de 500 toneladas mensais.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });
});

describe('EntityAwareGoldVerifier — evidência não emprestada (gate adversarial final)', () => {
  it('reprova valor divergente: Safe 120 mil sacas vs Gold 900 mil sacas', () => {
    const pack = safePack();
    pack.facts.push({
      id: 'f-silos',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'Capacidade de armazenagem de 120 mil sacas confirmada em laudo',
      status: 'Confirmado',
      source: 'Laudo técnico',
      kind: 'operation',
    });
    const gold = ['# Gold Brief', 'Capacidade de armazenagem de 900 mil sacas confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('reprova entidade divergente: evidência da entidade B atribuída à conta A', () => {
    const pack = safePack();
    pack.facts.push({
      id: 'f-cap-b',
      entity: 'EMPRESA LATERAL LTDA',
      claim: 'Capacidade de armazenagem de 120 mil sacas confirmada em laudo',
      status: 'Confirmado',
      source: 'Laudo técnico',
      kind: 'operation',
    });
    // Gold afirma capacidade para a CONTA (sem mencionar a lateral)
    const gold = ['# Gold Brief', 'A conta tem capacidade de armazenagem de 120 mil sacas.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('aceita claim compatível real: mesma entidade + valor igual + Confirmado + fonte aceitável', () => {
    const pack = safePack();
    pack.facts.push({
      id: 'f-silos',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'Capacidade de armazenagem de 120 mil sacas confirmada em laudo',
      status: 'Confirmado',
      source: 'Laudo técnico',
      kind: 'operation',
    });
    const gold = ['# Gold Brief', 'Capacidade de armazenagem de 120 mil sacas confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.filter((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toHaveLength(0);
  });
});

describe('EntityAwareGoldVerifier — comparador de valor numérico (defeito da re-auditoria final)', () => {
  it('reprova 1,2 milhões vs 12 milhões (vírgula decimal não pode sumir)', () => {
    const pack = safePack();
    pack.facts.push({
      id: 'f-cap',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'Capacidade de 1,2 milhões de sacas confirmada em laudo',
      status: 'Confirmado',
      source: 'Laudo técnico',
      kind: 'operation',
    });
    const gold = ['# Gold Brief', 'Capacidade de 12 milhões de sacas confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('reprova 120 mil sacas vs 120 mil funcionários (unidade composta preservada)', () => {
    const pack = safePack();
    pack.facts.push({
      id: 'f-cap',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'Capacidade de 120 mil sacas confirmada em laudo',
      status: 'Confirmado',
      source: 'Laudo técnico',
      kind: 'operation',
    });
    const gold = ['# Gold Brief', 'Capacidade de 120 mil funcionários confirmada em registro.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('aceita 120 mil sacas vs 120 mil sacas (igualdade real preservada)', () => {
    const pack = safePack();
    pack.facts.push({
      id: 'f-cap',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'Capacidade de 120 mil sacas confirmada em laudo',
      status: 'Confirmado',
      source: 'Laudo técnico',
      kind: 'operation',
    });
    const gold = ['# Gold Brief', 'Capacidade de 120 mil sacas confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.filter((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toHaveLength(0);
  });
});

describe('EntityAwareGoldVerifier — parser de medida (bloqueador da auditoria da publicação)', () => {
  const packWithCap = (claim: string) => {
    const pack = safePack();
    pack.facts.push({
      id: 'f-cap',
      entity: 'SCHEFFER & CIA LTDA',
      claim,
      status: 'Confirmado',
      source: 'Laudo técnico',
      kind: 'operation',
    });
    return pack;
  };

  it('REPROVA: Safe ROI de 10% vs Gold ROI de 90% (percentual colado)', () => {
    const pack = packWithCap('ROI de 10% confirmado em laudo');
    const gold = ['# Gold Brief', 'ROI de 90% confirmado em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('REPROVA: Safe 1,2 milhões de sacas vs Gold 1,2 milhões de funcionários (unidade após escala)', () => {
    const pack = packWithCap('Capacidade de 1,2 milhões de sacas confirmada em laudo');
    const gold = ['# Gold Brief', 'Capacidade de 1,2 milhões de funcionários confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('PASSA: Safe 1,2 milhões de sacas vs Gold igual', () => {
    const pack = packWithCap('Capacidade de 1,2 milhões de sacas confirmada em laudo');
    const gold = ['# Gold Brief', 'Capacidade de 1,2 milhões de sacas confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.filter((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toHaveLength(0);
  });

  it('REPROVA: Safe 500t vs Gold 600t (unidade compacta colada)', () => {
    const pack = packWithCap('Capacidade de 500t confirmada em laudo');
    const gold = ['# Gold Brief', 'Capacidade de 600t confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });
});

describe('EntityAwareGoldVerifier — medida ancorada na categoria (correção final da auditoria)', () => {
  const packWithCap = (claim: string) => {
    const pack = safePack();
    pack.facts.push({
      id: 'f-cap',
      entity: 'SCHEFFER & CIA LTDA',
      claim,
      status: 'Confirmado',
      source: 'Laudo técnico',
      kind: 'operation',
    });
    return pack;
  };

  it('REPROVA: número anterior ao claim não vira medida (unidade 2, capacidade 120 vs 900 mil sacas)', () => {
    const pack = packWithCap('A unidade 2 possui capacidade de 120 mil sacas confirmada em laudo');
    const gold = ['# Gold Brief', 'A unidade 2 possui capacidade de 900 mil sacas confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('PASSA: número anterior ao claim com medida igual (unidade 2, capacidade 120 mil sacas)', () => {
    const pack = packWithCap('A unidade 2 possui capacidade de 120 mil sacas confirmada em laudo');
    const gold = ['# Gold Brief', 'A unidade 2 possui capacidade de 120 mil sacas confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.filter((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toHaveLength(0);
  });

  it('REPROVA: modificador material preservado (1,2 milhões de sacas por ano vs por mês)', () => {
    const pack = packWithCap('Capacidade de 1,2 milhões de sacas por ano confirmada em laudo');
    const gold = ['# Gold Brief', 'Capacidade de 1,2 milhões de sacas por mês confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('REPROVA: CNPJ anterior ao claim não vira medida (CNPJ .../0014-03, capacidade 120 vs 900 mil sacas)', () => {
    const pack = packWithCap('CNPJ 04.733.767/0014-03 possui capacidade de 120 mil sacas confirmada em laudo');
    const gold = ['# Gold Brief', 'CNPJ 04.733.767/0014-03 possui capacidade de 900 mil sacas confirmada em laudo.'].join('\n');
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  // ── Política do Planejador (2026-08-08): falso positivo de "capacidade" ──
  it('ACEITA: "capacidade de investimento" (uso financeiro, não produtivo)', () => {
    const gold = [
      '# Gold Brief',
      'A conta demonstra capacidade de investimento em novas plantas industriais.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(false);
  });

  it('ACEITA: "capacidade de absorção de ciclos econômicos" (gerencial)', () => {
    const gold = [
      '# Gold Brief',
      'A empresa tem capacidade de absorção de ciclos econômicos adversos.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(false);
  });

  it('ACEITA: "capacidade de atender múltiplas necessidades" (gerencial)', () => {
    const gold = [
      '# Gold Brief',
      'A operação tem capacidade de atender múltiplas necessidades dos clientes.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(false);
  });

  it('REPROVA: "capacidade produtiva de 500 toneladas/mês" sem fato no pack', () => {
    const gold = [
      '# Gold Brief',
      'A conta possui capacidade produtiva de 500 toneladas por mês.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('REPROVA: "capacidade de armazenagem de 120 mil sacas" sem fato no pack', () => {
    const gold = [
      '# Gold Brief',
      'A conta tem capacidade de armazenagem de 120 mil sacas.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  it('REPROVA: "produção de 900 mil toneladas" sem fato no pack', () => {
    const gold = [
      '# Gold Brief',
      'A produção de 900 mil toneladas por ano sustenta a operação.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(true);
  });

  // ── Política B do Planejador (2026-08-08): NEGATIVE_EVIDENCE_AS_GAP ──
  it('ACEITA: "lacuna de dados financeiros públicos" (lacuna de informação)', () => {
    const gold = [
      '# Gold Brief',
      'Há lacuna de dados financeiros públicos para validar o faturamento.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'NEGATIVE_EVIDENCE_AS_GAP')).toBe(false);
  });

  it('ACEITA: "lacuna de informação" (lacuna de informação)', () => {
    const gold = [
      '# Gold Brief',
      'Existe lacuna de informação sobre a estrutura societária completa.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'NEGATIVE_EVIDENCE_AS_GAP')).toBe(false);
  });

  it('REPROVA: "lacuna operacional de TMS" (gap operacional)', () => {
    const gold = [
      '# Gold Brief',
      'A empresa apresenta lacuna operacional de TMS na distribuição.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'NEGATIVE_EVIDENCE_AS_GAP')).toBe(true);
  });

  it('REPROVA: "gap de ERP identificado" (gap tecnológico)', () => {
    const gold = [
      '# Gold Brief',
      'Foi identificado um gap de ERP na gestão da operação.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'NEGATIVE_EVIDENCE_AS_GAP')).toBe(true);
  });

  // ── QSA legalRole (decisão congelada do Planejador 2026-08-08) ──
  it('PASS: QSA Presidente → "consta no QSA como Presidente" (qualificação literal)', () => {
    const gold = [
      '# Gold Brief',
      'CAROLINA MOGNON SCHEFFER consta no QSA como Presidente da empresa.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'QSA_AS_DECISOR')).toBe(false);
  });

  it('PASS: QSA Diretor → "consta no QSA como Diretor" (qualificação literal)', () => {
    const gold = [
      '# Gold Brief',
      'ELIZEU ZULMAR MAGGI SCHEFFER consta no QSA como Diretor.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'QSA_AS_DECISOR')).toBe(false);
  });

  it('FAIL: QSA Presidente → "é CFO" (papel funcional inferido)', () => {
    const gold = [
      '# Gold Brief',
      'ELIZEU ZULMAR MAGGI SCHEFFER é CFO da organização.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'QSA_AS_DECISOR')).toBe(true);
  });

  it('FAIL: QSA Presidente → "é decisor" (papel funcional inferido)', () => {
    const gold = [
      '# Gold Brief',
      'ELIZEU ZULMAR MAGGI SCHEFFER é decisor nas compras de tecnologia.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'QSA_AS_DECISOR')).toBe(true);
  });

  it('FAIL: QSA Diretor → "é Diretor Comercial" (papel funcional específico)', () => {
    const gold = [
      '# Gold Brief',
      'ELIZEU ZULMAR MAGGI SCHEFFER é Diretor Comercial da empresa.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'QSA_AS_DECISOR')).toBe(true);
  });

  it('FAIL: QSA Sócio-Administrador → "é Diretor de Operações" (papel funcional)', () => {
    const gold = [
      '# Gold Brief',
      'ELIZEU ZULMAR MAGGI SCHEFFER é Diretor de Operações.',
    ].join('\n');
    const result = verifyGold(gold, canonical, safePack());
    expect(result.hardFails.some((h) => h.code === 'QSA_AS_DECISOR')).toBe(true);
  });
});
