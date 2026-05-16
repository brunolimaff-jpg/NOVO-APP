import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEmailModal } from '../../hooks/useEmailModal';
import { Sender, type Message } from '../../types';

const FIXED_DATE = '2026-05-16T12:00:00.000Z';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    sender: Sender.Bot,
    text: 'Resumo executivo com conteudo suficiente para envio.',
    timestamp: new Date(FIXED_DATE),
    ...overrides,
  };
}

describe('useEmailModal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('abre com assunto derivado da sessao', () => {
    const { result } = renderHook(() =>
      useEmailModal({
        messages: [makeMessage()],
        sessionTitle: 'Acme Agro',
        operatorName: 'Bruno',
        toast: { error: vi.fn() },
      }),
    );

    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.emailSubject).toContain('Senior Scout 360');
  });

  it('fecha ao pressionar Escape', () => {
    const { result } = renderHook(() =>
      useEmailModal({
        messages: [makeMessage()],
        sessionTitle: 'Acme Agro',
        operatorName: 'Bruno',
        toast: { error: vi.fn() },
      }),
    );

    act(() => result.current.open());
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(result.current.isOpen).toBe(false);
  });

  it('envia e fecha apos sucesso', async () => {
    const sendEmail = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useEmailModal({
        messages: [makeMessage()],
        sessionTitle: 'Acme Agro',
        operatorName: 'Bruno',
        toast: { error: vi.fn() },
        sendEmail,
      }),
    );

    act(() => {
      result.current.open();
      result.current.setEmailTo('cliente@example.com');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailTo: 'cliente@example.com',
        operatorName: 'Bruno',
      }),
    );
    expect(result.current.emailStatus).toBe('sent');

    act(() => vi.advanceTimersByTime(3000));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.emailTo).toBe('');
  });
});
