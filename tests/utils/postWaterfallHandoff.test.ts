import { describe, expect, it } from 'vitest';
import type { BlankPanelSnapshot } from '../../utils/blankPanelTelemetry';
import {
  isOverlayStuckPostWaterfall,
  isPostWaterfallStuckHandoff,
  shouldApplyProactiveForceStatic,
  shouldResetForceStaticOnLoadingStart,
} from '../../utils/postWaterfallHandoff';

function snapshot(partial: Partial<BlankPanelSnapshot>): BlankPanelSnapshot {
  return {
    sessionId: 'sess-1',
    source: 'unit',
    route: '/',
    messageCount: 2,
    expectedBotCharsMax: 5_000,
    isLoading: false,
    loadingVariant: null,
    panelState: 'content',
    showInitialHome: false,
    shouldSuspendVirtualizedList: false,
    panelVisible: true,
    mainPanelChars: 0,
    rowCount: 0,
    visibleRowCount: 0,
    botNodeCount: 0,
    visibleBotNodeCount: 0,
    visibleBotWithCharsCount: 0,
    botCharsMax: 0,
    dossierNodeVisible: false,
    controlledErrorVisible: false,
    emptyStateVisible: false,
    loadingOverlayVisible: false,
    inlineBubbleVisible: false,
    centerElementTag: null,
    centerElementTestId: 'messages-viewport-placeholder',
    centerElementRole: null,
    centerElementClass: null,
    suspendedViewportVisible: false,
    placeholderVisible: true,
    heroFallbackVisible: false,
    scrollerHeight: 0,
    scrollerScrollHeight: 0,
    scrollerScrollTop: 0,
    panelRect: { width: 900, height: 600, top: 0, left: 0, inViewport: true },
    reason: 'stuck-viewport-placeholder',
    blankDetected: true,
    ...partial,
  };
}

describe('postWaterfallHandoff', () => {
  it('não zera forceStatic ao iniciar loading quando o dossiê já tem >= 4000 chars', () => {
    expect(
      shouldResetForceStaticOnLoadingStart({
        expectedBotCharsMax: 5_000,
        isLoading: true,
        wasLoading: false,
      }),
    ).toBe(false);
  });

  it('zera forceStatic ao iniciar loading quando o volume ainda é pequeno', () => {
    expect(
      shouldResetForceStaticOnLoadingStart({
        expectedBotCharsMax: 500,
        isLoading: true,
        wasLoading: false,
      }),
    ).toBe(true);
  });

  it('aplica forceStatic proativo para sessão ativa com dossiê grande', () => {
    expect(
      shouldApplyProactiveForceStatic({
        expectedBotCharsMax: 4_000,
        showInitialHome: false,
        sessionId: 'sess-1',
      }),
    ).toBe(true);
  });

  it('detecta handoff preso em placeholder com overlay ausente', () => {
    expect(isPostWaterfallStuckHandoff(snapshot({ placeholderVisible: true }))).toBe(true);
  });

  it('detecta painel branco quando bot tem texto mas nenhum nó visível', () => {
    expect(
      isPostWaterfallStuckHandoff(
        snapshot({
          placeholderVisible: false,
          centerElementTestId: null,
          botNodeCount: 1,
          botCharsMax: 25_154,
          visibleBotNodeCount: 0,
          visibleBotWithCharsCount: 0,
          reason: 'bot-nodes-have-no-visible-chars',
          blankDetected: true,
        }),
      ),
    ).toBe(true);
  });

  it('ignora handoff preso enquanto overlay ainda está visível', () => {
    expect(isPostWaterfallStuckHandoff(snapshot({ loadingOverlayVisible: true, placeholderVisible: true }))).toBe(
      false,
    );
  });

  describe('isOverlayStuckPostWaterfall', () => {
    it('detecta overlay preso com isLoading=false', () => {
      expect(isOverlayStuckPostWaterfall(snapshot({ loadingOverlayVisible: true, isLoading: false }))).toBe(true);
    });

    it('ignora overlay quando isLoading=true', () => {
      expect(isOverlayStuckPostWaterfall(snapshot({ loadingOverlayVisible: true, isLoading: true }))).toBe(false);
    });

    it('ignora quando overlay não está visível', () => {
      expect(isOverlayStuckPostWaterfall(snapshot({ loadingOverlayVisible: false }))).toBe(false);
    });
  });
});
