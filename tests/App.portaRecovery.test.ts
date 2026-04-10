import { describe, expect, it } from 'vitest';
import { buildPortaReconciliationPrompt, resolveModuleNamesForMissingDimensions } from '../App';

describe('App PORTA recovery helpers', () => {
  it('mapeia dimensões faltantes para módulos donos com deduplicação', () => {
    const result = resolveModuleNamesForMissingDimensions(['O', 'T', 'O', 'A']);
    expect(result).toEqual(['Raio-X Operacional', 'Tech Stack', 'RH & Decisores']);
  });

  it('gera prompt de reconciliação apenas com templates das dimensões pendentes', () => {
    const prompt = buildPortaReconciliationPrompt(['P', 'R']);
    expect(prompt).toContain('DIMENSÕES FALTANTES: P, R');
    expect(prompt).toContain('[[PORTA_FEED_P:6:HA:0:CNPJS:0:FAT:NA]]');
    expect(prompt).toContain('[[PORTA_FEED_R:6:PRESSOES:Sem_pressao_identificada]]');
    expect(prompt).not.toContain('[[PORTA_FEED_T:6:T1:6:T2:6:T3:6:STACK:NA]]');
  });
});
