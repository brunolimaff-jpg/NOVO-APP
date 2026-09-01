/**
 * BRU-162 Slot A — boundary server/provider (despacho Planejador ea6fdc4b).
 *
 * Contrato de telemetria em /api/llm:
 * - server_request:start  — entrada do handler LLM (action, module, inputChars, historyItemCount, historyChars)
 * - server_response:finish — resposta enviada (status, bodyChars, elapsedMs)
 * - server_response:close_before_finish — cliente desconectou ANTES da resposta
 *   (o sinal dos runs órfãos: res 'close' antes de 'finish')
 * Zero prompt/texto real, zero PII, zero secrets — só métricas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  insertDiagnosticsBatchMock: vi.fn(
    async (_ctx: { runId: string; route: string; events: unknown[] }, _events: unknown[]) => ({ error: null as string | null }),
  ),
}));

vi.mock('../../utils/serverDiagnostics.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../utils/serverDiagnostics.js')>();
  return {
    ...actual,
    insertDiagnosticsBatch: hoisted.insertDiagnosticsBatchMock,
  };
});

import { __testEmitServerBoundary, type ServerBoundaryEvent } from '../../api/llm';

type DiagEvent = {
  runId: string;
  route: string;
  events: Array<{ area: string; event: string; payload: Record<string, unknown> }>;
};

function diagCalls(): DiagEvent[] {
  return hoisted.insertDiagnosticsBatchMock.mock.calls.map(call => {
    const ctx = call[0] as { runId: string; route: string };
    const events = call[1] as DiagEvent['events'];
    return { runId: ctx.runId, route: ctx.route, events };
  });
}

function allEvents(): Array<{ area: string; event: string; payload: Record<string, unknown> }> {
  return diagCalls().flatMap(d => d.events);
}

describe('BRU-162 Slot A — boundary server/provider', () => {
  beforeEach(() => {
    hoisted.insertDiagnosticsBatchMock.mockClear();
  });

  it('helper do boundary emite evento com runId srv-*, área ServerBoundary e só métricas', () => {
    const ev: ServerBoundaryEvent = {
      event: 'server_request:start',
      runId: 'srv-test-1',
      payload: {
        action: 'generateContent',
        module: 'Caminho de Venda',
        inputChars: 92_000,
        historyItemCount: 12,
        historyChars: 121_000,
      },
    };
    __testEmitServerBoundary(ev);

    const events = allEvents();
    expect(events).toHaveLength(1);
    expect(events[0].area).toBe('ServerBoundary');
    expect(events[0].event).toBe('server_request:start');
    expect(events[0].payload).toEqual({
      action: 'generateContent',
      module: 'Caminho de Venda',
      inputChars: 92_000,
      historyItemCount: 12,
      historyChars: 121_000,
    });
    // runId do contexto do batch = runId do evento
    expect(diagCalls()[0].runId).toBe('srv-test-1');
    expect(diagCalls()[0].route).toBe('/api/llm');
  });

  it('emite server_response:close_before_finish quando cliente desconecta antes da resposta', () => {
    __testEmitServerBoundary({
      event: 'server_response:close_before_finish',
      runId: 'srv-test-2',
      payload: {
        action: 'generateContent',
        module: 'Caminho de Venda',
        elapsedMs: 95_000,
        inputChars: 92_000,
      },
    });

    const events = allEvents();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('server_response:close_before_finish');
    expect(events[0].payload.elapsedMs).toBe(95_000);
  });

  it('não emite nada quando diagnostics não configurado (degraded silencioso, sem throw)', () => {
    hoisted.insertDiagnosticsBatchMock.mockImplementationOnce(async () => ({ error: 'Supabase not configured' }));
    expect(() =>
      __testEmitServerBoundary({ event: 'server_request:start', runId: 'srv-3', payload: { action: 'health' } }),
    ).not.toThrow();
  });
});
