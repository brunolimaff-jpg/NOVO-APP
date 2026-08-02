import { describe, expect, it } from 'vitest';
import {
  createDossierRuntimeEnvelope,
  estimateDossierRuntimeEnvelopeBudget,
  type RuntimeEnvelopeAdapters,
  type RuntimeEnvelopeHeartbeat,
} from '../../api/_dossier-runtime-envelope';

type TestConfig = NonNullable<Parameters<typeof createDossierRuntimeEnvelope>[1]>['config'];

function delayWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function testConfig(overrides: TestConfig = {}): TestConfig {
  const base = {
    requestApplicationBudgetMs: 180,
    vercelMaxDurationMs: 10_180,
    platformMarginMs: 10_000,
    finalizationReserveMs: 40,
    minimumControlledStageStartMs: 5,
    cleanupWaitMs: 20,
    controlledStageTimeoutsMs: {
      validation: 30,
      authentication: 30,
      load_run: 30,
      acquire_lease: 30,
      start_heartbeat: 30,
      pipeline: 100,
    },
    finalizationStageTimeoutsMs: {
      stop_heartbeat: 30,
      final_lease_validation: 30,
      persistence: 30,
      response: 20,
      failure_finalization: 20,
      reconciliation: 20,
    },
    finalizationMinimumsMs: {
      stop_heartbeat: 5,
      final_lease_validation: 5,
      persistence: 10,
      response: 5,
      failure_finalization: 5,
      reconciliation: 5,
    },
  };
  return {
    ...base,
    ...overrides,
    controlledStageTimeoutsMs: { ...base.controlledStageTimeoutsMs, ...overrides.controlledStageTimeoutsMs },
    finalizationStageTimeoutsMs: { ...base.finalizationStageTimeoutsMs, ...overrides.finalizationStageTimeoutsMs },
    finalizationMinimumsMs: { ...base.finalizationMinimumsMs, ...overrides.finalizationMinimumsMs },
  };
}

type AdapterOptions = {
  validationMs?: number;
  authenticationMs?: number;
  loadRunMs?: number;
  acquireLeaseMs?: number;
  startHeartbeatMs?: number;
  pipelineMs?: number;
  stopHeartbeatMs?: number;
  finalLeaseMs?: number;
  persistenceMs?: number;
  responseMs?: number;
  failureFinalizationMs?: number;
  reconciliationMs?: number;
  failAt?: keyof AdapterOptions;
  ignorePipelineAbort?: boolean;
  ignoreStopHeartbeatAbort?: boolean;
};

function buildAdapters(options: AdapterOptions = {}) {
  const calls = {
    pipeline: 0,
    persistence: 0,
    response: 0,
    failureFinalization: 0,
    reconciliation: 0,
    stopHeartbeat: 0,
  };
  let heartbeatPending = 0;
  let heartbeat: RuntimeEnvelopeHeartbeat | undefined;
  const maybeFail = (key: keyof AdapterOptions): void => {
    if (options.failAt === key) throw new Error(`${key} failed`);
  };
  const run = (key: keyof AdapterOptions, ms: number | undefined, signal: AbortSignal, ignoreAbort = false) => {
    maybeFail(key);
    return ignoreAbort ? new Promise<void>(() => undefined) : delayWithAbort(ms ?? 1, signal);
  };
  const adapters: RuntimeEnvelopeAdapters = {
    validation: signal => run('validationMs', options.validationMs, signal),
    authentication: signal => run('authenticationMs', options.authenticationMs, signal),
    loadRun: signal => run('loadRunMs', options.loadRunMs, signal),
    acquireLease: signal => run('acquireLeaseMs', options.acquireLeaseMs, signal),
    startHeartbeat: async signal => {
      await run('startHeartbeatMs', options.startHeartbeatMs, signal);
      heartbeat = {
        stop: stopSignal => {
          calls.stopHeartbeat += 1;
          heartbeatPending += 1;
          const result = run('stopHeartbeatMs', options.stopHeartbeatMs, stopSignal, options.ignoreStopHeartbeatAbort);
          return result.finally(() => {
            heartbeatPending -= 1;
          });
        },
        pendingOperations: () => heartbeatPending,
      };
      return heartbeat;
    },
    pipeline: async ({ signal }) => {
      calls.pipeline += 1;
      await run('pipelineMs', options.pipelineMs, signal, options.ignorePipelineAbort);
    },
    validateFinalLease: signal => run('finalLeaseMs', options.finalLeaseMs, signal),
    persistence: async signal => {
      calls.persistence += 1;
      await run('persistenceMs', options.persistenceMs, signal);
    },
    response: async signal => {
      calls.response += 1;
      await run('responseMs', options.responseMs, signal);
    },
    failureFinalization: async signal => {
      calls.failureFinalization += 1;
      await run('failureFinalizationMs', options.failureFinalizationMs, signal);
    },
    reconciliation: async signal => {
      calls.reconciliation += 1;
      await run('reconciliationMs', options.reconciliationMs, signal);
    },
  };
  return { adapters, calls, getHeartbeat: () => heartbeat };
}

