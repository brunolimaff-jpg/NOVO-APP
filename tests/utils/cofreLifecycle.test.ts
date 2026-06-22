import { describe, expect, it, vi } from 'vitest';
import * as cofreLifecycle from '../../utils/cofreLifecycle';

const readySnapshot = {
  generationKind: 'dossier' as const,
  storeIsLoading: false,
  composerDisabled: false,
  blankPanelDetected: false,
  panelVisible: true,
  visibleBotWithCharsCount: 1,
  botTextMaxLen: 12_000,
  scrollerHeight: 640,
};

describe('cofreLifecycle', () => {
  it('nunca exibe mais modulos concluidos do que o total', () => {
    expect(cofreLifecycle.resolveCofreTotalStageCount(7, 8, 8)).toBe(8);
    expect(cofreLifecycle.resolveCofreTotalStageCount(undefined, 0, 0)).toBe(1);
  });

  it('reconhece apenas render real de dossiê como pronto', () => {
    expect(typeof cofreLifecycle.isCofreRenderReady).toBe('function');
    expect(cofreLifecycle.isCofreRenderReady(readySnapshot)).toBe(true);
    expect(cofreLifecycle.isCofreRenderReady({ ...readySnapshot, generationKind: 'follow_up' })).toBe(false);
    expect(cofreLifecycle.isCofreRenderReady({ ...readySnapshot, storeIsLoading: true })).toBe(false);
    expect(cofreLifecycle.isCofreRenderReady({ ...readySnapshot, composerDisabled: true })).toBe(false);
    expect(cofreLifecycle.isCofreRenderReady({ ...readySnapshot, blankPanelDetected: true })).toBe(false);
    expect(cofreLifecycle.isCofreRenderReady({ ...readySnapshot, panelVisible: false })).toBe(false);
    expect(cofreLifecycle.isCofreRenderReady({ ...readySnapshot, visibleBotWithCharsCount: 0 })).toBe(false);
    expect(cofreLifecycle.isCofreRenderReady({ ...readySnapshot, botTextMaxLen: 0 })).toBe(false);
    expect(cofreLifecycle.isCofreRenderReady({ ...readySnapshot, scrollerHeight: 0 })).toBe(true);
  });

  it('emite o evento de prontidão com a sessão correta', () => {
    const listener = vi.fn();
    window.addEventListener(cofreLifecycle.COFRE_RENDER_READY_EVENT, listener);

    cofreLifecycle.dispatchCofreRenderReady('session-1');

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ sessionId: 'session-1' });
    window.removeEventListener(cofreLifecycle.COFRE_RENDER_READY_EVENT, listener);
  });
});
