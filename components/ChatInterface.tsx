import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { motion } from 'framer-motion';
import MessageRow, { MessageRowData } from './MessageRow';
import { ChatInterfaceProps, Sender } from '../types';
import { useMode } from '../contexts/ModeContext';
import { useAuth } from '../contexts/AuthContext';
import SessionsSidebar from './SessionsSidebar';
import UserMenu from './UserMenu';
import EmptyStateHome from './EmptyStateHome';
import GreetingWelcomeScreen from './GreetingWelcomeScreen';
import { APP_NAME } from '../constants';
import SuspenseWithError from './SuspenseWithError';
import { loadWithChunkRetry } from '../utils/chunkRetry';
import { scoutDiag } from '../utils/diagnosticLog';
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
  loadingPinnedLabel,
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
  const { user, userId, updateName, login, loading } = useAuth();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);

  // ── Scroll behavior refs ──────────────────────────────────────────────────
  const userHasScrolledUpRef = useRef(false);
  const malformedProcessingSignatureRef = useRef<string | null>(null);
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
  const safeMessages = Array.isArray(messages) ? messages : [];
  const showInitialHome = !currentSession || safeMessages.length === 0;

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
    const container = scrollContainerRef.current?.querySelector(
      '[data-virtuoso-scroller]',
    ) as HTMLElement | null;
    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      userHasScrolledUpRef.current = distanceFromBottom > 120;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Índices computados — DEVEM estar antes do useEffect que os consome ────
  const lastBotWithSuggestionsIndex = useMemo(
    () =>
      [...safeMessages]
        .map((m, i) => ({ m, i }))
        .filter(
          ({ m }) =>
            m.sender === Sender.Bot &&
            ((m.suggestions && m.suggestions.length > 0) || parseSmartOptions(m.text).options.length > 0),
        )
        .map(({ i }) => i)
        .pop(),
    [safeMessages],
  );

  const lastUserIndex = useMemo(
    () =>
      [...safeMessages]
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.sender === Sender.User)
        .map(({ i }) => i)
        .pop(),
    [safeMessages],
  );

  const processingInfo = useMemo(() => {
    if (!processing) return null;

    const stage = typeof processing.stage === 'string' ? processing.stage.trim() : '';
    const completedStages = Array.isArray(processing.completedStages) ? processing.completedStages : [];
    const failureCount =
      typeof processing.failureCount === 'number' && Number.isFinite(processing.failureCount)
        ? processing.failureCount
        : 0;
    const totalStages =
      typeof processing.totalStages === 'number' && Number.isFinite(processing.totalStages)
        ? processing.totalStages
        : null;

    const details: string[] = [];
    if (completedStages.length > 0) {
      details.push(
        totalStages && totalStages > 0
          ? `${completedStages.length}/${totalStages} etapas`
          : `${completedStages.length} ${completedStages.length === 1 ? 'etapa' : 'etapas'}`,
      );
    }
    if (failureCount > 0) {
      details.push(`tentativa ${failureCount + 1}`);
    }

    return {
      label: stage || 'Processando...',
      detailText: details.join(' • '),
      stageType: typeof processing.stage,
      completedStagesIsArray: Array.isArray(processing.completedStages),
      failureCountType: typeof processing.failureCount,
      totalStagesType: typeof processing.totalStages,
      isMalformed:
        typeof processing.stage !== 'string' ||
        !Array.isArray(processing.completedStages),
    };
  }, [processing]);

  useEffect(() => {
    if (!processingInfo?.isMalformed) {
      malformedProcessingSignatureRef.current = null;
      return;
    }

    const logPayload = {
      stageType: processingInfo.stageType,
      completedStagesIsArray: processingInfo.completedStagesIsArray,
      failureCountType: processingInfo.failureCountType,
      totalStagesType: processingInfo.totalStagesType,
      sessionId: currentSession?.id ?? null,
    };
    const signature = JSON.stringify(logPayload);
    if (malformedProcessingSignatureRef.current === signature) return;

    malformedProcessingSignatureRef.current = signature;
    scoutDiag.warn(
      'ChatInterface',
      'processing payload malformado no indicador inferior',
      logPayload,
    );
  }, [currentSession?.id, processingInfo]);
  // ─────────────────────────────────────────────────────────────────────────

  // O auto-scroll forçado ao finalizar a geração foi removido para permitir leitura estável do topo.
  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const hideSuggestionsForMessageId =
    isLoading &&
    lastBotWithSuggestionsIndex !== undefined &&
    lastUserIndex !== undefined &&
    lastUserIndex > lastBotWithSuggestionsIndex
      ? safeMessages[lastBotWithSuggestionsIndex]?.id ?? null
      : null;

  const handleSend = () => {
    if (showInitialHome) return;
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
  const handleStartInvestigation = useCallback(
    async (payload: { companyName: string; cnpj: string | null; city: string; state: string }) => {
      const prompt = `🔍 Investigando ${payload.companyName}...`;
      const promptMode = resolvePromptMode(mode, canWarRoom);
      const hiddenPromptBase = buildInvestigationHiddenPrompt(
        {
          companyName: payload.companyName,
          cnpj: payload.cnpj || undefined,
          city: payload.city,
          state: payload.state,
        },
        {
          includeBudget: shouldIncludeBudgetPrompt(payload, promptMode, radar),
          mode: promptMode,
          strictAudit: true,
          enableDiscrepancyHunter: true,
          enableCostOfDelay: true,
          promptVersion: PROMPT_VERSION,
        },
      );
      const hiddenPrompt = [hiddenPromptBase, buildRadarContextBlock(radar)].filter(Boolean).join('\n\n');
      await onDeepDive(prompt, hiddenPrompt, payload.companyName);
    },
    [mode, canWarRoom, radar, onDeepDive],
  );

  const handleCopyMarkdown = useCallback(() => {
    const text = safeMessages
      .filter(m => !m.isError && !m.isThinking)
      .map(m => `**${m.sender === Sender.User ? 'Você' : 'Scout 360'}:**\n${m.text}`)
      .join('\n\n---\n\n')
      .replace(/\[\[PORTA:[^\]]+\]\]/g, '');

    void navigator.clipboard.writeText(text);
  }, [safeMessages]);

  const handleStopWithToast = useCallback(() => {
    onStop?.();
    setShowRetryToast(true);
  }, [onStop]);

  const handleRetryNormal = useCallback(() => {
    setShowRetryToast(false);
    onRetry();
  }, [onRetry]);

  const displayName = user?.displayName?.trim() || 'Usuário';
  const avatarUrl = null;
  const headerTitle = cleanTitle(currentSession?.empresaAlvo || currentSession?.title || APP_NAME);
  const displayTitle = headerTitle.length > 35 ? `${headerTitle.substring(0, 32)}...` : headerTitle;

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
      pendingDeleteId,
      hideSuggestionsForMessageId,
      currentSession?.id,
      currentSession?.empresaAlvo,
      userId,
      processing,
      lastUserQuery,
      handleStopWithToast,
      onSendMessage,
      loadingPinnedLabel,
    ],
  );

  const itemContent = useCallback(
    (index: number) => <MessageRow index={index} data={itemData} />,
    [itemData],
  );
  const handleOpenSettings = () => setShowSettings(true);
  const handleCloseSettings = () => setShowSettings(false);
  const handleOpenWarRoom = () => setShowWarRoom(true);
  const handleCloseWarRoom = () => setShowWarRoom(false);

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

  // Radar unread badge
  const radarUnread = radar?.unreadCount ?? 0;

  return (
    <div className={`flex flex-1 min-h-0 overflow-hidden ${theme.bg}`}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <SessionsSidebar
        sessions={sessions}
        currentSessionId={currentSession?.id ?? null}
        onSelectSession={(id) => {
          onSelectSession(id);
          if (window.innerWidth < 768) onToggleSidebar();
        }}
        onNewSession={onNewSession}
        onDeleteSession={onDeleteSession}
        isOpen={isSidebarOpen}
        onCloseMobile={onToggleSidebar}
        isDarkMode={isDarkMode}
        onSaveToCRM={onSaveToCRM || (() => {})}
        onOpenKanban={onOpenKanban || (() => {})}
        searchTerm={sessionSearchTerm}
        onSearchChange={setSessionSearchTerm}
        showSearchField
        toggleButtonRef={sidebarToggleRef}
        canAccessMiniCRM={canAccessMiniCRM}
      />

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

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
              {displayTitle}
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
              <motion.button
                whileHover={{ scale: 1.1, rotate: [-2, 2, -1, 0] }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={handleOpenWarRoom}
                className={`group relative p-2.5 rounded-xl transition-all shadow-md overflow-hidden ${
                  isDarkMode 
                    ? 'bg-slate-900 border border-red-500/30' 
                    : 'bg-white border border-red-200 shadow-red-200/50'
                }`}
                title="War Room"
                aria-label="Abrir War Room"
              >
                {/* Background Glow */}
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br ${
                  isDarkMode ? 'from-red-600/20 to-rose-900/20' : 'from-red-50 to-rose-100'
                }`} />

                <div className="relative flex items-center justify-center">
                  <svg className="w-5 h-5 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    {/* Crossed Double Battle Axes (Machados de Lâmina Dupla) */}
                    
                    {/* Axe 1 (Red) */}
                    <g transform="rotate(45, 12, 12)">
                      <path className={isDarkMode ? 'text-red-500' : 'text-red-600'} d="M12 21V7" />
                      <path className={isDarkMode ? 'text-red-500' : 'text-red-600'} d="M12 7c-3-2-5-1-5 2s2 4 5 2M12 7c3-2 5-1 5 2s-2 4-5 2" />
                    </g>

                    {/* Axe 2 (Rose) */}
                    <g transform="rotate(-45, 12, 12)">
                      <path className={isDarkMode ? 'text-rose-400' : 'text-rose-500'} d="M12 21V7" />
                      <path className={isDarkMode ? 'text-rose-400' : 'text-rose-500'} d="M12 7c-3-2-5-1-5 2s2 4 5 2M12 7c3-2 5-1 5 2s-2 4-5 2" />
                    </g>
                  </svg>
                </div>
                
                {/* Status Dot for "Active/Dangerous" vibe */}
                <span className="absolute top-1.5 right-1.5 flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                </span>
              </motion.button>
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
          {showInitialHome ? (
            <div className="h-full min-h-0 overflow-y-auto custom-scrollbar">
              {!loading && !user ? (
                <GreetingWelcomeScreen
                  isDarkMode={isDarkMode}
                  onConfirmName={(name) => login(name)}
                />
              ) : (
                <EmptyStateHome
                  mode={mode}
                  isDarkMode={isDarkMode}
                  onStartInvestigation={handleStartInvestigation}
                  radarAlerts={radar?.alerts}
                  radarIsScanning={radar?.isScanning}
                  onForceScan={radar?.onForceScan}
                  onOpenRadar={() => setShowRadarPanel(true)}
                />
              )}
            </div>
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              data={safeMessages}
              computeItemKey={(_, message) => message.id}
              itemContent={itemContent}
              followOutput={false}
              increaseViewportBy={{ top: 400, bottom: 400 }}
              initialTopMostItemIndex={Math.max(0, safeMessages.length - 1)}
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
        {!showInitialHome && (
          <div className={`flex-none border-t ${theme.border} ${theme.surface}`}>
            {/* Processing indicator */}
            {isLoading && processing && processingInfo && (
              <div className={`px-4 pt-2 pb-1 text-xs ${theme.textSecondary} flex items-center gap-1.5 flex-wrap`}>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{processingInfo.label}</span>
                {processingInfo.detailText ? (
                  <span className="opacity-80">{processingInfo.detailText}</span>
                ) : null}
              </div>
            )}

            {/* Retry toast */}
            {showRetryToast && (
              <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
                <span>⚠️ Geração interrompida. Você pode tentar novamente agora.</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetryNormal}
                    className="rounded-md bg-amber-500/15 px-2 py-1 font-semibold hover:bg-amber-500/25"
                  >
                    Tentar de novo
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRetryToast(false)}
                    className="text-amber-600 dark:text-amber-400 hover:opacity-70 flex-none"
                    aria-label="Fechar aviso"
                  >✕</button>
                </div>
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
                  placeholder={isLoading ? 'Gerando resposta...' : 'Digite sua mensagem...'}
                  disabled={isLoading}
                  rows={1}
                  className={`w-full resize-none rounded-xl px-3 py-2.5 text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${theme.inputBg} ${theme.inputBorder} ${theme.textPrimary} disabled:opacity-50 max-h-40 overflow-y-auto`}
                  aria-label="Campo de mensagem"
                />
              </div>

              {/* Stop / Send button */}
              {isLoading ? (
                <button
                  type="button"
                  onClick={handleStopWithToast}
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
                  disabled={!input.trim()}
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
        )}
      </div>

      {/* ── Overlays ──────────────────────────────────────────────────────────── */}

      {/* Investigation Dashboard */}
      {showDashboard && (
        <React.Suspense fallback={null}>
          <SuspenseWithError>
            <InvestigationDashboard
              onSelectEmpresa={(empresa) => {
                onSendMessage(`Investigar ${empresa}`);
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
              isOpen={showSettings}
              userName={user?.displayName || ''}
              onUpdateName={updateName}
              mode={mode}
              onSetMode={setMode}
              isDarkMode={isDarkMode}
              onToggleTheme={onToggleTheme}
              onOpenDashboard={() => canAccessDashboard && setShowDashboard(true)}
              onExportPDF={onExportPDF}
              onExportConversation={onExportConversation}
              onCopyMarkdown={handleCopyMarkdown}
              onScheduleFollowUp={onOpenFollowUpModal}
              onLogout={onLogout}
              onClose={handleCloseSettings}
              exportStatus={exportStatus}
              exportError={exportError}
              canAccessDashboard={canAccessDashboard}
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
              isOpen={showWarRoom}
              isDarkMode={isDarkMode}
              onClose={handleCloseWarRoom}
              defaultCompetitorTarget={null}
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
              lastScanAt={radar.lastScanAt}
              onClose={() => setShowRadarSettings(false)}
            />
          </SuspenseWithError>
        </React.Suspense>
      )}
    </div>
  );
};

export default ChatInterface;
