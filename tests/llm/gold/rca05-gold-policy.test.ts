import { describe, it, expect } from 'vitest';
import { sanitizeFindingPack } from '../../../services/llm/gold/finding-sanitizer';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';
import {
  matchesSensitiveTheme,
  matchesConfirmedVocabulary,
  neutralizeConfirmedVocabulary,
  matchesUnsupportedOperationalClaim,
  normalizeDiscoveryQuestion,
  GOLD_POLICY_CORPUS,
  goldPolicyCorpusSchema,
} from '../../../services/llm/gold/gold-policy';
import type { CanonicalAccount, RawFindingPack, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * RCA-05 — GOLD SEMANTIC POLICY (Fase 3, REDs de drift).
 * Demonstram o drift ATUAL entre camadas (falham no baseline a1c00bae) e
 * ficam verdes com a consolidação: primitivas canônicas em gold-policy.ts +
 * consumidores migrados.
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

describe('RCA-05 — primitivas canônicas (gold-policy.ts)', () => {
  it('RED drift-plural: claim com "confirmadas" (plural) é reescrito pelo sanitizer', () => {
    const raw = rawPack({
      facts: [
        {
          id: 'f1',
          entity: 'SCHEFFER & CIA LTDA',
          claim: 'Operações internacionais confirmadas em Cumaribo.',
          status: 'Pista forte',
          source: 'Site institucional',
          kind: 'operation',
        },
      ],
    });
    const result = sanitizeFindingPack(raw, canonical);
    expect(result.facts[0].claim).not.toContain('confirmadas');
  });

  it('RED controle-negativo: "controle de pragas confirmado" NÃO é tema sensível (verifier não acusa PROMOTED)', () => {
    const result = verifyGold('O grupo contratou controle de pragas confirmado em 2025.', canonical, emptySafe);
    expect(result.hardFails.map((h) => h.code)).not.toContain('PROMOTED_CLAIM');
  });

  it('primitivas: matchesSensitiveTheme cobre todas as formas do corpus', () => {
    for (const t of GOLD_POLICY_CORPUS.sensitiveThemes) {
      expect(matchesSensitiveTheme(`texto ${t} texto`)).toBe(true);
    }
    for (const t of GOLD_POLICY_CORPUS.nonSensitiveControls) {
      expect(matchesSensitiveTheme(`texto ${t} texto`)).toBe(false);
    }
  });

  it('primitivas: matchesConfirmedVocabulary cobre singular, plural e confirmadamente', () => {
    for (const w of GOLD_POLICY_CORPUS.certaintyWords) {
      expect(matchesConfirmedVocabulary(`texto ${w} texto`)).toBe(true);
    }
  });

  it('primitivas: neutralizeConfirmedVocabulary preserva gênero e número', () => {
    expect(neutralizeConfirmedVocabulary('confirmado')).toBe('mencionado');
    expect(neutralizeConfirmedVocabulary('confirmada')).toBe('mencionada');
    expect(neutralizeConfirmedVocabulary('confirmados')).toBe('mencionados');
    expect(neutralizeConfirmedVocabulary('confirmadas')).toBe('mencionadas');
    expect(neutralizeConfirmedVocabulary('confirmadamente')).toBe('possivelmente');
  });

  it('primitivas: matchesUnsupportedOperationalClaim cobre o vocabulário do corpus', () => {
    for (const c of GOLD_POLICY_CORPUS.unsupportedClaims) {
      expect(matchesUnsupportedOperationalClaim(`texto ${c} texto`)).toBe(true);
    }
  });

  it('primitivas: normalizeDiscoveryQuestion neutraliza certeza apenas em interrogativas (RCA-03 preservado)', () => {
    expect(normalizeDiscoveryQuestion('A operação na Colômbia (Cumaribo) possui registro legal confirmado?')).not.toContain('confirmado');
    expect(normalizeDiscoveryQuestion('Operação na Colômbia está confirmada.')).toBe('Operação na Colômbia está confirmada.');
    expect(normalizeDiscoveryQuestion('Qual é a capacidade estática total de armazenagem?')).not.toContain('capacidade');
  });

  it('corpus: o schema de contrato valida o corpus versionado', () => {
    const parsed = goldPolicyCorpusSchema.safeParse(GOLD_POLICY_CORPUS);
    expect(parsed.success).toBe(true);
  });
});
