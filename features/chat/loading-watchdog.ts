import * as Sentry from '@sentry/react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { scoutDiag } from '../../utils/diagnosticLog';
import type { LoadingVariant } from '../../utils/loadingVariant';

/** T-A.5: 3 probes (era 6) — imediato, 1s, 10s timeout Sentry. */
export const LOADING_STUCK_PROBE_DELAYS_MS = [0, 1_000, 10_000] as const;

export const POST_COMPLETION_PROBE_DELAYS_MS = [0, 1_000, 10_000] as const;

export interface LoadingStuckProbeDeps {
  activeGenerationRef: MutableRefObject<Record<string, string>>;
  currentSessionIdRef: MutableRefObject<string | null | undefined>;
  latestLoadingRef: MutableRefObject<{
    isLoading: boolean;
    loadingVariant: LoadingVariant | null | undefined;
  }>;
  setIsLoading: (value: boolean) => void;
  setLoadingVariant: Dispatch<SetStateAction<LoadingVariant | undefined>>;
  completeLoadingProgress: () => void;
}

export function scheduleLoadingStuckProbes(
  sessionId: string,
  botMessageId: string,
  generationValid: boolean,
  deps: LoadingStuckProbeDeps,
): () => void {
  const {
    activeGenerationRef,
    currentSessionIdRef,
    latestLoadingRef,
    setIsLoading,
    setLoadingVariant,
    completeLoadingProgress,
  } = deps;

  const timerIds: ReturnType<typeof setTimeout>[] = [];
  const capturedSessionId = sessionId;
  const capturedBotMessageId = botMessageId;
  let rafSafetyNetFired = false;
  let rafHandle = 0;

  if (!generationValid) return () => {};

  rafHandle = requestAnimationFrame(() => {
    const activeGen = activeGenerationRef.current[capturedSessionId];
    if (activeGen !== undefined && activeGen !== capturedBotMessageId) {
      scoutDiag.info('MessageOrchestrator', 'raf-safety-net-skipped-superseded', {
        sessionId: capturedSessionId,
        capturedBotMessageId,
        activeBotMessageId: activeGen,
      } as unknown as Record<string, unknown>);
      return;
    }

    if (currentSessionIdRef.current !== capturedSessionId) {
      scoutDiag.info('MessageOrchestrator', 'raf-safety-net-skipped-session-changed', {
        sessionId: capturedSessionId,
        currentSessionId: currentSessionIdRef.current,
      } as unknown as Record<string, unknown>);
      return;
    }

    if (latestLoadingRef.current.isLoading) {
      rafSafetyNetFired = true;
      setIsLoading(false);
      setLoadingVariant(undefined);
      completeLoadingProgress();
      scoutDiag.warn('MessageOrchestrator', 'raf-safety-net-fired', {
        sessionId: capturedSessionId,
        botMessageId: capturedBotMessageId,
      } as unknown as Record<string, unknown>);
    }
  });

  for (const delay of LOADING_STUCK_PROBE_DELAYS_MS) {
    const id = setTimeout(() => {
      const activeGen = activeGenerationRef.current[capturedSessionId];
      if (activeGen !== undefined && activeGen !== capturedBotMessageId) {
        scoutDiag.info('LoadingStuckProbe', 'probe-skipped-superseded', {
          sessionId: capturedSessionId,
          capturedBotMessageId,
          activeBotMessageId: activeGen,
          timing: delay,
        } as unknown as Record<string, unknown>);
        return;
      }
      if (currentSessionIdRef.current !== capturedSessionId) {
        scoutDiag.info('LoadingStuckProbe', 'probe-skipped-session-changed', {
          sessionId: capturedSessionId,
          currentSessionId: currentSessionIdRef.current,
          timing: delay,
        } as unknown as Record<string, unknown>);
        return;
      }

      try {
        const bodyText = document.body?.textContent || '';
        const loadingOverlay = document.querySelector('[data-testid="loading-smart-overlay"]');
        const stopButton = document.querySelector('[data-testid="loading-stop-button"]');
        const composer = document.querySelector(
          '[data-testid="chat-input"], [data-testid="composer-input"]',
        ) as HTMLInputElement | null;
        const botMessages = document.querySelectorAll('[data-testid="bot-message-content"]');
        const storeIsLoading = latestLoadingRef.current.isLoading;
        const storeLoadingVariant = latestLoadingRef.current.loadingVariant ?? null;

        const domHasOverlay = Boolean(loadingOverlay);
        const domHasStopButton = Boolean(stopButton);
        const domComposerDisabled = composer?.disabled ?? false;
        const botTextLen = Math.max(0, ...[...botMessages].map(el => (el as HTMLElement).textContent?.length || 0));
        const containsDossie = /dossi[eê]/i.test(bodyText);

        const isStuck =
          domHasOverlay || domHasStopButton || domComposerDisabled || storeIsLoading || storeLoadingVariant !== null;

        const payload = {
          sessionId: capturedSessionId,
          timing: delay,
          rafSafetyNetFired,
          storeIsLoading,
          storeLoadingVariant,
          domHasOverlay,
          domHasStopButton,
          domComposerDisabled,
          composerPlaceholder: composer?.placeholder ?? null,
          botMessageCount: botMessages.length,
          botTextLen,
          bodyTextLen: bodyText.length,
          containsDossie,
          hostname: typeof window !== 'undefined' ? window.location.hostname : 'ssr',
        };

        if (isStuck) {
          scoutDiag.warn(
            'LoadingStuckProbe',
            `stuck-after-completed:${delay}ms`,
            payload as unknown as Record<string, unknown>,
          );
          if (delay === 10_000) {
            Sentry.captureMessage('Scout360 loading stuck — safety probe timed out', {
              level: 'warning',
              tags: { area: 'loading-stuck', session_id: capturedSessionId, probe_delay: '10000' },
              extra: payload as unknown as Record<string, unknown>,
            });
          }
        } else {
          scoutDiag.info('LoadingStuckProbe', `clear:${delay}ms`, payload as unknown as Record<string, unknown>);
        }
      } catch (err: unknown) {
        scoutDiag.warn('LoadingStuckProbe', 'probe-error', {
          sessionId: capturedSessionId,
          delay,
          error: err instanceof Error ? err.message : String(err),
        } as unknown as Record<string, unknown>);
      }
    }, delay);
    timerIds.push(id);
  }

  return () => {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    timerIds.forEach(tid => clearTimeout(tid));
  };
}
