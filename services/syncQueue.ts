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
      this.queue[existingIndex] = op;
    } else {
      this.queue.push(op);
    }
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
    try {
      const maxRetries = opts.maxRetries ?? MAX_RETRIES;
      const backoffMs = opts.backoffMs ?? BACKOFF_MS;
      const failed: SyncOperation[] = [];

      for (const op of this.queue) {
        const attempts = op.attempts ?? 0;

        if (attempts >= maxRetries) {
          failed.push(op);
          continue;
        }

        let success = false;
        for (let attempt = attempts; attempt <= maxRetries; attempt++) {
          try {
            op.attempts = attempt;
            await executor(op);
            success = true;
            break;
          } catch (error) {
            if (attempt < maxRetries) {
              const delay = backoffMs * attempt;
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }

        if (!success) {
          failed.push(op);
        }
      }

      this.queue = failed;
      await this.persist();
    } finally {
      this.isProcessing = false;
    }
  }
}

export const syncQueue = new SyncQueue();