import React, { useState, useEffect, useCallback } from 'react';
import { useOffline } from './hooks/useOffline';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import { useRadar } from './features/radar';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useEmailModal } from './hooks/useEmailModal';
import { useFollowUpModal } from './hooks/useFollowUpModal';
import { useSessionManager, useSessionRemoteSave } from './features/chat/session-controller';
import { useChatFeedbackActions } from './features/chat/feedback-actions';
import ChatErrorBoundary from './features/chat/ChatErrorBoundary';
import {
  useChatMessageOrchestrator,
} from './features/chat/message-orchestrator';
import DossierErrorBoundary from './features/dossier/DossierErrorBoundary';
import { useDossierWaterfallOrchestrator } from './features/dossier/waterfall-orchestrator';
import { useUpdateNotification } from './hooks/useUpdateNotification';
import { useMigrationNotice } from './hooks/useMigrationNotice';
import ToastContainer from './components/ToastContainer';
import ChatInterface from './components/ChatInterface';

// Lazy-loaded — não críticos para a primeira paint
const LoadingSmart = React.lazy(() => import('./components/LoadingSmart'));
const EmailModal = React.lazy(() => import('./components/EmailModal').then(m => ({ default: m.EmailModal })));
const FollowUpModal = React.lazy(() => import('./components/FollowUpModal').then(m => ({ default: m.FollowUpModal })));
const UpdateNotificationModal = React.lazy(() => import('./components/UpdateNotificationModal').then(m => ({ default: m.UpdateNotificationModal })));
const MigrationNoticeModal = React.lazy(() => import('./components/MigrationNoticeModal').then(m => ({ default: m.MigrationNoticeModal })));
import InstallPrompt from './components/InstallPrompt';
import { useOperator } from './contexts/OperatorContext';
import { useMode } from './contexts/ModeContext';
import {
  ExportFormat,
  ReportType,
} from './types';
import { generateContinuityQuestion } from './services/geminiService';

import { APP_NAME } from './constants';
import { cleanTitle } from './utils/textCleaners';
import { extractCompanyName } from './utils/companyNameExtractor';
import { getFeatureAccess } from './utils/featureAccess';
import { scoutDiag } from './utils/diagnosticLog';
import { downloadConversationExport, openDossierPrintReport } from './services/exportService';
import FooterCredits from './components/FooterCredits';
import {
  useChatStore,
} from './stores/chatStore';
import {
  useDossierStore,
} from './stores/dossierStore';

// --- INJETADO ANALYTICS AQUI ---
import { Analytics } from "@vercel/analytics/react";
// --- INJETADO SPEED INSIGHTS AQUI ---
import { SpeedInsights } from "@vercel/speed-insights/react";

const PAGE_SIZE = 20;

function isTopicDeepDiveDisplayMessage(displayMessage: string | undefined): boolean {
  const safeDisplay = (displayMessage || '').trim();
  return /^Dossi[êe]\s+completo:\s*/i.test(safeDisplay);
}

