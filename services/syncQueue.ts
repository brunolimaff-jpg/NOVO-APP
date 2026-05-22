import { get, set } from 'idb-keyval';

const MAX_RETRIES = 3;
const BACKOFF_MS = 1000;
const QUEUE_KEY = 'scout360_sync_queue';

export interface SyncOperation {
  table: string;
  operation: 'upsert' | 'delete';
  data: Record<string, unknown>;
  id?: string;
  attempts?: number;
}

class SyncQueue {
  private queue: SyncOperation[] = [];
  private isProcessing = false;

  enqueue(op: SyncOperation): void {
    // Deduplicate by table+id
    const existingIndex = this.queue.findIndex(
      (item) => item.table === op.table && item.id === op.id
    );

    if (existingIndex !== -1) {
      this.queue[existingIndex] = { ...op, attempts: 0 };
    } else {
      this.queue.push({ ...op, attempts: 0 });
    }

    // Persist immediately so items survive browser close
    this.persist().catch(() => {});
  }

  size(): number {
    return this.queue.length;
  }

  peek(): SyncOperation[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }

  async persist(): Promise<void> {
    await set(QUEUE_KEY, this.queue);
  }

  async load(): Promise<SyncOperation[]> {
    const loaded = await get<SyncOperation[]>(QUEUE_KEY);
    if (loaded) {
      this.queue = loaded;
    }
    return this.queue;
  }

  async processAll(
    executor: (op: SyncOperation) => Promise<void>,
    opts: { maxRetries?: number; backoffMs?: number } = {}
  ): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    const { maxRetries = MAX_RETRIES, backoffMs = BACKOFF_MS } = opts;
    const failed: SyncOperation[] = [];

    try {
      while (this.queue.length > 0) {
        const op = this.queue.shift()!;
        const attempt = op.attempts ?? 0;

        try {
          await executor(op);
        } catch (err) {
          if (attempt < maxRetries) {
            failed.push({ ...op, attempts: attempt + 1 });
            await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
          } else {
            console.error(
              `[SyncQueue] Falha definitiva para ${op.table}:${op.id}`,
              err
            );
          }
        }
      }
    } finally {
      this.queue = failed;
      await this.persist();
      this.isProcessing = false;
    }
  }
}

export const syncQueue = new SyncQueue();