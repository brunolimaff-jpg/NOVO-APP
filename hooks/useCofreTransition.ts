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
 * Key constraint: the phase transitions to 'entering' in the SAME render
 * commit as isLoading→false, preventing a 1-frame flash of frozen content.
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
  const prevIsLoadingRef = useRef(isLoading);
  const phaseRef = useRef<CofrePhase>('hidden');
  const [, forceRender] = useState(0);

  // Compute the next phase during render (same-commit, no flash).
  // Side-effect scheduling (timers, RAF) happens in useLayoutEffect below.
  const nextPhase = computeNextPhase();

  function computeNextPhase(): CofrePhase {
    if (isLoading && !prevIsLoadingRef.current) {
      return 'hidden';
    }
    if (
      !isLoading &&
      prevIsLoadingRef.current &&
      hasLargeDossier &&
      !shouldSuspendVirtualizedList &&
      phaseRef.current === 'hidden'
    ) {
      return 'entering';
    }
    return phaseRef.current;
  }

  phaseRef.current = nextPhase;

  // ── Update refs after commit (avoid render-time mutations) ──
  useEffect(() => {
    prevIsLoadingRef.current = isLoading;
  }, [isLoading]);

  // ── Side-effects scheduled in useLayoutEffect ──
  // Runs synchronously after DOM commit but before paint, keeping the
  // Cofre in the same visual frame. All timers/RAF properly cleaned up.
  useLayoutEffect(() => {
    if (phaseRef.current !== 'entering') return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        phaseRef.current = 'visible';
        forceRender(n => n + 1);

        requestAnimationFrame(() => {
          if (cancelled) return;
          requestAnimationFrame(() => {
            if (cancelled) return;
            phaseRef.current = 'dissolving';
            forceRender(n => n + 1);

            timers.push(
              setTimeout(() => {
                if (cancelled) return;
                phaseRef.current = 'hidden';
                forceRender(n => n + 1);
              }, 350),
            );
          });
        });
      }, 200),
    );

    // Safety timeout: never stay visible longer than 10s
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        if (phaseRef.current === 'visible' || phaseRef.current === 'entering') {
          phaseRef.current = 'dissolving';
          forceRender(n => n + 1);
          timers.push(
            setTimeout(() => {
              if (cancelled) return;
              phaseRef.current = 'hidden';
              forceRender(n => n + 1);
            }, 350),
          );
        }
      }, 10000),
    );

    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
  }, [nextPhase]);

  // Cleanup if loading resumes
  useEffect(() => {
    if (isLoading) {
      phaseRef.current = 'hidden';
    }
  }, [isLoading]);

  return { cofrePhase: phaseRef.current };
}
