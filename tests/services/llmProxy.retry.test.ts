import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyChatSendMessage } from '../../services/llmProxy';
import { withAutoRetry } from '../../utils/retry';
import { scoutDiag } from '../../utils/diagnosticLog';

const fetchMock = vi.hoisted(() => vi.fn());

describe('retry do proxy LLM', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('não repete budget_exceeded 429 quando o envelope é terminal', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const upstreamSecret = 'upstream-secret-body';
    const body = JSON.stringify({
      text: '',
      error: {
        code: 'LLM_BUDGET_EXCEEDED',
        message: 'O serviço de análise está temporariamente indisponível. Tente novamente mais tarde.',
        retryable: false,
      },
      upstream: upstreamSecret,
    });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => body,
    });
    const diagErrorSpy = vi.spyOn(scoutDiag, 'error').mockImplementation(() => {});

    let caught: unknown;
    try {
      await withAutoRetry(
        'Llm:sendMessage',
        () =>
          proxyChatSendMessage({
            model: 'model',
            systemInstruction: 'system',
            history: [],
            message: 'prompt',
          }),
        { maxRetries: 5, baseDelayMs: 0, jitter: false },
      );
    } catch (error) {
      caught = error;
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(caught).toMatchObject({ code: 'LLM_BUDGET_EXCEEDED', retryable: false, transient: false, httpStatus: 429 });
    expect(String((caught as Error).message)).not.toContain(upstreamSecret);
    expect(String((caught as Error).message)).not.toContain(body);
    expect(diagErrorSpy.mock.calls.flat()).not.toContain(upstreamSecret);
    expect(diagErrorSpy.mock.calls.flat().some(call => call && typeof call === 'object' && 'bodyPreview' in call)).toBe(false);
  });

  it('repete 429 transitório e recupera', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '3' }),
        text: async () =>
          JSON.stringify({
            text: '',
            error: { code: 'rate_limit_error', type: 'rate_limit_error', retryable: true },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ text: 'ok' }),
      });

    const result = await withAutoRetry(
      'Llm:sendMessage',
      () =>
        proxyChatSendMessage({
          model: 'model',
          systemInstruction: 'system',
          history: [],
          message: 'prompt',
        }),
      { maxRetries: 1, baseDelayMs: 0, jitter: false },
    );

    expect(result.text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
