import React, { useCallback, useEffect, useRef, useState } from 'react';
import { APP_NAME } from '../constants';
import { useMode } from '../contexts/ModeContext';
import { useOperator } from '../contexts/OperatorContext';
import { storage } from '../services/storage';
import { classifyPanelState } from '../utils/renderStateClassifier';
import { scoutDiag } from '../utils/diagnosticLog';
import {
  collectBlankPanelSnapshot,
  reportBlankPanelIfDetected,
  type BlankPanelSnapshot,
} from '../utils/blankPanelTelemetry';
import {
  buildHandoffPanelDiag,
  isOverlayStuckPostWaterfall,
  isPostWaterfallStuckHandoff,
  POST_WATERFALL_WATCHDOG_MS,
  shouldApplyProactiveForceStatic,
  shouldResetForceStaticOnLoadingStart,
} from '../utils/postWaterfallHandoff';
import { DuplicateDossierModal } from './DuplicateDossierModal';

import { cleanTitle } from '../utils/textCleaners';
import { maxExpectedBotChars, shouldPreferStaticTimelineForBotVolume } from '../utils/expectedBotContent';
import { shouldSuspendHeroMessageTimeline } from '../utils/loadingVariant';
import ChatPanels from './chat/ChatPanels';
import ChatShell from './chat/ChatShell';
import Composer from './chat/Composer';
import type { ChatTheme, ExtendedChatInterfaceProps, StartInvestigationPayload } from './chat/contracts';
import MessageTimeline from './chat/MessageTimeline';
import { useChatTheme } from '../hooks/useChatTheme';
import { usePanelState } from '../hooks/usePanelState';
import { useInvestigation } from '../hooks/useInvestigation';
import { useChatActions } from '../hooks/useChatActions';

export type { RadarProps } from './chat/contracts';

function shouldActivateStaticTimelineFallback(snapshot: BlankPanelSnapshot): boolean {
  if (!snapshot.sessionId || snapshot.expectedBotCharsMax <= 0 || snapshot.messageCount <= 0) return false;
  if (snapshot.isLoading || snapshot.showInitialHome || snapshot.shouldSuspendVirtualizedList) return false;
  if (
    snapshot.loadingOverlayVisible ||
    snapshot.inlineBubbleVisible ||
    snapshot.controlledErrorVisible ||
    snapshot.emptyStateVisible
  )
    return false;

  if (isPostWaterfallStuckHandoff(snapshot)) return true;
  if (snapshot.blankDetected) return true;

  const panelHasAlmostNoContent =
    snapshot.mainPanelChars < Math.min(800, Math.max(200, snapshot.expectedBotCharsMax / 10));
  if (snapshot.botNodeCount === 0 && panelHasAlmostNoContent) return true;
  if (snapshot.messageCount <= 3 && snapshot.visibleBotWithCharsCount === 0 && panelHasAlmostNoContent) return true;

  return snapshot.panelVisible && snapshot.rowCount > 0 && snapshot.visibleRowCount === 0;
}

