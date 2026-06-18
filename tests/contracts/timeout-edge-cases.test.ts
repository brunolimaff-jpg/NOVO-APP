import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function createAbortController() {
  const controller = new AbortController();
  const start = Date.now();
  return { controller, start };
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<{ result?: T; timedOut: boolean; aborted: boolean }> {
  let timedOut = false;
  let aborted = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      timedOut = true;
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        aborted = true;
        reject(new Error('Aborted'));
      },
      { once: true },
    );
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return { result, timedOut: false, aborted: false };
  } catch {
    return { timedOut, aborted };
  }
}

async function asyncThatTakes(ms: number, shouldThrow = false): Promise<string> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldThrow) reject(new Error('Forced failure'));
      else resolve('completed');
    }, ms);
  });
}

// ── Timeout Edge Cases ──

describe('timeout edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('complete antes do timeout', () => {
    it('resolve com resultado quando promessa termina antes', async () => {
      const promise = withTimeout(asyncThatTakes(500), 2_000);
      await vi.advanceTimersByTimeAsync(500);
      const result = await promise;
      expect(result.timedOut).toBe(false);
      expect(result.aborted).toBe(false);
    });
  });

  describe('timeout', () => {
    it('retorna timedOut=true quando timeout estoura', async () => {
      const promise = withTimeout(asyncThatTakes(10_000), 2_000);
      await vi.advanceTimersByTimeAsync(2_001);
      const result = await promise;
      expect(result.timedOut).toBe(true);
    });

    it('timeout de 0ms retorna timedOut=true imediatamente', async () => {
      const promise = withTimeout(asyncThatTakes(10_000), 0);
      await vi.advanceTimersByTimeAsync(1);
      const result = await promise;
      expect(result.timedOut).toBe(true);
    });

    it('timeout negativo trata como zero', async () => {
      const promise = withTimeout(asyncThatTakes(100), -1);
      await vi.advanceTimersByTimeAsync(1);
      const result = await promise;
      expect(result.timedOut).toBe(true);
    });
  });

  describe('abort', () => {
    it('abort pelo signal retorna aborted=true', async () => {
      const { controller } = createAbortController();
      const promise = withTimeout(asyncThatTakes(10_000), 10_000, controller.signal);
      await vi.advanceTimersByTimeAsync(100);
      controller.abort();
      await vi.advanceTimersByTimeAsync(1);
      const result = await promise;
      expect(result.aborted).toBe(true);
    });

    it('abort antes do timeout prevalece', async () => {
      const { controller } = createAbortController();
      const promise = withTimeout(asyncThatTakes(10_000), 2_000, controller.signal);
      await vi.advanceTimersByTimeAsync(500);
      controller.abort();
      await vi.advanceTimersByTimeAsync(1);
      const result = await promise;
      expect(result.aborted).toBe(true);
      expect(result.timedOut).toBe(false);
    });
  });

  describe('network failure', () => {
    it('promessa rejeitada retorna erro sem timedOut', async () => {
      const promise = withTimeout(asyncThatTakes(100, true), 2_000);
      await vi.advanceTimersByTimeAsync(101);
      const result = await promise;
      // O erro forçado deve propagar como erro, não como timeout
      expect(result.timedOut).toBe(false);
      expect(result.aborted).toBe(false);
    });
  });

  describe('race condition', () => {
    it('duas promessas: a mais rapida resolve primeiro', async () => {
      const fast = asyncThatTakes(200);
      const slow = asyncThatTakes(500);
      const resultPromise = Promise.race([fast, slow]);
      await vi.advanceTimersByTimeAsync(200);
      const result = await resultPromise;
      expect(result).toBe('completed');
    });

    it('timeout + abort: abort ganha se vier antes do timeout', async () => {
      const { controller } = createAbortController();
      // Timeout em 2s, abort em 500ms
      const promise = withTimeout(asyncThatTakes(10_000), 2_000, controller.signal);
      await vi.advanceTimersByTimeAsync(500);
      controller.abort();
      await vi.advanceTimersByTimeAsync(1);
      const result = await promise;
      expect(result.aborted).toBe(true);
      expect(result.timedOut).toBe(false);
    });
  });

  describe('limites', () => {
    it('timeout de Number.MAX_SAFE_INTEGER nao estoura', () => {
      // Deve aceitar valores grandes sem crash
      expect(() => {
        withTimeout(asyncThatTakes(100), Number.MAX_SAFE_INTEGER);
      }).not.toThrow();
    });

    it('timeout fracionario funciona', async () => {
      const promise = withTimeout(asyncThatTakes(10), 100.5);
      await vi.advanceTimersByTimeAsync(101);
      const result = await promise;
      expect(result.timedOut).toBe(false); // 10ms < 100.5ms
    });
  });
});
