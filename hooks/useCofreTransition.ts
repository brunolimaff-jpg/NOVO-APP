import { useRef, useState, useEffect } from 'react';
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
  const safetiesRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [, forceRender] = useState(0);

  const clearSafeties = () => {
    for (const t of safetiesRef.current) clearTimeout(t);
    safetiesRef.current = [];
  };

  // ── SAME-RENDER ACTIVATION ──
  // When isLoading→false AND we have a large dossier, set the phase ref
  // during THIS render so the Cofre overlay appears in the initial DOM
  // commit. No 1-frame flash of frozen content.
  if (
    !isLoading &&
    prevIsLoadingRef.current &&
    hasLargeDossier &&
    !shouldSuspendVirtualizedList &&
    phaseRef.current === 'hidden'
  ) {
    phaseRef.current = 'entering';
    clearSafeties();

    // 200ms: CSS cofre-enter animation completes → transition to 'visible'
    safetiesRef.current.push(
      setTimeout(() => {
        phaseRef.current = 'visible';
        forceRender(n => n + 1);

        // Double-RAF: once the browser has painted at least one frame with
        // the dossier content, dissolve the overlay.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            phaseRef.current = 'dissolving';
            forceRender(n => n + 1);

            // 350ms: CSS cofre-dissolve animation completes → remove overlay
            safetiesRef.current.push(
              setTimeout(() => {
                phaseRef.current = 'hidden';
                forceRender(n => n + 1);
              }, 350),
            );
          });
        });
      }, 200),
    );

    // ── Safety timeout: never stay visible longer than 10s ──
    safetiesRef.current.push(
      setTimeout(() => {
        if (phaseRef.current === 'visible' || phaseRef.current === 'entering') {
          phaseRef.current = 'dissolving';
          forceRender(n => n + 1);
          setTimeout(() => {
            phaseRef.current = 'hidden';
            forceRender(n => n + 1);
          }, 350);
        }
      }, 10000),
    );
  }

  // ── LOADING RESUMED — immediately hide ──
  if (isLoading && !prevIsLoadingRef.current) {
    phaseRef.current = 'hidden';
    clearSafeties();
  }

  // Store current isLoading for next render comparison
  prevIsLoadingRef.current = isLoading;

  // Cleanup on unmount
  useEffect(() => {
    return () => clearSafeties();
  }, []);

  return { cofrePhase: phaseRef.current };
}
