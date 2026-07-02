import type { BlankPanelSnapshot } from './blankPanelTelemetry';
import { LARGE_DOSSIER_STATIC_FALLBACK_CHARS } from './expectedBotContent';

export const POST_WATERFALL_WATCHDOG_MS = 2_000;

export interface ForceStaticResetContext {
  expectedBotCharsMax: number;
  isLoading: boolean;
  wasLoading: boolean;
}

export type TimelineRecoveryMode = 'none' | 'remount-virtualized' | 'static-fallback';

export function shouldResetForceStaticOnLoadingStart(ctx: ForceStaticResetContext): boolean {
  if (!ctx.isLoading || ctx.wasLoading) return false;
  return ctx.expectedBotCharsMax < LARGE_DOSSIER_STATIC_FALLBACK_CHARS;
}

export function shouldApplyProactiveForceStatic(params: {
  expectedBotCharsMax: number;
  showInitialHome: boolean;
  sessionId: string | null | undefined;
  isLoading?: boolean;
}): boolean {
  // BUG-8 v4: não ativar static-fallback proativo durante waterfall/preview.
  if (params.isLoading) return false;
  return (
    Boolean(params.sessionId) &&
    !params.showInitialHome &&
    params.expectedBotCharsMax >= LARGE_DOSSIER_STATIC_FALLBACK_CHARS
  );
}

function hasTimelineRecoverySignal(snapshot: BlankPanelSnapshot): boolean {
  if (snapshot.blankDetected || snapshot.placeholderVisible || snapshot.suspendedViewportVisible) return true;

  const panelHasAlmostNoContent =
    snapshot.mainPanelChars < Math.min(800, Math.max(200, snapshot.expectedBotCharsMax / 10));
  if (snapshot.botNodeCount === 0 && panelHasAlmostNoContent) return true;
  if (snapshot.messageCount <= 3 && snapshot.visibleBotWithCharsCount === 0 && panelHasAlmostNoContent) return true;

  return snapshot.panelVisible && snapshot.rowCount > 0 && snapshot.visibleRowCount === 0;
}

export function decideTimelineRecoveryMode(snapshot: BlankPanelSnapshot | null): TimelineRecoveryMode {
  if (!snapshot) return 'none';
  if (!snapshot.sessionId || snapshot.expectedBotCharsMax <= 0 || snapshot.messageCount <= 0) return 'none';
  if (snapshot.isLoading || snapshot.showInitialHome || snapshot.shouldSuspendVirtualizedList) return 'none';
  if (
    snapshot.loadingOverlayVisible ||
    snapshot.inlineBubbleVisible ||
    snapshot.controlledErrorVisible ||
    snapshot.emptyStateVisible
  ) {
    return 'none';
  }
  if (!hasTimelineRecoverySignal(snapshot)) return 'none';

  return snapshot.expectedBotCharsMax >= LARGE_DOSSIER_STATIC_FALLBACK_CHARS
    ? 'static-fallback'
    : 'remount-virtualized';
}

/** Overlay ausente, mas painel ainda em placeholder/suspended com dossiê grande esperado. */
export function isPostWaterfallStuckHandoff(snapshot: BlankPanelSnapshot | null): boolean {
  if (!snapshot) return false;
  if (snapshot.expectedBotCharsMax < LARGE_DOSSIER_STATIC_FALLBACK_CHARS) return false;
  if (snapshot.isLoading || snapshot.showInitialHome || snapshot.shouldSuspendVirtualizedList) return false;
  if (snapshot.loadingOverlayVisible) return false;
  return snapshot.blankDetected || snapshot.placeholderVisible || snapshot.suspendedViewportVisible;
}

/** Overlay preso: visível mesmo com isLoading=false após waterfall (desync store/DOM). */
export function isOverlayStuckPostWaterfall(snapshot: BlankPanelSnapshot | null): boolean {
  if (!snapshot) return false;
  if (snapshot.expectedBotCharsMax < LARGE_DOSSIER_STATIC_FALLBACK_CHARS) return false;
  if (snapshot.isLoading || snapshot.showInitialHome) return false;
  return snapshot.loadingOverlayVisible;
}

export function buildHandoffPanelDiag(
  domSnapshot: BlankPanelSnapshot | null,
  ui: {
    shouldSuspendVirtualizedList: boolean;
    forceStaticTimelineFallback: boolean;
    expectedBotCharsMax: number;
  },
): Record<string, unknown> {
  return {
    shouldSuspendVirtualizedList: ui.shouldSuspendVirtualizedList,
    forceStaticTimelineFallback: ui.forceStaticTimelineFallback,
    expectedBotCharsMax: ui.expectedBotCharsMax,
    centerElementTestId: domSnapshot?.centerElementTestId ?? null,
    suspendedViewportVisible: domSnapshot?.suspendedViewportVisible ?? false,
    placeholderVisible: domSnapshot?.placeholderVisible ?? false,
    loadingOverlayVisible: domSnapshot?.loadingOverlayVisible ?? false,
  };
}
