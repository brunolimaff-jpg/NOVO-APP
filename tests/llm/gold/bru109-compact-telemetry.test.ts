/**
 * BRU-109 DECISÃO 1 (A) — Telemetria estruturada do compact.
 *
 * Veredito do Planejador (2026-08-15): compact-error NÃO carrega texto livre —
 * somente errorClass + métricas da resposta crua (responseChars, finishReason,
 * hasObjectBoundary). compact-response mede a resposta CRUA que passou (mesma
 * série do FAIL), para vazio × prosa × truncado × JSON inválido serem
 * discrimináveis em run real.
 */
import { describe, expect, it } from 'vitest';
import {
  CompactPayloadError,
  classifyCompactErrorClass,
  compactErrorStageDetail,
  hasObjectBoundary,
  tryParseCompactPayload,
} from '../../../services/llm/gold/compact-error';

describe('BRU-109 (A) — taxonomia estruturada do compact-error', () => {
  it('hasObjectBoundary: só true quando há `{` antes de `}`', () => {
    expect(hasObjectBoundary('{"a":1}')).toBe(true);
    expect(hasObjectBoundary('{ "a": 1 }')).toBe(true);
    expect(hasObjectBoundary('prosa sem json')).toBe(false);
    expect(hasObjectBoundary('')).toBe(false);
    expect(hasObjectBoundary('{sem fechamento')).toBe(false);
    expect(hasObjectBoundary('}invertido{')).toBe(false);
  });

  it('tryParseCompactPayload: JSON válido retorna o pack com metadados', () => {
    const text = '{"module":"gold-compactor","accountIdentity":{},"facts":[],"relationships":[],"technologySignals":[],"people":[],"metrics":[],"conflicts":[],"openQuestions":[],"discardedClaims":[]}';
    const pack = tryParseCompactPayload(text, { finishReason: 'stop' });
    expect(pack.module).toBe('gold-compactor');
  });

  it('tryParseCompactPayload: ausência de boundary → JSON_NOT_FOUND com responseChars da resposta crua', () => {
    const text = 'Desculpe, não consegui extrair os dados solicitados.';
    try {
      tryParseCompactPayload(text, { finishReason: 'stop' });
      expect.unreachable('deveria lançar');
    } catch (error) {
      expect(error).toBeInstanceOf(CompactPayloadError);
      const e = error as CompactPayloadError;
      expect(e.errorClass).toBe('JSON_NOT_FOUND');
      expect(e.responseChars).toBe(text.length);
      expect(e.finishReason).toBe('stop');
      expect(e.hasObjectBoundary).toBe(false);
    }
  });

  it('tryParseCompactPayload: boundary presente com JSON inválido → JSON_SYNTAX (truncado)', () => {
    // `{` e `}` presentes, mas o conteúdo entre eles é sintaticamente inválido.
    const text = '{"module":"gold-compactor","facts":}';
    expect(hasObjectBoundary(text)).toBe(true);
    try {
      tryParseCompactPayload(text, { finishReason: 'length' });
      expect.unreachable('deveria lançar');
    } catch (error) {
      const e = error as CompactPayloadError;
      expect(e.errorClass).toBe('JSON_SYNTAX');
      expect(e.hasObjectBoundary).toBe(true);
      expect(e.finishReason).toBe('length');
    }
  });

  it('classifyCompactErrorClass: mapeia mensagens conhecidas para a classe', () => {
    expect(classifyCompactErrorClass(new Error('LLM proxy timeout after 270000ms'))).toBe('TIMEOUT');
    expect(classifyCompactErrorClass(new Error('LLM proxy failed (500): upstream'))).toBe('PROXY_TRANSPORT');
    expect(classifyCompactErrorClass(new Error('LLM proxy returned invalid JSON'))).toBe('PROXY_INVALID_BODY');
    expect(classifyCompactErrorClass(new Error('Compact: JSON não encontrado na resposta'))).toBe('JSON_NOT_FOUND');
    expect(classifyCompactErrorClass(new SyntaxError('Unexpected token } in JSON at position 5'))).toBe('JSON_SYNTAX');
    expect(classifyCompactErrorClass(new Error('outra coisa'))).toBe('UNKNOWN');
  });

  it('compactErrorStageDetail: CompactPayloadError expõe apenas metadados (sem mensagem livre)', () => {
    const detail = compactErrorStageDetail(
      new CompactPayloadError('mensagem interna', {
        errorClass: 'JSON_SYNTAX',
        responseChars: 42,
        finishReason: 'length',
        hasObjectBoundary: true,
      }),
    );
    expect(detail).toEqual({
      errorClass: 'JSON_SYNTAX',
      responseChars: 42,
      finishReason: 'length',
      hasObjectBoundary: true,
    });
    expect(JSON.stringify(detail)).not.toContain('mensagem interna');
  });

  it('compactErrorStageDetail: erro não estruturado → UNKNOWN sem métricas', () => {
    const detail = compactErrorStageDetail(new Error('erro arbitrário'));
    expect(detail).toEqual({ errorClass: 'UNKNOWN' });
    expect(detail).not.toHaveProperty('responseChars');
  });

  it('compactErrorStageDetail: nunca carrega o texto da resposta crua', () => {
    const leaked = '{"claim":"conteúdo comercial sensível"}';
    const detail = compactErrorStageDetail(
      new CompactPayloadError('x', { errorClass: 'JSON_SYNTAX', responseChars: leaked.length, finishReason: null, hasObjectBoundary: true }),
    );
    expect(JSON.stringify(detail)).not.toContain('conteúdo comercial sensível');
  });
});

describe('BRU-76 (BRU-117 lote 1) — 504/TimeoutError = TIMEOUT, AbortError distinto', () => {
  it('HTTP 504 do proxy → TIMEOUT (não PROXY_TRANSPORT)', () => {
    expect(classifyCompactErrorClass(new Error('LLM proxy failed (504): Gateway Timeout upstream'))).toBe('TIMEOUT');
  });

  it('TimeoutError externo → TIMEOUT', () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    expect(classifyCompactErrorClass(timeout)).toBe('TIMEOUT');
    // mensagem pura com TimeoutError
    expect(classifyCompactErrorClass(new Error('TimeoutError: deadline Gold atingido'))).toBe('TIMEOUT');
  });

  it('AbortError do usuário NÃO vira timeout nem PROXY_TRANSPORT', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    // isAbortLikeError detecta AbortError por nome → UNKNOWN (nunca TIMEOUT)
    expect(classifyCompactErrorClass(abort)).toBe('UNKNOWN');
  });

  it('HTTP 500 continua PROXY_TRANSPORT (504 é o único que é TIMEOUT)', () => {
    expect(classifyCompactErrorClass(new Error('LLM proxy failed (500): upstream'))).toBe('PROXY_TRANSPORT');
    expect(classifyCompactErrorClass(new Error('LLM proxy failed (429): rate limit'))).toBe('PROXY_TRANSPORT');
  });
});
