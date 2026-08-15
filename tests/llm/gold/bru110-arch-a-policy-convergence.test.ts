import { describe, it, expect } from 'vitest';
import { matchesUnsupportedOperationalClaim, matchesSensitiveTheme, matchesConfirmedVocabulary, matchesExecutiveRole } from '../../../services/llm/gold/gold-policy';
import { sanitizeFindingPack } from '../../../services/llm/gold/finding-sanitizer';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';
import type { CanonicalAccount, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';

const CANONICAL: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: null,
  directPjPartners: [],
  qsaPeople: [],
} as unknown as CanonicalAccount;

function makeSafePack(claims: string[]): SafeFindingPack {
  return {
    module: 'gold-compactor',
    accountIdentity: {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      conflicts: [],
    },
    facts: claims.map((claim, i) => ({
      id: `f${i}`,
      entity: 'SCHEFFER & CIA LTDA',
      claim,
      status: 'Confirmado',
      source: 'Fonte externa',
      kind: 'operation',
      process: null,
    })),
    relationships: [],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    sanitizerEvents: [],
    sanitized: true,
  } as unknown as SafeFindingPack;
}

function makeRawPack(claim: string) {
  return {
    module: 'gold-compactor',
    accountIdentity: {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial' as const,
      rootCnpj: '04.733.767',
      conflicts: [],
    },
    facts: [
      { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim, status: 'Confirmado', source: 'Fonte externa', kind: 'operation' as const, process: null },
    ],
    relationships: [],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    sanitizerEvents: [],
    discardedClaims: [],
  } as unknown as Parameters<typeof sanitizeFindingPack>[0];
}

/**
 * ARCH-A (BRU-110) — Semantic Policy Convergence.
 *
 * RED: demonstra a divergência atual entre os detectores locais do sanitizer
 * e do verifier para conceitos compartilhados. A auditoria de 2026-08-15
 * encontrou POSSESSION_NEGATION, GAP_CLAIM e EXECUTIVE_ROLE com definições
 * locais divergentes apesar do contrato RCA-05 de fonte canônica.
 *
 * Invariante: DETECTOR CANÔNICO ≠ AÇÃO CANÔNICA — o significado é único em
 * gold-policy.ts; sanitizer (remover), verifier (fail) e pipeline
 * (observar/fail-close) mantêm ações próprias.
 */
describe('BRU-110 ARCH-A — GREEN: detectores canônicos convergem (fonte única em gold-policy)', () => {
  it('GREEN 1: "não há WMS na empresa" agora é removido pelo sanitizer E reprovado pelo verifier (POSSESSION_NEGATION canônico)', () => {
    const claim = 'A empresa não há WMS na operação.';
    const sanitized = sanitizeFindingPack(makeRawPack(claim), CANONICAL);
    const sanitizerRemoved = sanitized.discardedClaims.some((d) => d.claim.includes('não há WMS'));
    // Verifier convergido: matchesPossessionNegation inclui "há" (canônico).
    const verification = verifyGold(claim, CANONICAL, makeSafePack([claim]));
    expect(sanitizerRemoved).toBe(true);
    expect(verification.passed).toBe(false); // GREEN: convergente reprova
  });

  it('GREEN 2: "lacuna de sistema" reprovado pelo verifier E removido pelo sanitizer (GAP canônico)', () => {
    const claim = 'Existe uma lacuna de sistema na unidade.';
    const sanitized = sanitizeFindingPack(makeRawPack(claim), CANONICAL);
    const sanitizerRemoved = sanitized.discardedClaims.some((d) => d.claim.includes('lacuna de sistema'));
    const verification = verifyGold(claim, CANONICAL, makeSafePack([claim]));
    expect(sanitizerRemoved).toBe(true);
    expect(verification.passed).toBe(false);
  });

  it('GREEN 3: "gerente geral" é reconhecido pelo detector canônico (união sanitizer+verifier)', () => {
    const phrase = 'O gerente geral decide a operação';
    expect(matchesExecutiveRole(phrase)).toBe(true);
  });

  it('GREEN 4: conceito já canônico: UNSUPPORTED_PRODUCT_CLAIM usa a MESMA definição (policy) nos dois', () => {
    // Sanitizer remove quando status ≠ Confirmado OU fonte não-externa.
    const claim = 'Capacidade de armazenagem de 120 mil sacas.';
    const sanitized = sanitizeFindingPack(
      {
        module: 'gold-compactor',
        accountIdentity: {
          inputCnpj: '04.733.767/0001-80',
          legalName: 'SCHEFFER & CIA LTDA',
          establishmentType: 'Filial' as const,
          rootCnpj: '04.733.767',
          conflicts: [],
        },
        facts: [
          { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim, status: 'Pista forte', source: 'CRM interno Senior', kind: 'operation' as const, process: null },
        ],
        relationships: [],
        technologySignals: [],
        people: [],
        metrics: [],
        conflicts: [],
        openQuestions: [],
        sanitizerEvents: [],
        discardedClaims: [],
      } as unknown as Parameters<typeof sanitizeFindingPack>[0],
      CANONICAL,
    );
    const sanitizerRemoved = sanitized.discardedClaims.some((d) => d.claim.toLowerCase().includes('capacidade'));
    // Safe pack SEM o claim (o verifier não encontra suporte → reprova).
    const verification = verifyGold(claim, CANONICAL, makeSafePack([]));
    expect(matchesUnsupportedOperationalClaim(claim)).toBe(true);
    expect(sanitizerRemoved).toBe(true);
    expect(verification.passed).toBe(false);
  });

  it('GREEN 5: sensitive theme e certainty vocabulary já vêm da policy (sem duplicação local)', () => {
    expect(matchesSensitiveTheme('operação na Colômbia')).toBe(true);
    expect(matchesConfirmedVocabulary('operação confirmada')).toBe(true);
  });
});
