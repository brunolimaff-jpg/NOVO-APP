import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  insertDiagnosticsBatch,
  resetDiagnosticsRetentionThrottleForTests,
  shouldPersistDiagnostic,
} from '../../utils/serverDiagnostics';

describe('serverDiagnostics payload sanitizer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetDiagnosticsRetentionThrottleForTests();
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co/');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('preserva métricas seguras de tela branca e remove texto/conteúdo sensível', async () => {
    const result = await insertDiagnosticsBatch(
      {
        appVersion: 'test',
        environment: 'test',
        events: [],
        operatorId: 'op-1',
        route: '/',
        runId: 'run-1',
        sessionId: 'sess-1',
        userAgent: 'vitest',
      },
      [
        {
          area: 'PostCompletion',
          at: new Date('2026-06-03T14:00:00.000Z').toISOString(),
          elapsedMs: 100,
          event: 'check:100ms',
          payload: {
            bodyLen: 33160,
            bodyText: 'conteudo completo do dossie nao deve sair',
            botTextMaxLen: 32976,
            centerElementTestId: 'chat-main-panel',
            content: 'conteudo sensivel',
            mainPanelChars: 32980,
            responseText: 'resposta sensivel',
            textPreview: 'preview sensivel',
            visibleBotWithCharsCount: 1,
          },
          runId: 'run-1',
          sessionId: 'sess-1',
          severity: 'warn',
          t: 123,
        },
      ],
    );

    expect(result).toEqual({ inserted: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, requestInit] = fetchMock.mock.calls[0];
    const rows = JSON.parse(String(requestInit.body)) as Array<{ payload: Record<string, unknown> }>;

    expect(rows[0].payload).toMatchObject({
      bodyLen: 33160,
      botTextMaxLen: 32976,
      centerElementTestId: 'chat-main-panel',
      mainPanelChars: 32980,
      visibleBotWithCharsCount: 1,
    });
    expect(rows[0].payload).not.toHaveProperty('bodyText');
    expect(rows[0].payload).not.toHaveProperty('content');
    expect(rows[0].payload).not.toHaveProperty('responseText');
    expect(rows[0].payload).not.toHaveProperty('textPreview');
  });

  it('LOTE GOLD P0 R2: verifier-summary do GoldSeam persiste SEMPRE no servidor (bucket 61 cairia no sampling)', () => {
    // runId fixo: bucket de GoldSeam:verifier-summary = 61 (>=10 — sem a
    // exceção, o evento seria descartado pelo sampling de info de 10%)
    const event = { at: '', t: 0, runId: 'fixo-teste-r2', severity: 'info', area: 'GoldSeam', event: 'verifier-summary' };
    expect(shouldPersistDiagnostic(event)).toBe(true);
    // controle: infos comuns da MESMA área continuam amostradas (bucket 89)
    expect(shouldPersistDiagnostic({ ...event, event: 'gold-start' })).toBe(false);
  });

  it('bloqueia heartbeat e eventos ruidosos de UI antes do Supabase', () => {
    const base = { at: '', t: 0, runId: 'run-1', severity: 'info' };
    expect(shouldPersistDiagnostic({ ...base, area: 'Diagnostic', event: 'heartbeat' })).toBe(false);
    expect(shouldPersistDiagnostic({ ...base, area: 'App', event: 'overlay:render-decision' })).toBe(false);
    expect(shouldPersistDiagnostic({ ...base, area: 'MessageRow', event: 'commit:dimensions' })).toBe(false);
    expect(shouldPersistDiagnostic({ ...base, area: 'ChatInterface', event: 'panel:snapshot' })).toBe(false);
    expect(shouldPersistDiagnostic({ ...base, area: 'Virtuoso', event: 'static-fallback-rendered' })).toBe(false);
    expect(shouldPersistDiagnostic({ ...base, area: 'BlankPanelDebug', event: 'probe:raf1' })).toBe(false);
    expect(shouldPersistDiagnostic({ ...base, area: 'LayoutTrace', event: 'mount' })).toBe(false);
    expect(shouldPersistDiagnostic({ ...base, area: 'Visibility', event: 'pagehide', severity: 'warn' })).toBe(false);
    expect(shouldPersistDiagnostic({ ...base, area: 'Visibility', event: 'pagehide', severity: 'error' })).toBe(false);
  });

  it('mantém error, warn acionável e lifecycle do dossiê', () => {
    const base = { at: '', t: 0, runId: 'run-1' };
    expect(shouldPersistDiagnostic({ ...base, area: 'Api', event: 'request:error', severity: 'error' })).toBe(true);
    expect(shouldPersistDiagnostic({ ...base, area: 'Provider', event: 'fallback', severity: 'warn' })).toBe(true);
    expect(shouldPersistDiagnostic({ ...base, area: 'DossierLifecycle', event: 'started', severity: 'info' })).toBe(
      true,
    );
    expect(shouldPersistDiagnostic({ ...base, area: 'Usage', event: 'tokens', severity: 'info' })).toBe(true);
    expect(shouldPersistDiagnostic({ ...base, area: 'Provider', event: 'selected', severity: 'info' })).toBe(true);
    expect(shouldPersistDiagnostic({ ...base, area: 'Model', event: 'selected', severity: 'info' })).toBe(true);
    expect(shouldPersistDiagnostic({ ...base, area: 'Usage', event: 'cost', severity: 'info' })).toBe(true);
    expect(shouldPersistDiagnostic({ ...base, area: 'Request', event: 'retry', severity: 'info' })).toBe(true);
    expect(shouldPersistDiagnostic({ ...base, area: 'Request', event: 'fallback', severity: 'info' })).toBe(true);
    expect(shouldPersistDiagnostic({ ...base, area: 'DossierLifecycle', event: 'failed', severity: 'info' })).toBe(
      true,
    );
    expect(shouldPersistDiagnostic({ ...base, area: 'Lease', event: 'lost', severity: 'info' })).toBe(true);
    expect(shouldPersistDiagnostic({ ...base, area: 'DossierModule', event: 'usage metadata', severity: 'info' })).toBe(
      true,
    );
  });

  it('aplica amostragem determinística de 10% aos infos restantes', () => {
    const decisions = Array.from({ length: 10_000 }, (_, index) =>
      shouldPersistDiagnostic({
        at: '',
        t: 0,
        runId: `sample-${index}`,
        area: 'BackgroundMetric',
        event: 'observed',
        severity: 'info',
      }),
    );
    const persisted = decisions.filter(Boolean).length;
    expect(persisted).toBeGreaterThanOrEqual(900);
    expect(persisted).toBeLessThanOrEqual(1_100);

    const sameInput = {
      at: '',
      t: 0,
      runId: 'stable-run',
      area: 'BackgroundMetric',
      event: 'observed',
      severity: 'info',
    };
    expect(shouldPersistDiagnostic(sameInput)).toBe(shouldPersistDiagnostic({ ...sameInput }));
  });

  it('não chama Supabase quando todo o lote é ruído', async () => {
    const result = await insertDiagnosticsBatch({ runId: 'run-noise', events: [] }, [
      { at: '', t: 0, runId: 'run-noise', area: 'Diagnostic', event: 'heartbeat', severity: 'info' },
    ]);
    expect(result).toEqual({ inserted: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('servidor limita o lote final a MAX_EVENTS_PER_BATCH', async () => {
    const events = Array.from({ length: 101 }, (_, index) => ({
      at: '',
      t: index,
      runId: 'run-limit',
      area: 'Api',
      event: `warning-${index}`,
      severity: 'warn',
    }));
    const result = await insertDiagnosticsBatch({ runId: 'run-limit', events: [] }, events);
    expect(result).toEqual({ inserted: 100 });
    const rows = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as unknown[];
    expect(rows).toHaveLength(100);
  });

  it('filtra ruído antes do limite e preserva error após os primeiros 100 eventos', async () => {
    const noisyEvents = Array.from({ length: 100 }, (_, index) => ({
      at: '',
      t: index,
      runId: 'run-trailing-error',
      area: 'Diagnostic',
      event: 'heartbeat',
      severity: 'info',
    }));
    const trailingError = {
      at: '',
      t: 100,
      runId: 'run-trailing-error',
      area: 'Api',
      event: 'request:error',
      severity: 'error',
    };

    const result = await insertDiagnosticsBatch(
      { runId: 'run-trailing-error', events: [] },
      [...noisyEvents, trailingError],
    );

    expect(result).toEqual({ inserted: 1 });
    const rows = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Array<{
      area: string;
      event: string;
      severity: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ area: 'Api', event: 'request:error', severity: 'error' });
  });

  it('falha best-effort da retenção não altera a gravação principal', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('retention unavailable'));
    const result = await insertDiagnosticsBatch({ runId: 'run-write', events: [] }, [
      { at: '', t: 0, runId: 'run-write', area: 'Api', event: 'failed', severity: 'error' },
    ]);
    expect(result).toEqual({ inserted: 1 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('throttle local tenta a retenção no máximo uma vez por dia', async () => {
    const event = { at: '', t: 0, runId: 'run-throttle', area: 'Api', event: 'failed', severity: 'error' };
    await insertDiagnosticsBatch({ runId: 'run-throttle-1', events: [] }, [event]);
    await insertDiagnosticsBatch({ runId: 'run-throttle-2', events: [] }, [event]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/rpc/cleanup_scout_diagnostics_opportunistic');
  });
});
