/**
 * BRU-99 (2026-08-14) — Reconciliação PORTA × PromptLeakShield.
 *
 * O shield genérico bloqueia o caminho marker-only legítimo da Reconciliação
 * PORTA: `stripInternalMarkers` remove a resposta composta somente por markers,
 * o sample volta ao texto bruto e o detector classifica o próprio marker
 * esperado como leak (falso positivo determinístico — run 86850904,
 * fingerprint 8bd44e4a).
 *
 * Correção estreita (sem relaxar o shield global): contrato explícito de
 * allowlist — um texto composto SOMENTE por markers `[[<prefix>_<DIM>:...]]`
 * com prefixo e dimensão autorizados NÃO é bloqueado. Qualquer outro conteúdo
 * (marker de outro tipo, texto de prompt, marker malformado ou conteúdo misto)
 * continua sujeito ao shield.
 */
import { describe, expect, it } from 'vitest';
import { applyPromptLeakShield } from '../../utils/textCleaners';
import { resolvePortaScore } from '../../utils/porta';

const MARKER_T = '[[PORTA_FEED_T:6:T1:6:T2:6:T3:6:STACK:NA]]';
const ALLOWLIST_T = { prefix: 'PORTA_FEED', dimensions: ['T'] };

describe('BRU-99 — PromptLeakShield × allowlist PORTA_FEED', () => {
  it('RED 1: marker-only PORTA_FEED_T válido NÃO bloqueia e o parser consolida T', () => {
    const shielded = applyPromptLeakShield(MARKER_T, {
      preserveInternalMarkersWhenSafe: true,
      internalMarkerAllowlist: ALLOWLIST_T,
    });
    expect(shielded.blocked).toBe(false);
    expect(shielded.text).toBe(MARKER_T);

    const resolution = resolvePortaScore(MARKER_T);
    expect(resolution.missingDimensions).not.toContain('T');
  });

  it('RED 2: marker-only de OUTRO tipo (fora da allowlist) continua bloqueado', () => {
    const otherMarker = '[[STATUS:ok]]';
    const shielded = applyPromptLeakShield(otherMarker, {
      preserveInternalMarkersWhenSafe: true,
      internalMarkerAllowlist: ALLOWLIST_T,
    });
    expect(shielded.blocked).toBe(true);
  });

  it('RED 2b: marker PORTA_FEED de dimensão NÃO solicitada continua bloqueado', () => {
    const wrongDim = '[[PORTA_FEED_P:6:HA:0:CNPJS:0:FAT:NA]]';
    const shielded = applyPromptLeakShield(wrongDim, {
      preserveInternalMarkersWhenSafe: true,
      internalMarkerAllowlist: ALLOWLIST_T,
    });
    expect(shielded.blocked).toBe(true);
  });

  it('RED 3: marker PORTA_FEED + texto de prompt leak continua bloqueado', () => {
    const mixed = `${MARKER_T}\nURGENTE: Para gerar o dossiê de agronegócio e consolidar o Score PORTA, preciso do CNPJ da empresa em análise.`;
    const shielded = applyPromptLeakShield(mixed, {
      preserveInternalMarkersWhenSafe: true,
      internalMarkerAllowlist: ALLOWLIST_T,
    });
    expect(shielded.blocked).toBe(true);
  });

  it('RED 4: marker malformado ou com corpo vazio NÃO é aceito como reconciliação válida', () => {
    const malformed = '[[PORTA_FEED_T';
    const emptyBody = '[[PORTA_FEED_T:]]';

    // o parser NÃO consolida a dimensão a partir de markers inválidos
    expect(resolvePortaScore(malformed).missingDimensions).toContain('T');
    expect(resolvePortaScore(emptyBody).missingDimensions).toContain('T');

    // e o shield não preserva o malformado via allowlist (segue o fluxo normal)
    const s1 = applyPromptLeakShield(malformed, {
      preserveInternalMarkersWhenSafe: true,
      internalMarkerAllowlist: ALLOWLIST_T,
    });
    expect(s1.blocked).toBe(false); // não é leak detectável — segue o fluxo normal
    expect(s1.text).not.toBe(ALLOWLIST_T.prefix + '_T'); // não é tratado como marker válido da allowlist
  });
});
