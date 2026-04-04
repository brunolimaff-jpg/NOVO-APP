import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import MessageRow, { MessageRowData } from './MessageRow';
import { ChatInterfaceProps, Sender } from '../types';
import { useMode } from '../contexts/ModeContext';
import { useAuth } from '../contexts/AuthContext';
import SessionsSidebar from './SessionsSidebar';
import UserMenu from './UserMenu';
import EmptyStateHome from './EmptyStateHome';
import { APP_NAME } from '../constants';
import SuspenseWithError from './SuspenseWithError';
import { loadWithChunkRetry } from '../utils/chunkRetry';
const InvestigationDashboard = React.lazy(() => loadWithChunkRetry(() => import('./InvestigationDashboard')));
const SettingsDrawer = React.lazy(() => loadWithChunkRetry(() => import('./SettingsDrawer')));
const WarRoom = React.lazy(() => loadWithChunkRetry(() => import('./WarRoom')));
import { cleanTitle } from '../utils/textCleaners';
import { parseSmartOptions } from './SmartOptions';
import {
  buildInvestigationHiddenPrompt,
  PROMPT_VERSION,
} from '../prompts/megaPrompts';

import type { RadarAlert, RadarConfig } from '../types';
const RadarBell = React.lazy(() => loadWithChunkRetry(() => import('./RadarBell')));
const RadarPanel = React.lazy(() => loadWithChunkRetry(() => import('./RadarPanel')));
const RadarSettings = React.lazy(() => loadWithChunkRetry(() => import('./RadarSettings')));

export interface RadarProps {
  alerts: RadarAlert[];
  metaInsight: string | null;
  config: RadarConfig;
  unreadCount: number;
  isScanning: boolean;
  lastScanAt: number | null;
  lastError: { code: string; message: string; retryable: boolean } | null;
  lastWarning: string | null;
  onUpdateConfig: (partial: Partial<RadarConfig>) => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onForceScan: () => void;
}

type ExtendedChatInterfaceProps = ChatInterfaceProps & {
  onDeleteMessage?: (id: string) => void;
  onSaveToCRM?: (sessionId: string) => void;
  onOpenKanban?: () => void;
  onOpenAdminDash?: () => void;
  radar?: RadarProps;
};

type PromptMode = 'standard' | 'executive' | 'ultraDepth' | 'warMode';

const resolvePromptMode = (appMode: unknown, canWarRoom?: boolean): PromptMode => {
  const raw = String(appMode || '').toLowerCase();

  if (raw.includes('war')) return 'warMode';
  if (raw.includes('ultra')) return 'ultraDepth';
  if (raw.includes('deep')) return 'ultraDepth';
  if (raw.includes('exec')) return 'executive';

  if (canWarRoom) return 'executive';
  return 'executive';
};

const shouldIncludeBudgetPrompt = (
  payload: { companyName: string; cnpj: string | null; city: string; state: string },
  promptMode: PromptMode,
  radar?: RadarProps,
): boolean => {
  if (promptMode === 'warMode') return true;
  if (promptMode === 'ultraDepth') return true;
  if (payload.cnpj) return true;
  if (radar?.metaInsight) return true;
  if ((radar?.alerts?.length || 0) > 0) return true;
  return false;
};

