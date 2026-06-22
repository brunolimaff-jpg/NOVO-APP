import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCofreTransition } from '../../hooks/useCofreTransition';
import type { GenerationKind } from '../../utils/cofreLifecycle';

function baseParams(
  overrides: Partial<{
    generationKind: GenerationKind;
    isLoading: boolean;
    sessionId: string | null;
  }> = {},
) {
  return {
    generationKind: 'dossier' as GenerationKind,
    isLoading: true,
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('useCofreTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('entra imediatamente quando uma geração de dossiê começa', () => {
    const { result } = renderHook(() => useCofreTransition(baseParams()));

    expect(result.current.cofrePhase).toBe('entering');
  });

  it.each(['follow_up', 'deep_dive'] as const)('permanece oculto durante %s', generationKind => {
    const { result } = renderHook(() => useCofreTransition(baseParams({ generationKind })));

    expect(result.current.cofrePhase).toBe('hidden');
  });

  it('fica visível durante a geração e não libera apenas com isLoading=false', () => {
    const { result, rerender } = renderHook(props => useCofreTransition(props), {
      initialProps: baseParams(),
    });

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.cofrePhase).toBe('visible');

    rerender(baseParams({ isLoading: false }));
    act(() => vi.advanceTimersByTime(9_999));

    expect(result.current.cofrePhase).toBe('visible');
  });

  it('libera quando o dossiê já está visível no DOM após loading terminar', () => {
    const bot = document.createElement('article');
    bot.dataset.testid = 'bot-message-content';
    bot.textContent = 'Dossiê visível no painel';
    bot.style.width = '100px';
    bot.style.height = '40px';
    document.body.replaceChildren(bot);

    const rect = {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    } as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);

    const { result, rerender } = renderHook(props => useCofreTransition(props), {
      initialProps: baseParams(),
    });

    act(() => vi.advanceTimersByTime(200));
    rerender(baseParams({ isLoading: false }));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(result.current.cofrePhase).toBe('dissolving');
    act(() => vi.advanceTimersByTime(350));
    expect(result.current.cofrePhase).toBe('hidden');
    document.body.replaceChildren();
  });

  it('libera após PostCompletion válido da mesma sessão', () => {
    const { result, rerender } = renderHook(props => useCofreTransition(props), {
      initialProps: baseParams(),
    });

    act(() => vi.advanceTimersByTime(200));
    rerender(baseParams({ isLoading: false }));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('scout:cofre-render-ready', {
          detail: { sessionId: 'session-1' },
        }),
      );
    });
    expect(result.current.cofrePhase).toBe('dissolving');

    act(() => vi.advanceTimersByTime(350));
    expect(result.current.cofrePhase).toBe('hidden');
  });

  it('ignora PostCompletion de outra sessão', () => {
    const { result, rerender } = renderHook(props => useCofreTransition(props), {
      initialProps: baseParams(),
    });

    act(() => vi.advanceTimersByTime(200));
    rerender(baseParams({ isLoading: false }));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('scout:cofre-render-ready', {
          detail: { sessionId: 'session-2' },
        }),
      );
    });

    expect(result.current.cofrePhase).toBe('visible');
  });

  it('usa timeout de segurança somente depois que a API termina', () => {
    const { result, rerender } = renderHook(props => useCofreTransition(props), {
      initialProps: baseParams(),
    });

    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.cofrePhase).toBe('visible');

    rerender(baseParams({ isLoading: false }));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.cofrePhase).toBe('dissolving');

    act(() => vi.advanceTimersByTime(350));
    expect(result.current.cofrePhase).toBe('hidden');
  });

  it('libera imediatamente quando a geração é abortada ou falha', () => {
    const { result, rerender } = renderHook(props => useCofreTransition(props), {
      initialProps: baseParams(),
    });

    act(() => vi.advanceTimersByTime(200));
    rerender(baseParams({ generationKind: null, isLoading: false }));

    expect(result.current.cofrePhase).toBe('dissolving');
    act(() => vi.advanceTimersByTime(350));
    expect(result.current.cofrePhase).toBe('hidden');
  });
});
