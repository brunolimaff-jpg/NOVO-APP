import { describe, it, expect } from 'vitest';
import { sanitizeFindingPack } from '../../../services/llm/gold/finding-sanitizer';
import type { CanonicalAccount, RawFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * RCA-04 (despacho do Planejador, 2026-08-14) — SANITIZER COVERAGE PARITY.
 * F1: paridade de tema sensível — "colombiana/colombiano" (derivados de
 * Colômbia) não podem escapar do sanitizer enquanto o verifier os acusa.
 * F2: technologySignals[*].observedFact é superfície assertiva e precisa da
 * MESMA neutralização de certeza/tema sensível das claims.
 * Contrato: perguntas de discovery e validationQuestion/whatIsNotKnown NÃO
 * são tocados; texto sem tema sensível permanece inalterado.
 */
const canonical: CanonicalAccount = {
  inputCnpj: '04733767000180',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04733767',
  headOfficeCnpj: null,
  headOfficeLegalName: null,
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [],
};

function rawPack(overrides: Partial<RawFindingPack>): RawFindingPack {
  return {
    module: 'gold-compact',
    accountIdentity: {
      inputCnpj: '04733767000180',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04733767',
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
    ...overrides,
  };
}

describe('RCA-04 — paridade de cobertura do sanitizer', () => {
  it('RED F1: claim com "colombiana" + "perímetro confirmado" (A validar) é reescrito pelo sanitizer', () => {
    const raw = rawPack({
      facts: [
        {
          id: 'f1',
          entity: 'SCHEFFER & CIA LTDA',
          claim: 'Operação colombiana fora do perímetro confirmado do ERP Senior',
          status: 'A validar',
          source: 'Análise de módulos Senior',
          kind: 'technology',
        },
      ],
    });
    const result = sanitizeFindingPack(raw, canonical);
    const fact = result.facts.find((f) => f.id === 'f1');
    expect(fact?.claim).not.toContain('confirmado');
    expect(result.sanitizerEvents.some((e) => e.code === 'CLAIM_LEXICAL_PROMOTION' && e.findingId === 'f1')).toBe(true);
  });

  it('RED F2: technologySignals[*].observedFact com "Colômbia confirmada" é neutralizado pelo sanitizer', () => {
    const raw = rawPack({
      technologySignals: [
        {
          technology: 'ERP internacional',
          observedFact: 'Operação na Colômbia confirmada, mas CRM Senior não lista módulos com escopo internacional',
          status: 'Pista forte',
          whatIsNotKnown: 'Não se sabe se há módulos com escopo internacional',
          validationQuestion: 'A operação na Colômbia roda em qual sistema hoje? Está integrada ao ERP Senior?',
        },
      ],
    });
    const result = sanitizeFindingPack(raw, canonical);
    const signal = result.technologySignals[0];
    expect(signal.observedFact).not.toContain('confirmada');
    expect(result.sanitizerEvents.some((e) => e.code === 'CLAIM_LEXICAL_PROMOTION')).toBe(true);
  });

  it('contrato: pergunta de discovery real da Colômbia NÃO é tocada', () => {
    const pergunta = 'A operação na Colômbia roda em qual sistema e como é integrada?';
    const raw = rawPack({ openQuestions: [pergunta] });
    const result = sanitizeFindingPack(raw, canonical);
    expect(result.openQuestions).toContain(pergunta);
    expect(result.openQuestions[0]).toBe(pergunta);
  });

  it('contrato: validationQuestion e whatIsNotKnown do sinal NÃO são tocados', () => {
    const vq = 'A operação na Colômbia roda em qual sistema hoje? Está integrada ao ERP Senior?';
    const wik = 'Não se sabe se há módulos com escopo internacional';
    const raw = rawPack({
      technologySignals: [
        { technology: 'X', observedFact: 'Fato neutro sobre integração.', status: 'Confirmado', whatIsNotKnown: wik, validationQuestion: vq },
      ],
    });
    const result = sanitizeFindingPack(raw, canonical);
    expect(result.technologySignals[0].validationQuestion).toBe(vq);
    expect(result.technologySignals[0].whatIsNotKnown).toBe(wik);
  });

  it('contrato: texto sem tema sensível permanece inalterado', () => {
    const claim = 'Cultivo próprio de soja na unidade de Sapezal.';
    const raw = rawPack({
      facts: [{ id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim, status: 'Confirmado', source: 'Site institucional', kind: 'operation' }],
    });
    const result = sanitizeFindingPack(raw, canonical);
    expect(result.facts[0].claim).toBe(claim);
    expect(result.sanitizerEvents).toHaveLength(0);
  });

  it('não-regressão: fact Pista forte com "Colômbia confirmada" já era reescrito (RCA-03 herdado)', () => {
    const raw = rawPack({
      facts: [
        {
          id: 'f3',
          entity: 'SCHEFFER & CIA LTDA',
          claim: 'Operação na Colômbia confirmada, mas CRM Senior não lista módulos com escopo internacional',
          status: 'Pista forte',
          source: 'Análise de módulos Senior',
          kind: 'technology',
        },
      ],
    });
    const result = sanitizeFindingPack(raw, canonical);
    expect(result.facts[0].claim).not.toContain('confirmada');
  });
});
