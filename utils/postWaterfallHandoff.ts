import type { BlankPanelSnapshot } from './blankPanelTelemetry';

export const POST_WATERFALL_WATCHDOG_MS = 2_000;

/** Overlay ausente, mas painel ainda em placeholder/suspended com dossiê grande esperado. */
export function isPostWaterfallStuckHandoff(snapshot: BlankPanelSnapshot | null): boolean {
  if (!snapshot) return false;
  if (snapshot.isLoading || snapshot.showInitialHome || snapshot.shouldSuspendVirtualizedList) return false;
  if (snapshot.loadingOverlayVisible) return false;
  return snapshot.blankDetected || snapshot.placeholderVisible || snapshot.suspendedViewportVisible;
}

/** Overlay preso: visível mesmo com isLoading=false após waterfall (desync store/DOM). */
export function isOverlayStuckPostWaterfall(snapshot: BlankPanelSnapshot | null): boolean {
  if (!snapshot) return false;
  if (snapshot.isLoading || snapshot.showInitialHome) return false;
  return snapshot.loadingOverlayVisible;
}

export function buildHandoffPanelDiag(
  domSnapshot: BlankPanelSnapshot | null,
  ui: {
    shouldSuspendVirtualizedList: boolean;
    expectedBotCharsMax: number;
  },
): Record<string, unknown> {
  return {
    shouldSuspendVirtualizedList: ui.shouldSuspendVirtualizedList,
    expectedBotCharsMax: ui.expectedBotCharsMax,
    centerElementTestId: domSnapshot?.centerElementTestId ?? null,
    suspendedViewportVisible: domSnapshot?.suspendedViewportVisible ?? false,
    placeholderVisible: domSnapshot?.placeholderVisible ?? false,
    loadingOverlayVisible: domSnapshot?.loadingOverlayVisible ?? false,
  };
}
