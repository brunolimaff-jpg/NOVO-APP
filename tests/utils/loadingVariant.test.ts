import { describe, expect, it } from 'vitest';
import {
  resolveDeepDiveRequestKind,
  resolveLoadingVariant,
  resolvePlaceholderLoadingVariant,
} from '../../utils/loadingVariant';

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

  it('keeps deep dives in hero mode even after a consolidated answer exists', () => {
    expect(resolveDeepDiveRequestKind(true)).toBe('deep_dive');
    expect(
      resolveLoadingVariant({
        requestKind: 'deep_dive',
        isFollowUp: true,
      }),
    ).toBe('hero');
    expect(
      resolvePlaceholderLoadingVariant({
        requestKind: 'deep_dive',
        isFollowUp: true,
        hasConsolidatedBotResponse: true,
      }),
    ).toBe('hero');
  });

  it('routes the first home investigation back to the hero flow', () => {
    expect(resolveDeepDiveRequestKind(false)).toBe('default');
  });

  it('keeps regular follow-up placeholders inline when the session already has a bot answer', () => {
    expect(
      resolvePlaceholderLoadingVariant({
        requestKind: 'default',
        isFollowUp: true,
        hasConsolidatedBotResponse: true,
      }),
    ).toBe('inline');
  });

  it('keeps placeholder aligned with hero for first investigation even if session has past bot answers', () => {
    expect(
      resolvePlaceholderLoadingVariant({
        requestKind: 'default',
        isFollowUp: false,
        hasConsolidatedBotResponse: true,
      }),
    ).toBe('hero');
  });
});
