export type GenerationKind = 'dossier' | 'follow_up' | 'deep_dive' | null;

export const COFRE_RENDER_READY_EVENT = 'scout:cofre-render-ready';

export interface CofreRenderReadyDetail {
  sessionId: string;
}

export interface CofreRenderSnapshot {
  generationKind: GenerationKind;
  storeIsLoading: boolean;
  composerDisabled: boolean;
  blankPanelDetected: boolean;
  panelVisible: boolean;
  visibleBotWithCharsCount: number;
  botTextMaxLen: number;
  scrollerHeight: number;
}

export function resolveGenerationKind(requestKind: 'default' | 'deep_dive', isFollowUp: boolean): GenerationKind {
  if (requestKind === 'deep_dive') return 'deep_dive';
  return isFollowUp ? 'follow_up' : 'dossier';
}

export function resolveCofreTotalStageCount(
  configuredTotal: number | undefined,
  completedCount: number,
  renderedStageCount: number,
): number {
  return Math.max(configuredTotal ?? 0, completedCount, renderedStageCount, 1);
}

export function isCofreRenderReady(snapshot: CofreRenderSnapshot): boolean {
  // scrollerHeight cobre Virtuoso; timeline estática (messages-static-fallback) não tem
  // [data-virtuoso-scroller]. botTextMaxLen > 0 prova que existe texto no DOM,
  // mesmo que o viewport-check de visibleBotWithCharsCount falhe (container com height:0
  // no primeiro paint pós-waterfall).
  const hasBotContent = snapshot.botTextMaxLen > 0;
  const timelineReady = snapshot.scrollerHeight > 0 || (snapshot.visibleBotWithCharsCount > 0 && hasBotContent);

  return (
    snapshot.generationKind === 'dossier' &&
    !snapshot.storeIsLoading &&
    !snapshot.composerDisabled &&
    !snapshot.blankPanelDetected &&
    snapshot.panelVisible &&
    (snapshot.visibleBotWithCharsCount > 0 || hasBotContent) &&
    hasBotContent &&
    timelineReady
  );
}

export function dispatchCofreRenderReady(sessionId: string): void {
  window.dispatchEvent(
    new CustomEvent<CofreRenderReadyDetail>(COFRE_RENDER_READY_EVENT, {
      detail: { sessionId },
    }),
  );
}
