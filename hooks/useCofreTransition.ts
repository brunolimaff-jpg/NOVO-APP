import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { scoutDiag } from '../utils/diagnosticLog';
import type { CofrePhase } from '../components/CofreOverlay';

interface UseCofreTransitionParams {
  isLoading: boolean;
  shouldSuspendVirtualizedList: boolean;
  hasLargeDossier: boolean;
}

interface UseCofreTransitionResult {
  cofrePhase: CofrePhase;
}

/**
 * Controls the Cofre lifecycle — a glassmorphism overlay that covers the
 * timeline during the isLoading→false transition when a large dossier was
 * just received. Prevents Virtuoso from freezing the browser while it
 * renders 27K+ char Markdown.
 *
 * All state mutations happen in useEffect/useLayoutEffect.
 * Phase detection during render reads refs (set in previous effects)
 * and derives the next phase without mutations.
 *
 * Lifecycle:
 *   isLoading→false + hasLargeDossier →
 *     'entering' (200ms) →
 *     'visible' (until double-RAF detects paint completion) →
 *     'dissolving' (350ms) →
 *     'hidden'
 *
 * P1 fix: Uses a ref-based lifecycleId to decouple the lifecycle effect
 * from `[phase]` deps — preventing cleanup from killing RAF callbacks
 * on phase transitions.
 */
export function useCofreTransition({
  isLoading,
  shouldSuspendVirtualizedList,
  hasLargeDossier,
}: UseCofreTransitionParams): UseCofreTransitionResult {
  const [phase, setPhase] = useState<CofrePhase>('hidden');
  const [lifecycleId, setLifecycleId] = useState(0);
  const prevIsLoadingRef = useRef(isLoading);
  const phaseStartRef = useRef<number | null>(null);

  // ── Detect isLoading→false transition ──
  const justFinishedLoading =
    !isLoading && prevIsLoadingRef.current && hasLargeDossier && !shouldSuspendVirtualizedList;

  // ── Start a new lifecycle (synchronous, before paint) ──
  useLayoutEffect(() => {
    if (justFinishedLoading && phase === 'hidden') {
      setPhase('entering');
      phaseStartRef.current = Date.now();
      setLifecycleId(id => id + 1);
      scoutDiag.info('Cofre', 'entering', {
        hasLargeDossier,
        shouldSuspendVirtualizedList,
      });
    }
  }, [justFinishedLoading, phase, hasLargeDossier, shouldSuspendVirtualizedList]);

  // ── Single lifecycle effect ──
  // Depends ONLY on lifecycleId, NOT on phase. This means when
  // setPhase('visible') triggers a re-render, this effect does NOT
  // re-run — its cleanup does NOT fire — so RAF callbacks survive.
  useEffect(() => {
    if (lifecycleId === 0) return;

    let cancelled = false;
    let stage: 'entering' | 'visible' | 'dissolving' | 'done' = 'entering';

    // 200ms: CSS cofre-enter animation completes → transition to 'visible'
    const enteringTimer = setTimeout(() => {
      if (cancelled) return;
      stage = 'visible';
      setPhase('visible');

      // Double-RAF: once the browser has painted at least one frame with
      // the dossier content, dissolve the overlay.
      requestAnimationFrame(() => {
        if (cancelled || stage !== 'visible') return;
        requestAnimationFrame(() => {
          if (cancelled || stage !== 'visible') return;
          stage = 'dissolving';
          setPhase('dissolving');
          scoutDiag.info('Cofre', 'dissolve', { afterMs: Date.now() - (phaseStartRef.current ?? Date.now()) });

          // 350ms: CSS cofre-dissolve animation completes → remove overlay
          setTimeout(() => {
            if (cancelled) return;
            stage = 'done';
            setPhase('hidden');
            phaseStartRef.current = null;
          }, 350);
        });
      });
    }, 200);

    // Safety timeout: never stay visible longer than 10s
    const safetyTimer = setTimeout(() => {
      if (cancelled || stage === 'done') return;
      scoutDiag.warn('Cofre', 'safety-timeout-fired', {
        stage,
        elapsedMs: Date.now() - (phaseStartRef.current ?? Date.now()),
      });
      stage = 'dissolving';
      setPhase('dissolving');
      setTimeout(() => {
        if (cancelled) return;
        stage = 'done';
        setPhase('hidden');
        phaseStartRef.current = null;
      }, 350);
    }, 10000);

    return () => {
      cancelled = true;
      clearTimeout(enteringTimer);
      clearTimeout(safetyTimer);
    };
  }, [lifecycleId]);

  // ── Store previous isLoading for next render comparison ──
  useEffect(() => {
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]);

  // ── Reset if loading resumes ──
  useEffect(() => {
    if (isLoading && phase !== 'hidden') {
      setPhase('hidden');
      setLifecycleId(0);
      phaseStartRef.current = null;
    }
  }, [isLoading]);

  return { cofrePhase: phase };
}
