import { describe, it, expect, vi, beforeEach } from 'vitest';

const withAutoRetryMock = vi.hoisted(() => vi.fn());
const scoutDiagMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
const supabaseInsertMock = vi.hoisted(() => vi.fn());
const supabaseFromMock = vi.hoisted(() => vi.fn(() => ({
  insert: supabaseInsertMock,
})));
const isSupabaseAvailableMock = vi.hoisted(() => vi.fn());

vi.mock('../../utils/retry', () => ({
  withAutoRetry: withAutoRetryMock,
}));

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
    isSupabaseAvailableMock.mockReturnValue(false);
    supabaseInsertMock.mockResolvedValue({ error: null });
  });

  it('retorna true em caso de sucesso', async () => {
    withAutoRetryMock.mockImplementation(async (_name: string, action: () => Promise<unknown>) => action());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      text: async () => JSON.stringify({ ok: true }),
    } as Response);

    const result = await sendFeedbackRemote(makePayload());
    expect(result).toBe(true);
  });

  it('retorna false em caso de erro de rede (não lança)', async () => {
    withAutoRetryMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await sendFeedbackRemote(makePayload());
    expect(result).toBe(false);
  });

  it('retorna false quando API responde com ok=false', async () => {
    withAutoRetryMock.mockImplementation(async (_name: string, action: () => Promise<unknown>) => action());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      text: async () => JSON.stringify({ ok: false, error: 'Not found' }),
    } as Response);

    const result = await sendFeedbackRemote(makePayload());
    expect(result).toBe(false);
  });

  it('loga erro via scoutDiag quando falha', async () => {
    withAutoRetryMock.mockRejectedValue(new Error('Timeout'));

    await sendFeedbackRemote(makePayload());
    expect(scoutDiagMock.error).toHaveBeenCalled();
  });

  it('retorna false para JSON inválido na resposta', async () => {
    withAutoRetryMock.mockImplementation(async (_name: string, action: () => Promise<unknown>) => action());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      text: async () => 'NOT_JSON_AT_ALL',
    } as Response);

    const result = await sendFeedbackRemote(makePayload());
    expect(result).toBe(false);
  });

  it('envia payload com action=feedback', async () => {
    let capturedBody = '';
    withAutoRetryMock.mockImplementation(async (_name: string, action: () => Promise<unknown>) => action());
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      capturedBody = options?.body as string;
      return { text: async () => JSON.stringify({ ok: true }) } as Response;
    });

    await sendFeedbackRemote(makePayload({ type: 'dislike' }));
    const parsed = JSON.parse(capturedBody);
    expect(parsed.action).toBe('feedback');
    expect(parsed.feedback.type).toBe('dislike');
  });

  it('grava no Supabase e retorna sucesso mesmo quando legado falha', async () => {
    isSupabaseAvailableMock.mockReturnValue(true);
    withAutoRetryMock.mockRejectedValue(new Error('Legacy down'));

    const result = await sendFeedbackRemote(makePayload({
      type: 'dislike',
      scope: 'section',
      sectionKey: 'resumo_1',
      sectionTitle: 'Resumo executivo',
      reason: 'no_evidence',
      metadata: { source: 'section_feedback' },
    }));

    expect(result).toBe(true);
    expect(supabaseFromMock).toHaveBeenCalledWith('feedback_events');
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

  it('continua chamando legado quando Supabase falha', async () => {
    isSupabaseAvailableMock.mockReturnValue(true);
    supabaseInsertMock.mockResolvedValue({ error: { message: 'RLS failed' } });
    withAutoRetryMock.mockImplementation(async (_name: string, action: () => Promise<unknown>) => action());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      text: async () => JSON.stringify({ ok: true }),
    } as Response);

    const result = await sendFeedbackRemote(makePayload());

    expect(result).toBe(true);
    expect(withAutoRetryMock).toHaveBeenCalled();
    expect(scoutDiagMock.error).toHaveBeenCalledWith(
      'Feedback',
      'envio Supabase falhou',
      expect.objectContaining({ error: 'RLS failed' }),
    );
  });

  it('usa maxRetries=2 no withAutoRetry', async () => {
    withAutoRetryMock.mockResolvedValue(true);

    await sendFeedbackRemote(makePayload());
    expect(withAutoRetryMock).toHaveBeenCalledWith(
      'Feedback:send',
      expect.any(Function),
      expect.objectContaining({ maxRetries: 2 }),
    );
  });
});
