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
      source: 'GEMINI' as const,
    };
    const result = normalizeAppError(original);
    expect(result.code).toBe('NETWORK');
    expect(result.source).toBe('GEMINI');
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
    const result = normalizeAppError(original, 'GEMINI');
    expect(result.source).toBe('GEMINI');
  });

  it('nunca retenta erro de "input body is disturbed"', () => {
    const error = new Error('The input body is disturbed or locked');
    const result = normalizeAppError(error);
    expect(result.retryable).toBe(false);
    expect(result.transient).toBe(false);
  });
});

describe('getFriendlyErrorMessage', () => {
  it('retorna mensagem formal para modo diretoria + NETWORK', () => {
    const error = normalizeAppError(new TypeError('fetch failed'));
    const msg = getFriendlyErrorMessage(error, 'diretoria');
    expect(msg).toContain('internet');
    expect(msg).not.toContain('boiadeiro');
  });

  it('retorna mensagem regional para modo operacao + NETWORK', () => {
    const error = normalizeAppError(new TypeError('fetch failed'));
    const msg = getFriendlyErrorMessage(error, 'operacao');
    expect(msg).toContain('internet');
  });

  it('retorna mensagem de rate limit para modo diretoria', () => {
    const error = normalizeAppError({ message: 'quota exceeded', status: 429 });
    const msg = getFriendlyErrorMessage(error, 'diretoria');
    expect(msg.toLowerCase()).toMatch(/requisições|muitas/);
  });

  it('retorna mensagem de rate limit para modo operacao', () => {
    const error = normalizeAppError({ message: 'quota exceeded', status: 429 });
    const msg = getFriendlyErrorMessage(error, 'operacao');
    expect(msg.length).toBeGreaterThan(5);
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
    const msg = getFriendlyErrorMessage(appError, 'diretoria');
    expect(msg).toBe('Mensagem custom');
  });
});
