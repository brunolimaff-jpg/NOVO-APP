/**
 * Testes de cenários de falha silenciosa no storage.
 *
 * Cobrem os riscos identificados no code review + validação em preview:
 *
 * F1 - saveDossier offline → retorna void sem throw, caller não sabe que falhou
 * F2 - getDossiers com erro Supabase → retorna [], usuário vê "Nenhuma investigação"
 * F3 - saveAllDossiers com erro Supabase → erro logado mas não propagado
 * F4 - deleteDossier sem operador → retorna void, dossiê reaparece no reload
 * F5 - Promise.allSettled com erro Supabase → falhas invisíveis
 * F6 - getDossiers sem operador → retorna [], parece que não há dados
 * F7 - saveDossier com operador trocado → dados salvos no operador errado
 * F8 - saveDossier sem Supabase → loga erro mas não propaga throw (sem fallback localStorage)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1' } } } })));

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  order: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  gt: vi.fn(),
  limit: vi.fn(),
}));

const isSupabaseAvailableMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: supabaseMock.from, auth: { getSession: getSessionMock } },
  isSupabaseAvailable: isSupabaseAvailableMock,
}));

import { storage } from '../../services/storage';
import { Sender, type ChatSession } from '../../types';

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'test-session-1',
    title: 'Test',
    empresaAlvo: 'Empresa Teste',
    cnpj: '12345678000190',
    modoPrincipal: 'completo',
    scoreOportunidade: 75,
    resumoDossie: 'resumo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    ...overrides,
  };
}

describe('storage — cenários de falha silenciosa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('scout360:operator_id', 'op_test_123');
    isSupabaseAvailableMock.mockReturnValue(true);
  });

  // ===================================================================
  // F1: saveDossier offline → sem feedback para o caller
  // ===================================================================
  describe('F1: saveDossier sem Supabase disponível', () => {
    it('deve lançar erro quando Supabase retorna erro (não silencioso)', async () => {
      supabaseMock.upsert.mockResolvedValue({ error: { message: 'RLS denied' } });
      supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });

      await expect(storage.saveDossier(makeSession())).rejects.toThrow('RLS denied');
    });

    it('não deve tentar salvar quando Supabase indisponível', async () => {
      isSupabaseAvailableMock.mockReturnValue(false);

      await storage.saveDossier(makeSession());
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it('não deve tentar salvar sem operator_id', async () => {
      localStorage.removeItem('scout360:operator_id');

      await storage.saveDossier(makeSession());
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  // F2: getDossiers com erro → usuário vê lista vazia
  // ===================================================================
  describe('F2: getDossiers retorna vazio em erro', () => {
    it('deve retornar [] quando Supabase retorna erro (usuário vê vazio)', async () => {
      const orderMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } });
      const isMock = vi.fn().mockReturnValue({ order: orderMock });
      const eqMock = vi.fn().mockReturnValue({ is: isMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabaseMock.from.mockReturnValue({ select: selectMock });

      const result = await storage.getDossiers();
      expect(result).toEqual([]);
    });

    it('deve retornar [] quando Supabase indisponível', async () => {
      isSupabaseAvailableMock.mockReturnValue(false);

      const result = await storage.getDossiers();
      expect(result).toEqual([]);
    });

    it('deve retornar [] sem operator_id', async () => {
      localStorage.removeItem('scout360:operator_id');

      const result = await storage.getDossiers();
      expect(result).toEqual([]);
    });

    it('deve normalizar isThinking:false em mensagens retornadas', async () => {
      const sessionWithThinking = makeSession({
        messages: [{ id: 'm1', sender: Sender.Bot, text: 'conteúdo', timestamp: new Date(), isThinking: true }],
      });
      const orderMock = vi.fn().mockResolvedValue({ data: [{ content: sessionWithThinking }], error: null });
      const isMock = vi.fn().mockReturnValue({ order: orderMock });
      const eqMock = vi.fn().mockReturnValue({ is: isMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabaseMock.from.mockReturnValue({ select: selectMock });

      const result = await storage.getDossiers();
      expect(result[0].messages[0].isThinking).toBe(false);
    });
  });

  // ===================================================================
  // F3: saveAllDossiers com erro → silencioso
  // ===================================================================
  describe('F3: saveAllDossiers com falha parcial ou total', () => {
    it('deve logar erro quando Supabase retorna erro no bulk upsert', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      supabaseMock.upsert.mockResolvedValue({ error: { message: 'Bulk upsert failed' } });
      supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });

      await storage.saveAllDossiers([makeSession()]);

      expect(consoleSpy).toHaveBeenCalledWith('[Storage] saveAllDossiers failed:', { message: 'Bulk upsert failed' });
      consoleSpy.mockRestore();
    });
  });

  // ===================================================================
  // F4: deleteDossier — não persiste sem operador
  // ===================================================================
  describe('F4: deleteDossier sem operador', () => {
    it('não deve tentar deletar sem operator_id', async () => {
      localStorage.removeItem('scout360:operator_id');

      await storage.deleteDossier('test-session-1');
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it('deve fazer soft-delete com operator_id', async () => {
      const eqOpMock = vi.fn().mockResolvedValue({ error: null });
      const eqIdMock = vi.fn().mockReturnValue({ eq: eqOpMock });
      supabaseMock.update.mockReturnValue({ eq: eqIdMock });
      supabaseMock.from.mockReturnValue({ update: supabaseMock.update });

      await storage.deleteDossier('test-session-1');

      expect(supabaseMock.update).toHaveBeenCalledWith({
        deleted_at: expect.any(String),
        updated_at: expect.any(String),
      });
    });
  });

  // ===================================================================
  // F5: getDossier com operator_id check (IDOR fix)
  // ===================================================================
  describe('F5: getDossier verifica operator_id', () => {
    it('deve incluir operator_id na query', async () => {
      supabaseMock.maybeSingle.mockResolvedValue({ data: { content: makeSession() }, error: null });
      const isMock = vi.fn().mockReturnValue({ maybeSingle: supabaseMock.maybeSingle });
      const eqOpMock = vi.fn().mockReturnValue({ is: isMock });
      const eqIdMock = vi.fn().mockReturnValue({ eq: eqOpMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqIdMock });
      supabaseMock.from.mockReturnValue({ select: selectMock });

      await storage.getDossier('test-session-1');

      expect(eqOpMock).toHaveBeenCalledWith('operator_id', 'op_test_123');
    });

    it('deve retornar null sem operator_id', async () => {
      localStorage.removeItem('scout360:operator_id');

      const result = await storage.getDossier('test-session-1');
      expect(result).toBeNull();
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });
  });
});
