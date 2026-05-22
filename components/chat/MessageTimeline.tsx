import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { ChatMode } from '../../constants';
import type { AppError, ChatSession, Feedback, Message } from '../../types';
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
  onConfirmOperatorName: (name: string, email: string) => void;
  onStartInvestigation: (payload: StartInvestigationPayload) => Promise<void>;
  radar?: RadarProps;
  onOpenRadarPanel: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onDeleteMessage?: (id: string) => void;
  onReportError?: (messageId: string, error: AppError) => void;
  onFeedback: (messageId: string, feedback: Feedback) => void;
  onSendFeedback: (messageId: string, feedback: Feedback, comment: string, content: string) => void;
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
    if (showInitialHome || shouldSuspendVirtualizedList) {
      setIsMessagesViewportReady(false);
      return;
    }

    const viewport = messagesViewportRef.current;
    if (!viewport) {
      setIsMessagesViewportReady(true);
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
        setIsMessagesViewportReady(true);
      }
    };

    setIsMessagesViewportReady(false);
    emergencyTimer = window.setTimeout(markReady, 180);

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
  }, [showInitialHome, shouldSuspendVirtualizedList, safeMessages.length]);

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
        <div className="h-full min-h-0 w-full" data-testid="messages-viewport-suspended" />
      ) : (
        <div ref={messagesViewportRef} className="h-full min-h-0 w-full">
          {isMessagesViewportReady ? (
            <Virtuoso
              ref={virtuosoRef}
              data={safeMessages}
              computeItemKey={(_, message) => message.id}
              itemContent={itemContent}
              // UX contract: never auto-scroll the main chat timeline on new messages.
              followOutput={false}
              increaseViewportBy={{ top: 400, bottom: 400 }}
              defaultItemHeight={96}
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
            <div className="h-full w-full" data-testid="messages-viewport-placeholder" />
          )}
        </div>
      )}
    </div>
  );
};

export default MessageTimeline;
