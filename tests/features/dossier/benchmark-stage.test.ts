import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runDossierBenchmarkStage } from '../../../features/dossier/benchmark-stage';

const getIsolatedBenchmarkMock = vi.hoisted(() => vi.fn());

vi.mock('../../../services/geminiService', () => ({
  getIsolatedBenchmark: getIsolatedBenchmarkMock,
}));

describe('runDossierBenchmarkStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('anexa o benchmark e limpa a falha opcional quando a etapa conclui', async () => {
    getIsolatedBenchmarkMock.mockResolvedValue('Benchmark consolidado');
    const optionalStepFailures = new Set(['Benchmark de mercado']);
    const appendWaterfallChunk = vi.fn();
    const setFailureCount = vi.fn();

    const completed = await runDossierBenchmarkStage({
      sessionId: 'session-1',
      company: 'Acme Agro',
      signal: new AbortController().signal,
      appendWaterfallChunk,
      optionalStepFailures,
      setFailureCount,
    });

    expect(completed).toBe(true);
    expect(appendWaterfallChunk).toHaveBeenCalledWith('Benchmark consolidado');
    expect(optionalStepFailures.has('Benchmark de mercado')).toBe(false);
    expect(setFailureCount).toHaveBeenCalledWith(0);
  });

  it('marca a etapa como falha opcional sem abortar o fluxo quando o benchmark quebra', async () => {
    getIsolatedBenchmarkMock.mockRejectedValue(new Error('timeout'));
    const optionalStepFailures = new Set<string>();
    const appendWaterfallChunk = vi.fn();
    const setFailureCount = vi.fn();

    const completed = await runDossierBenchmarkStage({
      sessionId: 'session-2',
      company: 'Acme Agro',
      signal: new AbortController().signal,
      appendWaterfallChunk,
      optionalStepFailures,
      setFailureCount,
    });

    expect(completed).toBe(false);
    expect(appendWaterfallChunk).not.toHaveBeenCalled();
    expect(optionalStepFailures.has('Benchmark de mercado')).toBe(true);
    expect(setFailureCount).toHaveBeenCalledTimes(1);
  });
});
