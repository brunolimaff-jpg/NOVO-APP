import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CofrePhase } from '../components/CofreOverlay';
import { scoutDiag } from '../utils/diagnosticLog';
import { COFRE_RENDER_READY_EVENT, type CofreRenderReadyDetail, type GenerationKind } from '../utils/cofreLifecycle';

interface UseCofreTransitionParams {
  generationKind: GenerationKind;
  isLoading: boolean;
  sessionId: string | null;
  onHidden?: () => void;
  /** Chamado no absolute-max para destravar UI quando waterfall não zera isLoading. */
  onForceReleaseLoading?: () => void;
}

interface UseCofreTransitionResult {
  cofrePhase: CofrePhase;
}

const ENTER_DURATION_MS = 200;
const DISSOLVE_DURATION_MS = 350;
const POST_API_SAFETY_TIMEOUT_MS = 10_000;
const DOM_READY_POLL_MAX_ATTEMPTS = 80;
/** Hard-cap absoluto do Cofre durante dossiê — evita overlay preso se isLoading não zerar. */
const COFRE_ABSOLUTE_MAX_MS = 320_000;
const COFRE_ABSOLUTE_POLL_MS = 2_000;

function isBotContentVisibleInDom(): boolean {
  if (typeof document === 'undefined') return false;
  const bot = document.querySelector('[data-testid="bot-message-content"]');
  if (!bot) return false;
  const style = window.getComputedStyle(bot);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') <= 0.01) {
    return false;
  }
  const rect = bot.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && Boolean(bot.textContent?.trim());
}

