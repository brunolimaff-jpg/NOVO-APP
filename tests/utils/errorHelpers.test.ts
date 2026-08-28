import { describe, it, expect } from 'vitest';
import { normalizeAppError, getFriendlyErrorMessage } from '../../utils/errorHelpers';

describe('normalizeAppError', () => {
  it('retorna ABORTED para erros com nome AbortError', () => {
    const error = new DOMException('Request aborted', 'AbortError');
    const result = normalizeAppError(error);
    expect(result.code).toBe('ABORTED');
    expect(result.retryable).toBe(false);
    expect(result.transient).toBe(false);
  });

  it('retorna ABORTED para mensagem contendo "aborted"', () => {
    const error = new Error('The operation was aborted');
    const result = normalizeAppError(error);
    expect(result.code).toBe('ABORTED');
    expect(result.retryable).toBe(false);
  });

  it('retorna NETWORK para erro de fetch failed', () => {
    const error = new TypeError('fetch failed');
    const result = normalizeAppError(error);
    expect(result.code).toBe('NETWORK');
    expect(result.retryable).toBe(true);
    expect(result.transient).toBe(true);
  });

  it('retorna NETWORK para mensagem "Failed to fetch"', () => {
    const error = new Error('Failed to fetch');
    const result = normalizeAppError(error);
    expect(result.code).toBe('NETWORK');
  });

  it('retorna TIMEOUT para erro de timeout', () => {
    const error = new Error('Request timeout exceeded');
    const result = normalizeAppError(error);
    expect(result.code).toBe('TIMEOUT');
    expect(result.transient).toBe(true);
  });

  it('retorna RATE_LIMIT para status 429', () => {
    const error = { message: 'Too many requests', status: 429 };
    const result = normalizeAppError(error);
    expect(result.code).toBe('RATE_LIMIT');
    expect(result.transient).toBe(true);
    expect(result.httpStatus).toBe(429);
  });

  it('retorna RATE_LIMIT para mensagem contendo "quota"', () => {
    const error = new Error('Quota exceeded for requests');
    const result = normalizeAppError(error);
    expect(result.code).toBe('RATE_LIMIT');
  });

  it('retorna MODEL_OVERLOADED para status 503', () => {
    const error = { message: 'Service overloaded', status: 503 };
    const result = normalizeAppError(error);
    expect(result.code).toBe('MODEL_OVERLOADED');
    expect(result.transient).toBe(true);
  });

  it('retorna SERVER para status 500', () => {
    const error = { message: 'Internal server error', status: 500 };
    const result = normalizeAppError(error);
    expect(result.code).toBe('SERVER');
    expect(result.transient).toBe(true);
  });

  it('retorna BLOCKED_CONTENT para mensagem contendo "safety"', () => {
    const error = new Error('Safety policy blocked the content');
    const result = normalizeAppError(error);
    expect(result.code).toBe('BLOCKED_CONTENT');
    expect(result.retryable).toBe(false);
  });

  it('retorna AUTH para status 401', () => {
    const error = { message: 'Unauthorized', status: 401 };
    const result = normalizeAppError(error);
    expect(result.code).toBe('AUTH');
    expect(result.retryable).toBe(false);
  });

  it('retorna AUTH para mensagem contendo "api key"', () => {
    const error = new Error('Invalid API key provided');
    const result = normalizeAppError(error);
    expect(result.code).toBe('AUTH');
  });

  it('retorna UNKNOWN para erros não classificados', () => {
    const error = new Error('Something totally unknown happened');
    const result = normalizeAppError(error);
    expect(result.code).toBe('UNKNOWN');
    expect(result.retryable).toBe(true);
  });

  it('preserva AppError já normalizado mantendo a source', () => {
    const original = {
      code: 'NETWORK' as const,
      message: 'network error',
      friendlyMessage: 'Sem internet',
      retryable: true,
      transient: true,
      source: 'LLM' as const,
    };
    const result = normalizeAppError(original);
    expect(result.code).toBe('NETWORK');
    expect(result.source).toBe('LLM');
  });

  it('aplica source UNKNOWN se AppError tiver source UNKNOWN', () => {
    const original = {
      code: 'TIMEOUT' as const,
      message: 'timed out',
      friendlyMessage: 'Timeout',
      retryable: true,
      transient: true,
      source: 'UNKNOWN' as const,
    };
    const result = normalizeAppError(original, 'LLM');
    expect(result.source).toBe('LLM');
  });

  it('nunca retenta erro de "input body is disturbed"', () => {
    const error = new Error('The input body is disturbed or locked');
    const result = normalizeAppError(error);
    expect(result.retryable).toBe(false);
    expect(result.transient).toBe(false);
  });

  it('normaliza LLM_BUDGET_EXCEEDED como terminal e não preserva mensagem ou detalhes upstream', () => {
    const upstreamSecret = 'upstream-secret-body';
    const error = Object.assign(new Error(`LLM proxy failed (429): ${upstreamSecret}`), {
      code: 'LLM_BUDGET_EXCEEDED',
      status: 429,
      retryable: false,
    });

    const result = normalizeAppError(error, 'LLM');

    expect(result.code).toBe('LLM_BUDGET_EXCEEDED');
    expect(result.httpStatus).toBe(429);
    expect(result.retryable).toBe(false);
    expect(result.transient).toBe(false);
    expect(result.message).toBe('O serviço de análise está temporariamente indisponível. Tente novamente mais tarde.');
    expect(result.details).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(upstreamSecret);
  });
});

describe('getFriendlyErrorMessage', () => {
  it('retorna mensagem amigável para NETWORK no modo único', () => {
    const error = normalizeAppError(new TypeError('fetch failed'));
    const msg = getFriendlyErrorMessage(error, 'investigacao');
    expect(msg).toContain('internet');
  });

  it('retorna mensagem de rate limit no modo único', () => {
    const error = normalizeAppError({ message: 'quota exceeded', status: 429 });
    const msg = getFriendlyErrorMessage(error, 'investigacao');
    expect(msg.toLowerCase()).toMatch(/requisições|muitas/);
  });

  it('retorna mensagem sanitizada para LLM_BUDGET_EXCEEDED', () => {
    const error = normalizeAppError(
      Object.assign(new Error('upstream budget body'), {
        code: 'LLM_BUDGET_EXCEEDED',
        status: 429,
        retryable: false,
      }),
      'LLM',
    );
    expect(getFriendlyErrorMessage(error, 'investigacao')).toBe(
      'O serviço de análise está temporariamente indisponível. Tente novamente mais tarde.',
    );
  });

  it('retorna fallback friendlyMessage para código desconhecido', () => {
    const appError = {
      code: 'UNKNOWN' as const,
      message: 'weird error',
      friendlyMessage: 'Mensagem custom',
      retryable: true,
      transient: false,
      source: 'UNKNOWN' as const,
    };
    const msg = getFriendlyErrorMessage(appError, 'investigacao');
    expect(msg).toBe('Mensagem custom');
  });
});
