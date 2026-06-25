import { scoutDiag } from '../../utils/diagnosticLog';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { ChatMode } from '../../constants';
import type { AppError, ChatSession, Feedback, FeedbackSubmissionOptions, Message } from '../../types';
import { Sender } from '../../types';
import EmptyStateHome from '../EmptyStateHome';
import GreetingWelcomeScreen from '../GreetingWelcomeScreen';
import HelpCenterFloating from '../HelpCenterFloating';
import MessageRow, { type MessageRowData } from '../MessageRow';
import { parseSmartOptions } from '../SmartOptions';
import type { ChatTheme, RadarProps, StartInvestigationPayload } from './contracts';

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
  onRequestStaticFallback?: () => void;
  onConfirmOperatorName: (name: string, email: string, existingOperatorId?: string) => void;
  onStartInvestigation: (payload: StartInvestigationPayload) => Promise<void>;
  radar?: RadarProps;
  onOpenRadarPanel: () => void;
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
  onDeepDive?: (displayMessage: string, hiddenPrompt: string) => Promise<void>;
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
  recoveryKey?: number;
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
  onRequestStaticFallback,
  onConfirmOperatorName,
  onStartInvestigation,
  radar,
  onOpenRadarPanel,
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
  recoveryKey,
}) => {
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportReadySignatureRef = useRef('');
  const [isMessagesViewportReady, setIsMessagesViewportReady] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [virtuosoKey, setVirtuosoKey] = useState(0);
  const safeMessages = useMemo(() => (Array.isArray(messages) ? messages : []), [messages]);
  const shouldRenderStaticTimelineFallback = forceStaticTimelineFallback;
  const shouldRenderSuspendedViewport = shouldSuspendVirtualizedList && !shouldRenderStaticTimelineFallback;

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
          shouldSuspendVirtualizedList,
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
      m => m.sender === Sender.Bot && typeof m.text === 'string' && /teia\s+societ[áa]ria/i.test(m.text),
    );
    if (hasTeia) return 600;
    const hasDossier = safeMessages.some(m => m.sender === Sender.Bot && (m.text?.length ?? 0) > 3000);
    return hasDossier ? 1400 : 400;
  }, [safeMessages]);

  const safeMessagesLengthRef = useRef(safeMessages.length);
  safeMessagesLengthRef.current = safeMessages.length;

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

  // ── Virtuoso ready signal ──
  useEffect(() => {
    if (showInitialHome || shouldRenderSuspendedViewport || shouldRenderStaticTimelineFallback) {
      setIsMessagesViewportReady(false);
      return;
    }

    const viewport = messagesViewportRef.current;
    if (!viewport) return;

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

  // ── Recovery: blank panel / watchdog → remount Virtuoso ──
  useEffect(() => {
    if (recoveryKey !== undefined && recoveryKey > 0) {
      setVirtuosoKey(k => k + 1);
    }
  }, [recoveryKey]);

  const lastBotTextLen = useMemo(() => {
    for (let i = safeMessages.length - 1; i >= 0; i -= 1) {
      const message = safeMessages[i];
      if (message.sender === Sender.Bot && !message.isError) {
        return message.text?.trim().length ?? 0;
      }
    }
    return 0;
  }, [safeMessages]);
  const storeDomRecoverySignatureRef = useRef('');

  // ── Recovery: store tem texto final mas DOM ainda sem bot-message-content ──
  useEffect(() => {
    if (isLoading || !isMessagesViewportReady || lastBotTextLen < 200) return;

    const signature = `${currentSession?.id ?? 'no-session'}|${lastBotTextLen}`;
    if (storeDomRecoverySignatureRef.current === signature) return;

    const timer = window.setTimeout(() => {
      const botNode = messagesViewportRef.current?.querySelector('[data-testid="bot-message-content"]');
      const botVisible = (() => {
        if (!botNode) return false;
        const style = window.getComputedStyle(botNode);
        const opacity = Number(style.opacity || '1');
        if (style.display === 'none' || style.visibility === 'hidden' || opacity <= 0.01) return false;
        const rect = botNode.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })();

      if (botVisible) return;

      storeDomRecoverySignatureRef.current = signature;
      scoutDiag.warn('Virtuoso', 'store-has-bot-text-dom-empty', {
        sessionId: currentSession?.id ?? null,
        lastBotTextLen,
      });
      setVirtuosoKey(k => k + 1);
      onRequestStaticFallback?.();
    }, 500);

    return () => window.clearTimeout(timer);
  }, [currentSession?.id, isLoading, isMessagesViewportReady, lastBotTextLen, onRequestStaticFallback]);

  // ── Virtuoso display:none recovery watchdog ──
  useEffect(() => {
    if (!isMessagesViewportReady) return;

    const timer = window.setTimeout(() => {
      const scroller = messagesViewportRef.current?.querySelector<HTMLElement>('[data-virtuoso-scroller]');
      if (!scroller) return;

      const cs = getComputedStyle(scroller);
      if (cs.display !== 'none') return;

      scoutDiag.warn('Virtuoso', 'virtuoso-scroller-display-none', {
        sessionId: currentSession?.id ?? null,
      });

      setVirtuosoKey(k => k + 1);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [isMessagesViewportReady, currentSession?.id]);

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

    const botMsg = safeMessages.find(message => message.sender === Sender.Bot);
    scoutDiag.warn('Virtuoso', 'static-fallback-rendered', {
      sessionId: currentSession?.id ?? null,
      totalItems: safeMessages.length,
      botTextLen: botMsg?.text?.length ?? 0,
    });
  }, [
    currentSession?.id,
    safeMessages.length,
    shouldRenderStaticTimelineFallback,
    safeMessages.find(m => m.sender === Sender.Bot)?.text?.length ?? 0,
  ]);

  const initialTopMostItemIndex = Math.max(0, safeMessages.length - 1);

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {showOperatorGate ? (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar">
          <GreetingWelcomeScreen isDarkMode={isDarkMode} onConfirmOperator={onConfirmOperatorName} />
        </div>
      ) : showInitialHome ? (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar">
          <EmptyStateHome
            mode={mode}
            isDarkMode={isDarkMode}
            onStartInvestigation={onStartInvestigation}
            radarAlerts={radar?.alerts}
            radarIsScanning={radar?.isScanning}
            onForceScan={radar?.onForceScan}
            onOpenRadar={onOpenRadarPanel}
          />
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
              key={virtuosoKey}
              ref={virtuosoRef}
              data={safeMessages}
              computeItemKey={(_, message) => message.id}
              itemContent={itemContent}
              initialTopMostItemIndex={initialTopMostItemIndex}
              followOutput={isLoading ? false : 'auto'}
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
