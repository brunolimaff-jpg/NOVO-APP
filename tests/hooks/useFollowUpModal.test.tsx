import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFollowUpModal } from '../../hooks/useFollowUpModal';

describe('useFollowUpModal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('abre em estado idle', () => {
    const { result } = renderHook(() => useFollowUpModal({ toast: { error: vi.fn() } }));

    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.followUpStatus).toBe('idle');
  });

  it('fecha ao pressionar Escape', () => {
    const { result } = renderHook(() => useFollowUpModal({ toast: { error: vi.fn() } }));

    act(() => result.current.open());
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(result.current.isOpen).toBe(false);
  });

  it('agenda com sucesso e limpa notas ao fechar automaticamente', () => {
    const { result } = renderHook(() => useFollowUpModal({ toast: { error: vi.fn() } }));

    act(() => {
      result.current.open();
      result.current.setFollowUpNotas('Retomar proposta');
      result.current.handleSchedule({ ok: true, method: 'ics' });
    });

    expect(result.current.followUpStatus).toBe('sent');

    act(() => vi.advanceTimersByTime(2200));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.followUpStatus).toBe('idle');
    expect(result.current.followUpNotas).toBe('');
  });

  it('exibe erro quando nao consegue agendar', () => {
    const toast = { error: vi.fn() };
    const { result } = renderHook(() => useFollowUpModal({ toast }));

    act(() => result.current.handleSchedule({ ok: false, error: 'Falhou' }));

    expect(result.current.followUpStatus).toBe('error');
    expect(toast.error).toHaveBeenCalledWith('Falhou');
  });
});
