import { useRef, useState, useEffect, useLayoutEffect } from 'react';
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
 */
export function useCofreTransition({
  isLoading,
  shouldSuspendVirtualizedList,
  hasLargeDossier,
}: UseCofreTransitionParams): UseCofreTransitionResult {
  const [phase, setPhase] = useState<CofrePhase>('hidden');
  const prevIsLoadingRef = useRef(isLoading);
  const phaseStartRef = useRef<number | null>(null);

  // ── Detect isLoading→false transition ──
  const justFinishedLoading =
    !isLoading && prevIsLoadingRef.current && hasLargeDossier && !shouldSuspendVirtualizedList;

  // ── Transition to 'entering' ──
  // useLayoutEffect fires synchronously after DOM commit but before paint,
  // so the Cofre appears in the same visual frame as the content.
  useLayoutEffect(() => {
    if (justFinishedLoading && phase === 'hidden') {
      setPhase('entering');
      phaseStartRef.current = Date.now();
    }
  }, [justFinishedLoading, phase]);

  // ── Timer-driven phase transitions ──
  useEffect(() => {
    if (phase !== 'entering') return;

    let cancelled = false;

    // 200ms: CSS cofre-enter animation completes → transition to 'visible'
    const enteringTimer = setTimeout(() => {
      if (cancelled) return;
      setPhase('visible');

      // Double-RAF: once the browser has painted at least one frame with
      // the dossier content, dissolve the overlay.
      requestAnimationFrame(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;
          setPhase('dissolving');

          // 350ms: CSS cofre-dissolve animation completes → remove overlay
          setTimeout(() => {
            if (cancelled) return;
            setPhase('hidden');
            phaseStartRef.current = null;
          }, 350);
        });
      });
    }, 200);

    // Safety timeout: never stay visible longer than 10s
    const safetyTimer = setTimeout(() => {
      if (cancelled) return;
      if (phaseStartRef.current !== null) {
        setPhase('dissolving');
        setTimeout(() => {
          if (cancelled) return;
          setPhase('hidden');
          phaseStartRef.current = null;
        }, 350);
      }
    }, 10000);

    return () => {
      cancelled = true;
      clearTimeout(enteringTimer);
      clearTimeout(safetyTimer);
    };
  }, [phase]);

  // ── Store previous isLoading for next render comparison ──
  useEffect(() => {
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]);

  // ── Reset if loading resumes ──
  useEffect(() => {
    if (isLoading && phase !== 'hidden') {
      setPhase('hidden');
      phaseStartRef.current = null;
    }
  }, [isLoading]);

  return { cofrePhase: phase };
}
