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
}) => {
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMessagesViewportReady, setIsMessagesViewportReady] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const safeMessages = Array.isArray(messages) ? messages : [];

  // Use larger overscan when any bot message looks like a dossier (long text) to
  // avoid Mermaid/SocietaryMap remounting when the user scrolls near the boundary.
  const virtuosoOverscan = useMemo(() => {
    const hasDossier = safeMessages.some(
      m => m.sender === Sender.Bot && (m.text?.length ?? 0) > 3000,
    );
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
      totalItems: safeMessages.length,
      overscan: virtuosoOverscan,
    });
    return () => {
      scoutDiag.info('Virtuoso', 'virtuoso:unmount', {
        totalItems: safeMessages.length,
      });
    };
  }, [isMessagesViewportReady]);

  const handleRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    scoutDiag.info('Virtuoso', 'virtuoso:itemsRendered', {
      firstIndex: range.startIndex,
      lastIndex: range.endIndex,
      totalItems: safeMessages.length,
    });
  }, [safeMessages.length]);

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
    scoutDiag.info('MessageTimeline', 'viewport readiness check', {
      showInitialHome,
      shouldSuspendVirtualizedList,
      safeMessagesCount: safeMessages.length,
      hasViewportRef: Boolean(messagesViewportRef.current),
    });

    if (showInitialHome || shouldSuspendVirtualizedList) {
      setIsMessagesViewportReady(false);
      return;
    }

    const viewport = messagesViewportRef.current;
    if (!viewport) {
      scoutDiag.warn('MessageTimeline', 'viewport ref ausente — aguardando emergency timer', {
        showInitialHome,
        shouldSuspendVirtualizedList,
      });
      return;
    }

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let rafA: number | null = null;
    let rafB: number | null = null;
    let emergencyTimer: number | null = null;

    const hasValidSize = () => viewport.clientHeight > 0 && viewport.clientWidth > 0;
    const markReady = () => {
      if (!cancelled) {
        const valid = hasValidSize();
        scoutDiag.info('MessageTimeline', 'viewport marked ready', {
          hasValidSize: valid,
          clientHeight: viewport.clientHeight,
          clientWidth: viewport.clientWidth,
        });
        setIsMessagesViewportReady(true);
      }
    };

    setIsMessagesViewportReady(false);
    emergencyTimer = window.setTimeout(() => {
      if (!hasValidSize()) {
        scoutDiag.warn('MessageTimeline', 'emergency timer disparou sem dimensão válida', {
          clientHeight: viewport.clientHeight,
          clientWidth: viewport.clientWidth,
        });
      }
      markReady();
    }, 180);

    if (hasValidSize()) {
      markReady();
    } else if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (hasValidSize()) {
          markReady();
        }
      });
      observer.observe(viewport);
    }

    if (typeof window.requestAnimationFrame === 'function') {
      rafA = window.requestAnimationFrame(() => {
        if (typeof window.requestAnimationFrame === 'function') {
          rafB = window.requestAnimationFrame(markReady);
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
  }, [showInitialHome, shouldSuspendVirtualizedList]);

  const hideSuggestionsForMessageId =
    isLoading &&
    lastBotWithSuggestionsIndex !== undefined &&
    lastUserIndex !== undefined &&
    lastUserIndex > lastBotWithSuggestionsIndex
      ? safeMessages[lastBotWithSuggestionsIndex]?.id ?? null
      : null;

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
    ],
  );

  const itemContent = useCallback(
    (index: number) => <MessageRow index={index} data={itemData} />,
    [itemData],
  );

  return (
    <div className="flex-1 min-h-0 relative">
      {showOperatorGate ? (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar">
          <GreetingWelcomeScreen
            isDarkMode={isDarkMode}
            onConfirmOperator={onConfirmOperatorName}
          />
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
      ) : shouldSuspendVirtualizedList ? (
        <div className="h-full min-h-0 w-full flex items-center justify-center" data-testid="messages-viewport-suspended">
          <div className="flex flex-col items-center gap-3">
            <div className={`w-8 h-8 border-4 rounded-full animate-spin ${isDarkMode ? 'border-emerald-500/20 border-t-emerald-500' : 'border-emerald-600/20 border-t-emerald-600'}`} />
            <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Preparando investigação...</p>
          </div>
        </div>
      ) : (
        <div ref={messagesViewportRef} className="h-full min-h-0 w-full" data-scout-virtuoso="timeline">
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
              <div className={`w-8 h-8 border-4 rounded-full animate-spin ${isDarkMode ? 'border-emerald-500/20 border-t-emerald-500' : 'border-emerald-600/20 border-t-emerald-600'}`} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageTimeline;
