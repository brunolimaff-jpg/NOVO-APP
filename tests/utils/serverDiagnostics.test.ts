import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { insertDiagnosticsBatch } from '../../utils/serverDiagnostics';

describe('serverDiagnostics payload sanitizer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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
          severity: 'info',
          t: 123,
        },
      ],
    );

    expect(result).toEqual({ inserted: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();

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
});
