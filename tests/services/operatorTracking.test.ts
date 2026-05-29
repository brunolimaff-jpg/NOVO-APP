// tests/services/operatorTracking.test.ts
// Tests para o sistema de tracking de operadores (fire-and-forget via Supabase)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInsert = vi.hoisted(() => vi.fn(() => ({ then: (fn: (v: unknown) => void) => fn({ error: null }) })));
const mockUpdate = vi.hoisted(() =>
  vi.fn(() => ({ eq: vi.fn(() => ({ then: (fn: (v: unknown) => void) => fn({ error: null }) })) })),
);
const mockUpsert = vi.hoisted(() => vi.fn(() => ({ then: (fn: (v: unknown) => void) => fn({ error: null }) })));

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(() => ({
    insert: mockInsert,
    update: mockUpdate,
    upsert: mockUpsert,
  })),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: supabaseMock,
  isSupabaseAvailable: vi.fn(() => true),
}));

import {
  trackOperatorEvent,
  startOperatorSession,
  endOperatorSession,
  initSessionTracking,
} from '../../services/operatorTracking';
import { isSupabaseAvailable } from '../../lib/supabaseClient';

describe('operatorTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(isSupabaseAvailable).mockReturnValue(true);
    mockInsert.mockReturnValue({ then: (fn: (v: unknown) => void) => fn({ error: null }) });
    mockUpdate.mockReturnValue({ eq: vi.fn(() => ({ then: (fn: (v: unknown) => void) => fn({ error: null }) })) });
    mockUpsert.mockReturnValue({ then: (fn: (v: unknown) => void) => fn({ error: null }) });
    supabaseMock.from.mockReturnValue({
      insert: mockInsert,
      update: mockUpdate,
      upsert: mockUpsert,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  // ===================================================================
  // trackOperatorEvent
  // ===================================================================

  describe('trackOperatorEvent', () => {
    it('deve inserir evento no Supabase quando disponivel', () => {
      trackOperatorEvent('app_opened', {
        operatorId: 'op_test123',
        email: 'Test@Senior.com.Br',
      });

      expect(supabaseMock.from).toHaveBeenCalledWith('operator_events');
      expect(mockInsert).toHaveBeenCalled();
    });

    it('nao deve lancar excecao quando Supabase indisponivel', () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(false);

      expect(() => {
        trackOperatorEvent('dossier_started', {
          operatorId: 'op_test123',
        });
      }).not.toThrow();

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('nao deve lancar excecao quando operatorId vazio', () => {
      expect(() => {
        trackOperatorEvent('dossier_completed', {
          operatorId: '',
          email: 'test@senior.com.br',
        });
      }).not.toThrow();

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('deve normalizar email para lowercase', () => {
      trackOperatorEvent('operator_registered', {
        operatorId: 'op_test123',
        email: 'BRUNO@SENIOR.COM.BR',
      });

      expect(mockInsert).toHaveBeenCalled();
      const callArgs = mockInsert.mock.calls[0] as unknown[];
      const inserted = callArgs[0] as Record<string, unknown> | undefined;
      expect(inserted?.email_normalized).toBe('bruno@senior.com.br');
    });

    it('deve incluir session_id quando disponivel no sessionStorage', () => {
      sessionStorage.setItem('scout:current_session_id', 'sess_abc123');

      trackOperatorEvent('dossier_opened', {
        operatorId: 'op_test123',
        entityType: 'session',
        entityId: 'sess_xyz',
      });

      expect(mockInsert).toHaveBeenCalled();
      const callArgs = mockInsert.mock.calls[0] as unknown[];
      const inserted = callArgs[0] as Record<string, unknown> | undefined;
      expect(inserted?.session_id).toBe('sess_abc123');
    });

    it('deve ignorar sessionId do payload e usar o sessionStorage (getCurrentSessionId)', () => {
      sessionStorage.setItem('scout:current_session_id', 'sess_da_storage');

      trackOperatorEvent('dossier_shared', {
        operatorId: 'op_test123',
        sessionId: 'sess_custom',
      });

      expect(mockInsert).toHaveBeenCalled();
      const callArgs = mockInsert.mock.calls[0] as unknown[];
      const inserted = callArgs[0] as Record<string, unknown> | undefined;
      expect(inserted?.session_id).toBe('sess_da_storage');
    });

    it('deve sanitizar metadata removendo chaves sensiveis', () => {
      trackOperatorEvent('dossier_failed', {
        operatorId: 'op_test123',
        metadata: {
          prompt: 'conteudo sensivel',
          geminiResponse: 'resposta confidencial',
          errorMessage: 'timeout',
          retryCount: 3,
        },
      });

      expect(mockInsert).toHaveBeenCalled();
      const callArgs = mockInsert.mock.calls[0] as unknown[];
      const inserted = callArgs[0] as Record<string, unknown> | undefined;
      const meta = inserted?.metadata as Record<string, unknown> | undefined;

      expect(meta?.prompt).toBeUndefined();
      expect(meta?.geminiResponse).toBeUndefined();
      expect(meta?.errorMessage).toBe('timeout');
      expect(meta?.retryCount).toBe(3);
    });

    it('deve truncar strings longas no metadata', () => {
      const longString = 'a'.repeat(500);

      trackOperatorEvent('dossier_completed', {
        operatorId: 'op_test123',
        metadata: { note: longString },
      });

      expect(mockInsert).toHaveBeenCalled();
      const callArgs = mockInsert.mock.calls[0] as unknown[];
      const inserted = callArgs[0] as Record<string, unknown> | undefined;
      const meta = inserted?.metadata as Record<string, unknown> | undefined;
      const note = meta?.note as string | undefined;

      expect(note?.length).toBeLessThanOrEqual(203);
      expect(note?.endsWith('...')).toBe(true);
    });

    it('nao deve lancar excecao se o Supabase falhar', () => {
      mockInsert.mockReturnValue({
        then: (_onSuccess: (v: unknown) => void, onError?: (v: unknown) => void) => {
          onError?.(new Error('mock error'));
          return undefined as unknown as PromiseLike<void>;
        },
      });

      expect(() => {
        trackOperatorEvent('app_opened', {
          operatorId: 'op_test123',
        });
      }).not.toThrow();
    });
  });

  // ===================================================================
  // startOperatorSession
  // ===================================================================

  describe('startOperatorSession', () => {
    it('deve fazer upsert da sessao com ID gerado no cliente', () => {
      startOperatorSession('op_test123', 'test@senior.com.br');

      expect(supabaseMock.from).toHaveBeenCalledWith('operator_sessions');
      expect(mockUpsert).toHaveBeenCalled();

      const stored = sessionStorage.getItem('scout:current_session_id');
      expect(stored).toBeDefined();
    });

    it('nao deve fazer upsert quando Supabase indisponivel', () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(false);
      startOperatorSession('op_test123');
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  // endOperatorSession
  // ===================================================================

  describe('endOperatorSession', () => {
    it('deve atualizar sessao com ended_at e reason', () => {
      sessionStorage.setItem('scout:current_session_id', 'sess_test');
      sessionStorage.setItem('scout:session_started_at', new Date(Date.now() - 60_000).toISOString());

      endOperatorSession('pagehide');

      expect(supabaseMock.from).toHaveBeenCalledWith('operator_sessions');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('nao deve atualizar se nao houver session_id', () => {
      endOperatorSession('manual');
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  // initSessionTracking
  // ===================================================================

  describe('initSessionTracking', () => {
    it('deve criar sessao e disparar app_opened', async () => {
      await initSessionTracking('op_test123', 'bruno@senior.com.br');

      expect(supabaseMock.from).toHaveBeenCalledWith('operator_sessions');
      expect(supabaseMock.from).toHaveBeenCalledWith('operator_events');
    });

    it('nao deve fazer nada sem operatorId', () => {
      initSessionTracking('', 'test@senior.com.br');
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });
  });
});
