import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sender, type AppError, type ChatSession } from '../../../types';
import { useChatFeedbackActions } from '../../../features/chat/feedback-actions';

const uuidv4Mock = vi.hoisted(() => vi.fn());
const sendFeedbackRemoteMock = vi.hoisted(() => vi.fn());

vi.mock('uuid', () => ({
  v4: uuidv4Mock,
}));

vi.mock('../../../services/feedbackRemoteStore', () => ({
  sendFeedbackRemote: sendFeedbackRemoteMock,
}));

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    title: 'Sessão 1',
    empresaAlvo: null,
    cnpj: null,
    modoPrincipal: null,
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [
      {
        id: 'message-1',
        sender: Sender.Bot,
        text: 'Resposta',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    ...overrides,
  };
}

function makeOptions(overrides: Partial<Parameters<typeof useChatFeedbackActions>[0]> = {}) {
  return {
    currentSession: makeSession(),
    operatorId: 'operator-1',
    operatorName: 'Bruno Lima',
    updateCurrentSession: vi.fn(),
    updateSessionById: vi.fn(),
    ...overrides,
  };
}

describe('useChatFeedbackActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidv4Mock.mockReturnValue('feedback-123');
    sendFeedbackRemoteMock.mockResolvedValue(true);
  });

  it('toggle o feedback local da mensagem', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useChatFeedbackActions(options));

    act(() => {
      result.current.handleFeedback('message-1', 'up');
    });

    expect(options.updateCurrentSession).toHaveBeenCalledWith(expect.any(Function));
    const updatedSession = (options.updateCurrentSession as ReturnType<typeof vi.fn>).mock.calls[0][0](
      options.currentSession as ChatSession,
    );
    expect(updatedSession.messages[0].feedback).toBe('up');

    act(() => {
      result.current.handleFeedback('message-1', 'up');
    });

    const toggledSession = (options.updateCurrentSession as ReturnType<typeof vi.fn>).mock.calls[1][0]({
      ...(options.currentSession as ChatSession),
      messages: [{ ...(options.currentSession as ChatSession).messages[0], feedback: 'up' }],
    });
    expect(toggledSession.messages[0].feedback).toBeUndefined();
  });

  it('envia feedback remoto com payload preservado e atualiza o snapshot local', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useChatFeedbackActions(options));

    await act(async () => {
      await result.current.handleSendFeedback('message-1', 'down', 'Faltou fonte', 'Conteúdo do relatório');
    });

    expect(options.updateSessionById).toHaveBeenCalledWith('session-1', expect.any(Function));
    const updatedSession = (options.updateSessionById as ReturnType<typeof vi.fn>).mock.calls[0][1](
      options.currentSession as ChatSession,
    );
    expect(updatedSession.messages[0].feedback).toBe('down');

    expect(sendFeedbackRemoteMock).toHaveBeenCalledWith({
      feedbackId: 'feedback-123',
      sessionId: 'session-1',
      messageId: 'message-1',
      sectionKey: null,
      sectionTitle: null,
      type: 'dislike',
      scope: 'message',
      reason: null,
      comment: 'Faltou fonte',
      aiContent: 'Conteúdo do relatório',
      userId: 'operator-1',
      userName: 'Bruno Lima',
      metadata: undefined,
      timestamp: expect.any(String),
    });
  });

  it('envia motivo e metadados opcionais no feedback remoto', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useChatFeedbackActions(options));

    await act(async () => {
      await result.current.handleSendFeedback('message-1', 'down', '', 'Trecho da seção', {
        scope: 'section',
        sectionKey: 'resumo_1',
        sectionTitle: 'Resumo executivo',
        reason: 'not_actionable',
        metadata: { source: 'section_feedback' },
      });
    });

    expect(sendFeedbackRemoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionKey: 'resumo_1',
        sectionTitle: 'Resumo executivo',
        scope: 'section',
        reason: 'not_actionable',
        metadata: { source: 'section_feedback' },
      }),
    );
  });

  it('registra erro quando o envio remoto de feedback falha', async () => {
    const error = new Error('feedback failed');
    sendFeedbackRemoteMock.mockRejectedValue(error);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const options = makeOptions();
    const { result } = renderHook(() => useChatFeedbackActions(options));

    try {
      await act(async () => {
        await result.current.handleSendFeedback('message-1', 'up', 'Ótimo', 'Conteúdo');
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Feedback error', error);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('toggle o feedback por seção', () => {
    const options = makeOptions({
      currentSession: makeSession({
        messages: [
          {
            id: 'message-1',
            sender: Sender.Bot,
            text: 'Resposta',
            timestamp: new Date('2026-01-01T00:00:00.000Z'),
            sectionFeedback: { Resumo: 'up' },
          },
        ],
      }),
    });
    const { result } = renderHook(() => useChatFeedbackActions(options));

    act(() => {
      result.current.handleSectionFeedback('message-1', 'Resumo', 'down');
    });

    const updatedSession = (options.updateCurrentSession as ReturnType<typeof vi.fn>).mock.calls[0][0](
      options.currentSession as ChatSession,
    );
    expect(updatedSession.messages[0].sectionFeedback).toEqual({ Resumo: 'down' });

    act(() => {
      result.current.handleSectionFeedback('message-1', 'Resumo', 'down');
    });

    const toggledSession = (options.updateCurrentSession as ReturnType<typeof vi.fn>).mock.calls[1][0]({
      ...(options.currentSession as ChatSession),
      messages: [
        {
          ...(options.currentSession as ChatSession).messages[0],
          sectionFeedback: { Resumo: 'down' },
        },
      ],
    });
    expect(toggledSession.messages[0].sectionFeedback).toEqual({});
  });

  it('toggle a visibilidade das fontes da mensagem', () => {
    const options = makeOptions({
      currentSession: makeSession({
        messages: [
          {
            id: 'message-1',
            sender: Sender.Bot,
            text: 'Resposta',
            timestamp: new Date('2026-01-01T00:00:00.000Z'),
            isSourcesOpen: false,
          },
        ],
      }),
    });
    const { result } = renderHook(() => useChatFeedbackActions(options));

    act(() => {
      result.current.handleToggleMessageSources('message-1');
    });

    const updatedSession = (options.updateCurrentSession as ReturnType<typeof vi.fn>).mock.calls[0][0](
      options.currentSession as ChatSession,
    );
    expect(updatedSession.messages[0].isSourcesOpen).toBe(true);
  });

  it('envia report de erro com sectionKey fixo e userId/operatorName preservados', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useChatFeedbackActions(options));
    const error: AppError = {
      code: 'NETWORK',
      message: 'Falha de rede',
      friendlyMessage: 'Falha ao carregar',
      retryable: true,
      transient: true,
      source: 'LLM',
      details: { attempt: 1 },
    };

    await act(async () => {
      await result.current.handleReportError('message-1', error);
    });

    expect(sendFeedbackRemoteMock).toHaveBeenCalledWith({
      feedbackId: 'feedback-123',
      sessionId: 'session-1',
      messageId: 'message-1',
      sectionKey: 'ERROR_REPORT',
      sectionTitle: 'System Error',
      type: 'dislike',
      scope: 'error',
      reason: 'generic',
      comment: 'Automated Error Report: NETWORK',
      aiContent: JSON.stringify(
        {
          code: 'NETWORK',
          source: 'LLM',
          message: 'Falha de rede',
          details: { attempt: 1 },
        },
        null,
        2,
      ),
      userId: 'operator-1',
      userName: 'Bruno Lima',
      metadata: {
        errorCode: 'NETWORK',
        source: 'LLM',
      },
      timestamp: expect.any(String),
    });
  });
});
