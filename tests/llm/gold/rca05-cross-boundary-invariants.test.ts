import { describe, it, expect } from 'vitest';
import { sanitizeFindingPack } from '../../../services/llm/gold/finding-sanitizer';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';
import { buildFrontierProbeText } from '../../../services/llm/gold/gold-pipeline';
import { injectCanonicalGoldMermaids } from '../../../services/llm/gold/mermaid/mermaid-deterministic';
import { downgradeUnsupportedCertainty } from '../../../services/llm/gold/gold-pipeline';
import { GOLD_POLICY_CORPUS, neutralizeConfirmedVocabulary, normalizeDiscoveryQuestion } from '../../../services/llm/gold/gold-policy';
import type { CanonicalAccount, RawFindingPack, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * RCA-05 — Fase 4/5: INVARIANTES CROSS-BOUNDARY (I1–I6) + matriz adversarial.
 * Gate preventivo: qualquer drift futuro de política semântica quebra CI.
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

const emptySafe: SafeFindingPack = {
  module: 'gold-compact',
  accountIdentity: { inputCnpj: '04733767000180', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04733767', conflicts: [] },
  facts: [],
  relationships: [],
  technologySignals: [],
  people: [],
  metrics: [],
  conflicts: [],
  openQuestions: [],
  sanitizerEvents: [],
  sanitized: true,
} as unknown as SafeFindingPack;

function rawPack(overrides: Partial<RawFindingPack>): RawFindingPack {
  return {
    module: 'gold-compact',
    accountIdentity: { inputCnpj: '04733767000180', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04733767', conflicts: [] },
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

// ─── I4 (primeiro, pois os demais invariantes usam o verifier) ─────────────

describe('I4 — VERIFIER CONTINUA FAIL-CLOSED (centralização não enfraquece)', () => {
  it('afirmação real proibida continua PROMOTED_CLAIM', () => {
    const r = verifyGold('Operação na Colômbia está confirmada.', canonical, emptySafe);
    expect(r.hardFails.map((h) => h.code)).toContain('PROMOTED_CLAIM');
  });
  it('afirmação de capacidade sem prova continua UNSUPPORTED_PRODUCT_CLAIM', () => {
    const r = verifyGold('Capacidade de armazenagem de 120 mil sacas.', canonical, emptySafe);
    expect(r.hardFails.map((h) => h.code)).toContain('UNSUPPORTED_PRODUCT_CLAIM');
  });
});

// ─── I1 — SANITIZER-OWNED SAFETY ────────────────────────────────────────────

describe('I1 — SANITIZER-OWNED SAFETY (raw → sanitize → pre-compose = 0)', () => {
  const themes = GOLD_POLICY_CORPUS.sensitiveThemes;
  const words = GOLD_POLICY_CORPUS.certaintyWords;

  it('matriz adversarial: tema × certeza em facts (Pista forte) → pre-compose 0 PROMOTED', () => {
    for (const theme of themes) {
      for (const word of words) {
        const claim = `Operação ${theme} ${word} na unidade.`;
        const raw = rawPack({
          facts: [{ id: 'f', entity: 'SCHEFFER & CIA LTDA', claim, status: 'Pista forte', source: 'Site institucional', kind: 'operation' }],
        });
        const sanitized = sanitizeFindingPack(raw, canonical);
        const probe = buildFrontierProbeText(sanitized as never);
        const result = verifyGold(probe, canonical, sanitized as never);
        const promoted = result.hardFails.filter((h) => h.code === 'PROMOTED_CLAIM');
        expect(promoted, `PROMOTED residual em: "${claim}"`).toHaveLength(0);
      }
    }
  });

  it('matriz adversarial: tema × certeza em technologySignals.observedFact → pre-compose 0 PROMOTED', () => {
    for (const theme of themes) {
      const claim = `Operação ${theme} confirmada na unidade.`;
      const raw = rawPack({
        technologySignals: [
          { technology: 'T', observedFact: claim, status: 'Pista forte', whatIsNotKnown: 'não se sabe', validationQuestion: 'Pergunta de validação?' },
        ],
      });
      const sanitized = sanitizeFindingPack(raw, canonical);
      const probe = buildFrontierProbeText(sanitized as never);
      const result = verifyGold(probe, canonical, sanitized as never);
      const promoted = result.hardFails.filter((h) => h.code === 'PROMOTED_CLAIM');
      expect(promoted, `PROMOTED residual em: "${claim}"`).toHaveLength(0);
    }
  });

  it('replay dos incidentes reais (corpus) → sanitize → pre-compose 0 PROMOTED', () => {
    for (const incident of GOLD_POLICY_CORPUS.incidents) {
      const raw = rawPack({
        facts: [
          { id: 'f', entity: 'SCHEFFER & CIA LTDA', claim: incident, status: 'A validar', source: 'Análise de módulos Senior', kind: 'operation' },
        ],
        // perguntas de discovery também atravessam openQuestions (RCA-03)
        openQuestions: incident.includes('?') ? [incident] : [],
      });
      const sanitized = sanitizeFindingPack(raw, canonical);
      const probe = buildFrontierProbeText(sanitized as never);
      const result = verifyGold(probe, canonical, sanitized as never);
      expect(result.hardFails.filter((h) => h.code === 'PROMOTED_CLAIM'), `incidente: "${incident}"`).toHaveLength(0);
    }
  });
});

// ─── I2 — TRANSFORMAÇÕES DETERMINÍSTICAS NÃO CRIAM NOVO HARD FAIL ──────────

describe('I2 — MONOTONICIDADE DETERMINÍSTICA (mermaid não cria hard fail)', () => {
  it('injectCanonicalGoldMermaids não introduz PROMOTED/UNSUPPORTED em Gold neutro', () => {
    const safePack = {
      module: 'gold-compact',
      accountIdentity: { inputCnpj: '04733767000180', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04733767', conflicts: [] },
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Cultivo próprio de soja.', status: 'Confirmado', source: 'Site institucional', kind: 'operation' },
      ],
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: [],
      openQuestions: ['A operação na Colômbia roda em qual sistema e como é integrada?'],
      sanitizerEvents: [],
      sanitized: true,
    } as unknown as SafeFindingPack;

    const gold = '### 1. SÍNTESE EXECUTIVA\nOperação agrícola consolidada.\n\n### 2. PERFIL\n### 3. ESTRUTURA SOCIETÁRIA\n### 9. PRÓXIMOS PASSOS\n';
    const before = verifyGold(gold, canonical, safePack);
    const injected = injectCanonicalGoldMermaids(gold, canonical, safePack, 'industrial_geral');
    const after = verifyGold(injected, canonical, safePack);
    expect(after.hardFails.filter((h) => !before.hardFails.some((b) => b.code === h.code && b.reason === h.reason))).toHaveLength(0);
  });
});

// ─── I3 — CERTAINTY GUARD MONOTÔNICO ───────────────────────────────────────

describe('I3 — CERTAINTY GUARD MONOTÔNICO (downgrade não aumenta hard fails)', () => {
  it('downgradeUnsupportedCertainty preserva ou reduz hard fails', () => {
    const gold = '### 1. SÍNTESE EXECUTIVA\nOperação internacional confirmada em Cumaribo.\nCapacidade de armazenagem de 120 mil sacas.\n';
    const before = verifyGold(gold, canonical, emptySafe);
    const downgraded = downgradeUnsupportedCertainty(gold);
    const after = verifyGold(downgraded, canonical, emptySafe);
    expect(after.hardFails.length).toBeLessThanOrEqual(before.hardFails.length);
  });
});

// ─── I5 — DISCOVERY NÃO VIRA ASSERTION ─────────────────────────────────────

describe('I5 — DISCOVERY NÃO VIRA ASSERTION (modalidade preservada)', () => {
  it('pergunta válida de discovery não acusa (após normalização); afirmação equivalente acusa', () => {
    const pergunta = 'A operação na Colômbia (Cumaribo) possui registro legal confirmado?';
    const afirmacao = 'A operação na Colômbia (Cumaribo) possui registro legal confirmado.';
    const rQ = verifyGold(normalizeDiscoveryQuestion(pergunta), canonical, emptySafe);
    const rA = verifyGold(afirmacao, canonical, emptySafe);
    expect(rQ.hardFails.filter((h) => h.code === 'PROMOTED_CLAIM')).toHaveLength(0);
    expect(rA.hardFails.map((h) => h.code)).toContain('PROMOTED_CLAIM');
  });
  it('normalizeDiscoveryQuestion preserva a pergunta útil (sem certeza)', () => {
    const n = neutralizeConfirmedVocabulary('A operação na Colômbia possui registro legal confirmado?');
    expect(n).not.toContain('confirmado');
  });
});

// ─── I6 — PARIDADE DE COBERTURA (campos do Frontier) ───────────────────────

describe('I6 — PARIDADE DE COBERTURA (nenhum campo esquecido silenciosamente)', () => {
  it('campo facts.claim: protegido pelo sanitizer', () => {
    const raw = rawPack({
      facts: [{ id: 'f', entity: 'SCHEFFER & CIA LTDA', claim: 'Operação na Colômbia confirmada em operação.', status: 'Pista forte', source: 'Site', kind: 'operation' }],
    });
    const r = sanitizeFindingPack(raw, canonical);
    expect(r.facts[0].claim).not.toContain('confirmada');
  });
  it('campo technologySignals.observedFact: protegido pelo sanitizer (RCA-04)', () => {
    const raw = rawPack({
      technologySignals: [{ technology: 'T', observedFact: 'Operação na Colômbia confirmada, mas sem módulo.', status: 'Pista forte', whatIsNotKnown: 'x', validationQuestion: 'y?' }],
    });
    const r = sanitizeFindingPack(raw, canonical);
    expect(r.technologySignals[0].observedFact).not.toContain('confirmada');
  });
  it('campo relationships.evidence: coberto pelo probe (não fabrica PROMOTED)', () => {
    const raw = rawPack({
      relationships: [
        { id: 'r', entity: 'SCHEFFER & CIA LTDA', relatedEntity: '11.021.773/0001-70', relationType: 'direct_pj_relation', status: 'Confirmado', source: 'Receita Federal', evidence: 'Controle societário direto confirmado da holding.' },
      ],
    });
    const sanitized = sanitizeFindingPack(raw, canonical);
    const probe = buildFrontierProbeText(sanitized as never);
    const result = verifyGold(probe, canonical, sanitized as never);
    // evidence é superfície assertiva coberta pelo probe; se o sanitizer não a
    // neutraliza, o probe sinaliza — aqui o texto usa "confirmado" em tema
    // sensível, então o resultado NÃO deve conter PROMOTED (I1 exige 0) — o
    // sanitizer/guard do probe é o mecanismo; este teste registra o contrato.
    expect(result.hardFails.filter((h) => h.code === 'PROMOTED_CLAIM')).toHaveLength(0);
  });
  it('campo openQuestions: permitido por design (normalização de modalidade — RCA-03)', () => {
    const pergunta = 'A operação na Colômbia roda em qual sistema e como é integrada?';
    const raw = rawPack({ openQuestions: [pergunta] });
    const r = sanitizeFindingPack(raw, canonical);
    expect(r.openQuestions).toContain(pergunta);
  });
});
