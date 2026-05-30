import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runIdbToSupabaseMigration } from '../../../lib/migration/idbToSupabase';

const MOCK_SESSIONS = [
  { id: 'session-1', title: 'Test 1', empresaAlvo: 'Empresa A', messages: [], updatedAt: '2026-01-01' },
  { id: 'session-2', title: 'Test 2', empresaAlvo: 'Empresa B', messages: [], updatedAt: '2026-01-02' },
];

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
}));

describe('runIdbToSupabaseMigration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('deve pular migração se flag já existe', async () => {
    localStorage.setItem('scout360:migration_v2_complete', 'true');
    const upsertMock = vi.fn();

    const result = await runIdbToSupabaseMigration({
      upsertFn: upsertMock,
      getOperatorId: () => 'op-123',
    });

    expect(result).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('deve retornar 0 se não houver operatorId', async () => {
    const upsertMock = vi.fn();

    const result = await runIdbToSupabaseMigration({
      upsertFn: upsertMock,
      getOperatorId: () => null,
    });

    expect(result).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('deve retornar 0 se leitura IDB falhar', async () => {
    const { get } = await import('idb-keyval');
    vi.mocked(get).mockRejectedValue(new Error('IDB unavailable'));

    const upsertMock = vi.fn();

    const result = await runIdbToSupabaseMigration({
      upsertFn: upsertMock,
      getOperatorId: () => 'op-123',
    });

    expect(result).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('deve setar flag e retornar 0 se não houver sessões no IDB', async () => {
    const { get } = await import('idb-keyval');
    vi.mocked(get).mockResolvedValue([]);

    const upsertMock = vi.fn();

    const result = await runIdbToSupabaseMigration({
      upsertFn: upsertMock,
      getOperatorId: () => 'op-123',
    });

    expect(result).toBe(0);
    expect(localStorage.getItem('scout360:migration_v2_complete')).toBe('true');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('deve migrar sessões do IDB para Supabase e setar flag', async () => {
    const { get } = await import('idb-keyval');
    vi.mocked(get).mockResolvedValue(MOCK_SESSIONS);

    const upsertMock = vi.fn().mockResolvedValue(undefined);

    const result = await runIdbToSupabaseMigration({
      upsertFn: upsertMock,
      getOperatorId: () => 'op-123',
    });

    expect(result).toBe(2);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledWith(MOCK_SESSIONS[0]);
    expect(upsertMock).toHaveBeenCalledWith(MOCK_SESSIONS[1]);
    expect(localStorage.getItem('scout360:migration_v2_complete')).toBe('true');
  });

  it('não deve setar flag se migração falhar e deve lançar erro', async () => {
    const { get } = await import('idb-keyval');
    vi.mocked(get).mockResolvedValue(MOCK_SESSIONS);

    const upsertMock = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Supabase offline'));

    await expect(
      runIdbToSupabaseMigration({
        upsertFn: upsertMock,
        getOperatorId: () => 'op-123',
      }),
    ).rejects.toThrow('Migration failed: 1/2 errors');

    expect(localStorage.getItem('scout360:migration_v2_complete')).toBeNull();
  });
});