export function useCofreTransition({
  generationKind,
  isLoading,
  sessionId,
  onHidden,
  onForceReleaseLoading,
}: UseCofreTransitionParams): UseCofreTransitionResult {
  const [cofrePhase, setCofrePhase] = useState<CofrePhase>('hidden');
  const phaseRef = useRef<CofrePhase>('hidden');
  const lifecycleSessionRef = useRef<string | null>(null);
  /** Evita reabrir Cofre após safety/absolute timeout enquanto isLoading ainda true. */
  const cofreReleasedRef = useRef(false);
  const cofreOpenedAtRef = useRef<number | null>(null);

  const commitPhase = useCallback((nextPhase: CofrePhase) => {
    phaseRef.current = nextPhase;
    setCofrePhase(nextPhase);
  }, []);

  const startDissolve = useCallback(
    (reason: 'render-ready' | 'aborted-or-failed' | 'safety-timeout') => {
      if (phaseRef.current === 'hidden' || phaseRef.current === 'dissolving') return;
      if (reason === 'safety-timeout' || reason === 'aborted-or-failed') {
        cofreReleasedRef.current = true;
      }
      console.log('⏱️ [Cofre] startDissolve', {
        reason,
        sessionId: lifecycleSessionRef.current?.substring(0, 8),
        phaseBefore: phaseRef.current,
      });
      scoutDiag.info('Cofre', 'dissolve', {
        reason,
        sessionId: lifecycleSessionRef.current,
      });
      commitPhase('dissolving');
    },
    [commitPhase],
  );

  useEffect(() => {
    cofreReleasedRef.current = false;
    cofreOpenedAtRef.current = null;
  }, [sessionId]);

  useLayoutEffect(() => {
    console.log('⏱️ [Cofre] useLayoutEffect', {
      generationKind,
      isLoading,
      hasSessionId: !!sessionId,
      cofreReleased: cofreReleasedRef.current,
    });
    if (cofreReleasedRef.current) return;
    if (generationKind !== 'dossier' || !isLoading || !sessionId) return;
    lifecycleSessionRef.current = sessionId;
    if (cofreOpenedAtRef.current === null) {
      cofreOpenedAtRef.current = Date.now();
    }
    commitPhase('entering');
    scoutDiag.info('Cofre', 'entering', { sessionId });
  }, [commitPhase, generationKind, isLoading, sessionId]);

  useEffect(() => {
    if (cofrePhase !== 'entering') return;
    const timer = window.setTimeout(() => commitPhase('visible'), ENTER_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [cofrePhase, commitPhase]);

  useEffect(() => {
    const handleReady = (event: Event) => {
      const detail = (event as CustomEvent<CofreRenderReadyDetail>).detail;
      if (!detail || detail.sessionId !== lifecycleSessionRef.current) return;
      startDissolve('render-ready');
    };

    window.addEventListener(COFRE_RENDER_READY_EVENT, handleReady);
    return () => window.removeEventListener(COFRE_RENDER_READY_EVENT, handleReady);
  }, [startDissolve]);

  useEffect(() => {
    const isOpen = cofrePhase !== 'hidden' && cofrePhase !== 'dissolving';
    if (!isOpen || generationKind === 'dossier') return;
    startDissolve('aborted-or-failed');
  }, [cofrePhase, generationKind, startDissolve]);

  useEffect(() => {
    const isWaitingForRender =
      generationKind === 'dossier' && !isLoading && cofrePhase !== 'hidden' && cofrePhase !== 'dissolving';
    if (!isWaitingForRender) return;

    let cancelled = false;
    let attempts = 0;
    let rafHandle = 0;
    let fallbackTimer = 0;

    const pollDomReady = () => {
      if (cancelled) return;
      if (isBotContentVisibleInDom()) {
        startDissolve('render-ready');
        return;
      }
      attempts += 1;
      if (attempts < DOM_READY_POLL_MAX_ATTEMPTS) {
        rafHandle = requestAnimationFrame(pollDomReady);
      }
    };

    rafHandle = requestAnimationFrame(pollDomReady);

    // Fallback via setTimeout: se RAF estiver saturado (main thread ocupada),
    // setTimeout garante segunda via de polling a cada 500ms
    fallbackTimer = window.setTimeout(() => {
      const pollWithTimeout = () => {
        if (cancelled || attempts >= DOM_READY_POLL_MAX_ATTEMPTS) return;
        if (isBotContentVisibleInDom()) {
          startDissolve('render-ready');
          return;
        }
        attempts += 1;
        fallbackTimer = window.setTimeout(pollWithTimeout, 500);
      };
      pollWithTimeout();
    }, 2000);

    const timer = window.setTimeout(() => startDissolve('safety-timeout'), POST_API_SAFETY_TIMEOUT_MS);
    return () => {
      cancelled = true;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      window.clearTimeout(timer);
      window.clearTimeout(fallbackTimer);
    };
  }, [cofrePhase, generationKind, isLoading, startDissolve]);

  useEffect(() => {
    if (generationKind !== 'dossier' || cofrePhase === 'hidden' || cofrePhase === 'dissolving') return;
    const openedAt = cofreOpenedAtRef.current;
    if (!openedAt) return;

    const interval = window.setInterval(() => {
      if (phaseRef.current === 'hidden' || phaseRef.current === 'dissolving') return;
      const elapsedMs = Date.now() - openedAt;
      if (elapsedMs < COFRE_ABSOLUTE_MAX_MS) return;
      scoutDiag.warn('Cofre', 'absolute-max-timeout', {
        sessionId: lifecycleSessionRef.current,
        phase: phaseRef.current,
        isLoading,
        elapsedMs,
      });
      onForceReleaseLoading?.();
      startDissolve('safety-timeout');
    }, COFRE_ABSOLUTE_POLL_MS);

    return () => window.clearInterval(interval);
  }, [cofrePhase, generationKind, isLoading, onForceReleaseLoading, sessionId, startDissolve]);

  useEffect(() => {
    if (cofrePhase !== 'dissolving') return;
    const dissolveStart = performance.now();
    const timer = window.setTimeout(() => {
      console.log('⏱️ [Cofre] commitPhase hidden', {
        totalDissolveMs: Math.round(performance.now() - dissolveStart),
      });
      lifecycleSessionRef.current = null;
      commitPhase('hidden');
      onHidden?.();
    }, DISSOLVE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [cofrePhase, commitPhase, onHidden]);

  return { cofrePhase };
}
