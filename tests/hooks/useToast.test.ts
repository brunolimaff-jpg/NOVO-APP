import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useToast } from '../../hooks/useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inicializa com lista de toasts vazia', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toHaveLength(0);
  });

  it('toast.success adiciona toast do tipo success', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast.success('Salvo com sucesso!');
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe('success');
    expect(result.current.toasts[0].message).toBe('Salvo com sucesso!');
  });

  it('toast.error adiciona toast do tipo error', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast.error('Erro ao salvar');
    });
    expect(result.current.toasts[0].type).toBe('error');
  });

  it('toast.info adiciona toast do tipo info', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast.info('Processando...');
    });
    expect(result.current.toasts[0].type).toBe('info');
  });

  it('toast.warning adiciona toast do tipo warning', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast.warning('Atenção!');
    });
    expect(result.current.toasts[0].type).toBe('warning');
  });

  it('dismiss remove toast pelo id', () => {
    const { result } = renderHook(() => useToast());
    let toastId: string;
    act(() => {
      toastId = result.current.toast.success('Mensagem');
    });
    act(() => {
      result.current.dismiss(toastId!);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('toast expira automaticamente após o duration', async () => {
    const { result } = renderHook(() => useToast(500));
    act(() => {
      result.current.toast.success('Expirando...');
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('mantém no máximo 5 toasts simultâneos', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      for (let i = 0; i < 7; i++) {
        result.current.toast.info(`Toast ${i}`);
      }
    });
    expect(result.current.toasts.length).toBeLessThanOrEqual(5);
  });

  it('cada toast tem id único', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.toast.success('Toast A');
      result.current.toast.success('Toast B');
    });
    const ids = result.current.toasts.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
