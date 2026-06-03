import type { BlankPanelSnapshot } from './blankPanelTelemetry';
import { LARGE_DOSSIER_STATIC_FALLBACK_CHARS } from './expectedBotContent';

export const POST_WATERFALL_WATCHDOG_MS = 2_000;

export interface ForceStaticResetContext {
  expectedBotCharsMax: number;
  isLoading: boolean;
  wasLoading: boolean;
}

export function shouldResetForceStaticOnLoadingStart(ctx: ForceStaticResetContext): boolean {
  if (!ctx.isLoading || ctx.wasLoading) return false;
  return ctx.expectedBotCharsMax < LARGE_DOSSIER_STATIC_FALLBACK_CHARS;
}

export function shouldApplyProactiveForceStatic(params: {
  expectedBotCharsMax: number;
  showInitialHome: boolean;
  sessionId: string | null | undefined;
}): boolean {
  return (
    Boolean(params.sessionId) &&
    !params.showInitialHome &&
    params.expectedBotCharsMax >= LARGE_DOSSIER_STATIC_FALLBACK_CHARS
  );
}

/** Overlay ausente, mas painel ainda em placeholder/suspended com dossiê grande esperado. */
export function isPostWaterfallStuckHandoff(snapshot: BlankPanelSnapshot | null): boolean {
  if (!snapshot) return false;
  if (snapshot.expectedBotCharsMax < LARGE_DOSSIER_STATIC_FALLBACK_CHARS) return false;
  if (snapshot.isLoading || snapshot.showInitialHome || snapshot.shouldSuspendVirtualizedList) return false;
  if (snapshot.loadingOverlayVisible) return false;
  return snapshot.placeholderVisible || snapshot.suspendedViewportVisible;
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
