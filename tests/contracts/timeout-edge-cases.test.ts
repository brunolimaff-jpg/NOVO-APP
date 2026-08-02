import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTimeoutError, runWithStepTimeout } from '../../services/llm/runtime';

async function delay(ms: number, shouldThrow = false): Promise<string> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldThrow) reject(new Error('Forced failure'));
      else resolve('completed');
    }, ms);
  });
}

function actionThatRespectsAbort(signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve('completed'), 10_000);
    const onAbort = () => {
      clearTimeout(id);
      reject(new Error('Aborted'));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

describe('runWithStepTimeout (produção — services/llm/runtime)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('complete antes do timeout', () => {
    it('resolve com resultado quando a action termina antes', async () => {
      const promise = runWithStepTimeout('step', () => delay(500), undefined, 2_000);
      await vi.advanceTimersByTimeAsync(500);
      await expect(promise).resolves.toBe('completed');
    });
  });

  describe('timeout', () => {
    it('rejeita com TimeoutError quando o timeout estoura', async () => {
      const promise = runWithStepTimeout('step', () => delay(10_000), undefined, 2_000);
      const assertion = expect(promise).rejects.toMatchObject({
        name: 'TimeoutError',
        message: 'step timeout after 2000ms',
      });
      await vi.advanceTimersByTimeAsync(2_001);
      await assertion;
    });

    it('timeout <= 0 não aplica timer (contrato real do runtime)', async () => {
      const promise = runWithStepTimeout('step', () => delay(10_000), undefined, 0);
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(promise).resolves.toBe('completed');
    });

    it('timeout negativo não aplica timer', async () => {
      const promise = runWithStepTimeout('step', () => delay(100), undefined, -1);
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).resolves.toBe('completed');
    });
  });

  describe('abort', () => {
    it('abort pelo signal externo propaga para a action', async () => {
      const controller = new AbortController();
      const promise = runWithStepTimeout(
        'step',
        (signal?: AbortSignal) => actionThatRespectsAbort(signal),
        controller.signal,
        10_000,
      );
      await vi.advanceTimersByTimeAsync(100);
      controller.abort();
      await expect(promise).rejects.toThrow('Aborted');
    });

    it('abort externo antes do timeout não confunde com TimeoutError', async () => {
      const controller = new AbortController();
      const promise = runWithStepTimeout(
        'step',
        (signal?: AbortSignal) => actionThatRespectsAbort(signal),
        controller.signal,
        2_000,
      );
      await vi.advanceTimersByTimeAsync(500);
      controller.abort();
      await expect(promise).rejects.toThrow('Aborted');
      await expect(promise).rejects.not.toMatchObject({ name: 'TimeoutError' });
    });
  });

  describe('network failure', () => {
    it('rejeição da action propaga o erro real (não TimeoutError)', async () => {
      const promise = runWithStepTimeout('step', () => delay(100, true), undefined, 2_000);
      const assertion = expect(promise).rejects.toThrow('Forced failure');
      await vi.advanceTimersByTimeAsync(101);
      await assertion;
    });
  });

  describe('limites', () => {
    it('buildTimeoutError usa name TimeoutError', () => {
      const error = buildTimeoutError('label', 1_500);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('label timeout after 1500ms');
    });

    it('timeout fracionário funciona', async () => {
      const promise = runWithStepTimeout('step', () => delay(10), undefined, 100.5);
      await vi.advanceTimersByTimeAsync(10);
      await expect(promise).resolves.toBe('completed');
    });
  });
});
