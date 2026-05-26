import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncQueue, SyncOperation } from '../../services/syncQueue';
import { get, set } from 'idb-keyval';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
}));

describe('syncQueue', () => {
  beforeEach(() => {
    // Reset queue before each test
    syncQueue.clear();
    vi.clearAllMocks();
    vi.mocked(get).mockResolvedValue(undefined);
    vi.mocked(set).mockResolvedValue(undefined);
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

  it('deve processar apenas operacoes que combinam com o filtro', async () => {
    const dossierOp: SyncOperation = {
      table: 'dossies',
      operation: 'upsert',
      data: { id: 'dossier-1' },
      id: 'dossier-1',
    };
    const radarOp: SyncOperation = {
      table: 'radar_alerts',
      operation: 'upsert',
      data: { operator_id: 'operator-123' },
      id: 'alerts',
    };

    const mockExecutor = vi.fn().mockResolvedValue(undefined);

    syncQueue.enqueue(dossierOp);
    syncQueue.enqueue(radarOp);

    await syncQueue.processWhere(
      (op) => op.table === 'dossies',
      mockExecutor
    );

    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(mockExecutor).toHaveBeenCalledWith(expect.objectContaining(dossierOp));
    expect(syncQueue.size()).toBe(1);
    expect(syncQueue.peek()[0]).toMatchObject(radarOp);
  });

  it('descarta retry obsoleto quando uma versao nova chega durante o processamento', async () => {
    const staleOp: SyncOperation = {
      table: 'dossies',
      operation: 'upsert',
      data: { id: 'dossier-1', title: 'old' },
      id: 'dossier-1',
    };
    const freshOp: SyncOperation = {
      table: 'dossies',
      operation: 'upsert',
      data: { id: 'dossier-1', title: 'new' },
      id: 'dossier-1',
    };

    const failingExecutor = vi.fn(async () => {
      syncQueue.enqueue(freshOp);
      throw new Error('older operation failed');
    });

    syncQueue.enqueue(staleOp);

    await syncQueue.processWhere(
      (op) => op.table === 'dossies',
      failingExecutor,
      { maxRetries: 3, backoffMs: 0 }
    );

    expect(failingExecutor).toHaveBeenCalledTimes(1);
    expect(syncQueue.size()).toBe(1);
    expect(syncQueue.peek()[0]).toMatchObject({ ...freshOp, attempts: 0 });
  });

  it('deve persistir fila no IDB', async () => {
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

  it('nao deve sobrescrever fila em memoria com snapshot antigo do IDB', async () => {
    let resolvePersist: (() => void) | undefined;
    let persistStarted: (() => void) | undefined;
    const persistStartedPromise = new Promise<void>((resolve) => {
      persistStarted = resolve;
    });

    vi.mocked(set).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePersist = resolve;
          persistStarted?.();
        })
    );
    vi.mocked(get).mockResolvedValue([]);

    const op: SyncOperation = {
      table: 'user_context',
      operation: 'upsert',
      data: { operator_id: 'operator-123' },
      id: 'operator-123',
    };

    syncQueue.enqueue(op);
    const loadedPromise = syncQueue.load();
    await persistStartedPromise;
    resolvePersist?.();

    const loaded = await loadedPromise;

    expect(get).toHaveBeenCalledWith('scout360_sync_queue');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject(op);
    expect(syncQueue.peek()).toHaveLength(1);
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
