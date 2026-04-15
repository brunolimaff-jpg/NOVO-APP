import type { Dispatch, SetStateAction } from 'react';
import { getIsolatedBenchmark } from '../../services/geminiService';
import { scoutDiag } from '../../utils/diagnosticLog';
import { isAbortLikeError } from '../chat/message-helpers';

const MODULAR_BENCHMARK_TIMEOUT_MS = 45000;
const BENCHMARK_FAILURE_LABEL = 'Benchmark de mercado';

export interface RunDossierBenchmarkStageArgs {
  sessionId: string;
  company: string;
  signal: AbortSignal;
  appendWaterfallChunk: (chunk: string) => void;
  optionalStepFailures: Set<string>;
  setFailureCount: Dispatch<SetStateAction<number>>;
}

export async function runDossierBenchmarkStage({
  sessionId,
  company,
  signal,
  appendWaterfallChunk,
  optionalStepFailures,
  setFailureCount,
}: RunDossierBenchmarkStageArgs): Promise<boolean> {
  try {
    const benchmark = await getIsolatedBenchmark(company, {
      signal,
      timeoutMs: MODULAR_BENCHMARK_TIMEOUT_MS,
    });

    if (benchmark) appendWaterfallChunk(benchmark);
    optionalStepFailures.delete(BENCHMARK_FAILURE_LABEL);
    setFailureCount(0);
    return true;
  } catch (error) {
    if (isAbortLikeError(error)) throw error;

    optionalStepFailures.add(BENCHMARK_FAILURE_LABEL);
    setFailureCount(count => count + 1);
    scoutDiag.warn('ModularDossier', 'benchmark isolado falhou e sera ignorado', {
      sessionId,
      company: company || null,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
