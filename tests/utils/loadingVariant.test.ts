import { describe, expect, it } from 'vitest';
import { resolveDeepDiveRequestKind, resolveLoadingVariant } from '../../utils/loadingVariant';

describe('loadingVariant flow rules', () => {
  it('keeps the first investigation in hero mode', () => {
    expect(
      resolveLoadingVariant({
        requestKind: 'default',
        isFollowUp: false,
      }),
    ).toBe('hero');
  });

  it('keeps regular follow-ups inline', () => {
    expect(
      resolveLoadingVariant({
        requestKind: 'default',
        isFollowUp: true,
      }),
    ).toBe('inline');
  });

  it('keeps deep dives inline after a consolidated answer exists', () => {
    expect(resolveDeepDiveRequestKind(true)).toBe('deep_dive');
    expect(
      resolveLoadingVariant({
        requestKind: 'deep_dive',
        isFollowUp: true,
      }),
    ).toBe('inline');
  });

  it('routes the first home investigation back to the hero flow', () => {
    expect(resolveDeepDiveRequestKind(false)).toBe('default');
  });
});
