import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePWA } from '../../hooks/usePWA';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function createInstallEvent(): BeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  return event;
}

describe('usePWA', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: false,
    });
  });

  it('compartilha um único listener nativo entre múltiplos consumidores', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => usePWA());
    renderHook(() => usePWA());

    const beforeInstallRegistrations = addEventListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === 'beforeinstallprompt',
    );

    expect(beforeInstallRegistrations).toHaveLength(1);
  });

  it('sincroniza o prompt de instalação entre consumidores diferentes', async () => {
    const firstConsumer = renderHook(() => usePWA());
    const secondConsumer = renderHook(() => usePWA());
    const installEvent = createInstallEvent();

    act(() => {
      window.dispatchEvent(installEvent);
    });

    await waitFor(() => {
      expect(firstConsumer.result.current.showInstallPrompt).toBe(true);
      expect(secondConsumer.result.current.showInstallPrompt).toBe(true);
    });

    await act(async () => {
      await secondConsumer.result.current.installApp();
    });

    expect(installEvent.prompt).toHaveBeenCalledTimes(1);
  });
});
