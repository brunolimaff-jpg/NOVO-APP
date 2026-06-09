import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_NAME } from '../constants';
import { useMode } from '../contexts/ModeContext';
import { useOperator } from '../contexts/OperatorContext';
import { buildInvestigationHiddenPrompt, PROMPT_VERSION } from '../prompts/megaPrompts';
import { fetchCompanyByCnpj } from '../services/brasilApiService';
import { storage } from '../services/storage';
import { type ChatSession, Sender, type RadarAlert } from '../types';
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
import { findExistingDossier, type ExistingDossier } from '../lib/supabase/dossierDuplicate';
import { supabase } from '../lib/supabaseClient';
import { trackOperatorEvent } from '../services/operatorTracking';
import { DuplicateDossierModal } from './DuplicateDossierModal';

import { cleanTitle } from '../utils/textCleaners';
import { maxExpectedBotChars, shouldPreferStaticTimelineForBotVolume } from '../utils/expectedBotContent';
import { shouldSuspendHeroMessageTimeline } from '../utils/loadingVariant';
import ChatPanels from './chat/ChatPanels';
import ChatShell from './chat/ChatShell';
import Composer from './chat/Composer';
import type { ChatTheme, ExtendedChatInterfaceProps, StartInvestigationPayload } from './chat/contracts';
import MessageTimeline from './chat/MessageTimeline';

export type { RadarProps } from './chat/contracts';

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
  payload: StartInvestigationPayload,
  promptMode: PromptMode,
  radar?: ExtendedChatInterfaceProps['radar'],
): boolean => {
  if (promptMode === 'warMode') return true;
  if (promptMode === 'ultraDepth') return true;
  if (payload.cnpj) return true;
  if (radar?.metaInsight) return true;
  if ((radar?.alerts?.length || 0) > 0) return true;
  return false;
};

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

