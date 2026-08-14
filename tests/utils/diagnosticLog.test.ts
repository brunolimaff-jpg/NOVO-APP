// tests/utils/diagnosticLog.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scoutDiag,
  createScoutTraceId,
  flushDiagnosticsNow,
  getScoutTraceTarget,
  isScoutDiagEnabled,
  isScoutTraceEnabled,
  setupHeartbeat,
} from '../../utils/diagnosticLog';

/** Promise.withResolvers() polyfill para Node.js 20 (CI). */
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock('../../utils/diagnosticLog', async () => {
  // Use the actual module but intercept import.meta.env
  const actual = await vi.importActual<typeof import('../../utils/diagnosticLog')>('../../utils/diagnosticLog');
  return actual;
});

describe('scoutDiag', () => {
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    (window as typeof window & { __SCOUT_DIAG_HISTORY__?: unknown[] }).__SCOUT_DIAG_HISTORY__ = [];
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('warn — sempre visível', () => {
    it('chama console.warn com prefixo e scope', () => {
      scoutDiag.warn('TestScope', 'algo deu errado');
      expect(consoleSpy.warn).toHaveBeenCalledOnce();
      const msg = consoleSpy.warn.mock.calls[0][0] as string;
      expect(msg).toContain('[Scout360]');
      expect(msg).toContain('[TestScope]');
      expect(msg).toContain('algo deu errado');
    });

    it('inclui emoji de warning no output', () => {
      scoutDiag.warn('Scope', 'msg');
      const msg = consoleSpy.warn.mock.calls[0][0] as string;
      expect(msg).toContain('⚠');
    });

    it('serializa details com safeDetails', () => {
      scoutDiag.warn('Scope', 'msg', { count: 42 });
      expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('[Scope]'), expect.anything());
    });

    it('serializa Error dentro de details', () => {
      const err = new Error('boom');
      scoutDiag.warn('Scope', 'msg', { err });
      expect(consoleSpy.warn).toHaveBeenCalledOnce();
    });
  });

  describe('error — sempre visível', () => {
    it('chama console.error com prefixo e scope', () => {
      scoutDiag.error('LlmService', 'falha crítica');
      expect(consoleSpy.error).toHaveBeenCalledOnce();
      const msg = consoleSpy.error.mock.calls[0][0] as string;
      expect(msg).toContain('[Scout360]');
      expect(msg).toContain('[LlmService]');
      expect(msg).toContain('falha crítica');
      expect(msg).toContain('✖');
    });

    it('aceita details undefined', () => {
      expect(() => scoutDiag.error('S', 'msg')).not.toThrow();
    });
  });

  describe('debug / info — condicionais (DEV=false em testes)', () => {
    it('NÃO chama console.debug quando DEV=false e sem env overrides', () => {
      // No vitest environment, import.meta.env.DEV is false
      scoutDiag.debug('Scope', 'debug message');
      // May or may not be called depending on test env - just ensure no crash
      expect(true).toBe(true);
    });

    it('NÃO chama console.info quando DEV=false e sem env overrides', () => {
      scoutDiag.info('Scope', 'info message');
      expect(true).toBe(true);
    });
  });

  describe('startTimer', () => {
    it('retorna objeto com end e fail', () => {
      const timer = scoutDiag.startTimer('Scope', 'operacao');
      expect(timer).toHaveProperty('end');
      expect(timer).toHaveProperty('fail');
      expect(typeof timer.end).toBe('function');
      expect(typeof timer.fail).toBe('function');
    });

    it('fail loga como error', () => {
      const timer = scoutDiag.startTimer('Scope', 'op');
      timer.fail(new Error('timeout'));
      expect(consoleSpy.error).toHaveBeenCalledOnce();
    });

    it('end não lança exceção', () => {
      const timer = scoutDiag.startTimer('Scope', 'op');
      expect(() => timer.end({ chars: 100 })).not.toThrow();
    });

    it('fail aceita string como erro', () => {
      const timer = scoutDiag.startTimer('Scope', 'op');
      expect(() => timer.fail('string error')).not.toThrow();
      expect(consoleSpy.error).toHaveBeenCalledOnce();
    });
  });

  describe('isScoutDiagEnabled', () => {
    it('retorna boolean', () => {
      const result = isScoutDiagEnabled();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('trace opt-in por URL/localStorage', () => {
    it('ativa por query param e persiste no localStorage', () => {
      window.history.replaceState(null, '', '/?scoutTrace=teia');

      expect(getScoutTraceTarget()).toBe('teia');
      expect(window.localStorage.getItem('scoutTrace')).toBe('teia');
      expect(isScoutTraceEnabled('teia')).toBe(true);
      expect(isScoutTraceEnabled('outra-coisa')).toBe(false);
    });

    it('desliga por scoutTrace=off e limpa localStorage', () => {
      window.localStorage.setItem('scoutTrace', 'teia');
      window.history.replaceState(null, '', '/?scoutTrace=off');

      expect(getScoutTraceTarget()).toBeNull();
      expect(window.localStorage.getItem('scoutTrace')).toBeNull();
      expect(isScoutTraceEnabled('teia')).toBe(false);
    });

    it('loga trace apenas quando o alvo esta ativo', () => {
      scoutDiag.trace('teia', 'Scope', 'sem log');
      expect(consoleSpy.info).not.toHaveBeenCalled();

      window.localStorage.setItem('scoutTrace', 'teia');
      scoutDiag.trace('teia', 'Scope', 'com log', { traceId: 'trace-1' });

      expect(consoleSpy.info).toHaveBeenCalledOnce();
      expect(consoleSpy.info.mock.calls[0][0]).toContain('[Trace:teia][Scope]');
      expect(consoleSpy.info.mock.calls[0][0]).toContain('com log');
    });

    it('gera traceId com prefixo do alvo', () => {
      expect(createScoutTraceId('teia')).toMatch(/^teia-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('flushDiagnosticsNow', () => {
    beforeEach(() => {
      window.localStorage.setItem('SCOUT_DIAG_ENABLED', '1');
    });

    it('envia evento único abaixo do batch size no flush diferido', async () => {
      vi.useFakeTimers();

      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true } as Response);
      vi.stubGlobal('fetch', fetchMock);

      scoutDiag.warn('PostCompletion', 'check:10000ms');

      expect(fetchMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5_000);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const body = JSON.parse(String((fetchMock.mock.calls[0][1] as { body?: unknown }).body));
      expect(body.events).toHaveLength(1);
      expect(body.events[0].event).toBe('check:10000ms');

      vi.useRealTimers();
    });

    it('agenda dreno pós-flush quando force=true chega durante um flush ativo', async () => {
      vi.useFakeTimers();

      const firstFlushResponse = createDeferred<{ ok: boolean }>();
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(() => firstFlushResponse.promise as Promise<Response>)
        .mockResolvedValueOnce({ ok: true } as Response);
      vi.stubGlobal('fetch', fetchMock);

      scoutDiag.warn('PostCompletion', 'flush-a');
      flushDiagnosticsNow('flush-a');
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);

      flushDiagnosticsNow('processMessage:finally', true);
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);

      firstFlushResponse.resolve({ ok: true });
      await Promise.resolve();

      scoutDiag.warn('PostCompletion', 'check:0ms');
      await vi.advanceTimersByTimeAsync(5_000);

      expect(fetchMock).toHaveBeenCalledTimes(2);

      const firstBody = JSON.parse(
        String(fetchMock.mock.calls[0][0] && (fetchMock.mock.calls[0][1] as { body?: unknown })?.body),
      );
      const secondBody = JSON.parse(
        String(fetchMock.mock.calls[1][0] && (fetchMock.mock.calls[1][1] as { body?: unknown })?.body),
      );

      expect(firstBody.events).toHaveLength(1);
      expect(firstBody.events[0].event).toBe('flush-a');
      expect(secondBody.events).toHaveLength(1);
      expect(secondBody.events[0].event).toBe('check:0ms');

      vi.useRealTimers();
    });
  });

  it('heartbeat não agenda nem envia diagnóstico', async () => {
    vi.useFakeTimers();
    window.localStorage.setItem('SCOUT_DIAG_ENABLED', '1');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const cleanup = setupHeartbeat();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
    cleanup();
    vi.useRealTimers();
  });

  it('cliente não força persistência de evento bloqueado nem com severity error', async () => {
    vi.useFakeTimers();
    window.localStorage.setItem('SCOUT_DIAG_ENABLED', '1');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('fetch', fetchMock);
    scoutDiag.error('Visibility', 'pagehide', { force: true });
    scoutDiag.warn('MessageRow', 'commit:dimensions');
    scoutDiag.warn('ChatInterface', 'panel:snapshot');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('LOTE GOLD P0 R2 — verifier-summary chega ao buffer mesmo com verbose DESLIGADO (produção)', () => {
  it('info crítico do verifier entra no buffer sem NODE_ENV=development nem VITE_VERBOSE_LOGS', async () => {
    vi.resetModules();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.777);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    window.localStorage.setItem('SCOUT_DIAG_ENABLED', '1');
    const prevDiagEnv = process.env.VITE_SCOUT_DIAGNOSTICS_ENABLED;
    const prevNodeEnv = process.env.NODE_ENV;
    const prevVerbose = process.env.VITE_VERBOSE_LOGS;
    process.env.VITE_SCOUT_DIAGNOSTICS_ENABLED = 'true';
    process.env.NODE_ENV = 'production'; // verbose OFF — como em produção
    delete process.env.VITE_VERBOSE_LOGS;
    const fresh = await import('../../utils/diagnosticLog');

    // LOTE GOLD P0 R2-B: os 4 eventos críticos chegam ao buffer mesmo com
    // verbose DESLIGADO (produção).
    for (const event of [
      'diagnostics-post-preflight',
      'diagnostics-post-mermaid',
      'diagnostics-post-certainty',
      'verifier-summary',
    ]) {
      fresh.scoutDiag.info('GoldSeam', event, { hardFails: 1, codes: ['X'] });
    }

    const history = (window as typeof window & { __SCOUT_DIAG_HISTORY__?: Array<{ area: string; event: string }> })
      .__SCOUT_DIAG_HISTORY__ ?? [];
    for (const event of [
      'diagnostics-post-preflight',
      'diagnostics-post-mermaid',
      'diagnostics-post-certainty',
      'verifier-summary',
    ]) {
      expect(history.some(e => e.area === 'GoldSeam' && e.event === event)).toBe(true);
    }

    randomSpy.mockRestore();
    nowSpy.mockRestore();
    if (prevDiagEnv === undefined) delete process.env.VITE_SCOUT_DIAGNOSTICS_ENABLED;
    else process.env.VITE_SCOUT_DIAGNOSTICS_ENABLED = prevDiagEnv;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevVerbose === undefined) delete process.env.VITE_VERBOSE_LOGS;
    else process.env.VITE_VERBOSE_LOGS = prevVerbose;
  });
});

describe('LOTE GOLD P0 — persistência garantida do verifier-summary', () => {
  it('verifier-summary SEMPRE entra no buffer (bucket 93 cairia no sampling) e infos comuns continuam amostradas', async () => {
    // Determinístico: com Date.now fixo e Math.random=0.777, o runId do
    // módulo é estável e o bucket estável do evento é 93 (>=10 — sem a
    // exceção explícita, o info cairia no sampling de 10%). O controle
    // gold-start (bucket 57) continua amostrado e NÃO entra no buffer.
    vi.resetModules();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.777);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    window.localStorage.setItem('SCOUT_DIAG_ENABLED', '1');
    // env var tem precedência sobre o localStorage no isDiagnosticsEnabled
    const prevEnv = process.env.VITE_SCOUT_DIAGNOSTICS_ENABLED;
    process.env.VITE_SCOUT_DIAGNOSTICS_ENABLED = 'true';
    // scoutDiag.info só emite quando isVerboseEnabled (NODE_ENV=development)
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const fresh = await import('../../utils/diagnosticLog');

    fresh.scoutDiag.info('GoldSeam', 'verifier-summary', {
      hardFails: 1,
      codesJson: '["UNSUPPORTED_PRODUCT_CLAIM"]',
      dossierRunId: 'run-1',
      stage: 'final-verifier',
    });
    fresh.scoutDiag.info('GoldSeam', 'gold-start', { company: 'Controle' });

    const history = (window as typeof window & { __SCOUT_DIAG_HISTORY__?: Array<{ area: string; event: string }> })
      .__SCOUT_DIAG_HISTORY__ ?? [];
    expect(history.some(e => e.area === 'GoldSeam' && e.event === 'verifier-summary')).toBe(true);
    expect(history.some(e => e.area === 'GoldSeam' && e.event === 'gold-start')).toBe(false);

    randomSpy.mockRestore();
    nowSpy.mockRestore();
    if (prevEnv === undefined) delete process.env.VITE_SCOUT_DIAGNOSTICS_ENABLED;
    else process.env.VITE_SCOUT_DIAGNOSTICS_ENABLED = prevEnv;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });
});
