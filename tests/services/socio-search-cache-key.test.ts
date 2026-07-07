import { describe, expect, it } from 'vitest';
import { buildCacheKey } from '../../services/socio-search/types';

describe('buildCacheKey', () => {
  it('isola cache por operatorId', () => {
    const base = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer');
    const opA = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer', 'operator-a');
    const opB = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer', 'operator-b');

    expect(opA).not.toBe(opB);
    expect(opA).toContain('::operator a');
    expect(opB).toContain('::operator b');
  });

  it('preserva chave exata quando operatorId é omitido', () => {
    const key = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer');
    expect(key).toBe('v7-structured-lateral-cnpj::04733767000180::guilherme m scheffer');
  });

  it('ignora operatorId que normaliza para vazio', () => {
    const withoutOperator = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer');
    const emptyOperator = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer', '---!!!');

    expect(emptyOperator).toBe(withoutOperator);
  });
});
