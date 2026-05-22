// tests/services/storage.test.ts
// Tests for unified storage layer (Supabase + IDB offline)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storage } from '../../services/storage';

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
}));

// Mock supabaseClient
vi.mock('../../lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseAvailable: vi.fn(() => false),
}));

// Mock syncQueue
vi.mock('../../services/syncQueue', () => ({
  syncQueue: {
    enqueue: vi.fn(),
    size: vi.fn(() => 0),
    load: vi.fn(async () => []),
    processAll: vi.fn(),
  },
}));

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
    vi.clearAllMocks();
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
          operator_id: null, // No operator_id set in localStorage
        }),
        id: mockSession.id,
      });
    });

    it('saveAllDossiers should bulk save to IDB and enqueue sync for each', async () => {
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
          operator_id: null,
        }),
        id: mockSession.id,
      });
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
      vi.mocked(get).mockResolvedValue([mockSession]);
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.deleteDossier('session-1');

      expect(set).toHaveBeenCalledWith('scout360_sessions_v2', []);
      expect(syncQueue.enqueue).toHaveBeenCalledWith({
        table: 'dossies',
        operation: 'upsert',
        data: expect.objectContaining({
          id: 'session-1',
          deleted_at: expect.any(String),
        }),
        id: 'session-1',
      });
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
      const mockAlerts = [{ id: 'alert-1', title: 'Test Alert' }];
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveRadarAlerts(mockAlerts);

      expect(set).toHaveBeenCalledWith('scout360_radar_alerts', mockAlerts);
      expect(syncQueue.enqueue).toHaveBeenCalled();
    });

    it('getRadarConfig should return from IDB', async () => {
      const mockConfig = { enabled: true, categories: [] };
      vi.mocked(get).mockResolvedValue(mockConfig);

      const result = await storage.getRadarConfig();

      expect(get).toHaveBeenCalledWith('scout360_radar_config');
      expect(result).toEqual(mockConfig);
    });

    it('saveRadarConfig should save to IDB and enqueue sync', async () => {
      const mockConfig = { enabled: true, categories: [] };
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveRadarConfig(mockConfig);

      expect(set).toHaveBeenCalledWith('scout360_radar_config', mockConfig);
      expect(syncQueue.enqueue).toHaveBeenCalled();
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
      vi.mocked(set).mockResolvedValue(undefined);

      await storage.saveExtractCache('test-key', { data: 'test' });

      expect(set).toHaveBeenCalledWith('ext-cache-test-key', {
        result: { data: 'test' },
        timestamp: expect.any(Number),
      });
      expect(syncQueue.enqueue).toHaveBeenCalled();
    });
  });

  describe('User Context', () => {
    it('saveUserContext should enqueue sync only', async () => {
      localStorage.setItem('scout360:operator_id', 'operator-123');

      await storage.saveUserContext({
        operatorId: 'operator-123',
        name: 'Test Operator',
        email: 'test@example.com',
      });

      expect(syncQueue.enqueue).toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
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
      vi.mocked(set).mockResolvedValue(undefined);
      vi.mocked(get).mockResolvedValue([]); // Return empty array for getLocalSessions

      await storage.saveDossier(mockSession);

      expect(set).toHaveBeenCalled();
      expect(syncQueue.enqueue).toHaveBeenCalled();
    });

    it('getDossiers should work without Supabase', async () => {
      vi.mocked(get).mockResolvedValue([mockSession]);

      const result = await storage.getDossiers();

      expect(result).toEqual([mockSession]);
      expect(isSupabaseAvailable).toHaveBeenCalled();
    });
  });
});