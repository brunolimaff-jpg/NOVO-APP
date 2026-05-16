import { describe, expect, it } from 'vitest';
import {
  applyPortaTechnicalFallback,
  buildPortaFallbackChunk,
  buildPortaReconciliationPrompt,
  ensureWaterfallScorePorta,
  resolveModuleNamesForMissingDimensions,
  shouldHoldWaterfallScoreForIntegrity,
} from '../../../features/dossier/porta-reconciliation';
import { ensureContinuitySuggestions } from '../../../utils/messageHelpers';

describe('porta-reconciliation', () => {
  it('mapeia dimensões faltantes para módulos donos com deduplicação', () => {
    const result = resolveModuleNamesForMissingDimensions(['O', 'T', 'O', 'A']);
    expect(result).toEqual(['Raio-X Operacional', 'Tech Stack', 'RH & Decisores']);
  });

  it('ativa guardrail de integridade quando todas as dimensões PORTA ficam ausentes', () => {
    expect(
      shouldHoldWaterfallScoreForIntegrity({
        score: null,
        source: 'none',
        missingDimensions: ['P', 'O', 'R', 'T', 'A'],
      }),
    ).toBe(true);
    expect(
      shouldHoldWaterfallScoreForIntegrity({
        score: null,
        source: 'feeds',
        missingDimensions: ['P', 'R'],
      }),
    ).toBe(false);
  });

  it('gera prompt de reconciliação apenas com templates das dimensões pendentes', () => {
    const prompt = buildPortaReconciliationPrompt(['P', 'R']);
    expect(prompt).toContain('DIMENSÕES FALTANTES: P, R');
    expect(prompt).toContain('[[PORTA_FEED_P:6:HA:0:CNPJS:0:FAT:NA]]');
    expect(prompt).toContain('[[PORTA_FEED_R:6:PRESSOES:Sem_pressao_identificada]]');
    expect(prompt).not.toContain('[[PORTA_FEED_T:6:T1:6:T2:6:T3:6:STACK:NA]]');
  });

  it('gera chunk de fallback apenas para dimensões faltantes', () => {
    const chunk = buildPortaFallbackChunk(['O', 'T']);
    expect(chunk).toContain('[[PORTA_FEED_O:6:ELOS:Plantio]]');
    expect(chunk).toContain('[[PORTA_FEED_T:6:T1:6:T2:6:T3:6:STACK:NA]]');
    expect(chunk).not.toContain('[[PORTA_FEED_P:6:HA:0:CNPJS:0:FAT:NA]]');
  });

  it('aplica fallback técnico quando ainda faltam dimensões e resolve score sem erro fatal', () => {
    const base = `
[[PORTA_FEED_P:7:HA:9000:CNPJS:3:FAT:R$ 250 mi]]
[[PORTA_FEED_R:6:PRESSOES:SEFAZ]]
[[PORTA_FEED_T:5:T1:5:T2:5:T3:5:STACK:SAP]]
[[PORTA_FEED_A:6:A1:6:A2:6:GERACAO:G2]]
[[PORTA_SEG:PRD]]
`;
    const result = applyPortaTechnicalFallback(base);
    expect(result.fallbackApplied).toBe(true);
    expect(result.fallbackDimensions).toEqual(['O']);
    expect(result.content).toContain('[[PORTA_FEED_O:6:ELOS:Plantio]]');
    expect(result.resolution.score).not.toBeNull();
    expect(result.resolution.missingDimensions).toEqual([]);
  });

  it('não aplica fallback quando o score já está consolidado', () => {
    const complete = `
[[PORTA_FEED_P:7:HA:9000:CNPJS:3:FAT:R$ 250 mi]]
[[PORTA_FEED_O:6:ELOS:Plantio]]
[[PORTA_FEED_R:6:PRESSOES:SEFAZ]]
[[PORTA_FEED_T:5:T1:5:T2:5:T3:5:STACK:SAP]]
[[PORTA_FEED_A:6:A1:6:A2:6:GERACAO:G2]]
[[PORTA_SEG:PRD]]
`;
    const result = applyPortaTechnicalFallback(complete);
    expect(result.fallbackApplied).toBe(false);
    expect(result.fallbackDimensions).toEqual([]);
    expect(result.resolution.score).not.toBeNull();
  });

  it('garante score PORTA final mesmo quando a resolução recebida está vazia', () => {
    const unresolved = `
Texto consolidado sem marcador explícito.
`;
    const score = ensureWaterfallScorePorta(unresolved, {
      score: null,
      source: 'none',
      missingDimensions: ['P', 'O', 'R', 'T', 'A'],
    });

    expect(score).toMatchObject({
      p: 6,
      o: 6,
      r: 6,
      t: 6,
      a: 6,
      segmento: 'PRD',
      flags: [],
      score: 60,
      scoreBruto: 60,
    });
  });

  it('preenche perguntas de acompanhamento quando a IA retorna lista vazia ou parcial', () => {
    const ensuredEmpty = ensureContinuitySuggestions([], 'Scheffer');
    expect(ensuredEmpty).toHaveLength(4);
    expect(ensuredEmpty.every(item => item.endsWith('?'))).toBe(true);
    expect(ensuredEmpty.some(item => /Scheffer/i.test(item))).toBe(true);

    const ensuredPartial = ensureContinuitySuggestions(['Qual risco operacional já está escalando?'], 'Scheffer');
    expect(ensuredPartial).toHaveLength(4);
    expect(ensuredPartial[0]).toBe('Qual risco operacional já está escalando?');
  });
});
