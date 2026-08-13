// utils/finalizeWaterfallUI.ts
// Função centralizada para zerar atomicamente todos os estados de loading
// quando o waterfall termina (completed/failed/partial).
//
// Motivação: PR #334 e PR #335 corrigiram o overlay hero, mas outros estados

import * as Sentry from '@sentry/react';
// de UI (spinner "Preparando investigação...", botão Interromper, composer disabled)
// permaneciam ativos porque cada um era controlado por uma variável diferente.
// Esta função garante invariante: se waterfall terminou e botMsgTextLen > 0,
// NENHUM elemento de loading pode persistir na UI.

export interface WaterfallUIStore {
  setIsLoading?: (value: boolean) => void;
  setLoadingVariant?: (variant: 'hero' | 'inline' | 'hero-override' | undefined) => void;
  completeLoadingProgress?: () => void;
  setFailureCount?: (value: number) => void;
  activeGenerationRef?: { current: Record<string, string> };
}

export interface FinalizeWaterfallUIParams {
  store: WaterfallUIStore;
  sessionId: string;
  reason: string;
  waterfallEndStatus: string;
  botMsgTextLen: number;
  /** Função de log — tipicamente scoutDiag.info */
  log?: (area: string, event: string, payload: Record<string, unknown>) => void;
}

export function finalizeWaterfallUI(params: FinalizeWaterfallUIParams): void {
  const { store, sessionId, reason, waterfallEndStatus, botMsgTextLen, log } = params;

  // 1. Zera React state de loading
  store.setIsLoading?.(false);
  store.setLoadingVariant?.(undefined);
  store.completeLoadingProgress?.();
  store.setFailureCount?.(0);

  // 2. DOM safety net: esconde overlay e elementos de loading via seletores diretos.
  //    requestAnimationFrame garante execução após o commit do React, sem bloquear.
  if (typeof document !== 'undefined') {
    const HIDE_SELECTORS = [
      '[data-testid="loading-smart-overlay"]',
      '[data-testid="inline-loading-bubble"]',
      '[data-testid="messages-viewport-suspended"]',
      '[data-testid="loading-stop-button"]',
    ];

    const hideLoadingDOM = () => {
      for (const sel of HIDE_SELECTORS) {
        document.querySelector<HTMLElement>(sel)?.style.setProperty('display', 'none');
      }
    };

    // Após o React commitar o re-render (isLoading=false → unmount LoadingSmart)
    requestAnimationFrame(() => {
      hideLoadingDOM();
      // Duplo RAF: garante que passou pelo ciclo completo de paint
      requestAnimationFrame(hideLoadingDOM);
    });
  }

  // 5. Log ui-finalize-state com todos os booleanos para diagnóstico
  if (log) {
    const snapshot = () => {
      if (typeof document === 'undefined') return {};
      return {
        domHasOverlay: Boolean(document.querySelector('[data-testid="loading-smart-overlay"]')),
        domHasInlineBubble: Boolean(document.querySelector('[data-testid="inline-loading-bubble"]')),
        domHasSuspended: Boolean(document.querySelector('[data-testid="messages-viewport-suspended"]')),
        domHasStopButton: Boolean(document.querySelector('[data-testid="loading-stop-button"]')),
        domComposerDisabled: Boolean(
          (
            document.querySelector('[data-testid="chat-input"], [data-testid="composer-input"]') as
              | HTMLInputElement
              | HTMLTextAreaElement
              | null
          )?.disabled,
        ),
      };
    };

    log('WaterfallLifecycle', 'ui-finalize-state', {
      sessionId,
      reason,
      waterfallEndStatus,
      botMsgTextLen,
      // NOTA: valores abaixo sao o estado INTENDED apos finalize, nao leitura real.
      // Para estado real pos-render, ver ui-finalize-post-render e LoadingStuckProbe.
      intendedIsLoading: false,
      intendedLoadingVariant: null,
      intendedComposerDisabled: false,
      intendedStopButtonVisible: false,
      intendedPanelState: botMsgTextLen > 0 ? 'content' : 'error',
      intendedSuspendedViewportVisible: false,
      ...snapshot(),
    });

    // Log pós-render: verifica DOM após React ter chance de re-renderizar
    setTimeout(() => {
      const dom = snapshot();
      log('WaterfallLifecycle', 'ui-finalize-post-render', {
        sessionId,
        ...dom,
      });

      if (dom.domHasOverlay || dom.domHasInlineBubble || dom.domComposerDisabled || dom.domHasStopButton) {
        Sentry.captureMessage('Scout360 waterfall UI leak — loading elements still visible post-render', {
          level: 'warning',
          tags: {
            area: 'waterfall-ui-leak',
            session_id: sessionId,
            waterfall_end_status: waterfallEndStatus ?? 'unknown',
          },
          extra: dom as unknown as Record<string, unknown>,
        });
      }
    }, 600);
  }
}
