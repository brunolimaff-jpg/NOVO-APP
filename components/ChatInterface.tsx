import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import MessageRow, { MessageRowData } from './MessageRow';
import { ChatInterfaceProps, Sender } from '../types';
import { useMode } from '../contexts/ModeContext';
import { useAuth, TEMPORARILY_DISABLE_CLERK } from '../contexts/AuthContext';
import SessionsSidebar from './SessionsSidebar';
import AppIconRail from './AppIconRail';
import UserMenu from './UserMenu';
import UserMenuClerkBridge from './UserMenuClerkBridge';
import EmptyStateHome from './EmptyStateHome';
import { APP_NAME } from '../constants';
import SuspenseWithError from './SuspenseWithError';
import { loadWithChunkRetry } from '../utils/chunkRetry';
const InvestigationDashboard = React.lazy(() => loadWithChunkRetry(() => import('./InvestigationDashboard')));
const SettingsDrawer = React.lazy(() => loadWithChunkRetry(() => import('./SettingsDrawer')));
const WarRoom = React.lazy(() => loadWithChunkRetry(() => import('./WarRoom')));
import { cleanTitle } from '../utils/textCleaners';
import { extractCompanyName } from '../utils/companyNameExtractor';
import { parseSmartOptions } from './SmartOptions';
import {
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
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
  radar?: RadarProps;
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

  const lastBotWithSuggestionsIndex = useMemo(
    () =>
      [...messages]
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
      [...messages]
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.sender === Sender.User)
        .map(({ i }) => i)
        .pop(),
    [messages],
  );

  // Só escondemos sugestões antigas durante uma geração ativa.
  // Se a geração falhar, as sugestões voltam a aparecer para o usuário continuar.
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStartInvestigation = async (payload: {
    companyName: string;
    cnpj: string | null;
    city: string;
    state: string;
  }) => {
    const prompt = `Conta alvo:
- Empresa: ${payload.companyName}
- CNPJ: ${payload.cnpj || 'não informado'}
- Localização: ${payload.city}/${payload.state}`;

    const hiddenPrompt = [
      'INVESTIGACAO_COMPLETA_INTEGRADA (MVP):',
      'Execute um dossie completo combinando os protocolos abaixo sem repetir seções.',
      'Priorize objetividade, fontes auditáveis e síntese executiva final.',
      `Contexto cadastral obrigatório: Empresa=${payload.companyName}; CNPJ=${payload.cnpj || 'N/D'}; Cidade=${payload.city}; UF=${payload.state}.`,
      PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
      PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
      PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
      PROMPT_RADAR_EXPANSAO_GOD_MODE,
      PROMPT_RH_SINDICATOS_GOD_MODE,
      PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
    ].join('\n\n---\n\n');

    await onDeepDive(prompt, hiddenPrompt, payload.companyName);
  };

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

  const railNewSession = () => {
    onNewSession();
    if (typeof window !== 'undefined' && window.innerWidth < 768 && isSidebarOpen) onToggleSidebar();
  };

  const railOpenKanban = () => {
    onOpenKanban?.();
    if (typeof window !== 'undefined' && window.innerWidth < 768 && isSidebarOpen) onToggleSidebar();
  };

  const headerTitle = cleanTitle(currentSession?.empresaAlvo || currentSession?.title || 'Nova Investigação');
  const displayTitle = headerTitle.length > 35 ? headerTitle.substring(0, 32) + '...' : headerTitle;
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
      handleStopWithToast,
      onSendMessage,
    ],
  );

  return (
    <div className={`flex h-full w-full overflow-hidden ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
      <AppIconRail
        isDarkMode={isDarkMode}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={onToggleSidebar}
        onNewSession={railNewSession}
        onOpenKanban={onOpenKanban ? railOpenKanban : undefined}
        canAccessMiniCRM={canAccessMiniCRM}
      />

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
        />

        <main className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col transition-all duration-300">
        <header
          className={`z-10 flex h-14 flex-shrink-0 items-center gap-2 border-b px-2 py-2 backdrop-blur-md sm:px-3 ${
            isDarkMode ? 'bg-gray-900/80 border-gray-800' : 'bg-white/80 border-gray-200'
          }`}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden sm:flex-row sm:items-center sm:gap-3">
            <p
              className={`hidden text-[10px] font-semibold uppercase tracking-wide text-emerald-600/90 sm:block sm:max-w-[140px] sm:truncate ${
                isDarkMode ? 'text-emerald-400/90' : ''
              }`}
              title={APP_NAME}
            >
              Senior Scout 360
            </p>
            <h1 className={`truncate text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {displayTitle}
            </h1>
          </div>

          <div className="hidden min-w-0 max-w-xl flex-1 px-2 sm:flex sm:justify-center">
            <label className="relative w-full max-w-md">
              <span className="sr-only">Buscar empresa ou CNPJ no histórico</span>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs opacity-50">
                🔍
              </span>
              <input
                type="search"
                value={sessionSearchTerm}
                onChange={e => setSessionSearchTerm(e.target.value)}
                placeholder="Buscar empresa ou CNPJ..."
                className={`w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                  isDarkMode
                    ? 'border-slate-700 bg-slate-800/80 text-white placeholder-slate-500'
                    : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400'
                }`}
              />
            </label>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
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
            {TEMPORARILY_DISABLE_CLERK ? (
              <UserMenu
                isDarkMode={isDarkMode}
                displayName={user?.displayName || 'Usuário'}
                isGuest={user?.isGuest}
                onOpenSettings={() => setShowSettings(true)}
                onLogout={onLogout}
              />
            ) : (
              <UserMenuClerkBridge
                isDarkMode={isDarkMode}
                displayName={user?.displayName || 'Usuário'}
                isGuest={user?.isGuest}
                onOpenSettings={() => setShowSettings(true)}
                onLogout={onLogout}
              />
            )}
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
            <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6">
              <EmptyStateHome
                mode={mode}
                onStartInvestigation={handleStartInvestigation}
                isDarkMode={isDarkMode}
              />
            </div>
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              className="custom-scrollbar"
              data={messages}
              computeItemKey={(_, message) => message.id}
              followOutput="smooth"
              initialTopMostItemIndex={messages.length - 1}
              components={{
                Header: () =>
                  hasMore ? (
                    <div className="flex justify-center py-2">
                      <button
                        onClick={onLoadMore}
                        className="text-xs text-slate-500 hover:text-emerald-500 bg-white/80 dark:bg-slate-900/80 backdrop-blur px-3 py-1 rounded-full shadow"
                      >
                        Carregar anteriores
                      </button>
                    </div>
                  ) : null,
              }}
              itemContent={(idx) => <MessageRow index={idx} data={itemData} />}
            />
          )}
        </div>

        {showRetryToast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
            <div
              className={`rounded-xl shadow-2xl border px-4 py-3 min-w-[320px] max-w-md ${
                isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">⚠️</span>
                <div className="flex-1">
                  <p className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                    Cancelado — Tentar novamente?
                  </p>
                  <button
                    onClick={handleRetryNormal}
                    className={`w-full px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      isDarkMode
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    }`}
                  >
                    🔄 Tentar novamente
                  </button>
                </div>
                <button
                  onClick={() => setShowRetryToast(false)}
                  className={`text-xl opacity-50 hover:opacity-100 transition-opacity ${
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
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
            <div
              className={`flex items-center gap-3 rounded-xl shadow-xl border px-4 py-2.5 ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
              }`}
            >
              <span className="text-sm">Mensagem excluída</span>
              <button
                onClick={handleUndoDelete}
                className="text-sm font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
              >
                Desfazer
              </button>
            </div>
          </div>
        )}

        {!isInitialGateActive && (
          <div
            className={`flex-shrink-0 p-3 pb-4 md:p-6 border-t ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
            } z-20`}
          >
            <div className="w-full max-w-5xl xl:max-w-6xl mx-auto px-1 md:px-6 lg:px-8 relative">
              <div
                className={`relative flex items-end w-full rounded-2xl border pl-4 pr-12 py-2 shadow-sm ${
                  isDarkMode ? 'border-gray-700/50 bg-gray-800/80' : 'border-gray-300 bg-white'
                }`}
              >
                {!isLoading && messages.length > 0 && messages[messages.length - 1].sender === Sender.User && (
                  <div className="absolute bottom-full left-0 mb-3 w-full flex justify-center animate-fade-in">
                    <div
                      className={`flex items-center gap-3 px-4 py-2 rounded-full shadow-md border text-xs font-semibold ${
                        isDarkMode
                          ? 'bg-slate-800 border-red-900/50 text-slate-200'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}
                    >
                      <span>⚠️ A resposta falhou ou foi perdida no reload.</span>
                      <button
                        onClick={handleRetryNormal}
                        className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-sm transition-all flex items-center gap-1"
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
                  placeholder={
                    isLoading ? 'Gerando resposta...' : 'Investigar empresa, CNPJ ou colar ficha do Spotter...'
                  }
                  disabled={isLoading}
                  rows={1}
                  className={`flex-1 bg-transparent text-sm outline-none resize-none min-h-[36px] max-h-[100px] mb-1 px-2 custom-scrollbar ${
                    isDarkMode ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
                  }`}
                  style={{ overflow: 'hidden' }}
                />
                {isLoading ? (
                  <button
                    onClick={handleStopWithToast}
                    className={`absolute right-2 bottom-2 w-10 h-10 flex items-center justify-center rounded-xl transition-all border ${
                      isDarkMode
                        ? 'bg-red-950/70 hover:bg-red-900/90 border-red-900/60 text-red-400 hover:text-red-300'
                        : 'bg-red-50 hover:bg-red-100 border-red-200 text-red-500 hover:text-red-600'
                    }`}
                    title="Parar geração"
                  >
                    <span className="text-base leading-none">⏹</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className={`absolute right-2 bottom-2 w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-md ${
                      !input.trim()
                        ? isDarkMode
                          ? 'bg-slate-700 text-slate-500'
                          : 'bg-slate-200 text-slate-400'
                        : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white hover:scale-105 active:scale-95 shadow-emerald-500/30'
                    }`}
                  >
                    <span className="text-lg ml-0.5">➤</span>
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
                className={`fixed inset-0 z-50 flex items-center justify-center ${isDarkMode ? 'bg-slate-950/90' : 'bg-white/90'}`}
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
              unreadCount={radar.unreadCount}
              isConfigured={radar.config.isConfigured}
              onMarkAsRead={radar.onMarkAsRead}
              onMarkAllAsRead={radar.onMarkAllAsRead}
              onDismiss={radar.onDismiss}
              onForceScan={radar.onForceScan}
              onOpenSettings={() => { setShowRadarPanel(false); setShowRadarSettings(true); }}
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
