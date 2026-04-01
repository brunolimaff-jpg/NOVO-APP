import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOffline } from '../../hooks/useOffline';

describe('useOffline', () => {
  beforeEach(() => {
    // Garante que navigator.onLine começa como true
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('inicializa com isOnline=true quando navigator.onLine=true', () => {
    const { result } = renderHook(() => useOffline());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.wasOffline).toBe(false);
  });

  it('atualiza isOnline para false ao disparar evento "offline"', () => {
    const { result } = renderHook(() => useOffline());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('atualiza isOnline para true ao disparar evento "online"', () => {
    const { result } = renderHook(() => useOffline());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('seta wasOffline=true quando volta online após estar offline', () => {
    const { result } = renderHook(() => useOffline());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.wasOffline).toBe(true);
  });

  it('clearWasOffline reseta wasOffline para false', () => {
    const { result } = renderHook(() => useOffline());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    act(() => {
      result.current.clearWasOffline();
    });

    expect(result.current.wasOffline).toBe(false);
  });

  it('remove event listeners ao desmontar', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useOffline());
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
