import { describe, expect, it } from 'vitest';
import { buildCacheKey } from '../../services/socio-search/types';

describe('buildCacheKey', () => {
  it('isola cache por operatorId', () => {
    const base = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer');
    const opA = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer', 'operator-a');
    const opB = buildCacheKey('04733767000180', 'Scheffer', 'Guilherme M Scheffer', 'operator-b');

    expect(opA).not.toBe(opB);
    expect(base).toContain('::anonymous::');
    expect(opA).toContain('::operator a::');
  });
});
