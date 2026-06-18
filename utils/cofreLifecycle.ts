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

export function isCofreRenderReady(snapshot: CofreRenderSnapshot): boolean {
  return (
    snapshot.generationKind === 'dossier' &&
    !snapshot.storeIsLoading &&
    !snapshot.composerDisabled &&
    !snapshot.blankPanelDetected &&
    snapshot.panelVisible &&
    snapshot.visibleBotWithCharsCount > 0 &&
    snapshot.botTextMaxLen > 0 &&
    snapshot.scrollerHeight > 0
  );
}

export function dispatchCofreRenderReady(sessionId: string): void {
  window.dispatchEvent(
    new CustomEvent<CofreRenderReadyDetail>(COFRE_RENDER_READY_EVENT, {
      detail: { sessionId },
    }),
  );
}
