import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncQueue, SyncOperation } from '../../services/syncQueue';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
}));

describe('syncQueue', () => {
  beforeEach(() => {
    // Reset queue before each test
    syncQueue.clear();
    vi.clearAllMocks();
  });

  it('deve adicionar operacao a fila', () => {
    const op: SyncOperation = {
      table: 'companies',
      operation: 'upsert',
      data: { name: 'Test Company' },
      id: '1',
    };

    syncQueue.enqueue(op);
    expect(syncQueue.size()).toBe(1);
  });

  it('deve processar fila e esvaziar', async () => {
    const op1: SyncOperation = {
      table: 'companies',
      operation: 'upsert',
      data: { name: 'Company 1' },
      id: '1',
    };
    const op2: SyncOperation = {
      table: 'companies',
      operation: 'upsert',
      data: { name: 'Company 2' },
      id: '2',
    };

    const mockExecutor = vi.fn().mockResolvedValue(undefined);

    syncQueue.enqueue(op1);
    syncQueue.enqueue(op2);

    await syncQueue.processAll(mockExecutor);

    expect(mockExecutor).toHaveBeenCalledTimes(2);
    expect(syncQueue.size()).toBe(0);
  });

  it('deve persistir fila no IDB', async () => {
    const { get, set } = await import('idb-keyval');

    vi.mocked(set).mockResolvedValue(undefined);
    vi.mocked(get).mockResolvedValue([
      {
        table: 'companies',
        operation: 'upsert',
        data: { name: 'Test Company' },
        id: '1',
      },
    ]);

    const op: SyncOperation = {
      table: 'companies',
      operation: 'upsert',
      data: { name: 'Test Company' },
      id: '1',
    };

    syncQueue.enqueue(op);
    await syncQueue.persist();

    expect(set).toHaveBeenCalledWith('scout360_sync_queue', [op]);

    const loaded = await syncQueue.load();
    expect(loaded).toHaveLength(1);
  });

  it('deve retry com backoff em caso de falha', async () => {
    let attemptCount = 0;
    const mockExecutor = vi.fn().mockImplementation(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('Simulated failure');
      }
    });

    const op: SyncOperation = {
      table: 'companies',
      operation: 'upsert',
      data: { name: 'Test Company' },
      id: '1',
    };

    syncQueue.enqueue(op);

    await syncQueue.processAll(mockExecutor, {
      maxRetries: 3,
      backoffMs: 10, // Small backoff for tests
    });

    expect(mockExecutor).toHaveBeenCalledTimes(3);
  });
});