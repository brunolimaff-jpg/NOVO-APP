import { useEffect, useRef, useState } from 'react';
import { scoutDiag } from '../utils/diagnosticLog';
import {
  collectBlankPanelSnapshot,
  reportBlankPanelIfDetected,
  type BlankPanelSnapshot,
} from '../utils/blankPanelTelemetry';
import {
  buildHandoffPanelDiag,
  decideTimelineRecoveryMode,
  isOverlayStuckPostWaterfall,
  isPostWaterfallStuckHandoff,
  POST_WATERFALL_WATCHDOG_MS,
  shouldResetForceStaticOnLoadingStart,
} from '../utils/postWaterfallHandoff';
import {
  LARGE_DOSSIER_STATIC_FALLBACK_CHARS,
  shouldPreferStaticTimelineForBotVolume,
} from '../utils/expectedBotContent';

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
  return decideTimelineRecoveryMode(snapshot) === 'static-fallback';
}

const MAX_VIRTUALIZED_TIMELINE_RECOVERY_ATTEMPTS = 2;

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
  timelineRecoveryNonce: number;
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
  const [timelineRecoveryNonce, setTimelineRecoveryNonce] = useState(0);
  const staticTimelineFallbackSessionRef = useRef<string | null>(null);
  const postWaterfallWatchdogLoggedRef = useRef<string | null>(null);
  const virtualizedRecoverySessionRef = useRef<string | null>(null);
  const virtualizedRecoveryAttemptsRef = useRef(0);
  const prevIsLoadingForStaticResetRef = useRef(isLoading);
  const panelSnapshotSignatureRef = useRef('');
  const renderingModeLocked = useRef(false);

  // BUG-8 v4: Virtuoso + SectionalBotMessage chunked — static proativo inflava DOM (~432k).
  // Watchdog/blank-panel ainda pode forçar fallback reativo via setForceStaticTimelineFallback.
  const preferStaticForLargeDossier = false;
  if (!shouldSuspendVirtualizedList && shouldPreferStaticTimelineForBotVolume(expectedBotCharsMax)) {
    renderingModeLocked.current = true;
  }
  const effectiveStaticTimelineFallback =
    forceStaticTimelineFallback || preferStaticForLargeDossier;
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

    if (effectiveStaticTimelineFallback && expectedBotCharsMax > LARGE_DOSSIER_STATIC_FALLBACK_CHARS) {
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
    setTimelineRecoveryNonce(0);
    staticTimelineFallbackSessionRef.current = null;
    postWaterfallWatchdogLoggedRef.current = null;
    virtualizedRecoverySessionRef.current = null;
    virtualizedRecoveryAttemptsRef.current = 0;
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
      virtualizedRecoverySessionRef.current = null;
      virtualizedRecoveryAttemptsRef.current = 0;
      renderingModeLocked.current = false;
    }
  }, [expectedBotCharsMax, isLoading]);

  // ── Efeito #5: Watchdog pós-waterfall ──
  useEffect(() => {
    if (!currentSession?.id || expectedBotCharsMax < LARGE_DOSSIER_STATIC_FALLBACK_CHARS) return;
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

  // ── Efeito #6: Detecção de blank panel (4 timers) ──
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

        if (!snapshot || !shouldActivateStaticTimelineFallback(snapshot)) {
          const recoveryMode = decideTimelineRecoveryMode(snapshot);
          if (recoveryMode !== 'remount-virtualized') return;
          if (staticTimelineFallbackSessionRef.current === currentSession.id) return;

          if (virtualizedRecoverySessionRef.current !== currentSession.id) {
            virtualizedRecoverySessionRef.current = currentSession.id;
            virtualizedRecoveryAttemptsRef.current = 0;
          }

          if (virtualizedRecoveryAttemptsRef.current >= MAX_VIRTUALIZED_TIMELINE_RECOVERY_ATTEMPTS) {
            scoutDiag.warn('BlankPanel', 'virtualized-timeline-recovery-exhausted', {
              ...snapshot,
              delay,
              recoveryAttempt: virtualizedRecoveryAttemptsRef.current,
              maxRecoveryAttempts: MAX_VIRTUALIZED_TIMELINE_RECOVERY_ATTEMPTS,
            } as unknown as Record<string, unknown>);
            return;
          }

          virtualizedRecoveryAttemptsRef.current += 1;
          const recoveryAttempt = virtualizedRecoveryAttemptsRef.current;
          setTimelineRecoveryNonce(value => value + 1);
          scoutDiag.warn('BlankPanel', 'virtualized-timeline-recovery', {
            ...snapshot,
            delay,
            recoveryAttempt,
            maxRecoveryAttempts: MAX_VIRTUALIZED_TIMELINE_RECOVERY_ATTEMPTS,
          } as unknown as Record<string, unknown>);
          return;
        }
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
    timelineRecoveryNonce,
  };
}
