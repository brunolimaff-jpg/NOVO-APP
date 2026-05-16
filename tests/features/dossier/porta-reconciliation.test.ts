import { describe, expect, it, vi } from 'vitest';

const generateDossierModuleMock = vi.hoisted(() => vi.fn());
const scoutDiagMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../../../services/geminiService', () => ({
  generateDossierModule: generateDossierModuleMock,
}));

vi.mock('../../../utils/diagnosticLog', () => ({
  scoutDiag: scoutDiagMock,
}));

import {
  buildPortaReconciliationPrompt,
  ensureWaterfallScorePorta,
  reconcileWaterfallPorta,
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

  it('lança erro quando não consegue consolidar score PORTA após todas as tentativas', () => {
    const unresolved = `
Texto consolidado sem marcador explícito.
`;
    expect(() => ensureWaterfallScorePorta(unresolved, {
      score: null,
      source: 'none',
      missingDimensions: ['P', 'O', 'R', 'T', 'A'],
    })).toThrow('Score PORTA não pôde ser consolidado após todas as tentativas.');
  });

  it('não transforma falha parcial de PORTA em hold de integridade', async () => {
    generateDossierModuleMock.mockResolvedValue('');

    await expect(
      reconcileWaterfallPorta({
        sessionId: 'session-1',
        signal: new AbortController().signal,
        resolvedMegaCompany: 'Scheffer',
        sessionCnpjDigits: '04733767000180',
        dossierSeedContext: '',
        waterfallLookupContext: '',
        seniorEvidenceContext: '',
        accumulatedText: 'Texto com [[PORTA_FEED_P:7:HA:1:CNPJS:1:FAT:NA]] parcial.',
        modulesByName: new Map(),
        runWaterfallModule: vi.fn(),
        optionalStepFailures: new Set(),
        setFailureCount: vi.fn(),
      }),
    ).rejects.toThrow('Falha técnica ao consolidar Score PORTA');
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
