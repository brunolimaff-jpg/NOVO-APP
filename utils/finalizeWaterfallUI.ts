// utils/finalizeWaterfallUI.ts
// Função centralizada para zerar atomicamente todos os estados de loading
// quando o waterfall termina (completed/failed/partial).
//
// Motivação: PR #334 e PR #335 corrigiram o overlay hero, mas outros estados
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
  abortControllerRef?: { current: AbortController | null };
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

  // 2. Limpa refs de geração ativa
  if (store.activeGenerationRef?.current) {
    const botId = store.activeGenerationRef.current[sessionId];
    if (botId) {
      delete store.activeGenerationRef.current[sessionId];
    }
  }

  // 3. Cancela e limpa abort controller
  if (store.abortControllerRef?.current) {
    try {
      store.abortControllerRef.current.abort();
    } catch {
      // abort pode lançar se já cancelado — seguro ignorar
    }
    store.abortControllerRef.current = null;
  }

  // 4. DOM cleanup: esconde overlay e elementos de loading se React ainda não removeu.
  //    setTimeout garante que o check roda DEPOIS do ciclo de render do React.
  if (typeof document !== 'undefined') {
    const hideLoadingDOM = () => {
      // Overlay principal
      const overlay = document.querySelector<HTMLElement>('[data-testid="loading-smart-overlay"]');
      if (overlay) overlay.style.display = 'none';

      // Viewport suspenso (spinner "Preparando investigação...")
      const suspended = document.querySelector<HTMLElement>('[data-testid="messages-viewport-suspended"]');
      if (suspended) suspended.style.display = 'none';

      // Botão Interromper dentro do overlay (fallback se overlay não foi escondido)
      const stopBtn = document.querySelector<HTMLElement>('[data-testid="loading-stop-button"]');
      if (stopBtn) stopBtn.style.display = 'none';

      // Textos de loading residuais
      const loadingTexts = ['Consolidando informações', 'Preparando investigação', 'Gerando resposta'];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodesToHide: Text[] = [];
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        for (const text of loadingTexts) {
          if (node.textContent?.includes(text)) {
            nodesToHide.push(node);
            break;
          }
        }
      }
      for (const n of nodesToHide) {
        const parent = n.parentElement;
        if (parent && !parent.closest('[data-testid="bot-message-content"]')) {
          parent.style.display = 'none';
        }
      }
    };

    // Imediato: pega overlay antes do React re-render
    hideLoadingDOM();
    // Deferido: pega overlay se React não removeu após re-render
    setTimeout(hideLoadingDOM, 100);
    setTimeout(hideLoadingDOM, 500);
  }

  // 5. Log ui-finalize-state com todos os booleanos para diagnóstico
  if (log) {
    const snapshot = () => {
      if (typeof document === 'undefined') return {};
      return {
        domHasOverlay: Boolean(document.querySelector('[data-testid="loading-smart-overlay"]')),
        domHasSuspended: Boolean(document.querySelector('[data-testid="messages-viewport-suspended"]')),
        domHasStopButton: Boolean(document.querySelector('[data-testid="loading-stop-button"]')),
        domComposerDisabled: Boolean(
          (document.querySelector('[data-testid="composer-input"]') as HTMLInputElement)?.disabled,
        ),
        domBodyContainsLoading: /Consolidando|Preparando|Gerando resposta/i.test(
          document.body?.textContent || '',
        ),
      };
    };

    log('WaterfallLifecycle', 'ui-finalize-state', {
      sessionId,
      reason,
      waterfallEndStatus,
      botMsgTextLen,
      isLoading: false,
      loadingVariant: null,
      hasAbortController: false,
      composerDisabled: false,
      stopButtonVisible: false,
      panelState: botMsgTextLen > 0 ? 'content' : 'error',
      suspendedViewportVisible: false,
      ...snapshot(),
    });

    // Log pós-render: verifica DOM após React ter chance de re-renderizar
    setTimeout(() => {
      log('WaterfallLifecycle', 'ui-finalize-post-render', {
        sessionId,
        ...snapshot(),
      });
    }, 600);
  }
}
