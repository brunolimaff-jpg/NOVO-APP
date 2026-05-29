// tests/utils/loadingHelpers.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanFactPrefix, getNextFact, shuffleArray, resetShownFacts } from '../../utils/loadingHelpers';

describe('cleanFactPrefix', () => {
  it('remove prefixo "Você sabia?"', () => {
    expect(cleanFactPrefix('Você sabia? O Brasil lidera...')).toBe('O Brasil lidera...');
  });

  it('remove prefixo "Dado:"', () => {
    expect(cleanFactPrefix('Dado: 60% das empresas...')).toBe('60% das empresas...');
  });

  it('remove prefixo "Fato:"', () => {
    expect(cleanFactPrefix('Fato: O agronegócio representa...')).toBe('O agronegócio representa...');
  });

  it('remove prefixo "Insight:"', () => {
    expect(cleanFactPrefix('Insight: Adoção de IA cresce...')).toBe('Adoção de IA cresce...');
  });

  it('não altera texto sem prefixo', () => {
    const text = 'Texto normal sem prefixo';
    expect(cleanFactPrefix(text)).toBe(text);
  });

  it('remove aspas duplas no início e fim', () => {
    expect(cleanFactPrefix('"Texto entre aspas"')).toBe('Texto entre aspas');
  });

  it('remove aspas simples no início e fim', () => {
    expect(cleanFactPrefix("'Texto entre aspas simples'")).toBe('Texto entre aspas simples');
  });

  it('é case insensitive para os prefixos', () => {
    expect(cleanFactPrefix('DADO: texto')).toBe('texto');
  });
});

describe('getNextFact', () => {
  beforeEach(() => {
    resetShownFacts();
  });

  it('retorna um fato do pool', () => {
    const pool = ['Fato A', 'Fato B', 'Fato C'];
    const result = getNextFact(pool);
    expect(pool).toContain(result);
  });

  it('não repete fatos até esgotar o pool', () => {
    const pool = ['A', 'B', 'C'];
    const shown = new Set<string>();
    for (let i = 0; i < 3; i++) {
      shown.add(getNextFact(pool));
    }
    expect(shown.size).toBe(3);
  });

  it('reseta quando todos foram mostrados e retorna novo fato', () => {
    const pool = ['X', 'Y'];
    getNextFact(pool); // X or Y
    getNextFact(pool); // the other one
    // Pool exhausted — next call should reset and return something
    const reset = getNextFact(pool);
    expect(pool).toContain(reset);
  });

  it('funciona com pool de 1 elemento', () => {
    const pool = ['único'];
    expect(getNextFact(pool)).toBe('único');
    // After reset
    expect(getNextFact(pool)).toBe('único');
  });
});

describe('shuffleArray', () => {
  it('retorna array com mesmos elementos', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled).toHaveLength(arr.length);
    expect(shuffled.sort()).toEqual([...arr].sort());
  });

  it('não modifica o array original', () => {
    const arr = [1, 2, 3];
    const copy = [...arr];
    shuffleArray(arr);
    expect(arr).toEqual(copy);
  });

  it('funciona com array vazio', () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it('funciona com array de 1 elemento', () => {
    expect(shuffleArray(['único'])).toEqual(['único']);
  });
});