const buildRadarContextBlock = (radar?: ExtendedChatInterfaceProps['radar']): string => {
  if (!radar) return '';

  const topAlerts = (radar.alerts || []).slice(0, 3).map((alert: RadarAlert, index) => {
    const title = alert.title?.trim() || `Alerta ${index + 1}`;
    const detail = alert.summary?.trim() || 'Sem detalhe adicional';
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
  const [duplicateDossier, setDuplicateDossier] = useState<ExistingDossier | null>(null);
  const [forceStaticTimelineFallback, setForceStaticTimelineFallback] = useState(false);
  const pendingPayloadRef = useRef<StartInvestigationPayload | null>(null);
  const staticTimelineFallbackSessionRef = useRef<string | null>(null);
  const postWaterfallWatchdogLoggedRef = useRef<string | null>(null);

  const safeMessages = Array.isArray(messages) ? messages : [];
  const hasOperatorName = operatorName.trim().length > 0;
  const showOperatorGate = !operatorLoading && !hasOperatorName;
  const showInitialHome = !currentSession || (safeMessages.length === 0 && !isLoading);
  // A waterfall preview (isThinking=true) with enough text is renderable — show timeline incrementally.
  // Mirrors WATERFALL_PREVIEW_MIN_CHARS = 200 from waterfall-orchestrator.ts.
  const WATERFALL_PREVIEW_MIN_CHARS = 200;
  const hasRenderableBotMessage = safeMessages.some(
    message =>
      message.sender === Sender.Bot &&
      !message.isError &&
      Boolean(String(message.text || '').trim()) &&
      (!message.isThinking || String(message.text || '').trim().length >= WATERFALL_PREVIEW_MIN_CHARS),
  );
  const shouldSuspendVirtualizedList = shouldSuspendHeroMessageTimeline(
    isLoading,
    loadingVariant,
    hasRenderableBotMessage,
  );

  useEffect(() => {
    if (!operatorId || !hasOperatorName) return;
    void storage.touchUserContext(operatorId);
  }, [hasOperatorName, operatorId]);

  const executeInvestigation = useCallback(
    async (payload: StartInvestigationPayload) => {
      const prompt = `🔍 Investigando ${payload.companyName}...`;
      const promptMode = resolvePromptMode(mode, canWarRoom);

      let segmentHint: string | undefined;
      if (payload.cnpj) {
        try {
          const signal = AbortSignal.timeout(8000);
          const companyData = await fetchCompanyByCnpj(payload.cnpj, signal);
          if (companyData.cnaeDescricao) {
            segmentHint = companyData.cnaeDescricao;
          }
        } catch (error) {
          scoutDiag.warn('ChatInterface', 'Falha ao buscar CNAE', { cnpj: payload.cnpj, error });
        }
      }

      const hiddenPromptBase = buildInvestigationHiddenPrompt(
        {
          companyName: payload.companyName,
          cnpj: payload.cnpj || undefined,
          city: payload.city,
          state: payload.state,
          segmentHint,
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
      await onDeepDive(prompt, hiddenPrompt, payload.companyName, payload.cnpj);
    },
    [mode, canWarRoom, onDeepDive, radar],
  );

  const handleStartInvestigation = useCallback(
    async (payload: StartInvestigationPayload) => {
      if (operatorId) {
        void storage.touchUserContext(operatorId);
      }

      if (payload.cnpj || payload.companyName) {
        const existing = await findExistingDossier(payload.cnpj, payload.companyName, operatorId || '');
        if (existing) {
          pendingPayloadRef.current = payload;
          setDuplicateDossier(existing);
          return;
        }
      }

      await executeInvestigation(payload);
    },
    [operatorId, executeInvestigation],
  );

  const handleAccessExistingDossier = useCallback(async () => {
    if (!duplicateDossier || !operatorId) return;

    let dossier = await storage.getDossier(duplicateDossier.id);
    if (!dossier) {
      if (!supabase) {
        setDuplicateDossier(null);
        pendingPayloadRef.current = null;
        return;
      }
      const { data } = await supabase.from('dossies').select('content').eq('id', duplicateDossier.id).maybeSingle();
      if (!data || !data.content) {
        setDuplicateDossier(null);
        pendingPayloadRef.current = null;
        return;
      }
      dossier = data.content as ChatSession;
      await storage.saveDossier(dossier!);
    }

    onSelectSession(duplicateDossier.id);
    setDuplicateDossier(null);
    pendingPayloadRef.current = null;
    trackOperatorEvent('dossier_reopened', {
      operatorId,
      entityId: duplicateDossier.id,
      entityType: 'dossier',
      companyName: duplicateDossier.empresaAlvo,
    });
  }, [duplicateDossier, operatorId, onSelectSession]);

  const handleNewResearchOverride = useCallback(async () => {
    const payload = pendingPayloadRef.current;
    const oldDossier = duplicateDossier;
    if (!payload) return;

    try {
      await executeInvestigation(payload);

      if (oldDossier) {
        await storage.deleteDossier(oldDossier.id);
      }

      trackOperatorEvent('dossier_override', {
        operatorId: operatorId || '',
        previousDossierId: oldDossier?.id,
        entityType: 'dossier',
        companyName: payload.companyName,
      });
    } catch (error) {
      scoutDiag.warn('ChatInterface', 'Falha ao sobrescrever dossiê', {
        previousDossierId: oldDossier?.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDuplicateDossier(null);
      pendingPayloadRef.current = null;
    }
  }, [duplicateDossier, executeInvestigation, operatorId]);

  const handleCopyMarkdown = useCallback(() => {
    const text = safeMessages
      .filter(message => !message.isError && !message.isThinking)
      .map(message => `**${message.sender === Sender.User ? 'Você' : 'Scout 360'}:**\n${message.text}`)
      .join('\n\n---\n\n')
      .replace(/\[\[PORTA:[^\]]+\]\]/g, '');

    void navigator.clipboard.writeText(text);
  }, [safeMessages]);

  const handlePrefillComposer = useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent('scout:prefill', { detail: { text } }));
  }, []);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (operatorId) {
        void storage.touchUserContext(operatorId);
      }

      onSendMessage(text);
    },
    [onSendMessage, operatorId],
  );

  const theme = useMemo<ChatTheme>(
    () => ({
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
    }),
    [isDarkMode],
  );

  const headerTitle = cleanTitle(currentSession?.empresaAlvo || currentSession?.title || APP_NAME);
  const displayTitle = headerTitle.length > 35 ? `${headerTitle.substring(0, 32)}...` : headerTitle;
  const displayName = operatorName.trim() || 'Operador';

  const hasActiveSession = currentSession !== null && currentSession !== undefined;
  const hasErrorInMessages = safeMessages.some(msg => Boolean(msg.isError));
  const hasDossierContent = Boolean(currentSession?.resumoDossie);
  const panelState = classifyPanelState({
    messages: safeMessages,
    hasDossierContent,
    isLoading,
    hasError: hasErrorInMessages,
  });
  const expectedBotCharsMax = useMemo(() => maxExpectedBotChars(safeMessages), [safeMessages]);

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
