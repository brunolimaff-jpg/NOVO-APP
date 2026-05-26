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

  it('deve remover item especifico por tabela e id', () => {
    const userContextOp: SyncOperation = {
      table: 'user_context',
      operation: 'upsert',
      data: { operator_id: 'operator-123' },
      id: 'operator-123',
    };
    const dossierOp: SyncOperation = {
      table: 'dossies',
      operation: 'upsert',
      data: { id: 'dossier-1' },
      id: 'dossier-1',
    };

    syncQueue.enqueue(userContextOp);
    syncQueue.enqueue(dossierOp);

    syncQueue.remove('user_context', 'operator-123');

    expect(syncQueue.size()).toBe(1);
    expect(syncQueue.peek()[0]).toMatchObject(dossierOp);
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

    // Mock an IDB store: set saves, get retrieves
    const store = new Map<string, unknown>();
    vi.mocked(set).mockImplementation(async (key: string, value: unknown) => {
      store.set(key, value);
    });
    vi.mocked(get).mockImplementation(async (key: string) => store.get(key));

    const op: SyncOperation = {
      table: 'companies',
      operation: 'upsert',
      data: { name: 'Test Company' },
      id: '1',
    };

    syncQueue.enqueue(op);

    // Enqueue now persists automatically (microtask). Wait for microtask to drain.
    await new Promise((r) => setTimeout(r, 0));

    expect(set).toHaveBeenCalledWith('scout360_sync_queue', [
      { ...op, attempts: 0 },
    ]);

    const loaded = await syncQueue.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject(op);
    expect(loaded[0].attempts).toBe(0);
  });

  it('deve mover item para failed queue com attempts incrementado em caso de falha', async () => {
    const failingExecutor = vi.fn().mockRejectedValue(new Error('Simulated failure'));

    const op: SyncOperation = {
      table: 'companies',
      operation: 'upsert',
      data: { name: 'Test Company' },
      id: '1',
    };

    syncQueue.enqueue(op);

    // First pass: executor fails, item goes to failed queue
    await syncQueue.processAll(failingExecutor, {
      maxRetries: 3,
      backoffMs: 10,
    });

    expect(failingExecutor).toHaveBeenCalledTimes(1);
    // Item should remain in queue with attempts = 1
    expect(syncQueue.size()).toBe(1);

    const remaining = syncQueue.peek();
    expect(remaining[0].attempts).toBe(1);

    // Second pass: retry with success
    const successExecutor = vi.fn().mockResolvedValue(undefined);
    await syncQueue.processAll(successExecutor, {
      maxRetries: 3,
      backoffMs: 10,
    });

    expect(successExecutor).toHaveBeenCalledTimes(1);
    expect(syncQueue.size()).toBe(0);
  });

  it('deve remover item da queue apos exaurir tentativas', async () => {
    const failingExecutor = vi.fn().mockRejectedValue(new Error('Always fails'));

    const op: SyncOperation = {
      table: 'companies',
      operation: 'upsert',
      data: { name: 'Failing Company' },
      id: '2',
    };

    syncQueue.enqueue(op);

    // Run processAll 4 times (attempts: 0,1,2,3 -> 3 failures, 4th exhausts)
    await syncQueue.processAll(failingExecutor, { maxRetries: 3, backoffMs: 5 });
    await syncQueue.processAll(failingExecutor, { maxRetries: 3, backoffMs: 5 });
    await syncQueue.processAll(failingExecutor, { maxRetries: 3, backoffMs: 5 });
    await syncQueue.processAll(failingExecutor, { maxRetries: 3, backoffMs: 5 });

    // After maxRetries failures, item should be removed from queue
    expect(syncQueue.size()).toBe(0);
  });
});
