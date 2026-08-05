import { scoutDiag } from '../../utils/diagnosticLog';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { ChatMode } from '../../constants';
import type { AppError, ChatSession, DossierWaterfallResult, Feedback, FeedbackSubmissionOptions, Message } from '../../types';
import { Sender } from '../../types';
import EmptyStateHome from '../EmptyStateHome';
import GreetingWelcomeScreen from '../GreetingWelcomeScreen';
import HelpCenterFloating from '../HelpCenterFloating';
import MessageRow, { type MessageRowData } from '../MessageRow';
import { parseSmartOptions } from '../SmartOptions';
import type { ChatTheme, StartInvestigationPayload } from './contracts';

interface MessageTimelineProps {
  currentSession: ChatSession | null;
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  isDarkMode: boolean;
  mode: ChatMode;
  showOperatorGate: boolean;
  showInitialHome: boolean;
  shouldSuspendVirtualizedList: boolean;
  forceStaticTimelineFallback?: boolean;
  onConfirmOperatorName: (name: string, email: string, existingOperatorId?: string) => void;
  onStartInvestigation: (payload: StartInvestigationPayload) => Promise<void>;
  onLoadMore: () => void;
  onRetry: () => void;
  onDeleteMessage?: (id: string) => void;
  onReportError?: (messageId: string, error: AppError) => void;
  onFeedback: (messageId: string, feedback: Feedback) => void;
  onSendFeedback: (
    messageId: string,
    feedback: Feedback,
    comment: string,
    content: string,
    options?: FeedbackSubmissionOptions,
  ) => void;
  onToggleMessageSources: (messageId: string) => void;
  onDeepDive?: (displayMessage: string, hiddenPrompt: string) => Promise<DossierWaterfallResult | null | undefined>;
  onRegenerateSuggestions: (messageId: string) => void;
  onPrefillComposer: (text: string) => void;
  operatorId?: string;
  processing?: {
    stage?: string;
    completedStages?: string[];
    failureCount?: number;
    totalStages?: number;
  };
  lastUserQuery?: string;
  onStop?: () => void;
  onSendMessage: (text: string) => void;
  loadingPinnedLabel?: string | null;
  canDeepDive: boolean;
  theme: ChatTheme;
}

