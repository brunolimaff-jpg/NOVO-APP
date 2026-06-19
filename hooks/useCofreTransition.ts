import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CofrePhase } from '../components/CofreOverlay';
import { scoutDiag } from '../utils/diagnosticLog';
import { COFRE_RENDER_READY_EVENT, type CofreRenderReadyDetail, type GenerationKind } from '../utils/cofreLifecycle';

interface UseCofreTransitionParams {
  generationKind: GenerationKind;
  isLoading: boolean;
  sessionId: string | null;
  onHidden?: () => void;
}

interface UseCofreTransitionResult {
  cofrePhase: CofrePhase;
}

const ENTER_DURATION_MS = 200;
const DISSOLVE_DURATION_MS = 350;
const POST_API_SAFETY_TIMEOUT_MS = 10_000;

export function useCofreTransition({
  generationKind,
  isLoading,
  sessionId,
  onHidden,
}: UseCofreTransitionParams): UseCofreTransitionResult {
  const [cofrePhase, setCofrePhase] = useState<CofrePhase>('hidden');
  const phaseRef = useRef<CofrePhase>('hidden');
  const lifecycleSessionRef = useRef<string | null>(null);

  const commitPhase = useCallback((nextPhase: CofrePhase) => {
    phaseRef.current = nextPhase;
    setCofrePhase(nextPhase);
  }, []);

  const startDissolve = useCallback(
    (reason: 'render-ready' | 'aborted-or-failed' | 'safety-timeout') => {
      if (phaseRef.current === 'hidden' || phaseRef.current === 'dissolving') return;
      scoutDiag.info('Cofre', 'dissolve', {
        reason,
        sessionId: lifecycleSessionRef.current,
      });
      commitPhase('dissolving');
    },
    [commitPhase],
  );

  useLayoutEffect(() => {
    if (generationKind !== 'dossier' || !isLoading || !sessionId) return;
    lifecycleSessionRef.current = sessionId;
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

    const timer = window.setTimeout(() => startDissolve('safety-timeout'), POST_API_SAFETY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [cofrePhase, generationKind, isLoading, startDissolve]);

  useEffect(() => {
    if (cofrePhase !== 'dissolving') return;
    const timer = window.setTimeout(() => {
      lifecycleSessionRef.current = null;
      commitPhase('hidden');
      onHidden?.();
    }, DISSOLVE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [cofrePhase, commitPhase, onHidden]);

  return { cofrePhase };
}
