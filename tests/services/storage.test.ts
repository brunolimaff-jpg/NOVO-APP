// tests/services/storage.test.ts
// Tests for simplified storage layer (Supabase direct, IDB only for extract cache)

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: supabaseMock.from,
  },
  isSupabaseAvailable: vi.fn(() => true),
}));

import { storage } from '../../services/storage';
import { get, set } from 'idb-keyval';
import { isSupabaseAvailable } from '../../lib/supabaseClient';
import type { ChatSession } from '../../types';

describe('storage (simplificado — Supabase direto)', () => {
  const mockSession: ChatSession = {
    id: 'session-1',
    title: 'Test Session',
    empresaAlvo: 'Test Company',
    cnpj: '12345678000190',
    modoPrincipal: 'Sales',
    scoreOportunidade: 75,
    resumoDossie: 'Test summary',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('scout360:operator_id', 'op_test123');
    vi.mocked(isSupabaseAvailable).mockReturnValue(true);
  });

  // ===================================================================
  // DOSSIERS
  // ===================================================================

  describe('getDossiers', () => {
    it('deve retornar dossiers do Supabase', async () => {
      const mockData = [{ content: { id: 'd1', title: 'Test', messages: [] } }];
      const orderMock = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const isMock = vi.fn().mockReturnValue({ order: orderMock });
      const eqMock = vi.fn().mockReturnValue({ is: isMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabaseMock.from.mockReturnValue({ select: selectMock });

      const result = await storage.getDossiers();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('d1');
      expect(supabaseMock.from).toHaveBeenCalledWith('dossies');
    });

    it('deve retornar array vazio se não houver operatorId', async () => {
      localStorage.removeItem('scout360:operator_id');

      const result = await storage.getDossiers();

      expect(result).toEqual([]);
    });

    it('deve retornar array vazio se Supabase indisponível', async () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(false);

      const result = await storage.getDossiers();

      expect(result).toEqual([]);
    });

    it('deve retornar array vazio se erro na consulta', async () => {
      const orderMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
      const isMock = vi.fn().mockReturnValue({ order: orderMock });
      const eqMock = vi.fn().mockReturnValue({ is: isMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabaseMock.from.mockReturnValue({ select: selectMock });

      const result = await storage.getDossiers();

      expect(result).toEqual([]);
    });
  });

  describe('getDossier', () => {
    it('deve retornar dossier específico do Supabase', async () => {
      supabaseMock.maybeSingle.mockResolvedValue({
        data: { content: mockSession },
        error: null,
      });
      const isMock = vi.fn().mockReturnValue({ maybeSingle: supabaseMock.maybeSingle });
      const eqOpMock = vi.fn().mockReturnValue({ is: isMock });
      const eqIdMock = vi.fn().mockReturnValue({ eq: eqOpMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqIdMock });
      supabaseMock.from.mockReturnValue({ select: selectMock });

      const result = await storage.getDossier('session-1');

      expect(result).toEqual(mockSession);
      expect(supabaseMock.from).toHaveBeenCalledWith('dossies');
    });

    it('deve retornar null se dossier não encontrado', async () => {
      supabaseMock.maybeSingle.mockResolvedValue({ data: null, error: null });
      const isMock = vi.fn().mockReturnValue({ maybeSingle: supabaseMock.maybeSingle });
      const eqOpMock = vi.fn().mockReturnValue({ is: isMock });
      const eqIdMock = vi.fn().mockReturnValue({ eq: eqOpMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqIdMock });
      supabaseMock.from.mockReturnValue({ select: selectMock });

      const result = await storage.getDossier('non-existent');

      expect(result).toBeNull();
    });

    it('deve retornar null se não houver operatorId', async () => {
      localStorage.removeItem('scout360:operator_id');

      const result = await storage.getDossier('session-1');

      expect(result).toBeNull();
      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it('deve retornar null se Supabase indisponível', async () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(false);

      const result = await storage.getDossier('session-1');

      expect(result).toBeNull();
    });
  });

  describe('saveDossier', () => {
    it('deve fazer upsert no Supabase', async () => {
      supabaseMock.upsert.mockResolvedValue({ error: null });
      supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });

      await storage.saveDossier(mockSession);

      expect(supabaseMock.from).toHaveBeenCalledWith('dossies');
      expect(supabaseMock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockSession.id,
          title: mockSession.title,
          operator_id: 'op_test123',
        }),
      );
    });

    it('não deve fazer upsert se não houver operatorId', async () => {
      localStorage.removeItem('scout360:operator_id');

      await storage.saveDossier(mockSession);

      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it('não deve fazer upsert se Supabase indisponível', async () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(false);

      await storage.saveDossier(mockSession);

      expect(supabaseMock.from).not.toHaveBeenCalled();
    });
  });

  describe('saveAllDossiers', () => {
    it('deve fazer upsert em lote (bulk) para todas as sessões', async () => {
      supabaseMock.upsert.mockResolvedValue({ error: null });
      supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });

      const sessions = [mockSession, { ...mockSession, id: 'session-2' }];
      await storage.saveAllDossiers(sessions);

      expect(supabaseMock.upsert).toHaveBeenCalledTimes(1);
      expect(supabaseMock.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'session-1' }),
          expect.objectContaining({ id: 'session-2' }),
        ]),
      );
    });

    it('não deve fazer upsert se não houver operatorId', async () => {
      localStorage.removeItem('scout360:operator_id');

      await storage.saveAllDossiers([mockSession]);

      expect(supabaseMock.from).not.toHaveBeenCalled();
    });
  });

  describe('deleteDossier', () => {
    it('deve fazer soft delete no Supabase', async () => {
      const eqOpMock = vi.fn().mockResolvedValue({ error: null });
      const eqIdMock = vi.fn().mockReturnValue({ eq: eqOpMock });
      supabaseMock.update.mockReturnValue({ eq: eqIdMock });
      supabaseMock.from.mockReturnValue({ update: supabaseMock.update });

      await storage.deleteDossier('session-1');

      expect(supabaseMock.from).toHaveBeenCalledWith('dossies');
      expect(supabaseMock.update).toHaveBeenCalledWith({
        deleted_at: expect.any(String),
        updated_at: expect.any(String),
      });
    });

    it('não deve fazer delete se não houver operatorId', async () => {
      localStorage.removeItem('scout360:operator_id');

      await storage.deleteDossier('session-1');

      expect(supabaseMock.from).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  // EXTRACT CACHE
  // ===================================================================

  describe('extract cache', () => {
    it('getExtractCache deve usar IDB', async () => {
      vi.mocked(get).mockResolvedValue({ result: 'cached', timestamp: Date.now() });

      const result = await storage.getExtractCache('test-key');

      expect(get).toHaveBeenCalledWith('ext-cache-test-key');
      expect(result).toEqual({ result: 'cached', timestamp: expect.any(Number) });
    });

    it('getExtractCache deve retornar null se IDB falhar', async () => {
      vi.mocked(get).mockRejectedValue(new Error('IDB error'));

      const result = await storage.getExtractCache('test-key');

      expect(result).toBeNull();
    });

    it('saveExtractCache deve salvar no IDB', async () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(false);
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveExtractCache('test-key', { data: 'test' });

      expect(set).toHaveBeenCalledWith('ext-cache-test-key', {
        result: { data: 'test' },
        timestamp: expect.any(Number),
      });
    });

    it('saveExtractCache deve fazer upsert no Supabase também', async () => {
      vi.mocked(set).mockResolvedValue(undefined);
      supabaseMock.upsert.mockResolvedValue({ error: null });
      supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });

      await storage.saveExtractCache('test-key', { data: 'test' });

      expect(supabaseMock.from).toHaveBeenCalledWith('extract_cache');
      expect(supabaseMock.upsert).toHaveBeenCalled();
    });
  });

  // ===================================================================
  // USER CONTEXT
  // ===================================================================

  describe('user context', () => {
    it('saveUserContext deve fazer upsert direto no Supabase', async () => {
      supabaseMock.upsert.mockResolvedValue({ error: null });
      supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });

      await storage.saveUserContext({
        operatorId: 'operator-123',
        name: 'Test Operator',
        email: 'test@example.com',
      });

      expect(supabaseMock.from).toHaveBeenCalledWith('user_context');
      expect(supabaseMock.upsert).toHaveBeenCalledWith(
        {
          operator_id: 'operator-123',
          display_name: 'Test Operator',
          email: 'test@example.com',
          email_normalized: 'test@example.com',
          last_seen: expect.any(String),
        },
        { onConflict: 'operator_id' },
      );
    });

    it('saveUserContext não deve fazer upsert sem operatorId', async () => {
      await storage.saveUserContext({
        operatorId: '',
        name: 'Test Operator',
        email: 'test@example.com',
      });

      expect(supabaseMock.from).not.toHaveBeenCalled();
    });

    it('touchUserContext deve atualizar last_seen', async () => {
      const updateEq = vi.fn().mockResolvedValue({ error: null });
      supabaseMock.update.mockReturnValue({ eq: updateEq });
      supabaseMock.from.mockReturnValue({ update: supabaseMock.update });

      await storage.touchUserContext('operator-123');

      expect(supabaseMock.from).toHaveBeenCalledWith('user_context');
      expect(supabaseMock.update).toHaveBeenCalledWith({ last_seen: expect.any(String) });
    });
  });

  // ===================================================================
  // RADAR
  // ===================================================================

  describe('radar', () => {
    it('getRadarAlerts deve buscar do Supabase', async () => {
      const mockAlerts = [{ id: 'alert-1', title: 'Test Alert' }];
      supabaseMock.maybeSingle.mockResolvedValue({
        data: { alert_data: mockAlerts },
        error: null,
      });
      const limitMock = vi.fn().mockReturnValue({ maybeSingle: supabaseMock.maybeSingle });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabaseMock.from.mockReturnValue({ select: selectMock });

      const result = await storage.getRadarAlerts();

      expect(supabaseMock.from).toHaveBeenCalledWith('radar_alerts');
      expect(result).toEqual(mockAlerts);
    });

    it('saveRadarAlerts deve fazer upsert no Supabase', async () => {
      supabaseMock.upsert.mockResolvedValue({ error: null });
      supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });

      await storage.saveRadarAlerts([{ id: 'alert-1' }]);

      expect(supabaseMock.from).toHaveBeenCalledWith('radar_alerts');
      expect(supabaseMock.upsert).toHaveBeenCalled();
    });

    it('getRadarConfig deve buscar do Supabase', async () => {
      supabaseMock.maybeSingle.mockResolvedValue({
        data: { config: { enabled: true } },
        error: null,
      });
      const eqMock = vi.fn().mockReturnValue({ maybeSingle: supabaseMock.maybeSingle });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabaseMock.from.mockReturnValue({ select: selectMock });

      const result = await storage.getRadarConfig();

      expect(supabaseMock.from).toHaveBeenCalledWith('radar_configs');
      expect(result).toEqual({ enabled: true });
    });

    it('saveRadarConfig deve fazer upsert no Supabase', async () => {
      supabaseMock.upsert.mockResolvedValue({ error: null });
      supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });

      await storage.saveRadarConfig({ enabled: true });

      expect(supabaseMock.from).toHaveBeenCalledWith('radar_configs');
      expect(supabaseMock.upsert).toHaveBeenCalled();
    });
  });

  // ===================================================================
  // FALLBACK: SUPABASE INDISPONÍVEL
  // ===================================================================

  describe('quando Supabase está indisponível', () => {
    beforeEach(() => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(false);
    });

    it('getDossiers deve retornar array vazio', async () => {
      const result = await storage.getDossiers();
      expect(result).toEqual([]);
    });

    it('saveDossier não deve quebrar', async () => {
      await expect(storage.saveDossier(mockSession)).resolves.toBeUndefined();
    });

    it('deleteDossier não deve quebrar', async () => {
      await expect(storage.deleteDossier('session-1')).resolves.toBeUndefined();
    });

    it('getExtractCache ainda funciona via IDB', async () => {
      vi.mocked(get).mockResolvedValue({ result: 'cached', timestamp: 123 });

      const result = await storage.getExtractCache('test-key');

      expect(result).toEqual({ result: 'cached', timestamp: 123 });
    });
  });
});