const ChatInterface: React.FC<ExtendedChatInterfaceProps> = ({
  currentSession,
  sessions,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  isSidebarOpen,
  onToggleSidebar,
  messages,
  isLoading,
  hasMore,
  onSendMessage,
  onFeedback,
  onSendFeedback,
  onLoadMore,
  onExportConversation,
  onExportPDF,
  onRetry,
  onRegenerateSuggestions,
  onStop,
  onReportError,
  isDarkMode,
  onToggleTheme,
  onToggleMessageSources,
  exportStatus,
  canAccessIntegrityCheck = true,
  canDeepDive = false,
  canWarRoom = false,
  onClearOperator,
  lastUserQuery,
  processing,
  loadingVariant,
  loadingPinnedLabel,
  onDeleteMessage,
  onDeepDive,
  radar,
}) => {
  const { mode } = useMode();
  const {
    name: operatorName,
    operatorId,
    setName,
    registerOperator,
    linkToExistingOperator,
    loading: operatorLoading,
  } = useOperator();

  const [showSettings, setShowSettings] = useState(false);
  const [showWarRoom, setShowWarRoom] = useState(false);
  const [showRadarPanel, setShowRadarPanel] = useState(false);
  const [showRadarSettings, setShowRadarSettings] = useState(false);
  const [forceStaticTimelineFallback, setForceStaticTimelineFallback] = useState(false);
  const staticTimelineFallbackSessionRef = useRef<string | null>(null);
  const postWaterfallWatchdogLoggedRef = useRef<string | null>(null);

  const {
    safeMessages,
    hasOperatorName,
    showOperatorGate,
    showInitialHome,
    hasRenderableBotMessage,
    shouldSuspendVirtualizedList,
    headerTitle,
    displayTitle,
    displayName,
    hasActiveSession,
    hasErrorInMessages,
    hasDossierContent,
    panelState,
    expectedBotCharsMax,
  } = usePanelState({
    messages,
    currentSession,
    isLoading,
    loadingVariant,
    operatorName,
    operatorLoading,
  });

  useEffect(() => {
    if (!operatorId || !hasOperatorName) return;
    void storage.touchUserContext(operatorId);
  }, [hasOperatorName, operatorId]);

  const {
    executeInvestigation,
    handleStartInvestigation,
    handleAccessExistingDossier,
    handleNewResearchOverride,
    duplicateDossier,
    setDuplicateDossier,
    pendingPayloadRef,
  } = useInvestigation({
    mode,
    canWarRoom,
    onDeepDive,
    radar,
    operatorId,
    onSelectSession,
  });

  const { handleCopyMarkdown, handlePrefillComposer } = useChatActions(safeMessages);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (operatorId) {
        void storage.touchUserContext(operatorId);
      }

      onSendMessage(text);
    },
    [onSendMessage, operatorId],
  );

  const theme = useChatTheme(isDarkMode);

  const preferStaticForLargeDossier =
    !isLoading &&
    !showInitialHome &&
    !shouldSuspendVirtualizedList &&
    shouldPreferStaticTimelineForBotVolume(expectedBotCharsMax);
  const effectiveStaticTimelineFallback = forceStaticTimelineFallback || preferStaticForLargeDossier;
  const shouldSuspendVirtualizedListForTimeline = shouldSuspendVirtualizedList && !effectiveStaticTimelineFallback;
  const prevIsLoadingForStaticResetRef = useRef(isLoading);

  const panelSnapshotSignatureRef = useRef('');
  useEffect(() => {
    const signature = [
      currentSession?.id ?? 'no-session',
      panelState,
      hasActiveSession ? 'active' : 'inactive',
      safeMessages.length,
      messages.length,
      hasDossierContent ? 'dossier' : 'no-dossier',
      isLoading ? 'loading' : 'idle',
      loadingVariant ?? 'none',
      showInitialHome ? 'home' : 'no-home',
      showOperatorGate ? 'operator-gate' : 'operator-ready',
      shouldSuspendVirtualizedList ? 'suspended' : 'timeline',
      effectiveStaticTimelineFallback ? 'static-fallback' : 'virtualized',
      expectedBotCharsMax,
    ].join('|');

    if (panelSnapshotSignatureRef.current === signature) return;
    panelSnapshotSignatureRef.current = signature;

    const domSnapshot =
      typeof document !== 'undefined'
        ? collectBlankPanelSnapshot({
            sessionId: currentSession?.id ?? null,
            source: 'ChatInterface:panel-snapshot',
            messageCount: safeMessages.length,
            expectedBotCharsMax,
            isLoading,
            loadingVariant,
            panelState,
            showInitialHome,
            shouldSuspendVirtualizedList: shouldSuspendVirtualizedListForTimeline,
          })
        : null;

    const snapshotPayload = {
      sessionId: currentSession?.id ?? null,
      panelState,
      hasActiveSession,
      safeMessageCount: safeMessages.length,
      propMessageCount: messages.length,
      hasDossierContent,
      expectedBotCharsMax,
      isLoading,
      loadingVariant,
      showInitialHome,
      showOperatorGate,
      shouldSuspendVirtualizedList,
      shouldSuspendVirtualizedListForTimeline,
      forceStaticTimelineFallback,
      preferStaticForLargeDossier,
      effectiveStaticTimelineFallback,
      ...buildHandoffPanelDiag(domSnapshot, {
        shouldSuspendVirtualizedList,
        forceStaticTimelineFallback,
        expectedBotCharsMax,
      }),
    };

    scoutDiag.info('ChatInterface', 'panel:snapshot', snapshotPayload);

    // LayoutTrace: quando static fallback ativo com dossiê grande, rastrear layout
    if (effectiveStaticTimelineFallback && expectedBotCharsMax > 4000) {
      requestAnimationFrame(() => {
        import('../utils/layoutTraceTelemetry')
          .then(({ traceLayout }) => {
            traceLayout(scoutDiag.info.bind(scoutDiag), 'chat-interface-static-fallback', {
              ...snapshotPayload,
            });
          })
          .catch(() => {}); // falha silenciosa em testes
      });
    }
  }, [
    currentSession?.id,
    expectedBotCharsMax,
    effectiveStaticTimelineFallback,
    forceStaticTimelineFallback,
    preferStaticForLargeDossier,
    hasActiveSession,
    hasDossierContent,
    isLoading,
    loadingVariant,
    messages.length,
    panelState,
    safeMessages.length,
    shouldSuspendVirtualizedList,
    shouldSuspendVirtualizedListForTimeline,
    showInitialHome,
    showOperatorGate,
  ]);

  useEffect(() => {
    setForceStaticTimelineFallback(false);
    staticTimelineFallbackSessionRef.current = null;
    postWaterfallWatchdogLoggedRef.current = null;
  }, [currentSession?.id]);

  useEffect(() => {
    const wasLoading = prevIsLoadingForStaticResetRef.current;
    prevIsLoadingForStaticResetRef.current = isLoading;
    if (
      shouldResetForceStaticOnLoadingStart({
        expectedBotCharsMax,
        isLoading,
        wasLoading,
      })
    ) {
      setForceStaticTimelineFallback(false);
      staticTimelineFallbackSessionRef.current = null;
      postWaterfallWatchdogLoggedRef.current = null;
    }
  }, [expectedBotCharsMax, isLoading]);

  useEffect(() => {
    if (
      !shouldApplyProactiveForceStatic({
        expectedBotCharsMax,
        showInitialHome,
        sessionId: currentSession?.id,
      })
    ) {
      return;
    }

    setForceStaticTimelineFallback(true);
    staticTimelineFallbackSessionRef.current = currentSession!.id;
    scoutDiag.info('ChatInterface', 'proactive-static-fallback-large-dossier', {
      sessionId: currentSession!.id,
      expectedBotCharsMax,
      threshold: 4_000,
      syncOnRender: true,
      preferStaticForLargeDossier,
      shouldSuspendVirtualizedList,
    });
  }, [
    currentSession?.id,
    expectedBotCharsMax,
    preferStaticForLargeDossier,
    shouldSuspendVirtualizedList,
    showInitialHome,
  ]);

  useEffect(() => {
    if (!currentSession?.id || expectedBotCharsMax < 4_000) return;
    if (isLoading || showInitialHome) return;

    const watchdogTimer = window.setTimeout(() => {
      const snapshot = collectBlankPanelSnapshot({
        sessionId: currentSession.id,
        source: 'ChatInterface:post-waterfall-watchdog',
        messageCount: safeMessages.length,
        expectedBotCharsMax,
        isLoading,
        loadingVariant,
        panelState,
        showInitialHome,
        shouldSuspendVirtualizedList: shouldSuspendVirtualizedListForTimeline,
      });

      if (!isPostWaterfallStuckHandoff(snapshot)) {
        if (isOverlayStuckPostWaterfall(snapshot)) {
          scoutDiag.warn('SpinnerStuck', 'overlay-persisted-post-waterfall', {
            sessionId: currentSession.id,
            delayMs: POST_WATERFALL_WATCHDOG_MS,
            ...buildHandoffPanelDiag(snapshot, {
              shouldSuspendVirtualizedList,
              forceStaticTimelineFallback,
              expectedBotCharsMax,
            }),
          } as unknown as Record<string, unknown>);
        }
        return;
      }

      staticTimelineFallbackSessionRef.current = currentSession.id;
      setForceStaticTimelineFallback(true);

      if (postWaterfallWatchdogLoggedRef.current === currentSession.id) return;
      postWaterfallWatchdogLoggedRef.current = currentSession.id;

      scoutDiag.warn('SpinnerStuck', 'post-waterfall-watchdog', {
        sessionId: currentSession.id,
        delayMs: POST_WATERFALL_WATCHDOG_MS,
        ...buildHandoffPanelDiag(snapshot, {
          shouldSuspendVirtualizedList,
          forceStaticTimelineFallback,
          expectedBotCharsMax,
        }),
        reason: snapshot?.reason,
      } as unknown as Record<string, unknown>);
    }, POST_WATERFALL_WATCHDOG_MS);

    return () => window.clearTimeout(watchdogTimer);
  }, [
    currentSession?.id,
    expectedBotCharsMax,
    forceStaticTimelineFallback,
    isLoading,
    loadingVariant,
    panelState,
    safeMessages.length,
    shouldSuspendVirtualizedList,
    shouldSuspendVirtualizedListForTimeline,
    showInitialHome,
  ]);

  useEffect(() => {
    if (!currentSession?.id || expectedBotCharsMax <= 0) return;
    if (isLoading || showInitialHome || shouldSuspendVirtualizedList) return;

    const delays = [750, 2_000, 5_000, 9_000];
    const timers = delays.map(delay =>
      window.setTimeout(() => {
        const snapshot = reportBlankPanelIfDetected({
          sessionId: currentSession.id,
          source: `ChatInterface:${delay}ms`,
          messageCount: safeMessages.length,
          expectedBotCharsMax,
          isLoading,
          loadingVariant,
          panelState,
          showInitialHome,
          shouldSuspendVirtualizedList,
        });

        if (!snapshot || !shouldActivateStaticTimelineFallback(snapshot)) return;
        if (staticTimelineFallbackSessionRef.current === currentSession.id) return;

        staticTimelineFallbackSessionRef.current = currentSession.id;
        setForceStaticTimelineFallback(true);
        scoutDiag.warn('BlankPanel', 'static-timeline-fallback-activated', {
          ...snapshot,
          delay,
        } as unknown as Record<string, unknown>);
      }, delay),
    );

    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [
    currentSession?.id,
    expectedBotCharsMax,
    isLoading,
    loadingVariant,
    panelState,
    safeMessages.length,
    shouldSuspendVirtualizedList,
    showInitialHome,
  ]);

  // ── Instrumentação: safeMessages vazio com sessão ativa ──
  const prevSafeLenRef = useRef(safeMessages.length);
  useEffect(() => {
    const prev = prevSafeLenRef.current;
    const curr = safeMessages.length;
    prevSafeLenRef.current = curr;

    if (prev > 0 && curr === 0 && currentSession?.id && !isLoading) {
      console.error(
        '[Scout360][ChatInterface] ⚠ safeMessages ZEROU com sessão ativa',
        JSON.stringify({
          sessionId: currentSession.id,
          allMessagesLen: messages.length,
          hasDossierContent,
          panelState,
          loadingVariant,
        }),
      );
    }
  }, [
    safeMessages.length,
    currentSession?.id,
    isLoading,
    hasDossierContent,
    panelState,
    loadingVariant,
    messages.length,
  ]);

  const showEmptyStateFallback = panelState === 'empty' && hasActiveSession && !showInitialHome;

  if (showEmptyStateFallback) {
    scoutDiag.warn('EmptyStateFallback', 'sessão ativa sem conteúdo renderizável', {
      activeSessionId: currentSession?.id ?? 'unknown',
      activeCompanyName: currentSession?.empresaAlvo ?? currentSession?.title ?? 'unknown',
      messagesLength: safeMessages.length,
      hasDossierContent,
      isLoading,
      route: typeof window !== 'undefined' ? window.location.pathname : 'ssr',
    });
  }

  return (
    <>
      <ChatShell
        sessions={sessions}
        currentSessionId={currentSession?.id ?? null}
        onSelectSession={onSelectSession}
        onNewSession={onNewSession}
        onDeleteSession={onDeleteSession}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={onToggleSidebar}
        isDarkMode={isDarkMode}
        theme={theme}
        displayTitle={displayTitle}
        radar={radar}
        onOpenRadarPanel={() => setShowRadarPanel(true)}
        canWarRoom={canWarRoom}
        onOpenWarRoom={() => setShowWarRoom(true)}
        onToggleTheme={onToggleTheme}
        displayName={displayName}
        avatarUrl={null}
        onOpenSettings={() => setShowSettings(true)}
        onClearOperator={onClearOperator}
        onExportPDF={onExportPDF}
        onExportConversation={onExportConversation}
        onCopyMarkdown={handleCopyMarkdown}
        exportStatus={exportStatus}
        timeline={
          <div data-testid="chat-main-panel" className="flex flex-1 min-h-0 overflow-hidden">
            {showEmptyStateFallback ? (
              <div
                data-testid="empty-state"
                className={`flex flex-1 items-center justify-center p-6 ${isDarkMode ? 'bg-slate-950 text-slate-400' : 'bg-slate-50 text-slate-500'}`}
              >
                <div className="text-center max-w-sm">
                  <p className="text-sm font-medium">Nenhum conteúdo disponível</p>
                  <p className="text-xs mt-2 opacity-60">
                    O painel está vazio. Tente recarregar a página ou iniciar uma nova investigação.
                  </p>
                </div>
              </div>
            ) : (
              <MessageTimeline
                currentSession={currentSession}
                messages={safeMessages}
                isLoading={isLoading}
                hasMore={hasMore}
                isDarkMode={isDarkMode}
                mode={mode}
                showOperatorGate={showOperatorGate}
                showInitialHome={showInitialHome}
                shouldSuspendVirtualizedList={shouldSuspendVirtualizedListForTimeline}
                forceStaticTimelineFallback={effectiveStaticTimelineFallback}
                onConfirmOperatorName={(name, email, existingOperatorId) => {
                  if (existingOperatorId) {
                    linkToExistingOperator(existingOperatorId, name, email);
                  } else {
                    registerOperator(name, email);
                  }
                }}
                onStartInvestigation={handleStartInvestigation}
                radar={radar}
                onOpenRadarPanel={() => setShowRadarPanel(true)}
                onLoadMore={onLoadMore}
                onRetry={onRetry}
                onDeleteMessage={onDeleteMessage}
                onReportError={onReportError}
                onFeedback={onFeedback}
                onSendFeedback={onSendFeedback}
                onToggleMessageSources={onToggleMessageSources}
                onDeepDive={onDeepDive}
                onRegenerateSuggestions={onRegenerateSuggestions}
                onPrefillComposer={handlePrefillComposer}
                operatorId={operatorId}
                processing={processing}
                lastUserQuery={lastUserQuery}
                onStop={onStop}
                onSendMessage={handleSendMessage}
                loadingPinnedLabel={loadingPinnedLabel}
                canDeepDive={canDeepDive}
                theme={theme}
              />
            )}
          </div>
        }
        composer={
          <Composer
            isHidden={showInitialHome || showOperatorGate}
            isLoading={isLoading}
            processing={processing}
            sessionId={currentSession?.id ?? null}
            theme={theme}
            onSendMessage={handleSendMessage}
            onRetry={onRetry}
            onStop={onStop}
          />
        }
        panels={
          <ChatPanels
            showSettings={showSettings}
            operatorName={operatorName}
            onUpdateOperatorName={setName}
            isDarkMode={isDarkMode}
            onToggleTheme={onToggleTheme}
            onClearOperator={onClearOperator}
            canAccessIntegrityCheck={canAccessIntegrityCheck}
            onCloseSettings={() => setShowSettings(false)}
            showWarRoom={showWarRoom}
            canWarRoom={canWarRoom}
            onCloseWarRoom={() => setShowWarRoom(false)}
            showRadarPanel={showRadarPanel}
            radar={radar}
            onOpenRadarSettings={() => {
              setShowRadarPanel(false);
              setShowRadarSettings(true);
            }}
            onCloseRadarPanel={() => setShowRadarPanel(false)}
            showRadarSettings={showRadarSettings}
            onCloseRadarSettings={() => setShowRadarSettings(false)}
          />
        }
      />
      {duplicateDossier && pendingPayloadRef.current && (
        <DuplicateDossierModal
          existing={duplicateDossier}
          companyName={pendingPayloadRef.current.companyName}
          onAccessExisting={handleAccessExistingDossier}
          onNewResearch={handleNewResearchOverride}
          onDismiss={() => {
            setDuplicateDossier(null);
            pendingPayloadRef.current = null;
          }}
        />
      )}
    </>
  );
};

export default ChatInterface;
