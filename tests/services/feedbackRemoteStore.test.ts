import { describe, it, expect, vi, beforeEach } from 'vitest';

const scoutDiagMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
const supabaseInsertMock = vi.hoisted(() => vi.fn());
const supabaseFromMock = vi.hoisted(() =>
  vi.fn(() => ({
    insert: supabaseInsertMock,
  })),
);
const isSupabaseAvailableMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/diagnosticLog', () => ({
  scoutDiag: scoutDiagMock,
}));

vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseAvailable: isSupabaseAvailableMock,
  supabase: {
    from: supabaseFromMock,
  },
}));

import { sendFeedbackRemote, RemoteFeedbackPayload } from '../../services/feedbackRemoteStore';
import { markGuest, setAuthenticatedOperatorId } from '../../services/storage/_shared';

function makePayload(overrides: Partial<RemoteFeedbackPayload> = {}): RemoteFeedbackPayload {
  return {
    feedbackId: 'fb-001',
    sessionId: 'sess-001',
    messageId: 'msg-001',
    sectionKey: null,
    sectionTitle: null,
    type: 'like',
    comment: 'Excelente análise',
    aiContent: 'Conteúdo do dossiê...',
    userId: 'user-123',
    userName: 'Vendedor Teste',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('sendFeedbackRemote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthenticatedOperatorId('user-123');
    isSupabaseAvailableMock.mockReturnValue(true);
    supabaseInsertMock.mockResolvedValue({ error: null });
  });

  it('guest não envia feedback para tabela protegida', async () => {
    markGuest();

    const result = await sendFeedbackRemote(makePayload());

    expect(result).toBe(false);
    expect(supabaseFromMock).not.toHaveBeenCalled();
    expect(scoutDiagMock.info).toHaveBeenCalledWith(
      'Feedback',
      'guest_local_only',
      expect.any(Object),
    );
  });

  it('retorna true em caso de sucesso no Supabase', async () => {
    const result = await sendFeedbackRemote(makePayload());
    expect(result).toBe(true);
    expect(supabaseFromMock).toHaveBeenCalledWith('feedback_events');
  });

  it('retorna false quando Supabase retorna erro', async () => {
    supabaseInsertMock.mockResolvedValue({ error: { message: 'RLS failed' } });

    const result = await sendFeedbackRemote(makePayload());
    expect(result).toBe(false);
    expect(scoutDiagMock.error).toHaveBeenCalledWith(
      'Feedback',
      'envio Supabase falhou',
      expect.objectContaining({
        sessionId: 'sess-001',
        messageId: 'msg-001',
      }),
    );
  });

  it('retorna false quando Supabase indisponível', async () => {
    isSupabaseAvailableMock.mockReturnValue(false);

    const result = await sendFeedbackRemote(makePayload());
    expect(result).toBe(false);
    expect(scoutDiagMock.error).toHaveBeenCalledWith(
      'Feedback',
      'Supabase indisponível ou userId ausente',
      expect.any(Object),
    );
  });

  it('retorna false quando userId ausente', async () => {
    const result = await sendFeedbackRemote(makePayload({ userId: '' }));
    expect(result).toBe(false);
  });

  it('loga erro via scoutDiag em exceção', async () => {
    supabaseInsertMock.mockRejectedValue(new Error('Network error'));

    const result = await sendFeedbackRemote(makePayload());
    expect(result).toBe(false);
    expect(scoutDiagMock.error).toHaveBeenCalledWith(
      'Feedback',
      'envio Supabase falhou',
      expect.objectContaining({ error: 'Network error' }),
    );
  });

  it('envia payload completo com scope section e reason', async () => {
    await sendFeedbackRemote(
      makePayload({
        type: 'dislike',
        scope: 'section',
        sectionKey: 'resumo_1',
        sectionTitle: 'Resumo executivo',
        reason: 'no_evidence',
        metadata: { source: 'section_feedback' },
      }),
    );

    expect(supabaseInsertMock).toHaveBeenCalledWith({
      feedback_id: 'fb-001',
      operator_id: 'user-123',
      user_name: 'Vendedor Teste',
      session_id: 'sess-001',
      message_id: 'msg-001',
      scope: 'section',
      section_key: 'resumo_1',
      section_title: 'Resumo executivo',
      feedback_type: 'dislike',
      reason: 'no_evidence',
      comment: 'Excelente análise',
      ai_content: 'Conteúdo do dossiê...',
      metadata: { source: 'section_feedback' },
      created_at: expect.any(String),
    });
  });
});