const buildRadarContextBlock = (radar?: RadarProps): string => {
  if (!radar) return '';

  const topAlerts = (radar.alerts || [])
    .slice(0, 3)
    .map((alert: any, index) => {
      const title =
        alert?.title ||
        alert?.headline ||
        alert?.label ||
        alert?.companyName ||
        `Alerta ${index + 1}`;
      const detail =
        alert?.summary ||
        alert?.message ||
        alert?.description ||
        alert?.reason ||
        'Sem detalhe adicional';
      return `- ${title}: ${detail}`;
    });

  return [
    '<radar_context>',
    `RadarConfigured=${radar.config?.isConfigured ? 'SIM' : 'NAO'}`,
    `RadarUnreadCount=${radar.unreadCount ?? 0}`,
    `RadarIsScanning=${radar.isScanning ? 'SIM' : 'NAO'}`,
    `RadarMetaInsight=${radar.metaInsight || 'N/D'}`,
    `RadarLastWarning=${radar.lastWarning || 'N/D'}`,
    `RadarLastError=${radar.lastError ? `${radar.lastError.code}: ${radar.lastError.message}` : 'N/D'}`,
    topAlerts.length ? 'TopRadarAlerts:' : 'TopRadarAlerts: N/D',
    ...(topAlerts.length ? topAlerts : []),
    '</radar_context>',
  ].join('\n');
};

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
  onSectionFeedback,
  onLoadMore,
  onExportConversation,
  onExportPDF,
  onExportMessage,
  onRetry,
  onClearChat,
  onRegenerateSuggestions,
  onStop,
  onReportError,
  onSaveRemote,
  isSavingRemote,
  remoteSaveStatus,
  isDarkMode,
  onToggleTheme,
  onToggleMessageSources,
  exportStatus,
  exportError,
  pdfReportContent,
  onOpenFollowUpModal,
  onLogout,
  lastUserQuery,
  processing,
  onDeepDive,
  onDeleteMessage,
  onSaveToCRM,
  onOpenKanban,
  onOpenAdminDash,
  radar,
  canAccessMiniCRM = true,
  canAccessDashboard = true,
  canAccessIntegrityCheck = true,
  canDeepDive = false,
  canWarRoom = false,
}) => {
  const { mode, setMode } = useMode();
  const { user, userId, updateName } = useAuth();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);

  // ── Scroll behavior refs ──────────────────────────────────────────────────
  const userHasScrolledUpRef = useRef(false);
  const prevIsLoadingRef = useRef(false);
  // ─────────────────────────────────────────────────────────────────────────

  const [input, setInput] = useState('');
  const [showDashboard, setShowDashboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWarRoom, setShowWarRoom] = useState(false);
  const [showRadarPanel, setShowRadarPanel] = useState(false);
  const [showRadarSettings, setShowRadarSettings] = useState(false);
  const [showRetryToast, setShowRetryToast] = useState(false);
  const [sessionSearchTerm, setSessionSearchTerm] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialGateActive = messages.length === 0;

  const handleDeleteWithUndo = (msgId: string) => {
    if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    setPendingDeleteId(msgId);
    pendingDeleteTimer.current = setTimeout(() => {
      onDeleteMessage?.(msgId);
      setPendingDeleteId(null);
    }, 5000);
  };

  const handleUndoDelete = () => {
    if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    setPendingDeleteId(null);
  };

  useEffect(() => {
    const handlePrefill = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (detail?.text) {
        setInput(detail.text);
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    };
    window.addEventListener('scout:prefill', handlePrefill);
    return () => window.removeEventListener('scout:prefill', handlePrefill);
  }, []);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    if (showRetryToast) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setShowRetryToast(false), 8000);
    }
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [showRetryToast]);

  // ── Detecta scroll manual do usuário durante a geração ───────────────────
  useEffect(() => {
    // O Virtuoso renderiza o scroller como um filho direto do container
    const container = scrollContainerRef.current?.querySelector(
      '[data-virtuoso-scroller]',
    ) as HTMLElement | null;
    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      // > 120px do fundo = usuário scrollou para cima intencionalmente
      userHasScrolledUpRef.current = distanceFromBottom > 120;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const lastBotWithSuggestionsIndex = useMemo(
    () =>
      [...(messages || [])]
        .map((m, i) => ({ m, i }))
        .filter(
          ({ m }) =>
            m.sender === Sender.Bot &&
            ((m.suggestions && m.suggestions.length > 0) || parseSmartOptions(m.text).options.length > 0),
        )
        .map(({ i }) => i)
        .pop(),
    [messages],
  );

  const lastUserIndex = useMemo(
    () =>
      [...(messages || [])]
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.sender === Sender.User)
        .map(({ i }) => i)
        .pop(),
    [messages],
  );

  // ── Ao concluir geração: volta suavemente para a mensagem do usuário ──────
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;

    // Só age na transição loading true → false
    if (!wasLoading || isLoading) return;

    // Reseta flag de scroll manual para o próximo ciclo
    userHasScrolledUpRef.current = false;

    if (lastUserIndex == null || !virtuosoRef.current) return;

    setTimeout(() => {
      virtuosoRef.current?.scrollToIndex({
        index: lastUserIndex,
        behavior: 'smooth',
        align: 'start',
      });
    }, 100);
  }, [isLoading, lastUserIndex]);