const MessageTimeline: React.FC<MessageTimelineProps> = ({
  currentSession,
  messages,
  isLoading,
  hasMore,
  isDarkMode,
  mode,
  showOperatorGate,
  showInitialHome,
  shouldSuspendVirtualizedList,
  forceStaticTimelineFallback = false,
  onConfirmOperatorName,
  onStartInvestigation,
  onLoadMore,
  onRetry,
  onDeleteMessage,
  onReportError,
  onFeedback,
  onSendFeedback,
  onToggleMessageSources,
  onDeepDive,
  onRegenerateSuggestions,
  onPrefillComposer,
  operatorId,
  processing,
  lastUserQuery,
  onStop,
  onSendMessage,
  loadingPinnedLabel,
  canDeepDive,
  theme,
}) => {
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportReadySignatureRef = useRef('');
  const [isMessagesViewportReady, setIsMessagesViewportReady] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const safeMessages = Array.isArray(messages) ? messages : [];
  const shouldRenderStaticTimelineFallback = forceStaticTimelineFallback;
  const shouldRenderSuspendedViewport = shouldSuspendVirtualizedList && !shouldRenderStaticTimelineFallback;
  const safeMessagesLengthRef = useRef(safeMessages.length);
  safeMessagesLengthRef.current = safeMessages.length;

  // ── Instrumentação: detecta timeline renderizando vazia ──
  const prevTimelineLenRef = useRef(safeMessages.length);
  useEffect(() => {
    const prev = prevTimelineLenRef.current;
    const curr = safeMessages.length;
    prevTimelineLenRef.current = curr;

    if (
      prev > 0 &&
      curr === 0 &&
      !showInitialHome &&
      !shouldRenderSuspendedViewport &&
      !shouldRenderStaticTimelineFallback &&
      !isLoading
    ) {
      console.error(
        '[Scout360][MessageTimeline] ⚠ Timeline renderizando VAZIA',
        JSON.stringify({
          sessionId: currentSession?.id,
          before: prev,
          after: curr,
          showInitialHome,
          shouldSuspendVirtualizedList: shouldRenderSuspendedViewport,
          forceStaticTimelineFallback: shouldRenderStaticTimelineFallback,
          isDarkMode,
        }),
      );
    }
  }, [
    safeMessages.length,
    showInitialHome,
    shouldRenderSuspendedViewport,
    shouldRenderStaticTimelineFallback,
    isLoading,
    currentSession?.id,
    isDarkMode,
  ]);

  // Overscan tuned per content type:
  // - Messages with teia societária (SocietaryMap) use a reduced overscan to avoid
  //   triggering SocietaryMap remounts + heavy QSA batch calls while scrolling.
  // - Long dossiers without teia use 1400 to prevent Mermaid remounts.
  const virtuosoOverscan = useMemo(() => {
    const hasTeia = safeMessages.some(
      m => m.sender === Sender.Bot && typeof m.text === 'string' && /teia\s+societ[aá]ria/i.test(m.text),
    );
    if (hasTeia) return 600;
    const hasDossier = safeMessages.some(m => m.sender === Sender.Bot && (m.text?.length ?? 0) > 3000);
    return hasDossier ? 1400 : 400;
  }, [safeMessages]);

  const handleDeleteWithUndo = useCallback(
    (messageId: string) => {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(messageId);
      pendingDeleteTimerRef.current = setTimeout(() => {
        onDeleteMessage?.(messageId);
        setPendingDeleteId(null);
      }, 5000);
    },
    [onDeleteMessage],
  );

  useEffect(() => {
    return () => {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    };
  }, []);

  // ── Virtuoso diagnostic mount/unmount ──
  useEffect(() => {
    if (!isMessagesViewportReady) return;
    const viewport = messagesViewportRef.current;
    scoutDiag.info('Virtuoso', 'virtuoso:mount', {
      viewportWidth: viewport?.clientWidth ?? 0,
      viewportHeight: viewport?.clientHeight ?? 0,
      totalItems: safeMessagesLengthRef.current,
      overscan: virtuosoOverscan,
    });
    return () => {
      scoutDiag.info('Virtuoso', 'virtuoso:unmount', {
        totalItems: safeMessages.length,
      });
    };
  }, [isMessagesViewportReady]);

  const handleRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      scoutDiag.info('Virtuoso', 'virtuoso:itemsRendered', {
        firstIndex: range.startIndex,
        lastIndex: range.endIndex,
        totalItems: safeMessages.length,
      });
    },
    [safeMessages.length],
  );

  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    scoutDiag.info('Virtuoso', 'virtuoso:atBottomStateChange', {
      atBottom,
    });
  }, []);

  const lastBotWithSuggestionsIndex = useMemo(
    () =>
      [...safeMessages]
        .map((message, index) => ({ message, index }))
        .filter(
          ({ message }) =>
            message.sender === Sender.Bot &&
            ((message.suggestions && message.suggestions.length > 0) ||
              parseSmartOptions(message.text).options.length > 0),
        )
        .map(({ index }) => index)
        .pop(),
    [safeMessages],
  );

  const lastUserIndex = useMemo(
    () =>
      [...safeMessages]
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => message.sender === Sender.User)
        .map(({ index }) => index)
        .pop(),
    [safeMessages],
  );

  useEffect(() => {
    if (showInitialHome || shouldRenderSuspendedViewport || shouldRenderStaticTimelineFallback) {
      setIsMessagesViewportReady(false);
      return;
    }

    const viewport = messagesViewportRef.current;
    if (!viewport) {
      // Container ainda não existe no DOM — não marca como ready.
      // O emergency timer (180ms) ou o ResizeObserver vão resolver quando o elemento aparecer.
      return;
    }

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let rafA: number | null = null;
    let rafB: number | null = null;
    let emergencyTimer: number | null = null;

    const readViewportMetrics = () => ({
      sessionId: currentSession?.id ?? null,
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
      offsetHeight: viewport.offsetHeight,
      scrollHeight: viewport.scrollHeight,
      totalItems: safeMessages.length,
      showInitialHome,
      shouldSuspendVirtualizedList: shouldRenderSuspendedViewport,
      forceStaticTimelineFallback: shouldRenderStaticTimelineFallback,
    });
    const hasValidSize = () => viewport.clientHeight > 0 && viewport.clientWidth > 0;
    const markReady = (reason: string) => {
      if (cancelled) return;

      const metrics = readViewportMetrics();
      const signature = `${reason}|${metrics.viewportWidth}|${metrics.viewportHeight}|${metrics.totalItems}`;
      if (viewportReadySignatureRef.current !== signature) {
        viewportReadySignatureRef.current = signature;
        const logPayload = { reason, ...metrics };
        if (metrics.viewportWidth <= 0 || metrics.viewportHeight <= 0) {
          scoutDiag.warn('Virtuoso', 'viewport-ready-with-invalid-size', logPayload);
        } else {
          scoutDiag.info('Virtuoso', 'viewport-ready', logPayload);
        }
      }

      setIsMessagesViewportReady(true);
    };

    setIsMessagesViewportReady(false);
    emergencyTimer = window.setTimeout(() => markReady('emergency-timer'), 180);

    if (hasValidSize()) {
      markReady('initial-size');
    } else if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (hasValidSize()) {
          markReady('resize-observer');
        }
      });
      observer.observe(viewport);
    }

    if (typeof window.requestAnimationFrame === 'function') {
      rafA = window.requestAnimationFrame(() => {
        if (typeof window.requestAnimationFrame === 'function') {
          rafB = window.requestAnimationFrame(() => markReady('double-raf'));
        }
      });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (rafA !== null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafA);
      }
      if (rafB !== null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafB);
      }
      if (emergencyTimer !== null) window.clearTimeout(emergencyTimer);
    };
  }, [currentSession?.id, shouldRenderStaticTimelineFallback, shouldRenderSuspendedViewport, showInitialHome]);

  const hideSuggestionsForMessageId =
    isLoading &&
    lastBotWithSuggestionsIndex !== undefined &&
    lastUserIndex !== undefined &&
    lastUserIndex > lastBotWithSuggestionsIndex
      ? (safeMessages[lastBotWithSuggestionsIndex]?.id ?? null)
      : null;

  const firstBotIndex = useMemo(
    () => safeMessages.findIndex(m => m.sender === Sender.Bot && !m.isError && !m.isThinking),
    [safeMessages],
  );

  const itemData = useMemo<MessageRowData>(
    () => ({
      messages: safeMessages,
      isLoading,
      isDarkMode,
      mode,
      onRetry,
      onDeleteMessage,
      onReportError,
      onFeedback,
      onSendFeedback,
      onToggleMessageSources,
      onDeepDive: canDeepDive && onDeepDive ? (display, hidden) => onDeepDive(display, hidden) : undefined,
      onRegenerateSuggestions,
      handleDeleteWithUndo,
      pendingDeleteId,
      hideSuggestionsForMessageId,
      setInput: onPrefillComposer,
      sessionId: currentSession?.id,
      userId: operatorId,
      processing,
      lastUserQuery,
      onStop,
      onSendMessage,
      empresaAlvo: currentSession?.empresaAlvo || null,
      cnpj: currentSession?.cnpj || null,
      loadingPinnedLabel,
      firstBotIndex,
    }),
    [
      safeMessages,
      isLoading,
      isDarkMode,
      mode,
      onRetry,
      onDeleteMessage,
      onReportError,
      onFeedback,
      onSendFeedback,
      onToggleMessageSources,
      canDeepDive,
      onDeepDive,
      onRegenerateSuggestions,
      handleDeleteWithUndo,
      pendingDeleteId,
      hideSuggestionsForMessageId,
      onPrefillComposer,
      currentSession?.id,
      operatorId,
      processing,
      lastUserQuery,
      onStop,
      onSendMessage,
      currentSession?.empresaAlvo,
      currentSession?.cnpj,
      loadingPinnedLabel,
      firstBotIndex,
    ],
  );

  const itemContent = useCallback((index: number) => <MessageRow index={index} data={itemData} />, [itemData]);

  useEffect(() => {
    if (!shouldRenderStaticTimelineFallback) return;

    const hasBotMessage = safeMessages.some(message => message.sender === Sender.Bot);
    const botMsg = safeMessages.find(message => message.sender === Sender.Bot);
    const hasLargeBot = hasBotMessage && (botMsg?.text?.length ?? 0) > 4000;

    if (import.meta.env.DEV) {
      scoutDiag.warn('Virtuoso', 'static-fallback-rendered', {
        sessionId: currentSession?.id ?? null,
        totalItems: safeMessages.length,
        hasBotMessage,
        botTextLen: botMsg?.text?.length ?? 0,
        hasLargeBot,
      });
    }

    // LayoutTrace: para dossiê grande, verificar se container tem dimensões válidas
    if (import.meta.env.DEV && hasLargeBot) {
      requestAnimationFrame(() => {
        import('../../utils/layoutTraceTelemetry')
          .then(({ traceLayout }) => {
            traceLayout(scoutDiag.info.bind(scoutDiag), 'static-fallback-mount', {
              sessionId: currentSession?.id ?? null,
              totalItems: safeMessages.length,
              botTextLen: botMsg?.text?.length ?? 0,
            });
          })
          .catch(() => {}); // falha silenciosa em testes
      });
      // PR #347: debug display:none — cadeia completa com múltiplos timings
      requestAnimationFrame(() => {
        import('../../utils/layoutTraceTelemetry')
          .then(({ debugStaticFallbackDisplay }) => {
            debugStaticFallbackDisplay(scoutDiag.warn.bind(scoutDiag), {
              sessionId: currentSession?.id ?? null,
              totalItems: safeMessages.length,
              botTextLen: botMsg?.text?.length ?? 0,
              source: 'MessageTimeline:static-fallback-rendered',
            });
          })
          .catch(() => {});
      });
    }

    // PR #347: safety net — se o static fallback montar com display:none,
    // força recovery. A origem exata do display:none não foi encontrada no
    // código (nem JS inline, nem CSS), mas o Supabase confirmou o estado
    // em sessão real de preview.
    const recoveryTimer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[data-testid="messages-static-fallback"]');
      if (!el) return;

      const cs = getComputedStyle(el);
      if (cs.display !== 'none') return;

      const previousDisplay = cs.display;
      const previousRect = el.getBoundingClientRect();

      // Passo 1: limpa inline style display (caso venha de style.display = 'none')
      el.style.display = '';

      const afterResetCs = getComputedStyle(el);
      let forcedDisplayApplied = false;

      // Passo 2: se ainda estiver none (veio de CSS cascade), força com !important
      if (afterResetCs.display === 'none') {
        el.style.setProperty('display', 'block', 'important');
        forcedDisplayApplied = true;
      }

      const afterRect = el.getBoundingClientRect();

      scoutDiag.warn('Virtuoso', 'static-fallback-display-recovery', {
        sessionId: currentSession?.id ?? null,
        previousDisplay,
        afterResetDisplay: afterResetCs.display,
        forcedDisplayApplied,
        previousRect: { w: Math.round(previousRect.width), h: Math.round(previousRect.height) },
        afterRect: { w: Math.round(afterRect.width), h: Math.round(afterRect.height) },
        hasBotMessage,
        botTextLen: botMsg?.text?.length ?? 0,
      } as unknown as Record<string, unknown>);
    }, 0);

    return () => clearTimeout(recoveryTimer);
  }, [currentSession?.id, safeMessages, shouldRenderStaticTimelineFallback]);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {showOperatorGate ? (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar">
          <GreetingWelcomeScreen isDarkMode={isDarkMode} onConfirmOperator={onConfirmOperatorName} />
        </div>
      ) : showInitialHome ? (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar">
          <EmptyStateHome mode={mode} isDarkMode={isDarkMode} onStartInvestigation={onStartInvestigation} />
          <HelpCenterFloating isDarkMode={isDarkMode} />
        </div>
      ) : shouldRenderStaticTimelineFallback ? (
        <div
          className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar"
          data-testid="messages-static-fallback"
          data-scout-virtuoso="static-fallback"
        >
          {hasMore ? (
            <div className="flex justify-center py-3">
              <button
                type="button"
                onClick={onLoadMore}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${theme.btnSecondary}`}
              >
                Carregar mensagens anteriores
              </button>
            </div>
          ) : null}
          {safeMessages.map((message, index) => (
            <MessageRow key={message.id} index={index} data={itemData} />
          ))}
        </div>
      ) : shouldRenderSuspendedViewport ? (
        <div
          className="flex-1 min-h-0 w-full flex items-center justify-center"
          data-testid="messages-viewport-suspended"
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className={`w-8 h-8 border-4 rounded-full animate-spin ${isDarkMode ? 'border-emerald-500/20 border-t-emerald-500' : 'border-emerald-600/20 border-t-emerald-600'}`}
            />
            <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Preparando investigação...
            </p>
          </div>
        </div>
      ) : (
        <div ref={messagesViewportRef} className="flex-1 min-h-0 w-full" data-scout-virtuoso="timeline">
          {isMessagesViewportReady ? (
            <Virtuoso
              ref={virtuosoRef}
              data={safeMessages}
              computeItemKey={(_, message) => message.id}
              itemContent={itemContent}
              // UX contract: never auto-scroll the main chat timeline on new messages.
              followOutput={false}
              increaseViewportBy={{ top: virtuosoOverscan, bottom: virtuosoOverscan }}
              defaultItemHeight={96}
              rangeChanged={handleRangeChanged}
              atBottomStateChange={handleAtBottomChange}
              style={{ height: '100%' }}
              components={{
                Header: () =>
                  hasMore ? (
                    <div className="flex justify-center py-3">
                      <button
                        type="button"
                        onClick={onLoadMore}
                        className={`text-xs px-3 py-1.5 rounded-full transition-colors ${theme.btnSecondary}`}
                      >
                        Carregar mensagens anteriores
                      </button>
                    </div>
                  ) : null,
              }}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center" data-testid="messages-viewport-placeholder">
              <div
                className={`w-8 h-8 border-4 rounded-full animate-spin ${isDarkMode ? 'border-emerald-500/20 border-t-emerald-500' : 'border-emerald-600/20 border-t-emerald-600'}`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageTimeline;
