import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withAutoRetry } from '../../utils/retry';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('withAutoRetry', () => {
  it('retorna resultado imediatamente em caso de sucesso', async () => {
    const action = vi.fn().mockResolvedValue('ok');
    const result = await withAutoRetry('test', action, { baseDelayMs: 10, jitter: false });
    expect(result).toBe('ok');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('retenta para erros transientes (NETWORK) e retorna na segunda tentativa', async () => {
    const networkError = new TypeError('fetch failed');
    const action = vi.fn().mockRejectedValueOnce(networkError).mockResolvedValue('recovered');

    const promise = withAutoRetry('test', action, { maxRetries: 3, baseDelayMs: 10, jitter: false });
    // Avança timers para o backoff entre tentativas
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('recovered');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('lança erro normalizado após esgotar maxRetries', async () => {
    const networkError = new TypeError('network error');
    const action = vi.fn().mockRejectedValue(networkError);

    const promise = withAutoRetry('test', action, { maxRetries: 2, baseDelayMs: 10, jitter: false });
    promise.catch(() => {}); // prevent unhandled rejection warning
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ code: 'NETWORK' });
    expect(action).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('NÃO retenta para erros não transientes (AUTH)', async () => {
    const authError = { message: 'Unauthorized', status: 401 };
    const action = vi.fn().mockRejectedValue(authError);

    const promise = withAutoRetry('test', action, { maxRetries: 3, baseDelayMs: 10 });
    promise.catch(() => {}); // prevent unhandled rejection warning
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ code: 'AUTH' });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('mantém retry para BILLING transiente mesmo com retryable false', async () => {
    const billingError = new Error('billing service unavailable');
    const action = vi.fn().mockRejectedValueOnce(billingError).mockResolvedValue('ok after billing retry');

    const promise = withAutoRetry('test', action, { maxRetries: 1, baseDelayMs: 10, jitter: false });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('ok after billing retry');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('NÃO retenta para erros BLOCKED_CONTENT', async () => {
    const blockedError = new Error('safety policy blocked this content');
    const action = vi.fn().mockRejectedValue(blockedError);

    const promise = withAutoRetry('test', action, { maxRetries: 3, baseDelayMs: 10 });
    promise.catch(() => {}); // prevent unhandled rejection warning
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ code: 'BLOCKED_CONTENT' });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('NÃO retenta se AbortSignal foi abortado antes de iniciar', async () => {
    const controller = new AbortController();
    controller.abort();
    const action = vi.fn().mockResolvedValue('should not run');

    const promise = withAutoRetry('test', action, { abortSignal: controller.signal });
    promise.catch(() => {}); // prevent unhandled rejection warning
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(action).not.toHaveBeenCalled();
  });

  it('retenta para erro 429 (RATE_LIMIT) e recupera', async () => {
    const rateLimitError = { message: '429 quota exhausted', status: 429 };
    const action = vi.fn().mockRejectedValueOnce(rateLimitError).mockResolvedValue('ok after backoff');

    const promise = withAutoRetry('test', action, { maxRetries: 3, baseDelayMs: 10, jitter: false });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('ok after backoff');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('retenta para MODEL_OVERLOADED (503)', async () => {
    const overloadedError = { message: 'Service overloaded', status: 503 };
    const action = vi
      .fn()
      .mockRejectedValueOnce(overloadedError)
      .mockRejectedValueOnce(overloadedError)
      .mockResolvedValue('ok');

    const promise = withAutoRetry('test', action, { maxRetries: 3, baseDelayMs: 10, jitter: false });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('ok');
    expect(action).toHaveBeenCalledTimes(3);
  });

  it('repassa o AppError normalizado (não o erro original) após esgotar tentativas', async () => {
    const rawError = new TypeError('fetch failed');
    const action = vi.fn().mockRejectedValue(rawError);

    const promise = withAutoRetry('test', action, { maxRetries: 1, baseDelayMs: 10, jitter: false });
    promise.catch(() => {}); // prevent unhandled rejection warning
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toMatchObject({
      code: 'NETWORK',
      friendlyMessage: expect.any(String),
      retryable: true,
      transient: true,
    });
  });
});