// ─────────────────────────────────────────────────────────────────────────

  const hideSuggestionsForMessageId =
    isLoading &&
    lastBotWithSuggestionsIndex !== undefined &&
    lastUserIndex !== undefined &&
    lastUserIndex > lastBotWithSuggestionsIndex
      ? messages[lastBotWithSuggestionsIndex].id
      : null;

  const handleSend = () => {
    if (isInitialGateActive) return;
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStartInvestigation = useCallback(
    async (payload: {
      companyName: string;
      cnpj: string | null;
      city: string;
      state: string;
    }) => {
      const prompt = `Conta alvo:\n- Empresa: ${payload.companyName}\n- CNPJ: ${payload.cnpj || 'não informado'}\n- Localização: ${payload.city}/${payload.state}`;

      const promptMode = resolvePromptMode(mode, canWarRoom);
      const includeBudget = shouldIncludeBudgetPrompt(payload, promptMode, radar);
      const radarContextBlock = buildRadarContextBlock(radar);

      const hiddenPromptBase = buildInvestigationHiddenPrompt(
        {
          companyName: payload.companyName,
          cnpj: payload.cnpj || undefined,
          city: payload.city,
          state: payload.state,
        },
        {
          includeBudget,
          mode: promptMode,
          strictAudit: true,
          enableDiscrepancyHunter: true,
          enableCostOfDelay: true,
          promptVersion: PROMPT_VERSION,
        },
      );

      const hiddenPrompt = [hiddenPromptBase, radarContextBlock].filter(Boolean).join('\n\n');

      await onDeepDive(prompt, hiddenPrompt, payload.companyName);
    },
    [mode, canWarRoom, radar, onDeepDive],
  );

  const handleCopyMarkdown = useCallback(() => {
    const text = messages
      .filter(m => !m.isError && !m.isThinking)
      .map(m => `**${m.sender === Sender.User ? 'Você' : 'Scout 360'}:**\n${m.text}`)
      .join('\n\n---\n\n')
      .replace(/\[\[PORTA:[^\]]+\]\]/g, '');
    navigator.clipboard.writeText(text).then(() => alert('Copiado!'));
  }, [messages]);

  const handleStopWithToast = () => {
    if (onStop) onStop();
    setShowRetryToast(true);
  };

  const handleRetryNormal = () => {
    setShowRetryToast(false);
    if (onRetry) onRetry();
  };

  const handleExportDoc = () => {
    onExportConversation('doc', 'full');
  };

  const headerTitle = cleanTitle(currentSession?.empresaAlvo || currentSession?.title || 'Nova Investigação');
  const displayTitle = headerTitle.length > 35 ? `${headerTitle.substring(0, 32)}...` : headerTitle;
  const hasReport = messages.some(
    m => m.sender === Sender.Bot && !m.isThinking && !m.isError && (m.text?.length || 0) > 100,
  );

  const itemData = useMemo<MessageRowData>(
    () => ({
      messages,
      isLoading,
      isDarkMode,
      mode,
      onRetry,
      onDeleteMessage,
      onReportError,
      onFeedback,
      onSendFeedback,
      onToggleMessageSources,
      onDeepDive: canDeepDive ? onDeepDive : undefined,
      onRegenerateSuggestions,
      handleDeleteWithUndo,
      pendingDeleteId,
      hideSuggestionsForMessageId,
      setInput,
      sessionId: currentSession?.id,
      userId,
      processing,
      lastUserQuery,
      onStop: handleStopWithToast,
      onSendMessage,
      empresaAlvo: currentSession?.empresaAlvo || null,
    }),
    [
      messages,
      isLoading,
      isDarkMode,
      mode,
      onRetry,
      onDeleteMessage,
      onReportError,
      onFeedback,
      onSendFeedback,
      onToggleMessageSources,
      onDeepDive,
      canDeepDive,
      onRegenerateSuggestions,
      pendingDeleteId,
      hideSuggestionsForMessageId,
      currentSession?.id,
      currentSession?.empresaAlvo,
      userId,
      processing,
      lastUserQuery,
      onSendMessage,
    ],
  );

  return (
    <div className={`flex h-full w-full overflow-hidden ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-row">
        <SessionsSidebar
          sessions={sessions}
          currentSessionId={currentSession?.id || null}
          onSelectSession={onSelectSession}
          onNewSession={onNewSession}
          onDeleteSession={onDeleteSession}
          onSaveToCRM={onSaveToCRM || (() => {})}
          onOpenKanban={onOpenKanban || (() => {})}
          isOpen={isSidebarOpen}
          onCloseMobile={onToggleSidebar}
          isDarkMode={isDarkMode}
          canAccessMiniCRM={canAccessMiniCRM}
          searchTerm={sessionSearchTerm}
          onSearchChange={setSessionSearchTerm}
          showSearchField
          toggleButtonRef={sidebarToggleRef}
        />

        <main className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col transition-all duration-300">
          <header
            className={`z-10 grid flex-shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 border-b px-3 py-2.5 backdrop-blur-md md:grid-cols-[2.5rem_minmax(0,1fr)_auto] md:gap-x-3 md:py-2 ${
              isDarkMode ? 'border-gray-800 bg-gray-900/85' : 'border-gray-200 bg-white/90'
            }`}
          >
            <button
              type="button"
              ref={sidebarToggleRef}
              onClick={onToggleSidebar}
              className={`col-start-1 row-start-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-lg transition-colors ${
                isDarkMode
                  ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-label={isSidebarOpen ? 'Fechar painel de histórico' : 'Abrir painel de histórico'}
              aria-expanded={isSidebarOpen}
              aria-controls="sessions-sidebar-panel"
            >
              ☰
            </button>

            <div className="col-start-2 row-start-1 min-w-0 overflow-hidden">
              <p
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  isDarkMode ? 'text-emerald-400/95' : 'text-emerald-600'
                }`}
                title={APP_NAME}
              >
                Senior Scout 360
              </p>
              <h1 className={`truncate text-sm font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {displayTitle}
              </h1>
            </div>

            <div className="col-start-3 row-start-1 flex flex-shrink-0 items-center gap-0.5 md:col-start-3">
              {hasReport && !isLoading && (
                <>
                  <button
                    onClick={handleExportDoc}
                    className={`p-1.5 text-sm transition-colors ${
                      isDarkMode ? 'text-gray-400 hover:text-emerald-400' : 'text-gray-500 hover:text-emerald-500'
                    }`}
                    title="Exportar DOC"
                  >
                    📝
                  </button>
                  <button
                    onClick={onOpenFollowUpModal}
                    className={`p-1.5 text-sm transition-colors ${
                      isDarkMode ? 'text-gray-400 hover:text-emerald-400' : 'text-gray-500 hover:text-emerald-500'
                    }`}
                    title="Agendar follow-up"
                  >
                    📅
                  </button>
                  <div className={`mx-1 h-4 w-px ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />
                </>
              )}

              {canWarRoom && (
                <button
                  onClick={() => setShowWarRoom(true)}
                  className={`rounded-lg p-2 transition-all ${
                    isDarkMode
                      ? 'text-gray-500 hover:bg-gray-800 hover:text-red-400'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-red-500'
                  }`}
                  title="War Room: Inteligência Competitiva"
                >
                  ⚔️
                </button>
              )}

              {onOpenAdminDash && (
                <button
                  onClick={onOpenAdminDash}
                  className={`rounded-lg p-2 transition-all ${
                    isDarkMode
                      ? 'text-amber-400 hover:bg-slate-800 hover:text-amber-300'
                      : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'
                  }`}
                  title="Dashboard Admin"
                  aria-label="Abrir Dashboard Admin"
                >
                  📊
                </button>
              )}

              {radar && (
                <React.Suspense fallback={null}>
                  <RadarBell
                    unreadCount={radar.unreadCount}
                    isScanning={radar.isScanning}
                    onClick={() => setShowRadarPanel(true)}
                    isDarkMode={isDarkMode}
                  />
                </React.Suspense>
              )}

              <UserMenu
                isDarkMode={isDarkMode}
                displayName={user?.displayName || 'Usuário'}
                onOpenSettings={() => setShowSettings(true)}
                onLogout={onLogout}
              />
            </div>
          </header>

          {showSettings && (
            <SuspenseWithError>
              <SettingsDrawer
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                userName={user?.displayName || ''}
                onUpdateName={updateName}
                mode={mode}
                onSetMode={setMode}
                isDarkMode={isDarkMode}
                onToggleTheme={onToggleTheme}
                onOpenDashboard={() => canAccessDashboard && setShowDashboard(true)}
                onExportPDF={onExportPDF}
                onCopyMarkdown={handleCopyMarkdown}
                onScheduleFollowUp={onOpenFollowUpModal}
                onLogout={onLogout}
                exportStatus={exportStatus}
                canAccessDashboard={canAccessDashboard}
                canAccessIntegrityCheck={canAccessIntegrityCheck}
              />
            </SuspenseWithError>
          )}

          {showDashboard && canAccessDashboard && (
            <SuspenseWithError>
              <InvestigationDashboard
                onClose={() => setShowDashboard(false)}
                onSelectEmpresa={empresa => {
                  onSendMessage(`Investigar ${empresa}`);
                  setShowDashboard(false);
                }}
              />
            </SuspenseWithError>
          )}

          <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-hidden">
            {messages.length === 0 ? (
              <div className="h-full min-h-0 overflow-y-auto custom-scrollbar">
                <EmptyStateHome
                  mode={mode}
                  onStartInvestigation={handleStartInvestigation}
                  isDarkMode={isDarkMode}
                  radarAlerts={radar?.alerts}
                  radarIsScanning={radar?.isScanning}
                  onForceScan={radar?.onForceScan}
                  onOpenRadar={() => setShowRadarPanel(true)}
                />
              </div>
            ) : (
              <Virtuoso
                ref={virtuosoRef}
                style={{ height: '100%' }}
                className="custom-scrollbar"
                data={messages}
                computeItemKey={(_, message) => message.id}
                followOutput={isLoading && !userHasScrolledUpRef.current ? 'smooth' : false}
                initialTopMostItemIndex={messages.length - 1}
                components={{
                  Header: () =>
                    hasMore ? (
                      <div className="flex justify-center py-2">
                        <button
                          onClick={onLoadMore}
                          className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-500 shadow backdrop-blur hover:text-emerald-500 dark:bg-slate-900/80"
                        >
                          Carregar anteriores
                        </button>
                      </div>
                    ) : null,
                }}
                itemContent={idx => <MessageRow index={idx} data={itemData} />}
              />
            )}
          </div>

          {showRetryToast && (
            <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 animate-fade-in">
              <div
                className={`min-w-[320px] max-w-md rounded-xl border px-4 py-3 shadow-2xl ${
                  isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-xl">⚠️</span>
                  <div className="flex-1">
                    <p className={`mb-2 text-sm font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      Cancelado — Tentar novamente?
                    </p>
                    <button
                      onClick={handleRetryNormal}
                      className={`w-full rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                        isDarkMode
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                          : 'bg-emerald-500 text-white hover:bg-emerald-600'
                      }`}
                    >
                      🔄 Tentar novamente
                    </button>
                  </div>
                  <button
                    onClick={() => setShowRetryToast(false)}
                    className={`text-xl opacity-50 transition-opacity hover:opacity-100 ${
                      isDarkMode ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )}

          {pendingDeleteId && (
            <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
              <div
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 shadow-xl ${
                  isDarkMode ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                }`}
              >
                <span className="text-sm">Mensagem excluída</span>
                <button
                  onClick={handleUndoDelete}
                  className="text-sm font-bold text-emerald-500 transition-colors hover:text-emerald-400"
                >
                  Desfazer
                </button>
              </div>
            </div>
          )}

          {!isInitialGateActive && (
            <div
              className={`z-20 flex-shrink-0 border-t p-3 pb-4 md:p-6 ${
                isDarkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="relative mx-auto w-full max-w-5xl px-1 md:px-6 lg:px-8 xl:max-w-6xl">
                <div
                  className={`relative flex w-full items-end rounded-2xl border py-2 pl-4 pr-12 shadow-sm ${
                    isDarkMode ? 'border-gray-700/50 bg-gray-800/80' : 'border-gray-300 bg-white'
                  }`}
                >
                  {!isLoading && messages.length > 0 && messages[messages.length - 1].sender === Sender.User && (
                    <div className="absolute bottom-full left-0 mb-3 flex w-full justify-center animate-fade-in">
                      <div
                        className={`flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-semibold shadow-md ${
                          isDarkMode
                            ? 'border-red-900/50 bg-slate-800 text-slate-200'
                            : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                      >
                        <span>⚠️ A resposta falhou ou foi perdida no reload.</span>
                        <button
                          onClick={handleRetryNormal}
                          className="flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-white shadow-sm transition-all hover:bg-red-500"
                        >
                          <span className="text-sm">🔄</span> Gerar Resposta
                        </button>
                      </div>
                    </div>
                  )}

                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    aria-label="Mensagem da investigação"
                    placeholder={
                      isLoading ? 'Gerando resposta...' : 'Investigar empresa, CNPJ ou colar ficha do Spotter...'
                    }
                    disabled={isLoading}
                    rows={1}
                    className={`custom-scrollbar mb-1 min-h-[36px] max-h-[100px] flex-1 resize-none bg-transparent px-2 text-sm outline-none ${
                      isDarkMode ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
                    }`}
                    style={{ overflow: 'hidden' }}
                  />

                  {isLoading ? (
                    <button
                      onClick={handleStopWithToast}
                      className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                        isDarkMode
                          ? 'border-red-900/60 bg-red-950/70 text-red-400 hover:bg-red-900/90 hover:text-red-300'
                          : 'border-red-200 bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600'
                      }`}
                      title="Parar geração"
                    >
                      <span className="text-base leading-none">⏹</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-xl shadow-md transition-all ${
                        !input.trim()
                          ? isDarkMode
                            ? 'bg-slate-700 text-slate-500'
                            : 'bg-slate-200 text-slate-400'
                          : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-emerald-500/30 hover:scale-105 hover:from-emerald-400 hover:to-emerald-500 active:scale-95'
                      }`}
                    >
                      <span className="ml-0.5 text-lg">➤</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {canWarRoom && showWarRoom && (
            <SuspenseWithError
              fallback={
                <div
                  className={`fixed inset-0 z-50 flex items-center justify-center ${
                    isDarkMode ? 'bg-slate-950/90' : 'bg-white/90'
                  }`}
                >
                  <div className={`text-sm font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Carregando War Room...
                  </div>
                </div>
              }
            >
              <WarRoom
                isOpen={showWarRoom}
                onClose={() => setShowWarRoom(false)}
                isDarkMode={isDarkMode}
                defaultCompetitorTarget={null}
              />
            </SuspenseWithError>
          )}

          {radar && showRadarPanel && (
            <SuspenseWithError>
              <RadarPanel
                alerts={radar.alerts}
                metaInsight={radar.metaInsight}
                isScanning={radar.isScanning}
                lastScanAt={radar.lastScanAt}
                scanError={radar.lastError}
                scanWarning={radar.lastWarning}
                unreadCount={radar.unreadCount}
                isConfigured={radar.config.isConfigured}
                onMarkAsRead={radar.onMarkAsRead}
                onMarkAllAsRead={radar.onMarkAllAsRead}
                onDismiss={radar.onDismiss}
                onForceScan={radar.onForceScan}
                onOpenSettings={() => {
                  setShowRadarPanel(false);
                  setShowRadarSettings(true);
                }}
                onClose={() => setShowRadarPanel(false)}
                isDarkMode={isDarkMode}
              />
            </SuspenseWithError>
          )}

          {radar && showRadarSettings && (
            <React.Suspense fallback={null}>
              <RadarSettings
                config={radar.config}
                onUpdateConfig={radar.onUpdateConfig}
                lastScanAt={radar.lastScanAt}
                onClose={() => setShowRadarSettings(false)}
                isDarkMode={isDarkMode}
              />
            </React.Suspense>
          )}
        </main>
      </div>
    </div>
  );
};

export default ChatInterface;