const App: React.FC = () => {
  const { name: operatorName, operatorId, clearName } = useOperator();
  const { mode, systemInstruction } = useMode();
  const { isOnline, wasOffline, clearWasOffline } = useOffline();
  const { isDarkMode, toggleTheme } = useTheme();
  const {
    sessions,
    setSessions,
    isInitialized,
    setIsInitialized,
    loadSessions,
    currentSessionId,
    setCurrentSessionId,
    currentSession,
    allMessages,
    visibleCount,
    setVisibleCount,
    lastQuery,
    setLastQuery,
    setInvestigationLogged,
    updateSessionById,
    updateCurrentSession,
    lastActionRef,
    abortControllerRef,
    isLoading,
    setIsLoading,
    loadingStatus,
    failureCount,
    completedLoadingStatuses,
    loadingTotalStages,
    loadingIsIncremental,
    setRequestKind,
    loadingVariant,
    setLoadingVariant,
    loadingPinnedLabel,
    setLoadingPinnedLabel,
    resetLoadingProgress,
  } = useChatStore();
  const {
    exportStatus,
    setExportStatus,
    exportError,
    setExportError,
    pdfReportContent,
    isSavingRemote,
    remoteSaveStatus,
  } = useDossierStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Update notification state
  const { updateAvailable, currentVersion, newVersion, dismissUpdate, updateNow } = useUpdateNotification();

  // Migration notice (Supabase)
  const { showMigrationNotice, dismissMigrationNotice } = useMigrationNotice();

  const { toasts, toast, dismiss: dismissToast } = useToast();
  const radar = useRadar(toast);

  const featureAccess = getFeatureAccess();
  const canAccessIntegrityCheck = featureAccess.integrityCheck;
  const canUseLookup = featureAccess.clientLookup;
  const canDeepDive = featureAccess.deepDive;
  const canWarRoom = featureAccess.warRoom;
  const resolvedOperatorName = operatorName.trim() || 'Vendedor';
  const emailModal = useEmailModal({
    messages: allMessages,
    sessionTitle: currentSession?.title,
    operatorName: resolvedOperatorName,
    toast,
  });
  const followUpModal = useFollowUpModal({ toast });

  const { handleSaveRemote } = useSessionRemoteSave({
    operatorId,
    operatorName: resolvedOperatorName,
  });
  const {
    handleReportError,
    handleFeedback,
    handleSendFeedback,
    handleSectionFeedback,
    handleToggleMessageSources,
  } = useChatFeedbackActions({
    operatorId,
    operatorName,
  });

  useEffect(() => {
    document.title = APP_NAME;
  }, [mode]);

  const { handleNewSession, handleSelectSession, handleDeleteSession } = useSessionManager();

  useAppInitialization({
    loadSessions,
    setSessions,
    setCurrentSessionId,
    setIsSidebarOpen,
    setIsInitialized,
  });

  const handleClearChat = () => {
    updateCurrentSession(session => ({
      ...session,
      messages: [],
      title: 'Nova Investigação',
      empresaAlvo: null,
      updatedAt: new Date().toISOString(),
    }));
    setInvestigationLogged(false);
    resetLoadingProgress();
    setRequestKind('default');
    setLoadingVariant('hero');
    setLoadingPinnedLabel(null);
    lastActionRef.current = null;
    setLastQuery('');
    setVisibleCount(PAGE_SIZE);
  };

  const dossierWaterfall = useDossierWaterfallOrchestrator({
    canUseLookup,
    resolvedOperatorName,
  });

  const { handleSendMessage, retryLastSendMessage } = useChatMessageOrchestrator({
    systemInstruction,
    resolvedOperatorName,
    canUseLookup,
    toast,
    runMegaPromptWaterfall: dossierWaterfall.runMegaPromptWaterfall,
  });

  const handleDeepDive = async (displayMessage: string, hiddenPrompt: string, forcedCompanyName?: string) => {
    const empresaContext =
      forcedCompanyName?.trim() || currentSession?.empresaAlvo || currentSession?.title || 'a empresa desta conversa';
    const isTopicDeepDive = isTopicDeepDiveDisplayMessage(displayMessage);
    if (isTopicDeepDive && !canDeepDive) {
      scoutDiag.info?.('App', 'tentativa de Deep Dive bloqueada por feature flag', {
        sessionId: currentSessionId,
        displayMessage,
      });
      return;
    }
    const topicLabel = displayMessage.replace(/^Dossi[êe]\s+completo:\s*/i, '').trim();
    await handleSendMessage(
      `Dossiê completo de [${empresaContext}]. Protocolo de investigação forense especializada:\n\n${hiddenPrompt}`,
      displayMessage,
      empresaContext,
      {
        requestKind: isTopicDeepDive ? 'deep_dive' : 'default',
        fixedLoadingLine:
          isTopicDeepDive && topicLabel
            ? `Deep Dive em andamento: ${topicLabel}`
            : isTopicDeepDive
              ? 'Deep Dive em andamento'
              : undefined,
      },
    );
  };

  const handleDeleteMessage = (id: string) => {
    if (!currentSessionId) return;
    updateSessionById(currentSessionId, session => {
      const msgIndex = session.messages.findIndex(m => m.id === id);
      if (msgIndex === -1) return session;
      return { ...session, messages: (session.messages || []).slice(0, msgIndex) };
    });
  };

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setLoadingPinnedLabel(null);
    }
  }, []);

  const handleRetry = () => {
    if (!lastActionRef.current) return;
    if (lastActionRef.current.type === 'sendMessage') {
      retryLastSendMessage();
    } else if (lastActionRef.current.type === 'regenerateSuggestions') {
      handleRegenerateSuggestions(lastActionRef.current.payload.messageId || '');
    }
  };

  const handleRegenerateSuggestions = async (messageId: string) => {
    const sessionId = currentSessionId;
    if (!sessionId) return;
    lastActionRef.current = { type: 'regenerateSuggestions', payload: { messageId } };
    const targetSession = sessions.find(s => s.id === sessionId);
    if (!targetSession) return;
    const targetMessage = targetSession.messages.find(m => m.id === messageId);
    if (!targetMessage) return;
    const companyName =
      targetSession.empresaAlvo || extractCompanyName(targetSession.title || '') || 'Empresa não identificada';
    const nomeVendedor = resolvedOperatorName;
    const oldSuggestions = Array.isArray(targetMessage.suggestions)
      ? targetMessage.suggestions
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
      : [];

    updateSessionById(sessionId, session => ({
      ...session,
      messages: (session.messages || []).map(msg => (msg.id === messageId ? { ...msg, isRegeneratingSuggestions: true } : msg)),
    }));
    try {
      const newSuggestions = await generateContinuityQuestion(
        [
          ...targetSession.messages,
          {
            ...targetMessage,
            text: targetMessage.text || '',
          },
        ],
        companyName,
        nomeVendedor,
        {
          mode: 'regenerate',
          avoidSuggestions: oldSuggestions,
          ensureFresh: true,
        },
      );
      updateSessionById(sessionId, session => ({
        ...session,
        messages: (session.messages || []).map(msg =>
          msg.id === messageId ? { ...msg, suggestions: newSuggestions, isRegeneratingSuggestions: false } : msg,
        ),
      }));
    } catch (e: unknown) {
      scoutDiag.warn('App', 'falha ao regenerar sugestões', {
        sessionId,
        messageId,
        error: e instanceof Error ? e.message : String(e),
      });
      toast.error(e instanceof Error ? e.message : 'Falha na conexão com a IA.');
      updateSessionById(sessionId, session => ({
        ...session,
        messages: (session.messages || []).map(msg =>
          msg.id === messageId ? { ...msg, isRegeneratingSuggestions: false } : msg,
        ),
      }));
    }
  };

  async function handleExportPDF() {
    try {
      const opened = openDossierPrintReport(allMessages, currentSession?.title);
      if (!opened) {
        toast.error('Não foi possível abrir a visualização de impressão. Verifique se o navegador bloqueou a nova janela.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar PDF. Tente novamente.';
      toast.error(msg);
    }
  }

  const handleExportConversation = async (format: ExportFormat, reportType: ReportType) => {
    if (!currentSession) return;
    setExportStatus('loading');
    setExportError(null);
    try {
      downloadConversationExport(currentSession, format, reportType);
      setExportStatus('success');
      setTimeout(() => setExportStatus('idle'), 3000);
    } catch (error: unknown) {
      setExportError(error instanceof Error ? error.message : 'Falha ao gerar o arquivo.');
      setExportStatus('error');
    }
  };

  if (!isInitialized) {
    return (
      <div
        className={`flex h-screen w-full items-center justify-center ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} animate-pulse`}>
            Preparando ambiente...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!isOnline && (
        <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 text-amber-950 text-xs font-semibold py-1.5 px-4 shadow-lg">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M8.464 8.464a5 5 0 000 7.072M5.636 5.636a9 9 0 000 12.728M12 12v.01"
            />
          </svg>
          Sem conexão — algumas funções ficam indisponíveis offline
        </div>
      )}

      {isOnline && wasOffline && (
        <div
          className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-emerald-600 text-white text-xs font-semibold py-1.5 px-4 shadow-lg cursor-pointer"
          onClick={clearWasOffline}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Conexão restabelecida ✕
        </div>
      )}

      <div
        className={`flex h-[100dvh] min-h-screen w-full flex-col overflow-hidden overscroll-none ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}
      >
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatErrorBoundary isDarkMode={isDarkMode}>
            <ChatInterface
            currentSession={currentSession}
            sessions={sessions}
            onNewSession={handleNewSession}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            isSidebarOpen={isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen((previous) => !previous)}
              messages={allMessages.slice(-visibleCount)}
              isLoading={isLoading}
              hasMore={allMessages.length > visibleCount}
              onSendMessage={handleSendMessage}
              onDeepDive={handleDeepDive}
              onFeedback={handleFeedback}
              onSendFeedback={handleSendFeedback}
              onSectionFeedback={handleSectionFeedback}
              onLoadMore={() => setVisibleCount(prev => prev + PAGE_SIZE)}
              onExportConversation={handleExportConversation}
              onExportPDF={handleExportPDF}
              onExportMessage={() => {}}
              onRetry={handleRetry}
              onStop={handleStopGeneration}
              onReportError={handleReportError}
              onClearChat={handleClearChat}
              onRegenerateSuggestions={handleRegenerateSuggestions}
              isDarkMode={isDarkMode}
              onToggleTheme={toggleTheme}
              onToggleMessageSources={handleToggleMessageSources}
              exportStatus={exportStatus}
              exportError={exportError}
              pdfReportContent={pdfReportContent}
              loadingVariant={loadingVariant}
              loadingPinnedLabel={loadingPinnedLabel}
              onOpenEmailModal={emailModal.open}
              onOpenFollowUpModal={followUpModal.open}
              onSaveRemote={handleSaveRemote}
              isSavingRemote={isSavingRemote}
              remoteSaveStatus={remoteSaveStatus}
              canAccessIntegrityCheck={canAccessIntegrityCheck}
              canDeepDive={canDeepDive}
              canWarRoom={canWarRoom}
              onClearOperator={clearName}
              lastUserQuery={lastQuery}
              onDeleteMessage={handleDeleteMessage}
              radar={{
                alerts: radar.alerts,
                config: radar.config,
                unreadCount: radar.unreadCount,
                isScanning: radar.isScanning,
                lastScanAt: radar.lastScanAt,
                lastError: radar.lastError,
                lastWarning: radar.lastWarning,
                onUpdateConfig: radar.updateConfig,
                onMarkAsRead: radar.markAsRead,
                onMarkAllAsRead: radar.markAllAsRead,
                onDismiss: radar.dismissAlert,
                onForceScan: radar.forceScan,
                metaInsight: null,
              }}
            />
          </ChatErrorBoundary>
        </main>
        <div className="flex-none">
          <FooterCredits />
        </div>
      </div>

      {emailModal.isOpen && (
        <React.Suspense fallback={null}>
          <EmailModal
            emailTo={emailModal.emailTo}
            onEmailToChange={emailModal.setEmailTo}
            emailSubject={emailModal.emailSubject}
            onEmailSubjectChange={emailModal.setEmailSubject}
            emailStatus={emailModal.emailStatus}
            onSend={emailModal.handleSend}
            onClose={emailModal.close}
          />
        </React.Suspense>
      )}

      {followUpModal.isOpen && (
        <React.Suspense fallback={null}>
          <FollowUpModal
            emailTo={followUpModal.emailTo}
            onEmailToChange={followUpModal.setEmailTo}
            followUpDias={followUpModal.followUpDias}
            onDiasChange={followUpModal.setFollowUpDias}
            followUpNotas={followUpModal.followUpNotas}
            onNotasChange={followUpModal.setFollowUpNotas}
            followUpStatus={followUpModal.followUpStatus}
            companyName={
              cleanTitle(extractCompanyName(currentSession?.title)) ||
              currentSession?.empresaAlvo ||
              'Conta em prospecção'
            }
            onSchedule={followUpModal.handleSchedule}
            onClose={followUpModal.close}
          />
        </React.Suspense>
      )}

      {showMigrationNotice && (
        <React.Suspense fallback={null}>
          <MigrationNoticeModal
            isDarkMode={isDarkMode}
            onDismiss={dismissMigrationNotice}
            isOpen={showMigrationNotice}
          />
        </React.Suspense>
      )}

      {updateAvailable && !showMigrationNotice && (
        <React.Suspense fallback={null}>
          <UpdateNotificationModal
            currentVersion={currentVersion}
            newVersion={newVersion}
            isDarkMode={isDarkMode}
            onDismiss={dismissUpdate}
            onUpdate={updateNow}
            isOpen={updateAvailable}
          />
        </React.Suspense>
      )}

      {isLoading && loadingVariant === 'hero' && (
        <DossierErrorBoundary isDarkMode={isDarkMode} variant="overlay">
          <React.Suspense fallback={null}>
            <LoadingSmart
              isLoading={isLoading}
              mode={mode}
              isDarkMode={isDarkMode}
              loadingVariant={loadingVariant}
              fixedStatusLine={loadingPinnedLabel || undefined}
              onStop={handleStopGeneration}
              processing={{
                stage: loadingStatus,
                completedStages: completedLoadingStatuses,
                failureCount: failureCount,
                totalStages: loadingTotalStages,
                isIncremental: loadingIsIncremental,
              }}
              searchQuery={lastQuery}
              empresaAlvo={currentSession?.empresaAlvo}
            />
          </React.Suspense>
        </DossierErrorBoundary>
      )}

      <InstallPrompt />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
      {/* VERCEL ANALYTICS RENDERIZADO NO FINAL DO APP */}
      <Analytics />
      {/* VERCEL SPEED INSIGHTS RENDERIZADO NO FINAL DO APP */}
      <SpeedInsights />
    </>
  );
};

export default App;
// Forcing deployment to resolve dossier rendering and test conflicts.
// Force build 1775507790
