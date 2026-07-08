import { describe, expect, it, beforeEach } from 'vitest';
import {
  addFeedAdjustment,
  addFlagFeed,
  addSegmentFeed,
  getPortaState,
  initPortaState,
  resetPortaState,
  setBaseScore,
} from '../../services/portaStateService';

describe('portaStateService', () => {
  beforeEach(() => {
    resetPortaState();
  });

  it('initializes and consolidates base score', () => {
    initPortaState('Grupo Scheffer', 'session-1');
    setBaseScore({
      score: 75,
      p: 9,
      o: 8,
      r: 8,
      t: 6,
      a: 8,
      segmento: 'PRD',
      flags: [],
      scoreBruto: 75,
    });

    const state = getPortaState();
    expect(state?.baseScore?.score).toBe(75);
    expect(state?.consolidatedScore?.score).toBe(75);
    expect(state?.consolidatedScore?.t).toBe(6);
  });

  it('applies deep dive adjustment and keeps single consolidated score', () => {
    initPortaState('Grupo Scheffer', 'session-1');
    setBaseScore({
      score: 75,
      p: 9,
      o: 8,
      r: 8,
      t: 6,
      a: 8,
      segmento: 'PRD',
      flags: [],
      scoreBruto: 75,
    });

    addFeedAdjustment({
      source: 'TECH_STACK',
      dimension: 'T',
      suggestedValue: 8,
      justification: 'Stack encontrado com baixa dor e alta liberdade',
      subScores: { T1: 9, T2: 3, T3: 9 },
      metadata: { STACK: 'Senior' },
    });

    const state = getPortaState();
    expect(state?.consolidatedScore?.t).toBe(8);
    expect(state?.consolidatedScore?.score).toBe(81);
    expect(state?.feedAdjustments).toHaveLength(1);
  });

  it('clampa ajuste T fora da escala antes de consolidar o score', () => {
    initPortaState('Grupo Scheffer', 'session-1');
    setBaseScore({
      score: 75,
      p: 9,
      o: 8,
      r: 8,
      t: 6,
      a: 8,
      segmento: 'PRD',
      flags: [],
      scoreBruto: 75,
    });

    addFeedAdjustment({
      source: 'TECH_STACK',
      dimension: 'T',
      suggestedValue: 62,
      justification: 'valor bruto fora da escala recebido do deep dive',
    });

    const state = getPortaState();
    expect(state?.consolidatedScore?.t).toBe(10);
    expect(state?.consolidatedScore?.score).toBe(87);
    expect(state?.consolidatedScore?.scoreBruto).toBe(87);
  });

  it('replaces previous feed from same source and dimension', () => {
    initPortaState('Grupo Scheffer', 'session-1');
    setBaseScore({
      score: 75,
      p: 9,
      o: 8,
      r: 8,
      t: 6,
      a: 8,
      segmento: 'PRD',
      flags: [],
      scoreBruto: 75,
    });

    addFeedAdjustment({
      source: 'TECH_STACK',
      dimension: 'T',
      suggestedValue: 7,
      justification: 'primeira leitura',
    });
    addFeedAdjustment({
      source: 'TECH_STACK',
      dimension: 'T',
      suggestedValue: 8,
      justification: 'ajuste final',
    });

    const state = getPortaState();
    expect(state?.feedAdjustments).toHaveLength(1);
    expect(state?.consolidatedScore?.t).toBe(8);
  });

  it('supports flag and segment feeds', () => {
    initPortaState('Grupo Scheffer', 'session-1');
    setBaseScore({
      score: 75,
      p: 9,
      o: 8,
      r: 8,
      t: 6,
      a: 8,
      segmento: 'PRD',
      flags: [],
      scoreBruto: 75,
    });

    addSegmentFeed({
      source: 'RADAR_EXPANSAO',
      segmento: 'AGI',
      justification: 'grupo com beneficiamento e indústria como core',
    });
    addFlagFeed({
      source: 'RISCOS_COMPLIANCE',
      flag: 'TRAD',
      active: false,
      justification: 'natureza majoritária de produção própria',
    });

    const state = getPortaState();
    expect(state?.consolidatedScore?.segmento).toBe('AGI');
    expect(state?.consolidatedScore?.flags).toEqual([]);
  });
});
