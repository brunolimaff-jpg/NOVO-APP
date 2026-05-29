import { describe, expect, it } from 'vitest';
import { coerceGroundingSources } from '../../utils/dossierSourcePool';

describe('coerceGroundingSources', () => {
  it('retorna array vazio para null/undefined', () => {
    expect(coerceGroundingSources(null)).toEqual([]);
    expect(coerceGroundingSources(undefined)).toEqual([]);
  });

  it('normaliza array de fontes', () => {
    expect(
      coerceGroundingSources([
        { title: 'A', url: 'https://a.com', verification: 'grounding' },
        { title: 'B', url: 'https://b.com', verification: 'fallback' },
      ]),
    ).toHaveLength(2);
  });

  it('converte objeto único legado em array', () => {
    expect(coerceGroundingSources({ title: 'Legado', url: 'https://legacy.example' })).toEqual([
      { title: 'Legado', url: 'https://legacy.example', verification: undefined },
    ]);
  });
});
