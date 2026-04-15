import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOffline } from './hooks/useOffline';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import { useSessionStorage } from './hooks/useSessionStorage';
import { useRadar } from './hooks/useRadar';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useChatLoadingProgress } from './features/chat/loading-progress';
import { useSessionManager, useSessionRemoteSave } from './features/chat/session-controller';
import { useChatFeedbackActions } from './features/chat/feedback-actions';
import {
  useChatMessageOrchestrator,
  type LastAction,
} from './features/chat/message-orchestrator';
import { useDossierWaterfallOrchestrator } from './features/dossier/waterfall-orchestrator';
import { useUpdateNotification } from './hooks/useUpdateNotification';
import ToastContainer from './components/ToastContainer';
import ChatInterface from './components/ChatInterface';
import LoadingSmart from './components/LoadingSmart';
import { EmailModal } from './components/EmailModal';
import { FollowUpModal } from './components/FollowUpModal';
import { UpdateNotificationModal } from './components/UpdateNotificationModal';
import InstallPrompt from './components/InstallPrompt';
import { CRMView } from './components/CRMView';
import { AdminDash } from './components/AdminDash';
import { useOperator } from './contexts/OperatorContext';
import { useMode } from './contexts/ModeContext';
import { useCRM } from './contexts/CRMContext';
import { loadWithChunkRetry } from './utils/chunkRetry';
import SuspenseWithError from './components/SuspenseWithError';
const CRMDetail = React.lazy(() =>
  loadWithChunkRetry(() => import('./components/CRMDetail')).then(m => ({ default: m.CRMDetail })),
);
import {
  Message,
  Sender,
  ChatSession,
  ExportFormat,
  ReportType,
  AppError,
  CRMStage,
} from './types';
import { generateContinuityQuestion } from './services/geminiService';

import { APP_NAME, DEFAULT_MODE } from './constants';
import { downloadFile } from './utils/downloadHelpers';
import { cleanTitle } from './utils/textCleaners';
import { fixFakeLinksHTML } from './utils/linkFixer';
import { BACKEND_URL } from './services/apiConfig';
import { extractCompanyName } from './utils/companyNameExtractor';
import { convertMarkdownToHTML, simpleMarkdownToHtml } from './utils/markdownToHtml';
import {
  collectFullReport,
  detectInconsistencies,
  generateExecutiveSummary,
  normalizeMermaidBlocks,
} from './utils/reportUtils';
import { getFeatureAccess } from './utils/featureAccess';
import { scoutDiag } from './utils/diagnosticLog';
import FooterCredits from './components/FooterCredits';

// --- INJETADO ANALYTICS AQUI ---
import { Analytics } from "@vercel/analytics/react";
// --- INJETADO SPEED INSIGHTS AQUI ---
import { SpeedInsights } from "@vercel/speed-insights/react";

const PAGE_SIZE = 20;
type FollowUpScheduleResult = { ok: boolean; method?: 'outlook' | 'ics'; error?: string };

function isTopicDeepDiveDisplayMessage(displayMessage: string | undefined): boolean {
  const safeDisplay = (displayMessage || '').trim();
  return /^Dossi[êe]\s+completo:\s*/i.test(safeDisplay);
}

