import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMode } from '../contexts/ModeContext';
import { useOperator } from '../contexts/OperatorContext';
import { storage } from '../services/storage';
import { scoutDiag } from '../utils/diagnosticLog';
import { DuplicateDossierModal } from './DuplicateDossierModal';

import ChatPanels from './chat/ChatPanels';
import ChatShell from './chat/ChatShell';
import Composer from './chat/Composer';
import type { ChatTheme, ExtendedChatInterfaceProps } from './chat/contracts';
import MessageTimeline from './chat/MessageTimeline';
import { useChatTheme } from '../hooks/useChatTheme';
import { usePanelState } from '../hooks/usePanelState';
import { useInvestigation } from '../hooks/useInvestigation';
import { useChatActions } from '../hooks/useChatActions';
import { useStaticTimelineFallback } from '../hooks/useStaticTimelineFallback';

const ChatInterface: React.FC<ExtendedChatInterfaceProps> = ({
  currentSession,
  sessions,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onCleanupTransientSession,
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
  canDeepDive = false,
  onClearOperator,
  lastUserQuery,
  processing,
  loadingVariant,
  loadingPinnedLabel,
  onDeleteMessage,
  onDeepDive,
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
    isForeignDossier,
  } = useInvestigation({
    mode,
    onDeepDive,
    operatorId,
    onSelectSession,
    onCleanupTransientSession,
    currentSessionId: currentSession?.id ?? null,
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

  const {
    forceStaticTimelineFallback,
    preferStaticForLargeDossier,
    effectiveStaticTimelineFallback,
    shouldSuspendVirtualizedListForTimeline,
  } = useStaticTimelineFallback({
    currentSession,
    isLoading,
    showInitialHome,
    shouldSuspendVirtualizedList,
    expectedBotCharsMax,
    safeMessagesLength: safeMessages.length,
    messagesLength: messages.length,
    panelState,
    loadingVariant,
    hasActiveSession,
    hasDossierContent,
    showOperatorGate,
  });
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
                followOutputOverride={loadingVariant === 'inline' && Boolean(loadingPinnedLabel)}
                scrollToActivityKey={lastUserQuery ? `wayfinding-${lastUserQuery}` : null}
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
            onCloseSettings={() => setShowSettings(false)}
          />
        }
      />
      {duplicateDossier && pendingPayloadRef.current && (
        <DuplicateDossierModal
          existing={duplicateDossier}
          companyName={pendingPayloadRef.current.companyName}
          isForeign={isForeignDossier}
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
