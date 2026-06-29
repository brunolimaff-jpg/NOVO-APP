import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleLoadingStuckProbes } from '../../../features/chat/loading-watchdog';

describe('scheduleLoadingStuckProbes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ignora probe setTimeout quando sessao mudou apos agendamento', () => {
    const activeGenerationRef = { current: { 'session-a': 'bot-a' } };
    const currentSessionIdRef = { current: 'session-b' as string | null };
    const latestLoadingRef = {
      current: { isLoading: true, loadingVariant: 'hero' as const },
    };
    const setIsLoading = vi.fn();
    const setLoadingVariant = vi.fn();
    const completeLoadingProgress = vi.fn();

    const cleanup = scheduleLoadingStuckProbes('session-a', 'bot-a', true, {
      activeGenerationRef,
      currentSessionIdRef,
      latestLoadingRef,
      setIsLoading,
      setLoadingVariant,
      completeLoadingProgress,
    });

    vi.runAllTimers();

    expect(setIsLoading).not.toHaveBeenCalled();
    cleanup();
  });
});
