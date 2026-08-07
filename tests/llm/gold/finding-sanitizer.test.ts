import { describe, expect, it } from 'vitest';
import type { CanonicalAccount, RawFindingPack } from '../../../services/llm/gold/gold-contracts';
import { sanitizeFindingPack } from '../../../services/llm/gold/finding-sanitizer';

/**
 * T3 — FindingSanitizer (TDD).
 * Uma passagem determinística RawFindingPack → SafeFindingPack + sanitizerEvents.
 * Regras SEMÂNTICAS (estrutura de claim/status/fonte/relação), não blocklist
 * de palavras: Scheffer testa a regra; Scheffer não define a regra.
 */

const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [
    { name: 'CAROLINA MOGNON SCHEFFER', role: 'Sócio' },
    { name: 'ELIZEU ZULMAR MAGGI SCHEFFER', role: 'Sócio-Administrador' },
  ],
};

function basePack(): RawFindingPack {
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
    relationships: [],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    discardedClaims: [],
  };
}

describe('FindingSanitizer', () => {
  it('marca o pack como saneado e registra eventos (contrato SafeFindingPack)', () => {
    const raw = basePack();
    raw.facts.push({
      id: 'f1',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'A empresa não possui WMS',
      status: 'Confirmado',
      source: 'CRM interno Senior',
      kind: 'technology',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    expect(safe.sanitized).toBe(true);
    expect(Array.isArray(safe.sanitizerEvents)).toBe(true);
    expect(safe.originalPack).toBe(raw);
    expect(safe.sanitizerEvents.length).toBeGreaterThan(0);
  });

  it('bloqueia negação de posse sem evidência positiva (ausência → ausência da empresa)', () => {
    const raw = basePack();
    raw.facts.push({
      id: 'f-wms',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'A empresa não possui WMS',
      status: 'Confirmado',
      source: 'CRM interno Senior',
      kind: 'technology',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    const removed = safe.sanitizerEvents.find((e) => e.findingId === 'f-wms');
    expect(removed?.code).toBe('NEGATIVE_EVIDENCE_AS_ABSENCE');
    expect(safe.facts.find((f) => f.id === 'f-wms')).toBeUndefined();
  });

  it('bloqueia ausência convertida em gap', () => {
    const raw = basePack();
    raw.facts.push({
      id: 'f-gap',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'Gap de TMS confirmado na operação logística',
      status: 'Confirmado',
      source: 'CRM interno Senior',
      kind: 'operation',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    const removed = safe.sanitizerEvents.find((e) => e.findingId === 'f-gap');
    expect(removed?.code).toBe('NEGATIVE_EVIDENCE_AS_GAP');
  });

  it('bloqueia processo manual/planilha inferido sem evidência', () => {
    const raw = basePack();
    raw.facts.push({
      id: 'f-manual',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'O processo de romaneio é manual, feito em planilha',
      status: 'Pista forte',
      source: 'Análise de módulos contratados',
      kind: 'operation',
      process: 'manual',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    const removed = safe.sanitizerEvents.find((e) => e.findingId === 'f-manual');
    expect(removed?.code).toBe('MANUAL_PROCESS_INFERRED');
    expect(safe.facts.find((f) => f.id === 'f-manual')).toBeUndefined();
  });

  it('preserva observação factual válida de não-aparecimento (WMS não é regra especial)', () => {
    const raw = basePack();
    raw.facts.push({
      id: 'f-obs',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'WMS Senior não aparece no recorte interno de módulos contratados',
      status: 'Confirmado',
      source: 'CRM interno Senior',
      kind: 'technology',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    expect(safe.facts.find((f) => f.id === 'f-obs')).toBeDefined();
    expect(safe.sanitizerEvents.find((e) => e.findingId === 'f-obs')).toBeUndefined();
  });

  it('impede lateral promovida a grupo suportado', () => {
    const raw = basePack();
    raw.relationships.push({
      id: 'r-lat',
      entity: 'SCHEFFER & CIA LTDA',
      relatedEntity: 'EMPRESA LATERAL LTDA',
      relationType: 'partner_other_cnpj',
      status: 'Confirmado',
      source: 'socio-search',
      evidence: 'Compartilha sócio ELIZEU ZULMAR MAGGI SCHEFFER',
    });
    raw.facts.push({
      id: 'f-grupo',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'EMPRESA LATERAL LTDA integra o grupo econômico Scheffer',
      status: 'Confirmado',
      source: 'socio-search',
      kind: 'relationship',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    const removed = safe.sanitizerEvents.find((e) => e.findingId === 'f-grupo');
    expect(removed?.code).toBe('LATERAL_PROMOTED');
  });

  it('impede QSA convertido em decisor funcional', () => {
    const raw = basePack();
    raw.people.push({
      id: 'p-1',
      personName: 'ELIZEU ZULMAR MAGGI SCHEFFER',
      role: 'CFO do grupo',
      roleBasis: 'qsa',
      status: 'Confirmado',
      source: 'QSA oficial',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    const event = safe.sanitizerEvents.find((e) => e.findingId === 'p-1');
    expect(event?.code).toBe('QSA_AS_DECISOR');
    const kept = safe.people.find((p) => p.id === 'p-1');
    expect(kept?.role).not.toBe('CFO do grupo');
  });

  it('impede módulo contratado virar prova operacional isolada', () => {
    const raw = basePack();
    raw.facts.push({
      id: 'f-mod',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'A empresa usa o módulo GATec para o processo de beneficiamento',
      status: 'Confirmado',
      source: 'CRM interno Senior (módulo contratado)',
      kind: 'technology',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    const removed = safe.sanitizerEvents.find((e) => e.findingId === 'f-mod');
    expect(removed?.code).toBe('MODULE_AS_PROCESS_PROOF');
  });

  it('bloqueia capacidade de produto não sustentada', () => {
    const raw = basePack();
    raw.facts.push({
      id: 'f-cap',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'Capacidade estática de 1 milhão de toneladas por ano',
      status: 'Pista inicial',
      source: 'Estimativa de segmento',
      kind: 'metric',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    const removed = safe.sanitizerEvents.find((e) => e.findingId === 'f-cap');
    expect(removed?.code).toBe('UNSUPPORTED_PRODUCT_CLAIM');
  });

  it('deduplica fato já presente no canonical', () => {
    const raw = basePack();
    raw.facts.push({
      id: 'f-matriz',
      entity: 'SCHEFFER & CIA LTDA',
      claim: 'A matriz é a inscrição 04.733.767/0014-03 em Cuiabá',
      status: 'Confirmado',
      source: 'dossiê legado',
      kind: 'identity',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    const removed = safe.sanitizerEvents.find((e) => e.findingId === 'f-matriz');
    expect(removed?.code).toBe('CANONICAL_DUPLICATE');
  });

  it('remove CPF de payloads e registra CPF_LEAK', () => {
    const raw = basePack();
    raw.facts.push({
      id: 'f-cpf',
      entity: 'ELIZEU ZULMAR MAGGI SCHEFFER',
      claim: 'Sócio com CPF 123.456.789-00 e cargo administrativo',
      status: 'Confirmado',
      source: 'QSA oficial',
      kind: 'person',
    });
    const safe = sanitizeFindingPack(raw, canonical);
    const removed = safe.sanitizerEvents.find((e) => e.findingId === 'f-cpf');
    expect(removed?.code).toBe('CPF_LEAK');
    expect(JSON.stringify(safe)).not.toContain('123456789');
  });

  it('reescreve pergunta que pressupõe conclusão em pergunta neutra', () => {
    const raw = basePack();
    raw.openQuestions.push('Como vocês fazem o romaneio sem TMS?');
    const safe = sanitizeFindingPack(raw, canonical);
    expect(safe.openQuestions.some((q) => q.includes('sem TMS'))).toBe(false);
    expect(safe.openQuestions.some((q) => q.includes('Qual solução suporta hoje o processo de romaneio?'))).toBe(true);
  });

  it('mantém pack rastreável (ids preservados) e removed/kept coerentes', () => {
    const raw = basePack();
    raw.facts.push(
      {
        id: 'f-keep',
        entity: 'SCHEFFER & CIA LTDA',
        claim: '74 módulos Senior ativos no CRM interno',
        status: 'Confirmado',
        source: 'CRM interno Senior',
        kind: 'operation',
      },
      {
        id: 'f-drop',
        entity: 'SCHEFFER & CIA LTDA',
        claim: 'A empresa não possui TMS',
        status: 'Confirmado',
        source: 'CRM interno Senior',
        kind: 'technology',
      },
    );
    const safe = sanitizeFindingPack(raw, canonical);
    expect(safe.facts.map((f) => f.id)).toContain('f-keep');
    expect(safe.facts.map((f) => f.id)).not.toContain('f-drop');
    expect(safe.sanitizerEvents.find((e) => e.findingId === 'f-drop')?.action).toBe('removed');
    expect(safe.discardedClaims.some((d) => d.originFindingId === 'f-drop')).toBe(true);
  });
});
