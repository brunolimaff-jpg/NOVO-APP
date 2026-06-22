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
  setLoadingVariant?: (variant: 'hero' | 'inline' | undefined) => void;
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

const INLINE_LOADING_BUBBLE_SELECTOR = '[data-testid="inline-loading-bubble"]';
const BOT_MESSAGE_CONTENT_SELECTOR = '[data-testid="bot-message-content"]';

const ALWAYS_HIDE_SELECTORS = [
  '[data-testid="loading-smart-overlay"]',
  '[data-testid="messages-viewport-suspended"]',
  '[data-testid="loading-stop-button"]',
] as const;

function isDomElementVisible(element: Element | null): boolean {
  if (!element || typeof window === 'undefined') return false;
  const style = window.getComputedStyle(element);
  const opacity = Number(style.opacity || '1');
  if (style.display === 'none' || style.visibility === 'hidden' || opacity <= 0.01) return false;
  const htmlEl = element as HTMLElement;
  const rect = element.getBoundingClientRect();
  const width = Math.max(rect.width, htmlEl.offsetWidth);
  const height = Math.max(rect.height, htmlEl.offsetHeight);
  if (width > 0 && height > 0) return true;
  return Boolean(element.textContent?.trim());
}

function isBotMessageContentVisible(): boolean {
  if (typeof document === 'undefined') return false;
  return isDomElementVisible(document.querySelector(BOT_MESSAGE_CONTENT_SELECTOR));
}

function hideElement(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.style.setProperty('display', 'none');
}

function hideInlineLoadingBubbleIfSafe(botMsgTextLen: number): void {
  if (botMsgTextLen > 0 && !isBotMessageContentVisible()) return;
  hideElement(INLINE_LOADING_BUBBLE_SELECTOR);
}

function hideLoadingDOM(botMsgTextLen: number): void {
  for (const sel of ALWAYS_HIDE_SELECTORS) {
    hideElement(sel);
  }
  hideInlineLoadingBubbleIfSafe(botMsgTextLen);
}

export function finalizeWaterfallUI(params: FinalizeWaterfallUIParams): void {
  const { store, sessionId, reason, waterfallEndStatus, botMsgTextLen, log } = params;

  // 1. Zera React state de loading
  store.setIsLoading?.(false);
  store.setLoadingVariant?.(undefined);
  store.completeLoadingProgress?.();
  store.setFailureCount?.(0);

  // 2. DOM safety net: esconde overlay e elementos de loading via seletores diretos.
  //    inline-loading-bubble só some quando bot-message-content está visível (ou não há dossiê).
  if (typeof document !== 'undefined') {
    let rafA: number | null = null;
    let rafB: number | null = null;
    let inlinePollTimer: number | null = null;
    let inlinePollAttempts = 0;
    const maxInlinePollAttempts = 40;

    const scheduleInlineBubblePoll = () => {
      if (botMsgTextLen <= 0 || isBotMessageContentVisible()) {
        hideInlineLoadingBubbleIfSafe(botMsgTextLen);
        return;
      }
      if (inlinePollAttempts >= maxInlinePollAttempts) return;

      inlinePollAttempts += 1;
      inlinePollTimer = window.setTimeout(() => {
        hideInlineLoadingBubbleIfSafe(botMsgTextLen);
        if (!isBotMessageContentVisible() && inlinePollAttempts < maxInlinePollAttempts) {
          scheduleInlineBubblePoll();
        }
      }, 300);
    };

    const runHidePass = () => hideLoadingDOM(botMsgTextLen);

    rafA = requestAnimationFrame(() => {
      runHidePass();
      rafB = requestAnimationFrame(runHidePass);
      inlinePollTimer = window.setTimeout(scheduleInlineBubblePoll, 600);
    });

    void rafA;
    void rafB;
    void inlinePollTimer;
  }

  // 5. Log ui-finalize-state com todos os booleanos para diagnóstico
  if (log) {
    const snapshot = () => {
      if (typeof document === 'undefined') return {};
      return {
        domHasOverlay: Boolean(document.querySelector('[data-testid="loading-smart-overlay"]')),
        domHasInlineBubble: Boolean(document.querySelector(INLINE_LOADING_BUBBLE_SELECTOR)),
        domHasBotContent: isBotMessageContentVisible(),
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
