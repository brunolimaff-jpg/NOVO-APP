// tests/services/storage.test.ts
// Tests for unified storage layer (Supabase + IDB offline)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
}));

// Mock supabaseClient
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: supabaseMock.from,
  },
  isSupabaseAvailable: vi.fn(() => false),
}));

// Mock syncQueue
vi.mock('../../services/syncQueue', () => ({
  syncQueue: {
    enqueue: vi.fn(),
    remove: vi.fn(),
    size: vi.fn(() => 0),
    peek: vi.fn(() => []),
    load: vi.fn(async () => []),
    processWhere: vi.fn(async () => true),
    processAll: vi.fn(),
  },
}));

import { storage } from '../../services/storage';
import { get, set } from 'idb-keyval';
import { isSupabaseAvailable } from '../../lib/supabaseClient';
import { syncQueue } from '../../services/syncQueue';
import type { ChatSession } from '../../types';

describe('storage', () => {
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
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.mocked(isSupabaseAvailable).mockReturnValue(false);
    vi.mocked(syncQueue.peek).mockReturnValue([]);
    supabaseMock.from.mockReset();
    supabaseMock.upsert.mockReset();
    supabaseMock.select.mockReset();
    supabaseMock.update.mockReset();
    supabaseMock.eq.mockReset();
    supabaseMock.maybeSingle.mockReset();
  });

  describe('getOperatorId', () => {
    it('should read operator_id from localStorage', () => {
      localStorage.setItem('scout360:operator_id', 'operator-123');
      // Access the helper via storage methods that use it
      expect(localStorage.getItem('scout360:operator_id')).toBe('operator-123');
      localStorage.removeItem('scout360:operator_id');
    });
  });

  describe('Dossiers', () => {
    it('saveDossier should call IDB set and syncQueue.enqueue', async () => {
      localStorage.setItem('scout360:operator_id', 'operator-123');
      vi.mocked(set).mockResolvedValue(undefined);
      vi.mocked(get).mockResolvedValue([]); // Return empty array for getLocalSessions

      await storage.saveDossier(mockSession);

      expect(set).toHaveBeenCalledWith('scout360_sessions_v2', expect.any(Array));
      expect(syncQueue.enqueue).toHaveBeenCalledWith({
        table: 'dossies',
        operation: 'upsert',
        data: expect.objectContaining({
          id: mockSession.id,
          title: mockSession.title,
          empresa_alvo: mockSession.empresaAlvo,
          cnpj: mockSession.cnpj,
          modo_principal: mockSession.modoPrincipal,
          score_oportunidade: mockSession.scoreOportunidade,
          resumo_dossie: mockSession.resumoDossie,
          operator_id: 'operator-123',
        }),
        id: mockSession.id,
      });
      localStorage.removeItem('scout360:operator_id');
    });

    it('saveDossier should save to IDB but NOT enqueue when no operator_id', async () => {
      vi.mocked(set).mockResolvedValue(undefined);
      vi.mocked(get).mockResolvedValue([]); // Return empty array for getLocalSessions

      await storage.saveDossier(mockSession);

      expect(set).toHaveBeenCalledWith('scout360_sessions_v2', expect.any(Array));
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });

    it('saveAllDossiers should bulk save to IDB and enqueue sync for each', async () => {
      localStorage.setItem('scout360:operator_id', 'operator-123');
      const sessions = [mockSession];
      vi.mocked(set).mockResolvedValue(undefined);
      vi.mocked(get).mockResolvedValue([]); // Return empty array for getLocalSessions

      await storage.saveAllDossiers(sessions);

      expect(set).toHaveBeenCalledWith('scout360_sessions_v2', sessions);
      expect(syncQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(syncQueue.enqueue).toHaveBeenCalledWith({
        table: 'dossies',
        operation: 'upsert',
        data: expect.objectContaining({
          id: mockSession.id,
          operator_id: 'operator-123',
        }),
        id: mockSession.id,
      });
      localStorage.removeItem('scout360:operator_id');
    });

    it('saveAllDossiers should save to IDB but NOT enqueue when no operator_id', async () => {
      const sessions = [mockSession];
      vi.mocked(set).mockResolvedValue(undefined);
      vi.mocked(get).mockResolvedValue([]); // Return empty array for getLocalSessions

      await storage.saveAllDossiers(sessions);

      expect(set).toHaveBeenCalledWith('scout360_sessions_v2', sessions);
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });

    it('getDossiers should return from IDB', async () => {
      vi.mocked(get).mockResolvedValue([mockSession]);

      const result = await storage.getDossiers();

      expect(get).toHaveBeenCalledWith('scout360_sessions_v2');
      expect(result).toEqual([mockSession]);
    });

    it('getDossier should return specific session from local sessions', async () => {
      vi.mocked(get).mockResolvedValue([mockSession]);

      const result = await storage.getDossier('session-1');

      expect(result).toEqual(mockSession);
    });

    it('getDossier should return null if session not found', async () => {
      vi.mocked(get).mockResolvedValue([mockSession]);

      const result = await storage.getDossier('non-existent');

      expect(result).toBeNull();
    });

    it('deleteDossier should remove from local and enqueue sync with deleted_at', async () => {
      localStorage.setItem('scout360:operator_id', 'operator-123');
      vi.mocked(get).mockResolvedValue([mockSession]);
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.deleteDossier('session-1');

      expect(set).toHaveBeenCalledWith('scout360_sessions_v2', []);
      expect(syncQueue.enqueue).toHaveBeenCalledWith({
        table: 'dossies',
        operation: 'upsert',
        data: expect.objectContaining({
          id: 'session-1',
          operator_id: 'operator-123',
          content: mockSession,
          deleted_at: expect.any(String),
          updated_at: expect.any(String),
        }),
        id: 'session-1',
      });
      localStorage.removeItem('scout360:operator_id');
    });

    it('deleteDossier should remove from local but NOT enqueue when no operator_id', async () => {
      vi.mocked(get).mockResolvedValue([mockSession]);
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.deleteDossier('session-1');

      expect(set).toHaveBeenCalledWith('scout360_sessions_v2', []);
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });

    it('saveDossier should schedule one debounced auto sync for dossier operations', async () => {
      vi.useFakeTimers();
      vi.mocked(isSupabaseAvailable).mockReturnValue(true);
      localStorage.setItem('scout360:operator_id', 'operator-123');
      vi.mocked(set).mockResolvedValue(undefined);
      vi.mocked(get).mockResolvedValue([]);
      vi.mocked(syncQueue.peek)
        .mockReturnValueOnce([
          {
            table: 'dossies',
            operation: 'upsert',
            data: {},
            id: 'session-1',
          },
        ])
        .mockReturnValueOnce([]);

      await storage.saveDossier(mockSession);
      await storage.saveDossier({ ...mockSession, title: 'Updated Session' });

      expect(syncQueue.processWhere).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(749);
      expect(syncQueue.processWhere).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);

      expect(syncQueue.processWhere).toHaveBeenCalledTimes(1);
      const [predicate] = vi.mocked(syncQueue.processWhere).mock.calls[0];
      expect(
        predicate({
          table: 'dossies',
          operation: 'upsert',
          data: {},
          id: 'session-1',
        }),
      ).toBe(true);
      expect(
        predicate({
          table: 'radar_alerts',
          operation: 'upsert',
          data: {},
          id: 'alerts',
        }),
      ).toBe(false);
      localStorage.removeItem('scout360:operator_id');
    });

    it('syncDossiers should preserve pull when a rerun is requested during in-flight sync', async () => {
      vi.useFakeTimers();
      vi.mocked(isSupabaseAvailable).mockReturnValue(true);
      localStorage.setItem('scout360:operator_id', 'operator-123');
      vi.mocked(get).mockResolvedValue([]);
      vi.mocked(set).mockResolvedValue(undefined);

      const dossierOp = {
        table: 'dossies',
        operation: 'upsert' as const,
        data: {},
        id: 'session-1',
      };
      const orderMock = vi.fn().mockResolvedValue({
        data: [{ content: mockSession }],
        error: null,
      });
      const isMock = vi.fn().mockReturnValue({ order: orderMock });
      const eqMock = vi.fn().mockReturnValue({ is: isMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabaseMock.from.mockReturnValue({ select: selectMock });

      let releaseProcessing: (() => void) | undefined;
      const processing = new Promise<void>(resolve => {
        releaseProcessing = resolve;
      });
      vi.mocked(syncQueue.processWhere).mockImplementationOnce(async () => {
        await processing;
        return true;
      });
      vi.mocked(syncQueue.peek)
        .mockReturnValueOnce([dossierOp])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([]);

      const syncComplete = new Promise<Event>(resolve => {
        window.addEventListener('scout:sync-complete', resolve, { once: true });
      });

      const firstSync = storage.syncDossiers();
      await Promise.resolve();

      const skippedSync = await storage.syncDossiers({ pull: true });
      expect(skippedSync).toEqual({ pushed: 0, pulled: 0, errors: [] });

      releaseProcessing?.();
      await firstSync;
      await vi.advanceTimersByTimeAsync(750);
      await syncComplete;

      expect(supabaseMock.from).toHaveBeenCalledWith('dossies');
      expect(selectMock).toHaveBeenCalledWith('content');
      expect(eqMock).toHaveBeenCalledWith('operator_id', 'operator-123');
      expect(isMock).toHaveBeenCalledWith('deleted_at', null);
      expect(orderMock).toHaveBeenCalledWith('updated_at', { ascending: false });
      expect(set).toHaveBeenCalledWith('scout360_sessions_v2', [mockSession]);
      localStorage.removeItem('scout360:operator_id');
    });
  });

  describe('Radar', () => {
    it('getRadarAlerts should return from IDB', async () => {
      const mockAlerts = [{ id: 'alert-1', title: 'Test Alert' }];
      vi.mocked(get).mockResolvedValue(mockAlerts);

      const result = await storage.getRadarAlerts();

      expect(get).toHaveBeenCalledWith('scout360_radar_alerts');
      expect(result).toEqual(mockAlerts);
    });

    it('saveRadarAlerts should save to IDB and enqueue sync', async () => {
      localStorage.setItem('scout360:operator_id', 'operator-123');
      const mockAlerts = [{ id: 'alert-1', title: 'Test Alert' }];
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveRadarAlerts(mockAlerts);

      expect(set).toHaveBeenCalledWith('scout360_radar_alerts', mockAlerts);
      expect(syncQueue.enqueue).toHaveBeenCalled();
      localStorage.removeItem('scout360:operator_id');
    });

    it('saveRadarAlerts should save to IDB but NOT enqueue when no operator_id', async () => {
      const mockAlerts = [{ id: 'alert-1', title: 'Test Alert' }];
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveRadarAlerts(mockAlerts);

      expect(set).toHaveBeenCalledWith('scout360_radar_alerts', mockAlerts);
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });

    it('getRadarConfig should return from IDB', async () => {
      const mockConfig = { enabled: true, categories: [] };
      vi.mocked(get).mockResolvedValue(mockConfig);

      const result = await storage.getRadarConfig();

      expect(get).toHaveBeenCalledWith('scout360_radar_config');
      expect(result).toEqual(mockConfig);
    });

    it('saveRadarConfig should save to IDB and enqueue sync', async () => {
      localStorage.setItem('scout360:operator_id', 'operator-123');
      const mockConfig = { enabled: true, categories: [] };
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveRadarConfig(mockConfig);

      expect(set).toHaveBeenCalledWith('scout360_radar_config', mockConfig);
      expect(syncQueue.enqueue).toHaveBeenCalled();
      localStorage.removeItem('scout360:operator_id');
    });

    it('saveRadarConfig should save to IDB but NOT enqueue when no operator_id', async () => {
      const mockConfig = { enabled: true, categories: [] };
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveRadarConfig(mockConfig);

      expect(set).toHaveBeenCalledWith('scout360_radar_config', mockConfig);
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });

    it('getRadarLastScan should return from IDB', async () => {
      vi.mocked(get).mockResolvedValue(1234567890);

      const result = await storage.getRadarLastScan();

      expect(get).toHaveBeenCalledWith('scout360_radar_last_scan');
      expect(result).toBe(1234567890);
    });

    it('saveRadarLastScan should save to IDB only', async () => {
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveRadarLastScan(1234567890);

      expect(set).toHaveBeenCalledWith('scout360_radar_last_scan', 1234567890);
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });

    it('getRadarMetaInsight should return from IDB', async () => {
      vi.mocked(get).mockResolvedValue('Test insight');

      const result = await storage.getRadarMetaInsight();

      expect(get).toHaveBeenCalledWith('scout360_radar_meta_insight');
      expect(result).toBe('Test insight');
    });

    it('saveRadarMetaInsight should save to IDB only', async () => {
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveRadarMetaInsight('Test insight');

      expect(set).toHaveBeenCalledWith('scout360_radar_meta_insight', 'Test insight');
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('Extract Cache', () => {
    it('getExtractCache should return from IDB with prefix', async () => {
      const mockCache = { result: { data: 'test' }, timestamp: 1234567890 };
      vi.mocked(get).mockResolvedValue(mockCache);

      const result = await storage.getExtractCache('test-key');

      expect(get).toHaveBeenCalledWith('ext-cache-test-key');
      expect(result).toEqual(mockCache);
    });

    it('saveExtractCache should save to IDB and enqueue sync with expires_at', async () => {
      localStorage.setItem('scout360:operator_id', 'operator-123');
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveExtractCache('test-key', { data: 'test' });

      expect(set).toHaveBeenCalledWith('ext-cache-test-key', {
        result: { data: 'test' },
        timestamp: expect.any(Number),
      });
      expect(syncQueue.enqueue).toHaveBeenCalled();
      localStorage.removeItem('scout360:operator_id');
    });

    it('saveExtractCache should save to IDB but NOT enqueue when no operator_id', async () => {
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveExtractCache('test-key', { data: 'test' });

      expect(set).toHaveBeenCalledWith('ext-cache-test-key', {
        result: { data: 'test' },
        timestamp: expect.any(Number),
      });
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('User Context', () => {
    it('saveUserContext should upsert immediately when Supabase is available', async () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(true);
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
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });

    it('saveUserContext should keep retry queued when remote upsert fails', async () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(true);
      supabaseMock.upsert.mockResolvedValue({ error: { message: 'RLS denied' } });
      supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });

      await storage.saveUserContext({
        operatorId: 'operator-123',
        name: 'Test Operator',
        email: 'test@example.com',
      });

      expect(supabaseMock.upsert).toHaveBeenCalled();
      expect(syncQueue.enqueue).toHaveBeenCalledWith({
        table: 'user_context',
        operation: 'upsert',
        data: expect.objectContaining({
          operator_id: 'operator-123',
          display_name: 'Test Operator',
          email: 'test@example.com',
        }),
        id: 'operator-123',
      });
    });

    it('saveUserContext should remove pending retry after remote success', async () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(true);
      supabaseMock.upsert.mockResolvedValue({ error: null });
      supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });

      await storage.saveUserContext({
        operatorId: 'operator-123',
        name: 'Test Operator',
        email: 'test@example.com',
      });

      expect(syncQueue.remove).toHaveBeenCalledWith('user_context', 'operator-123');
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });

    it('saveUserContext should enqueue when Supabase is unavailable', async () => {
      await storage.saveUserContext({
        operatorId: 'operator-123',
        name: 'Test Operator',
        email: 'test@example.com',
      });

      expect(supabaseMock.from).not.toHaveBeenCalled();
      expect(syncQueue.enqueue).toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    });

    it('saveUserContext should NOT enqueue when no operatorId', async () => {
      await storage.saveUserContext({
        operatorId: '',
        name: 'Test Operator',
        email: 'test@example.com',
      });

      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });

    it('touchUserContext should update only last_seen for an existing user', async () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(true);
      const updateEq = vi.fn().mockResolvedValue({ error: null });
      supabaseMock.update.mockReturnValue({ eq: updateEq });
      supabaseMock.from.mockReturnValue({ update: supabaseMock.update });

      await storage.touchUserContext('operator-123');

      expect(supabaseMock.from).toHaveBeenCalledWith('user_context');
      expect(supabaseMock.select).not.toHaveBeenCalled();
      expect(supabaseMock.update).toHaveBeenCalledWith({ last_seen: expect.any(String) });
      expect(updateEq).toHaveBeenCalledWith('operator_id', 'operator-123');
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });

    it('touchUserContext should not create or enqueue when no matching row exists', async () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(true);
      const updateEq = vi.fn().mockResolvedValue({ error: null });
      supabaseMock.update.mockReturnValue({ eq: updateEq });
      supabaseMock.from.mockReturnValue({ update: supabaseMock.update });

      await storage.touchUserContext('operator-missing');

      expect(supabaseMock.select).not.toHaveBeenCalled();
      expect(supabaseMock.update).toHaveBeenCalledWith({ last_seen: expect.any(String) });
      expect(updateEq).toHaveBeenCalledWith('operator_id', 'operator-missing');
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
      expect(supabaseMock.upsert).not.toHaveBeenCalled();
    });

    it('touchUserContext should debounce repeated touches for same operator', async () => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(true);
      const updateEq = vi.fn().mockResolvedValue({ error: null });
      supabaseMock.update.mockReturnValue({ eq: updateEq });
      supabaseMock.from.mockReturnValue({ update: supabaseMock.update });

      await storage.touchUserContext('operator-debounce');
      await storage.touchUserContext('operator-debounce');

      expect(updateEq).toHaveBeenCalledTimes(1);
      expect(syncQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('Sync', () => {
    it('getSyncQueueSize should return syncQueue size', () => {
      vi.mocked(syncQueue.size).mockReturnValue(5);

      const size = storage.getSyncQueueSize();

      expect(size).toBe(5);
      expect(syncQueue.size).toHaveBeenCalled();
    });
  });

  describe('Works when Supabase is unavailable', () => {
    beforeEach(() => {
      vi.mocked(isSupabaseAvailable).mockReturnValue(false);
    });

    it('saveDossier should work without Supabase', async () => {
      localStorage.setItem('scout360:operator_id', 'operator-123');
      vi.mocked(set).mockResolvedValue(undefined);
      vi.mocked(get).mockResolvedValue([]); // Return empty array for getLocalSessions

      await storage.saveDossier(mockSession);

      expect(set).toHaveBeenCalled();
      expect(syncQueue.enqueue).toHaveBeenCalled();
      localStorage.removeItem('scout360:operator_id');
    });

    it('getDossiers should work without Supabase', async () => {
      vi.mocked(get).mockResolvedValue([mockSession]);

      const result = await storage.getDossiers();

      expect(result).toEqual([mockSession]);
      expect(isSupabaseAvailable).toHaveBeenCalled();
    });
  });
});
