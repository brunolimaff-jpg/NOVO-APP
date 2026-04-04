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

  // ── Índices computados — DEVEM estar antes do useEffect que os consome ────
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
  // ─────────────────────────────────────────────────────────────────────────

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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Lógica de investigação ────────────────────────────────────────────────
  const [investigationMode, setInvestigationMode] = useState<{
    active: boolean;
    companyName: string;
    cnpj: string | null;
    city: string;
    state: string;
  }>({ active: false, companyName: '', cnpj: null, city: '', state: '' });

  const handleStartInvestigation = useCallback(
    (payload: { companyName: string; cnpj: string | null; city: string; state: string }) => {
      const promptMode = resolvePromptMode(mode, canWarRoom);
      const hiddenPrompt = buildInvestigationHiddenPrompt(payload, {
        promptMode,
        promptVersion: PROMPT_VERSION,
        includeBudgetSizing: shouldIncludeBudgetPrompt(payload, promptMode, radar),
        radarContext: buildRadarContextBlock(radar),
      });
      setInvestigationMode({ active: true, ...payload });
      onSendMessage(hiddenPrompt, { hidden: true, displayText: `🔍 Investigando ${payload.companyName}...` });
    },
    [mode, canWarRoom, onSendMessage, radar],
  );

  const handleCloseInvestigation = useCallback(() => {
    setInvestigationMode({ active: false, companyName: '', cnpj: null, city: '', state: '' });
  }, []);

  // ── Paleta de cores por tema ──────────────────────────────────────────────
  const theme = {
    bg: isDarkMode ? 'bg-slate-950' : 'bg-slate-50',
    surface: isDarkMode ? 'bg-slate-900' : 'bg-white',
    border: isDarkMode ? 'border-slate-800' : 'border-slate-200',
    textPrimary: isDarkMode ? 'text-slate-100' : 'text-slate-900',
    textSecondary: isDarkMode ? 'text-slate-400' : 'text-slate-500',
    inputBg: isDarkMode ? 'bg-slate-800' : 'bg-white',
    inputBorder: isDarkMode ? 'border-slate-700' : 'border-slate-300',
    itemHover: isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100',
    itemActive: isDarkMode ? 'bg-slate-800' : 'bg-slate-100',
    btnSecondary: isDarkMode
      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200',
  };

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
    : user?.username || 'Usuário';

  const avatarUrl = (user as any)?.imageUrl || null;

  const handleOpenSettings = () => setShowSettings(true);
  const handleCloseSettings = () => setShowSettings(false);
  const handleOpenWarRoom = () => setShowWarRoom(true);
  const handleCloseWarRoom = () => setShowWarRoom(false);

  // ── Filtragem de sessões ──────────────────────────────────────────────────
  const filteredSessions = useMemo(() => {
    if (!sessionSearchTerm.trim()) return sessions;
    const term = sessionSearchTerm.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title?.toLowerCase().includes(term) ||
        s.companyName?.toLowerCase().includes(term),
    );
  }, [sessions, sessionSearchTerm]);

  // ── Dados das mensagens para o Virtuoso ──────────────────────────────────
  const messageRowData: MessageRowData[] = useMemo(
    () =>
      messages.map((msg) => ({
        message: msg,
        isDarkMode,
        isLoading: isLoading && msg === messages[messages.length - 1],
        onFeedback,
        onSendFeedback,
        onSectionFeedback,
        onExportMessage,
        onRetry,
        onDeepDive,
        onDeleteMessage: onDeleteMessage ? () => handleDeleteWithUndo(msg.id) : undefined,
        pendingDeleteId,
        onUndoDelete: handleUndoDelete,
        hideSuggestionsForMessageId,
        onSuggestionClick: (text: string) => {
          onSendMessage(text);
        },
        onReportError,
        canDeepDive,
      })),
    [
      messages,
      isDarkMode,
      isLoading,
      onFeedback,
      onSendFeedback,
      onSectionFeedback,
      onExportMessage,
      onRetry,
      onDeepDive,
      onDeleteMessage,
      pendingDeleteId,
      hideSuggestionsForMessageId,
      onSendMessage,
      onReportError,
      canDeepDive,
    ],
  );

  const itemContent = useCallback(
    (_index: number, data: MessageRowData) => <MessageRow {...data} />,
    [],
  );

  // Radar unread badge
  const radarUnread = radar?.unreadCount ?? 0;

  return (
    <div className={`flex h-screen overflow-hidden ${theme.bg}`}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <SessionsSidebar
        sessions={filteredSessions}
        currentSessionId={currentSession?.id ?? null}
        onSelectSession={(id) => {
          onSelectSession(id);
          if (window.innerWidth < 768) onToggleSidebar();
        }}
        onNewSession={onNewSession}
        onDeleteSession={onDeleteSession}
        isOpen={isSidebarOpen}
        onClose={onToggleSidebar}
        isDarkMode={isDarkMode}
        onSaveToCRM={onSaveToCRM}
        searchTerm={sessionSearchTerm}
        onSearchChange={setSessionSearchTerm}
      />

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className={`flex items-center justify-between px-3 py-2 border-b flex-none ${theme.surface} ${theme.border}`}>
          <div className="flex items-center gap-2 min-w-0">
            <button
              ref={sidebarToggleRef}
              type="button"
              onClick={onToggleSidebar}
              className={`p-2 rounded-lg transition-colors flex-none ${theme.itemHover}`}
              aria-label={isSidebarOpen ? 'Fechar painel lateral' : 'Abrir painel lateral'}
            >
              {isSidebarOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>

            <span className={`text-sm font-semibold truncate ${theme.textPrimary}`}>
              {currentSession?.title || APP_NAME}
            </span>
          </div>

          <div className="flex items-center gap-1 flex-none">
            {/* Radar Bell */}
            {radar && (
              <React.Suspense fallback={null}>
                <RadarBell
                  unreadCount={radarUnread}
                  isScanning={radar.isScanning}
                  isDarkMode={isDarkMode}
                  onClick={() => setShowRadarPanel(true)}
                />
              </React.Suspense>
            )}

            {/* War Room button */}
            {canWarRoom && (
              <button
                type="button"
                onClick={handleOpenWarRoom}
                className={`p-2 rounded-lg transition-colors ${theme.itemHover}`}
                title="War Room"
                aria-label="Abrir War Room"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </button>
            )}

            {/* Dashboard button */}
            {canAccessDashboard && (
              <button
                type="button"
                onClick={() => setShowDashboard(true)}
                className={`p-2 rounded-lg transition-colors ${theme.itemHover}`}
                title="Dossiê de Investigação"
                aria-label="Abrir dossiê de investigação"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            )}

            {/* Admin dashboard button */}
            {canAccessDashboard && onOpenAdminDash && (
              <button
                type="button"
                onClick={onOpenAdminDash}
                className={`p-2 rounded-lg transition-colors ${theme.itemHover}`}
                title="Painel Administrativo"
                aria-label="Abrir painel administrativo"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            )}

            {/* Theme toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              className={`p-2 rounded-lg transition-colors ${theme.itemHover}`}
              aria-label={isDarkMode ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
            >
              {isDarkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* User menu */}
            <UserMenu
              isDarkMode={isDarkMode}
              displayName={displayName}
              avatarUrl={avatarUrl}
              onOpenSettings={handleOpenSettings}
              onLogout={onLogout}
            />
          </div>
        </header>

        {/* ── Messages area ───────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 relative" ref={scrollContainerRef}>
          {messages.length === 0 ? (
            <EmptyStateHome
              isDarkMode={isDarkMode}
              onStartInvestigation={handleStartInvestigation}
              onOpenKanban={onOpenKanban}
            />
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              data={messageRowData}
              itemContent={itemContent}
              followOutput="smooth"
              increaseViewportBy={{ top: 400, bottom: 400 }}
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
          )}
        </div>

        {/* ── Input area ──────────────────────────────────────────────────── */}
        <div className={`flex-none border-t ${theme.border} ${theme.surface}`}>
          {/* Processing indicator */}
          {processing && (
            <div className={`px-4 pt-2 pb-1 text-xs ${theme.textSecondary} flex items-center gap-1.5`}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {processing}
            </div>
          )}

          {/* Retry toast */}
          {showRetryToast && (
            <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
              <span>⚠️ Erro na última tentativa. Tente novamente ou aguarde.</span>
              <button
                type="button"
                onClick={() => setShowRetryToast(false)}
                className="text-amber-600 dark:text-amber-400 hover:opacity-70 flex-none"
                aria-label="Fechar aviso"
              >✕</button>
            </div>
          )}

          <div className="p-3 flex items-end gap-2">
            {/* Investigation trigger */}
            <button
              type="button"
              onClick={() => setShowDashboard(true)}
              className={`flex-none p-2.5 rounded-xl transition-colors ${theme.btnSecondary}`}
              title="Nova Investigação"
              aria-label="Iniciar nova investigação"
            >
              🔍
            </button>

            {/* Textarea */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isInitialGateActive ? 'Digite o nome da empresa para investigar...' : 'Digite sua mensagem...'}
                disabled={isLoading || isInitialGateActive}
                rows={1}
                className={`w-full resize-none rounded-xl px-3 py-2.5 text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${theme.inputBg} ${theme.inputBorder} ${theme.textPrimary} disabled:opacity-50 max-h-40 overflow-y-auto`}
                aria-label="Campo de mensagem"
              />
            </div>

            {/* Stop / Send button */}
            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                className="flex-none p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-colors"
                aria-label="Parar geração"
                title="Parar"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isInitialGateActive}
                className="flex-none p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white transition-colors"
                aria-label="Enviar mensagem"
                title="Enviar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m-7 7l7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Overlays ──────────────────────────────────────────────────────────── */}

      {/* Investigation Dashboard */}
      {showDashboard && (
        <React.Suspense fallback={null}>
          <SuspenseWithError>
            <InvestigationDashboard
              isDarkMode={isDarkMode}
              onStartInvestigation={(payload) => {
                handleStartInvestigation(payload);
                setShowDashboard(false);
              }}
              onClose={() => setShowDashboard(false)}
            />
          </SuspenseWithError>
        </React.Suspense>
      )}

      {/* Settings Drawer */}
      {showSettings && (
        <React.Suspense fallback={null}>
          <SuspenseWithError>
            <SettingsDrawer
              isDarkMode={isDarkMode}
              onClose={handleCloseSettings}
              onExportConversation={onExportConversation}
              onExportPDF={onExportPDF}
              onClearChat={onClearChat}
              onToggleMessageSources={onToggleMessageSources}
              exportStatus={exportStatus}
              exportError={exportError}
              pdfReportContent={pdfReportContent}
              onSaveRemote={onSaveRemote}
              isSavingRemote={isSavingRemote}
              remoteSaveStatus={remoteSaveStatus}
              canAccessIntegrityCheck={canAccessIntegrityCheck}
            />
          </SuspenseWithError>
        </React.Suspense>
      )}

      {/* War Room */}
      {showWarRoom && canWarRoom && (
        <React.Suspense fallback={null}>
          <SuspenseWithError>
            <WarRoom
              isDarkMode={isDarkMode}
              messages={messages}
              onClose={handleCloseWarRoom}
              onSendMessage={onSendMessage}
              lastUserQuery={lastUserQuery}
            />
          </SuspenseWithError>
        </React.Suspense>
      )}

      {/* Radar Panel */}
      {showRadarPanel && radar && (
        <React.Suspense fallback={null}>
          <SuspenseWithError>
            <RadarPanel
              isDarkMode={isDarkMode}
              alerts={radar.alerts}
              metaInsight={radar.metaInsight}
              isScanning={radar.isScanning}
              lastScanAt={radar.lastScanAt}
              lastError={radar.lastError}
              lastWarning={radar.lastWarning}
              unreadCount={radar.unreadCount}
              onMarkAsRead={radar.onMarkAsRead}
              onMarkAllAsRead={radar.onMarkAllAsRead}
              onDismiss={radar.onDismiss}
              onForceScan={radar.onForceScan}
              onOpenSettings={() => {
                setShowRadarPanel(false);
                setShowRadarSettings(true);
              }}
              onClose={() => setShowRadarPanel(false)}
            />
          </SuspenseWithError>
        </React.Suspense>
      )}

      {/* Radar Settings */}
      {showRadarSettings && radar && (
        <React.Suspense fallback={null}>
          <SuspenseWithError>
            <RadarSettings
              isDarkMode={isDarkMode}
              config={radar.config}
              onUpdateConfig={radar.onUpdateConfig}
              onClose={() => setShowRadarSettings(false)}
            />
          </SuspenseWithError>
        </React.Suspense>
      )}
    </div>
  );
};

export default ChatInterface;
