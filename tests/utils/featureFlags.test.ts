import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_FLAGS, getFlag } from '../../utils/featureFlags';

describe('featureFlags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retorna o valor default quando nao ha override', () => {
    expect(getFlag('deepDive')).toBe(FEATURE_FLAGS.deepDive.default);
    expect(getFlag('newExportFlow')).toBe(FEATURE_FLAGS.newExportFlow.default);
  });

  it('respeita override true e false em VITE_FF_*', () => {
    vi.stubEnv('VITE_FF_NEW_EXPORT', 'true');
    vi.stubEnv('VITE_FF_DEEP_DIVE', 'false');

    expect(getFlag('newExportFlow')).toBe(true);
    expect(getFlag('deepDive')).toBe(false);
  });

  it('ignora override invalido e cai no default', () => {
    vi.stubEnv('VITE_FF_RADAR_V2', 'maybe');

    expect(getFlag('radarV2')).toBe(FEATURE_FLAGS.radarV2.default);
  });
});
