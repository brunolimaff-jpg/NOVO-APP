import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCofreTransition } from '../../hooks/useCofreTransition';

// ── Helpers ──

function baseParams(overrides: Partial<{
  isLoading: boolean;
  shouldSuspendVirtualizedList: boolean;
  hasLargeDossier: boolean;
}> = {}) {
  return {
    isLoading: false,
    shouldSuspendVirtualizedList: false,
    hasLargeDossier: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────
//  CICLO DE VIDA DO COFRE
// ─────────────────────────────────────────────────────

describe('useCofreTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('começa em hidden quando isLoading=true', () => {
    const { result } = renderHook(
      (props) => useCofreTransition(props),
      { initialProps: baseParams({ isLoading: true }) },
    );
    expect(result.current.cofrePhase).toBe('hidden');
  });

  // ── Teste 1: hidden → entering ──

  it('hidden → entering quando isLoading: true → false + hasLargeDossier', () => {
    const { result, rerender } = renderHook(
      (props) => useCofreTransition(props),
      { initialProps: baseParams({ isLoading: true, hasLargeDossier: false }) },
    );

    expect(result.current.cofrePhase).toBe('hidden');

    // Transição: loading termina + dossiê grande
    rerender(baseParams({ isLoading: false, hasLargeDossier: true }));

    expect(result.current.cofrePhase).toBe('entering');
  });

  // ── Teste 2: permanece hidden sem hasLargeDossier ──

  it('permanece hidden quando hasLargeDossier é false', () => {
    const { result, rerender } = renderHook(
      (props) => useCofreTransition(props),
      { initialProps: baseParams({ isLoading: true, hasLargeDossier: false }) },
    );

    // Loading termina mas não tem dossiê grande
    rerender(baseParams({ isLoading: false, hasLargeDossier: false }));

    expect(result.current.cofrePhase).toBe('hidden');
  });

  // ── Teste 3: permanece hidden com shouldSuspendVirtualizedList ──

  it('permanece hidden quando shouldSuspendVirtualizedList é true', () => {
    const { result, rerender } = renderHook(
      (props) => useCofreTransition(props),
      { initialProps: baseParams({ isLoading: true, hasLargeDossier: false }) },
    );

    // Loading termina, dossiê grande, mas lista suspensa
    rerender(baseParams({
      isLoading: false,
      hasLargeDossier: true,
      shouldSuspendVirtualizedList: true,
    }));

    expect(result.current.cofrePhase).toBe('hidden');
  });

  // ── Teste 4: entering → visible após 200ms ──

  it('entering → visible após 200ms', () => {
    const { result, rerender } = renderHook(
      (props) => useCofreTransition(props),
      { initialProps: baseParams({ isLoading: true, hasLargeDossier: false }) },
    );

    // Dispara entering
    rerender(baseParams({ isLoading: false, hasLargeDossier: true }));
    expect(result.current.cofrePhase).toBe('entering');

    // Avança 200ms — o timer do useLayoutEffect deve disparar
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.cofrePhase).toBe('visible');
  });

  // ── Teste 5: reseta para hidden quando isLoading volta a true ──

  it('reseta para hidden quando isLoading volta a true', () => {
    const { result, rerender } = renderHook(
      (props) => useCofreTransition(props),
      { initialProps: baseParams({ isLoading: true, hasLargeDossier: false }) },
    );

    // Dispara entering
    rerender(baseParams({ isLoading: false, hasLargeDossier: true }));
    expect(result.current.cofrePhase).toBe('entering');

    // Loading reinicia
    rerender(baseParams({
      isLoading: true,
      hasLargeDossier: true,
      shouldSuspendVirtualizedList: false,
    }));

    expect(result.current.cofrePhase).toBe('hidden');
  });

  // ── Teste 6: limpeza no unmount ──

  it('não vaza timers após unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { rerender, unmount } = renderHook(
      (props) => useCofreTransition(props),
      { initialProps: baseParams({ isLoading: true, hasLargeDossier: false }) },
    );

    // Dispara entering — timers são agendados
    rerender(baseParams({ isLoading: false, hasLargeDossier: true }));

    unmount();

    // O cleanup do useLayoutEffect deve ter chamado clearTimeout
    // para os timers agendados (200ms + safety 10s)
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });

  it('não quebra se avançar timers após unmount', () => {
    const { rerender, unmount } = renderHook(
      (props) => useCofreTransition(props),
      { initialProps: baseParams({ isLoading: true, hasLargeDossier: false }) },
    );

    rerender(baseParams({ isLoading: false, hasLargeDossier: true }));

    unmount();

    // Avançar todos os timers — não deve lançar erro nem causar efeitos colaterais
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(15_000);
      });
    }).not.toThrow();
  });
});
