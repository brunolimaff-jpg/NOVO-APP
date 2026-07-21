import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFeatureAccess } from '../../utils/featureAccess';

describe('featureAccess', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps all product areas enabled by default and deep dive off when env flag is absent', () => {
    vi.stubEnv('VITE_ENABLE_DEEP_DIVE', '');

    expect(getFeatureAccess()).toEqual({
      dashboard: true,
      clientLookup: true,
      deepDive: false,
    });
  });

  it('enables Deep Dive only when VITE_ENABLE_DEEP_DIVE=true', () => {
    vi.stubEnv('VITE_ENABLE_DEEP_DIVE', 'true');

    expect(getFeatureAccess()).toEqual({
      dashboard: true,
      clientLookup: true,
      deepDive: true,
    });
  });
});