const App: React.FC = () => {
  const { name: operatorName, operatorId, clearName } = useOperator();
  const { mode, systemInstruction } = useMode();
  const { cards, createCardFromSession, moveCardToStage } = useCRM();
  const { isOnline, wasOffline, clearWasOffline } = useOffline();
  const { isDarkMode, toggleTheme } = useTheme();
  const { sessions, setSessions, sessionsRef, isInitialized, setIsInitialized, loadSessions } = useSessionStorage();

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const {
    isLoading,
    setIsLoading,
    loadingStatus,
    failureCount,
    setFailureCount,
    completedLoadingStatuses,
    loadingTotalStages,
    loadingIsIncremental,
    requestKind,
    setRequestKind,
    loadingVariant,
    setLoadingVariant,
    loadingPinnedLabel,
    setLoadingPinnedLabel,
    resetLoadingProgress,
    advanceLoadingProgress,
    replaceLoadingProgressStage,
    completeLoadingProgress,
  } = useChatLoadingProgress();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [lastQuery, setLastQuery] = useState<string>('');
  const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  const [pdfReportContent, setPdfReportContent] = useState<string | null>(null);
  const [investigationLogged, setInvestigationLogged] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'crm' | 'admin'>('chat');
  const [selectedCRMCardId, setSelectedCRMCardId] = useState<string | null>(null);
  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailStatus, setEmailStatus] = useState<'sending' | 'sent' | 'error' | null>(null);

  // Follow-up modal state
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpDias, setFollowUpDias] = useState(7);
  const [followUpNotas, setFollowUpNotas] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Update notification state
  const { updateAvailable, currentVersion, newVersion, dismissUpdate, updateNow } = useUpdateNotification();

  const { toasts, toast, dismiss: dismissToast } = useToast();
  const radar = useRadar(toast);
  const lastActionRef = useRef<LastAction | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeGenerationRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showEmailModal) setShowEmailModal(false);
        if (showFollowUpModal) setShowFollowUpModal(false);
      }
    };
    if (showEmailModal || showFollowUpModal) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showEmailModal, showFollowUpModal]);

  const currentSession = sessions.find(s => s.id === currentSessionId) || null;
  const allMessages = Array.isArray(currentSession?.messages) ? currentSession.messages : [];
  const selectedCRMCard = selectedCRMCardId ? cards.find(c => c.id === selectedCRMCardId) || null : null;
  const featureAccess = getFeatureAccess();
  const canAccessMiniCRM = featureAccess.miniCRM;
  const canAccessDashboard = featureAccess.dashboard;
  const canAccessIntegrityCheck = featureAccess.integrityCheck;
  const canUseLookup = featureAccess.clientLookup;
  const canDeepDive = featureAccess.deepDive;
  const canWarRoom = featureAccess.warRoom;
  const resolvedOperatorName = operatorName.trim() || 'Vendedor';

  useEffect(() => {
    if (!canAccessMiniCRM && activeView === 'crm') {
      setActiveView('chat');
      setSelectedCRMCardId(null);
    }
  }, [activeView, canAccessMiniCRM]);

  const updateSessionById = useCallback(
    (sessionId: string, updater: (session: ChatSession) => ChatSession) => {
      setSessions(prev =>
        prev.map(s => (s.id === sessionId ? { ...updater(s), updatedAt: new Date().toISOString() } : s)),
      );
    },
    [setSessions],
  );

  const updateCurrentSession = useCallback(
    (updater: (session: ChatSession) => ChatSession) => {
      setSessions(prev => {
        const target = prev.find(s => s.id === currentSessionId);
        if (!target) return prev;
        return prev.map(s => (s.id === currentSessionId ? { ...updater(s), updatedAt: new Date().toISOString() } : s));
      });
    },
    [currentSessionId, setSessions],
  );

  const { isSavingRemote, remoteSaveStatus, setRemoteSaveStatus, handleSaveRemote } = useSessionRemoteSave({
    currentSession,
    operatorId,
    operatorName: resolvedOperatorName,
    updateSessionById,
  });
  const {
    handleReportError,
    handleFeedback,
    handleSendFeedback,
    handleSectionFeedback,
    handleToggleMessageSources,
  } = useChatFeedbackActions({
    currentSession,
    operatorId,
    operatorName,
    updateCurrentSession,
    updateSessionById,
  });

  useEffect(() => {
    document.title = APP_NAME;
  }, [mode]);

  const { handleNewSession, handleSelectSession, handleDeleteSession } = useSessionManager({
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    isLoading,
    abortControllerRef,
    activeGenerationRef,
    updateSessionById,
    setVisibleCount,
    setRemoteSaveStatus,
    setExportStatus,
    setPdfReportContent,
    setInvestigationLogged,
    lastActionRef,
    setLastQuery,
    resetLoadingProgress,
    setIsLoading,
  });

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
    updateSessionById,
    resetLoadingProgress,
    advanceLoadingProgress,
    replaceLoadingProgressStage,
    completeLoadingProgress,
    setFailureCount,
  });

  const { handleSendMessage, retryLastSendMessage } = useChatMessageOrchestrator({
    currentSessionId,
    setSessions,
    setCurrentSessionId,
    sessionsRef,
    lastActionRef,
    abortControllerRef,
    activeGenerationRef,
    updateSessionById,
    systemInstruction,
    mode,
    resolvedOperatorName,
    canUseLookup,
    requestKind,
    setRequestKind,
    setIsLoading,
    resetLoadingProgress,
    advanceLoadingProgress,
    completeLoadingProgress,
    setFailureCount,
    setLoadingVariant,
    setLoadingPinnedLabel,
    setVisibleCount,
    setLastQuery,
    toast,
    investigationLogged,
    setInvestigationLogged,
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
        targetSession.messages,
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
      console.warn('Suggestion regeneration failed', e);
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
      const { text: fullText, sections, allLinks } = collectFullReport(allMessages);
      if (!fullText || fullText.length < 100) {
        alert('Nenhum dossiê para exportar.');
        return;
      }
      const inconsistenciesSection = detectInconsistencies(sections);
      const normalizedFullText = normalizeMermaidBlocks(fullText);
      const executiveSummary = generateExecutiveSummary(normalizedFullText, sections, inconsistenciesSection);
      const finalText = `${executiveSummary}\n\n---\n\n${normalizedFullText}${inconsistenciesSection}`;
      const empresa = cleanTitle(extractCompanyName(currentSession?.title));
      const now = new Date();
      const dataStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      const horaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const metaLine = `${dataStr} às ${horaStr} · ${sections.length} seção${sections.length !== 1 ? 'ões' : ''}`;
      const { PDFGenerator } = await import('./utils/PDFGenerator');
      const pdf = new PDFGenerator();
      pdf.addHeader(empresa, metaLine);
      await pdf.renderMarkdown(finalText);
      pdf.addSources(allLinks.map(l => ({ text: l.title || l.url, url: l.url })));
      const safeTitle = empresa.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      pdf.save(`SeniorScout_${safeTitle}_${now.toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error('Erro ao gerar PDF:', e);
      toast.error('Erro ao gerar PDF. Tente novamente.');
    }
  }

  const handleExportConversation = async (format: ExportFormat, reportType: ReportType) => {
    if (!currentSession) return;
    setExportStatus('loading');
    setExportError(null);
    try {
      const { text: fullText, sections } = collectFullReport(currentSession.messages);
      const inconsistenciesSection = detectInconsistencies(sections);
      const normalizedText = normalizeMermaidBlocks(fullText);
      const executiveSummary = generateExecutiveSummary(normalizedText, sections, inconsistenciesSection);
      const contentMarkdown =
        reportType === 'executive'
          ? executiveSummary
          : `${executiveSummary}\n\n---\n\n${normalizedText}${inconsistenciesSection}`;
      const safeTitle = cleanTitle(currentSession.title).replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      const dateStr = new Date().toISOString().slice(0, 10);
      const reportSuffix = reportType === 'executive' ? 'EXEC' : reportType === 'tech' ? 'FICHA' : 'DOSSIE';
      const filename = `SeniorScout_${safeTitle}_${reportSuffix}_${dateStr}`;
      if (format === 'md') {
        downloadFile(`${filename}.md`, contentMarkdown, 'text/markdown;charset=utf-8');
      } else if (format === 'doc') {
        const htmlContent = simpleMarkdownToHtml(contentMarkdown, currentSession.title);
        downloadFile(`${filename}.doc`, htmlContent, 'application/msword');
      }
      setExportStatus('success');
      setTimeout(() => setExportStatus('idle'), 3000);
    } catch (error: unknown) {
      setExportError(error instanceof Error ? error.message : 'Falha ao gerar o arquivo.');
      setExportStatus('error');
    }
  };

  async function handleSendEmail() {
    if (!emailTo.includes('@')) return;
    setEmailStatus('sending');
    try {
      const { text: fullText, sections } = collectFullReport(allMessages);
      if (!fullText || fullText.length < 100) {
        setEmailStatus('error');
        return;
      }
      const inconsistenciesSection = detectInconsistencies(sections);
      const htmlBody = fixFakeLinksHTML(convertMarkdownToHTML(fullText + inconsistenciesSection, true));
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'sendEmail',
          email: emailTo,
          subject: emailSubject,
          body: htmlBody,
          empresa: cleanTitle(extractCompanyName(currentSession?.title)),
          vendedor: resolvedOperatorName,
        }),
      });
      const text = await response.text();
      let result: { success: boolean };
      try {
        result = JSON.parse(text) as { success: boolean };
      } catch {
        result = response.ok ? { success: true } : { success: false };
      }
      if (result.success) {
        setEmailStatus('sent');
        setTimeout(() => {
          setShowEmailModal(false);
          setEmailStatus(null);
          setEmailTo('');
        }, 3000);
      } else {
        setEmailStatus('error');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      scoutDiag.warn('Email', 'handleSendEmail falhou', { error: message });
      setEmailStatus('error');
      toast.error('Falha ao enviar email. Verifique sua conexão.');
    }
  }

  function handleScheduleFollowUp(result: FollowUpScheduleResult) {
    setFollowUpStatus('sending');
    if (result.ok) {
      setFollowUpStatus('sent');
      setTimeout(() => {
        setShowFollowUpModal(false);
        setFollowUpStatus('idle');
        setFollowUpNotas('');
      }, 2200);
      return;
    }
    setFollowUpStatus('error');
    toast.error(result.error || 'Não foi possível preparar o follow-up.');
  }

  const handleSaveToCRM = async (sessionId: string) => {
    if (!canAccessMiniCRM) {
      toast.error('Mini CRM indisponível no modo MVP.');
      return;
    }
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const existingCard = cards.find(c => c.id === `crm_${sessionId}`);
    if (existingCard) {
      setSelectedCRMCardId(existingCard.id);
      setActiveView('crm');
      toast.success('Empresa já existe no CRM.');
      return;
    }
    const card = await createCardFromSession(session);
    toast.success(`${card.companyName} adicionada ao CRM!`);
    setSelectedCRMCardId(card.id);
    setActiveView('crm');
  };

  const handleMoveStageFromDetail = async (stage: string) => {
    if (selectedCRMCardId) await moveCardToStage(selectedCRMCardId, stage as CRMStage);
  };

  const handleSelectSessionFromDetail = async (sessionId: string) => {
    await handleSelectSession(sessionId);
    setActiveView('chat');
    setSelectedCRMCardId(null);
  };

  const handleCreateSessionFromDetail = () => {
    if (!selectedCRMCard) return;
    const companyName = selectedCRMCard.companyName || 'Empresa';
    setSelectedCRMCardId(null);
    setActiveView('chat');
    setTimeout(() => {
      handleNewSession();
      window.dispatchEvent(new CustomEvent('scout:prefill', { detail: { text: companyName } }));
    }, 80);
  };

  const handleOpenKanbanSafe = () => {
    if (!canAccessMiniCRM) {
      toast.error('Mini CRM indisponível no modo MVP.');
      return;
    }
    setActiveView('crm');
    setSelectedCRMCardId(null);
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
          {activeView === 'admin' ? (
            <AdminDash
              sessions={sessions}
              isDarkMode={isDarkMode}
              onClose={() => setActiveView('chat')}
            />
          ) : activeView === 'chat' || !canAccessMiniCRM ? (
            <ChatInterface
              currentSession={currentSession}
              sessions={sessions}
              onNewSession={handleNewSession}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              onSaveToCRM={handleSaveToCRM}
              onOpenKanban={handleOpenKanbanSafe}
              onOpenAdminDash={canAccessDashboard ? () => setActiveView('admin') : undefined}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
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
              onOpenEmailModal={() => {
                setEmailSubject(
                  'Dossiê de Inteligência — ' +
                    cleanTitle(extractCompanyName(currentSession?.title)) +
                    ' — 🦅 Senior Scout 360',
                );
                setShowEmailModal(true);
                setEmailStatus(null);
              }}
              onOpenFollowUpModal={() => {
                setShowFollowUpModal(true);
                setFollowUpStatus('idle');
              }}
              onSaveRemote={handleSaveRemote}
              isSavingRemote={isSavingRemote}
              remoteSaveStatus={remoteSaveStatus}
              canAccessMiniCRM={canAccessMiniCRM}
              canAccessDashboard={canAccessDashboard}
              canAccessIntegrityCheck={canAccessIntegrityCheck}
              canDeepDive={canDeepDive}
              canWarRoom={canWarRoom}
              onClearOperator={() => {
                clearName();
                setActiveView('chat');
                setSelectedCRMCardId(null);
              }}
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
          ) : (
            <CRMView
              isDarkMode={isDarkMode}
              onSelectCard={setSelectedCRMCardId}
              onBackToChat={() => setActiveView('chat')}
              canAccessMiniCRM={canAccessMiniCRM}
            />
          )}
        </main>
        <div className="flex-none">
          <FooterCredits />
        </div>
      </div>

      {selectedCRMCard && canAccessMiniCRM && (
        <SuspenseWithError>
          <CRMDetail
            card={selectedCRMCard}
            sessions={sessions}
            onClose={() => setSelectedCRMCardId(null)}
            onSelectSession={handleSelectSessionFromDetail}
            onMoveStage={handleMoveStageFromDetail}
            onCreateSessionFromCard={handleCreateSessionFromDetail}
            isDarkMode={isDarkMode}
          />
        </SuspenseWithError>
      )}

      {showEmailModal && (
        <EmailModal
          emailTo={emailTo}
          onEmailToChange={setEmailTo}
          emailSubject={emailSubject}
          onEmailSubjectChange={setEmailSubject}
          emailStatus={emailStatus}
          onSend={handleSendEmail}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {showFollowUpModal && (
        <FollowUpModal
          emailTo={emailTo}
          onEmailToChange={setEmailTo}
          followUpDias={followUpDias}
          onDiasChange={setFollowUpDias}
          followUpNotas={followUpNotas}
          onNotasChange={setFollowUpNotas}
          followUpStatus={followUpStatus}
          companyName={
            cleanTitle(extractCompanyName(currentSession?.title)) ||
            currentSession?.empresaAlvo ||
            'Conta em prospecção'
          }
          onSchedule={handleScheduleFollowUp}
          onClose={() => setShowFollowUpModal(false)}
        />
      )}

      {updateAvailable && (
        <UpdateNotificationModal
          currentVersion={currentVersion}
          newVersion={newVersion}
          isDarkMode={isDarkMode}
          onDismiss={dismissUpdate}
          onUpdate={updateNow}
          isOpen={updateAvailable}
        />
      )}

      {isLoading && loadingVariant === 'hero' && (
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

