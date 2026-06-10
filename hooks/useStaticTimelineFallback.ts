import { useEffect, useRef, useState } from 'react';
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
import { shouldPreferStaticTimelineForBotVolume } from '../utils/expectedBotContent';

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

export interface UseStaticTimelineFallbackParams {
  currentSession: { id: string; title?: string | null; empresaAlvo?: string | null } | null | undefined;
  isLoading: boolean;
  showInitialHome: boolean;
  shouldSuspendVirtualizedList: boolean;
  expectedBotCharsMax: number;
  safeMessagesLength: number;
  messagesLength: number;
  panelState: string;
  loadingVariant?: string;
  hasActiveSession: boolean;
  hasDossierContent: boolean;
  showOperatorGate: boolean;
  forceStaticTimelineFallback?: boolean;
  preferStaticForLargeDossier?: boolean;
  effectiveStaticTimelineFallback?: boolean;
  shouldSuspendVirtualizedListForTimeline?: boolean;
}

export interface UseStaticTimelineFallbackResult {
  forceStaticTimelineFallback: boolean;
  setForceStaticTimelineFallback: (value: boolean) => void;
  preferStaticForLargeDossier: boolean;
  effectiveStaticTimelineFallback: boolean;
  shouldSuspendVirtualizedListForTimeline: boolean;
}

export function useStaticTimelineFallback(params: UseStaticTimelineFallbackParams): UseStaticTimelineFallbackResult {
  const {
    currentSession,
    isLoading,
    showInitialHome,
    shouldSuspendVirtualizedList,
    expectedBotCharsMax,
    safeMessagesLength,
    messagesLength,
    panelState,
    loadingVariant,
    hasActiveSession,
    hasDossierContent,
    showOperatorGate,
  } = params;

  const [forceStaticTimelineFallback, setForceStaticTimelineFallback] = useState(false);
  const staticTimelineFallbackSessionRef = useRef<string | null>(null);
  const postWaterfallWatchdogLoggedRef = useRef<string | null>(null);
  const prevIsLoadingForStaticResetRef = useRef(isLoading);
  const panelSnapshotSignatureRef = useRef('');
  const renderingModeLocked = useRef(false);

  const preferStaticForLargeDossier =
    !isLoading &&
    !showInitialHome &&
    !shouldSuspendVirtualizedList &&
    !renderingModeLocked.current &&
    shouldPreferStaticTimelineForBotVolume(expectedBotCharsMax);
  if (!isLoading && !shouldSuspendVirtualizedList && !renderingModeLocked.current) {
    renderingModeLocked.current = true;
  }
  const effectiveStaticTimelineFallback = forceStaticTimelineFallback || preferStaticForLargeDossier;
  const shouldSuspendVirtualizedListForTimeline = shouldSuspendVirtualizedList && !effectiveStaticTimelineFallback;

  // ── Efeito #2: Panel snapshot telemetry ──
  useEffect(() => {
    const signature = [
      currentSession?.id ?? 'no-session',
      panelState,
      hasActiveSession ? 'active' : 'inactive',
      safeMessagesLength,
      messagesLength,
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
            messageCount: safeMessagesLength,
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
      safeMessageCount: safeMessagesLength,
      propMessageCount: messagesLength,
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

    if (effectiveStaticTimelineFallback && expectedBotCharsMax > 4000) {
      requestAnimationFrame(() => {
        import('../utils/layoutTraceTelemetry')
          .then(({ traceLayout }) => {
            traceLayout(scoutDiag.info.bind(scoutDiag), 'chat-interface-static-fallback', {
              ...snapshotPayload,
            });
          })
          .catch(() => {});
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
    messagesLength,
    panelState,
    safeMessagesLength,
    shouldSuspendVirtualizedList,
    shouldSuspendVirtualizedListForTimeline,
    showInitialHome,
    showOperatorGate,
  ]);

  // ── Efeito #3: Reset ao trocar de sessão ──
  useEffect(() => {
    setForceStaticTimelineFallback(false);
    staticTimelineFallbackSessionRef.current = null;
    postWaterfallWatchdogLoggedRef.current = null;
    renderingModeLocked.current = false;
  }, [currentSession?.id]);

  // ── Efeito #4: Reset ao iniciar loading com dossiê pequeno ──
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
      renderingModeLocked.current = false;
    }
  }, [expectedBotCharsMax, isLoading]);

  // ── Efeito #5: Força proativa para dossiês grandes ──
  useEffect(() => {
    if (isLoading) return;
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
    isLoading,
    preferStaticForLargeDossier,
    shouldSuspendVirtualizedList,
    showInitialHome,
  ]);

  // ── Efeito #6: Watchdog pós-waterfall ──
  useEffect(() => {
    if (!currentSession?.id || expectedBotCharsMax < 4_000) return;
    if (isLoading || showInitialHome) return;

    const watchdogTimer = window.setTimeout(() => {
      const snapshot = collectBlankPanelSnapshot({
        sessionId: currentSession.id,
        source: 'ChatInterface:post-waterfall-watchdog',
        messageCount: safeMessagesLength,
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
    safeMessagesLength,
    shouldSuspendVirtualizedList,
    shouldSuspendVirtualizedListForTimeline,
    showInitialHome,
  ]);

  // ── Efeito #7: Detecção de blank panel (4 timers) ──
  useEffect(() => {
    if (!currentSession?.id || expectedBotCharsMax <= 0) return;
    if (isLoading || showInitialHome || shouldSuspendVirtualizedList) return;

    const delays = [750, 2_000, 5_000, 9_000];
    const timers = delays.map(delay =>
      window.setTimeout(() => {
        const snapshot = reportBlankPanelIfDetected({
          sessionId: currentSession.id,
          source: `ChatInterface:${delay}ms`,
          messageCount: safeMessagesLength,
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
    safeMessagesLength,
    shouldSuspendVirtualizedList,
    showInitialHome,
  ]);

  return {
    forceStaticTimelineFallback,
    setForceStaticTimelineFallback,
    preferStaticForLargeDossier,
    effectiveStaticTimelineFallback,
    shouldSuspendVirtualizedListForTimeline,
  };
}