describe('dossier runtime envelope 05C.1R', () => {
  it('demonstra que o pior caso atual de 50s não cabe com preflight e reserva de finalização', () => {
    const budget = estimateDossierRuntimeEnvelopeBudget();

    expect(budget.requestApplicationBudgetMs).toBe(50_000);
    expect(budget.vercelMaxDurationMs).toBe(60_000);
    expect(budget.platformMarginMs).toBeGreaterThanOrEqual(10_000);
    expect(budget.finalizationReserveMs).toBe(8_000);
    expect(budget.pipelineAvailableBudgetMs).toBe(32_000);
    expect(budget.pipelineWorstCaseMs).toBe(50_000);
    expect(budget.totalControlledWorstCaseMs).toBe(60_000);
    expect(budget.status).toBe('INSUFFICIENT');
    expect(budget.errorCode).toBe('SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT');
  });

  it('exercita o caminho completo e preserva margem/plataforma sem promises pendentes', async () => {
    const { adapters, calls } = buildAdapters({
      validationMs: 1,
      authenticationMs: 1,
      loadRunMs: 1,
      acquireLeaseMs: 1,
      startHeartbeatMs: 1,
      pipelineMs: 5,
      stopHeartbeatMs: 1,
      finalLeaseMs: 1,
      persistenceMs: 2,
      responseMs: 1,
    });
    const run = createDossierRuntimeEnvelope(adapters, { config: testConfig() });
    const report = await run();

    expect(report.outcome).toBe('COMPLETED');
    expect(report.persistenceStarted).toBe(true);
    expect(report.persistenceCompleted).toBe(true);
    expect(report.heartbeatStoppedAndAwaited).toBe(true);
    expect(report.pendingOperations).toBe(0);
    expect(report.finalizationReservePreserved).toBe(true);
    expect(report.observedPlatformMarginMs).toBeGreaterThanOrEqual(40);
    expect(calls).toMatchObject({ pipeline: 1, persistence: 1, response: 1, stopHeartbeat: 1 });
    expect(report.stages.map(stage => stage.name)).toEqual([
      'validation', 'authentication', 'load_run', 'acquire_lease', 'start_heartbeat', 'pipeline',
      'stop_heartbeat', 'final_lease_validation', 'persistence', 'response',
    ]);
  });

  it('encerra o pipeline no deadline global e não inicia persistência após timeout LLM', async () => {
    const { adapters, calls } = buildAdapters({ pipelineMs: 150 });
    const run = createDossierRuntimeEnvelope(adapters, {
      config: testConfig({ requestApplicationBudgetMs: 90, vercelMaxDurationMs: 10_090, platformMarginMs: 10_000, finalizationReserveMs: 25 }),
    });
    const report = await run();

    expect(report.outcome).toBe('INSUFFICIENT_BUDGET');
    expect(report.errorCode).toMatch(/RUNTIME_ENVELOPE/);
    expect(report.persistenceStarted).toBe(false);
    expect(calls.persistence).toBe(0);
    expect(report.stages.find(stage => stage.name === 'pipeline')?.status).toBe('TIMED_OUT');
  });

  it('não inicia a próxima etapa quando o orçamento restante fica abaixo do mínimo', async () => {
    const { adapters, calls } = buildAdapters({ loadRunMs: 55 });
    const run = createDossierRuntimeEnvelope(adapters, {
      config: testConfig({
        requestApplicationBudgetMs: 90,
        vercelMaxDurationMs: 10_090,
        platformMarginMs: 10_000,
        finalizationReserveMs: 25,
        minimumControlledStageStartMs: 10,
        controlledStageTimeoutsMs: { load_run: 80 },
      }),
    });
    const report = await run();

    expect(report.outcome).toBe('INSUFFICIENT_BUDGET');
    expect(calls.pipeline).toBe(0);
    expect(report.stages.some(stage => stage.status === 'INSUFFICIENT_BUDGET' || stage.status === 'TIMED_OUT')).toBe(true);
    expect(report.persistenceStarted).toBe(false);
  });

  it('propaga cancelamento entre etapas e não devolve COMPLETED', async () => {
    const controller = new AbortController();
    const { adapters, calls } = buildAdapters({ pipelineMs: 40 });
    const basePipeline = adapters.pipeline;
    adapters.pipeline = async input => {
      setTimeout(() => controller.abort(), 5);
      return basePipeline(input);
    };
    const run = createDossierRuntimeEnvelope(adapters, { config: testConfig() });
    const report = await run(controller.signal);

    expect(report.outcome).toBe('CANCELLED');
    expect(calls.persistence).toBe(0);
    expect(report.persistenceCompleted).toBe(false);
    expect(report.heartbeatStoppedAndAwaited).toBe(true);
  });

  it('aguarda heartbeat e falha fechado se o stop exceder o envelope', async () => {
    const { adapters, calls } = buildAdapters({ stopHeartbeatMs: 80 });
    const run = createDossierRuntimeEnvelope(adapters, {
      config: testConfig({
        finalizationStageTimeoutsMs: { stop_heartbeat: 10 },
        finalizationMinimumsMs: { stop_heartbeat: 5, failure_finalization: 5, reconciliation: 5 },
      }),
    });
    const report = await run();

    expect(report.outcome).not.toBe('COMPLETED');
    expect(report.persistenceStarted).toBe(false);
    expect(calls.persistence).toBe(0);
    expect(report.heartbeatStoppedAndAwaited).toBe(false);
  });

  it('não marca COMPLETED quando a persistência excede seu timeout', async () => {
    const { adapters, calls } = buildAdapters({ persistenceMs: 80 });
    const run = createDossierRuntimeEnvelope(adapters, {
      config: testConfig({ finalizationStageTimeoutsMs: { persistence: 10 } }),
    });
    const report = await run();

    expect(report.outcome).not.toBe('COMPLETED');
    expect(report.persistenceStarted).toBe(true);
    expect(report.persistenceCompleted).toBe(false);
    expect(calls.response).toBe(0);
    expect(calls.reconciliation).toBeGreaterThanOrEqual(1);
  });

  it('finaliza falha intermediária sem persistir resultado parcial', async () => {
    const { adapters, calls } = buildAdapters({ failAt: 'loadRunMs' });
    const run = createDossierRuntimeEnvelope(adapters, { config: testConfig() });
    const report = await run();

    expect(report.outcome).toBe('FAILED');
    expect(report.persistenceStarted).toBe(false);
    expect(calls.persistence).toBe(0);
    expect(calls.failureFinalization).toBe(1);
  });

  it('reconcilia quando a resposta falha depois de possível commit', async () => {
    const { adapters, calls } = buildAdapters({ failAt: 'responseMs' });
    const run = createDossierRuntimeEnvelope(adapters, { config: testConfig() });
    const report = await run();

    expect(report.outcome).toBe('FAILED');
    expect(report.persistenceStarted).toBe(true);
    expect(report.persistenceCompleted).toBe(true);
    expect(calls.reconciliation).toBe(1);
  });

  it('registra operação pendente quando um adapter ignora AbortSignal', async () => {
    const { adapters } = buildAdapters({ pipelineMs: 80, ignorePipelineAbort: true });
    const run = createDossierRuntimeEnvelope(adapters, {
      config: testConfig({ requestApplicationBudgetMs: 80, vercelMaxDurationMs: 10_080, platformMarginMs: 10_000, finalizationReserveMs: 30, cleanupWaitMs: 5 }),
    });
    const report = await run();

    expect(report.outcome).toBe('FAILED');
    expect(report.errorCode).toBe('RUNTIME_ENVELOPE_PENDING_OPERATION');
    expect(report.pendingOperations).toBeGreaterThan(0);
    expect(report.persistenceStarted).toBe(false);
  });

  it('rejeita configuração que não preserva dez segundos de margem da plataforma', () => {
    const { adapters } = buildAdapters();
    expect(() => createDossierRuntimeEnvelope(adapters, {
      config: { requestApplicationBudgetMs: 50_000, vercelMaxDurationMs: 60_000, platformMarginMs: 1_000 },
    })).toThrow(/platform margin/);
  });
});
