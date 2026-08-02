export const DOSSIER_RUNTIME_ENVELOPE_VERSION = 'dossier-runtime-envelope.v1' as const;

export const RUNTIME_ENVELOPE_STAGE_NAMES = [
  'validation',
  'authentication',
  'load_run',
  'acquire_lease',
  'start_heartbeat',
  'pipeline',
  'stop_heartbeat',
  'final_lease_validation',
  'persistence',
  'response',
  'failure_finalization',
  'reconciliation',
] as const;

export type RuntimeEnvelopeStageName = (typeof RUNTIME_ENVELOPE_STAGE_NAMES)[number];
type ControlledStageName =
  | 'validation'
  | 'authentication'
  | 'load_run'
  | 'acquire_lease'
  | 'start_heartbeat'
  | 'pipeline';
type SuccessFinalizationStageName = 'stop_heartbeat' | 'final_lease_validation' | 'persistence' | 'response';
type FailureFinalizationStageName = 'stop_heartbeat' | 'failure_finalization' | 'reconciliation';

export type RuntimeEnvelopeStageStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'CANCELLED'
  | 'SKIPPED'
  | 'INSUFFICIENT_BUDGET';

export type RuntimeEnvelopeOutcome = 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INSUFFICIENT_BUDGET';

export type RuntimeEnvelopeStageReport = {
  name: RuntimeEnvelopeStageName;
  status: RuntimeEnvelopeStageStatus;
  phase: 'CONTROLLED' | 'FINALIZATION';
  startedAtMs: number | null;
  durationMs: number;
  remainingBeforeMs: number;
  remainingAfterMs: number;
  configuredTimeoutMs: number;
  effectiveTimeoutMs: number;
  minimumRequiredAtStartMs: number;
  errorCode?: string;
};

export type RuntimeEnvelopeConfig = {
  requestApplicationBudgetMs: number;
  vercelMaxDurationMs: number;
  platformMarginMs: number;
  finalizationReserveMs: number;
  minimumControlledStageStartMs: number;
  cleanupWaitMs: number;
  controlledStageTimeoutsMs: Readonly<Record<ControlledStageName, number>>;
  finalizationStageTimeoutsMs: Readonly<Record<RuntimeEnvelopeStageName, number>>;
  finalizationMinimumsMs: Readonly<Record<RuntimeEnvelopeStageName, number>>;
};

export const DOSSIER_RUNTIME_ENVELOPE_CONFIG: Readonly<RuntimeEnvelopeConfig> = Object.freeze({
  requestApplicationBudgetMs: 50_000,
  vercelMaxDurationMs: 60_000,
  platformMarginMs: 10_000,
  // 1.5s stop heartbeat + 1.5s final lease + 3s persistence + 0.5s response
  // leaves an explicit 8s reserve for terminal success. Failure paths use
  // bounded 2s finalization + 1.5s reconciliation within the same reserve.
  finalizationReserveMs: 8_000,
  minimumControlledStageStartMs: 100,
  cleanupWaitMs: 500,
  controlledStageTimeoutsMs: {
    validation: 1_000,
    authentication: 3_000,
    load_run: 2_000,
    acquire_lease: 3_000,
    start_heartbeat: 1_000,
    pipeline: 50_000,
  },
  finalizationStageTimeoutsMs: {
    validation: 0,
    authentication: 0,
    load_run: 0,
    acquire_lease: 0,
    start_heartbeat: 0,
    pipeline: 0,
    stop_heartbeat: 2_000,
    final_lease_validation: 2_000,
    persistence: 3_000,
    response: 1_000,
    failure_finalization: 2_000,
    reconciliation: 2_000,
  },
  finalizationMinimumsMs: {
    validation: 0,
    authentication: 0,
    load_run: 0,
    acquire_lease: 0,
    start_heartbeat: 0,
    pipeline: 0,
    stop_heartbeat: 1_500,
    final_lease_validation: 1_500,
    persistence: 3_000,
    response: 500,
    failure_finalization: 2_000,
    reconciliation: 1_500,
  },
});

export type RuntimeEnvelopeHeartbeat = {
  stop: (signal: AbortSignal) => Promise<void>;
  pendingOperations?: () => number;
};

export type RuntimeEnvelopeAdapters = {
  validation: (signal: AbortSignal) => Promise<void>;
  authentication: (signal: AbortSignal) => Promise<void>;
  loadRun: (signal: AbortSignal) => Promise<void>;
  acquireLease: (signal: AbortSignal) => Promise<void>;
  startHeartbeat: (signal: AbortSignal) => Promise<RuntimeEnvelopeHeartbeat>;
  pipeline: (input: { signal: AbortSignal; effectiveTimeoutMs: number }) => Promise<void>;
  validateFinalLease: (signal: AbortSignal) => Promise<void>;
  persistence: (signal: AbortSignal) => Promise<void>;
  response: (signal: AbortSignal) => Promise<void>;
  failureFinalization: (signal: AbortSignal) => Promise<void>;
  reconciliation: (signal: AbortSignal) => Promise<void>;
};

export type RuntimeEnvelopeConfigOverrides = Omit<Partial<RuntimeEnvelopeConfig>, 'controlledStageTimeoutsMs' | 'finalizationStageTimeoutsMs' | 'finalizationMinimumsMs'> & {
  controlledStageTimeoutsMs?: Partial<Record<ControlledStageName, number>>;
  finalizationStageTimeoutsMs?: Partial<Record<RuntimeEnvelopeStageName, number>>;
  finalizationMinimumsMs?: Partial<Record<RuntimeEnvelopeStageName, number>>;
};

export type RuntimeEnvelopeDependencies = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  config?: RuntimeEnvelopeConfigOverrides;
};

export type RuntimeEnvelopeReport = {
  version: typeof DOSSIER_RUNTIME_ENVELOPE_VERSION;
  outcome: RuntimeEnvelopeOutcome;
  requestStartedAtMs: number;
  applicationDeadlineMs: number;
  finalizationDeadlineMs: number;
  applicationBudgetMs: number;
  vercelMaxDurationMs: number;
  platformMarginMs: number;
  observedPlatformMarginMs: number;
  finalizationReserveMs: number;
  finalizationReservePreserved: boolean;
  criticalPathMs: number;
  pendingOperations: number;
  persistenceStarted: boolean;
  persistenceCompleted: boolean;
  heartbeatStoppedAndAwaited: boolean;
  stages: readonly RuntimeEnvelopeStageReport[];
  errorCode?: string;
};

export type RuntimeEnvelopeBudgetReport = {
  requestApplicationBudgetMs: number;
  vercelMaxDurationMs: number;
  platformMarginMs: number;
  finalizationReserveMs: number;
  controlledBudgetMs: number;
  nonPipelineControlledWorstCaseMs: number;
  pipelineAvailableBudgetMs: number;
  pipelineWorstCaseMs: number;
  totalControlledWorstCaseMs: number;
  status: 'SUFFICIENT' | 'INSUFFICIENT';
  errorCode?: 'SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT';
};

export class RuntimeEnvelopeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly stage: RuntimeEnvelopeStageName,
  ) {
    super(message);
    this.name = 'RuntimeEnvelopeError';
  }
}

function positiveFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid runtime envelope ${field}`);
  return value;
}

function mergeConfig(dependencies: RuntimeEnvelopeDependencies): RuntimeEnvelopeConfig {
  const override = dependencies.config ?? {};
  const base = DOSSIER_RUNTIME_ENVELOPE_CONFIG;
  const config: RuntimeEnvelopeConfig = {
    ...base,
    ...override,
    controlledStageTimeoutsMs: { ...base.controlledStageTimeoutsMs, ...override.controlledStageTimeoutsMs },
    finalizationStageTimeoutsMs: { ...base.finalizationStageTimeoutsMs, ...override.finalizationStageTimeoutsMs },
    finalizationMinimumsMs: { ...base.finalizationMinimumsMs, ...override.finalizationMinimumsMs },
  };
  positiveFinite(config.requestApplicationBudgetMs, 'requestApplicationBudgetMs');
  positiveFinite(config.vercelMaxDurationMs, 'vercelMaxDurationMs');
  positiveFinite(config.platformMarginMs, 'platformMarginMs');
  positiveFinite(config.finalizationReserveMs, 'finalizationReserveMs');
  positiveFinite(config.minimumControlledStageStartMs, 'minimumControlledStageStartMs');
  if (config.requestApplicationBudgetMs > 50_000) throw new Error('requestApplicationBudgetMs must be <= 50000');
  if (config.platformMarginMs < 10_000) throw new Error('platform margin must be >= 10000');
  if (config.vercelMaxDurationMs - config.requestApplicationBudgetMs < config.platformMarginMs) {
    throw new Error('platform margin is smaller than the configured request budget gap');
  }
  if (config.finalizationReserveMs >= config.requestApplicationBudgetMs) {
    throw new Error('finalization reserve must be smaller than request application budget');
  }
  for (const [name, timeout] of Object.entries(config.controlledStageTimeoutsMs)) positiveFinite(timeout, `${name} timeout`);
  for (const [name, timeout] of Object.entries(config.finalizationStageTimeoutsMs)) {
    if (name === 'validation' || name === 'authentication' || name === 'load_run' || name === 'acquire_lease' || name === 'start_heartbeat' || name === 'pipeline') continue;
    positiveFinite(timeout, `${name} timeout`);
  }
  for (const [name, minimum] of Object.entries(config.finalizationMinimumsMs)) {
    if (minimum < 0 || !Number.isFinite(minimum)) throw new Error(`Invalid runtime envelope ${name} minimum`);
  }
  const successReserveMinimum = sumMinimums(config, ['stop_heartbeat', 'final_lease_validation', 'persistence', 'response']);
  const failureReserveMinimum = sumMinimums(config, ['stop_heartbeat', 'failure_finalization', 'reconciliation']);
  if (successReserveMinimum > config.finalizationReserveMs || failureReserveMinimum > config.finalizationReserveMs) {
    throw new Error('finalization reserve is smaller than the required terminal stages');
  }
  return config;
}

function combineSignals(first: AbortSignal, second: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (first.aborted || second.aborted) controller.abort();
  else {
    first.addEventListener('abort', abort, { once: true });
    second.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      first.removeEventListener('abort', abort);
      second.removeEventListener('abort', abort);
    },
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function errorCode(error: unknown, fallback: string): string {
  return error instanceof RuntimeEnvelopeError ? error.code : error instanceof Error && error.name === 'AbortError' ? 'REQUEST_ABORTED' : fallback;
}

function sumMinimums(config: RuntimeEnvelopeConfig, stages: readonly RuntimeEnvelopeStageName[]): number {
  return stages.reduce((total, stage) => total + (config.finalizationMinimumsMs[stage] ?? 0), 0);
}

export function estimateDossierRuntimeEnvelopeBudget(
  pipelineWorstCaseMs = 50_000,
  dependencies: RuntimeEnvelopeDependencies = {},
): RuntimeEnvelopeBudgetReport {
  if (!Number.isFinite(pipelineWorstCaseMs) || pipelineWorstCaseMs < 0) {
    throw new Error('pipelineWorstCaseMs must be a non-negative finite number');
  }
  const config = mergeConfig(dependencies);
  const controlledBudgetMs = config.requestApplicationBudgetMs - config.finalizationReserveMs;
  const nonPipelineControlledWorstCaseMs = Object.entries(config.controlledStageTimeoutsMs)
    .filter(([name]) => name !== 'pipeline')
    .reduce((total, [, timeout]) => total + timeout, 0);
  const pipelineAvailableBudgetMs = Math.max(0, controlledBudgetMs - nonPipelineControlledWorstCaseMs);
  const totalControlledWorstCaseMs = nonPipelineControlledWorstCaseMs + pipelineWorstCaseMs;
  const sufficient = totalControlledWorstCaseMs <= controlledBudgetMs;
  return {
    requestApplicationBudgetMs: config.requestApplicationBudgetMs,
    vercelMaxDurationMs: config.vercelMaxDurationMs,
    platformMarginMs: config.platformMarginMs,
    finalizationReserveMs: config.finalizationReserveMs,
    controlledBudgetMs,
    nonPipelineControlledWorstCaseMs,
    pipelineAvailableBudgetMs,
    pipelineWorstCaseMs,
    totalControlledWorstCaseMs,
    status: sufficient ? 'SUFFICIENT' : 'INSUFFICIENT',
    ...(sufficient ? {} : { errorCode: 'SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT' as const }),
  };
}

export function createDossierRuntimeEnvelope(
  adapters: RuntimeEnvelopeAdapters,
  dependencies: RuntimeEnvelopeDependencies = {},
) {
  const config = mergeConfig(dependencies);
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? defaultSleep;

  return async function runDossierRuntimeEnvelope(signal: AbortSignal = new AbortController().signal): Promise<RuntimeEnvelopeReport> {
    const requestStartedAtMs = now();
    const applicationDeadlineMs = requestStartedAtMs + config.requestApplicationBudgetMs;
    const finalizationDeadlineMs = applicationDeadlineMs - config.finalizationReserveMs;
    const stages: RuntimeEnvelopeStageReport[] = [];
    const finalizationController = new AbortController();
    let pendingOperations = 0;
    let heartbeat: RuntimeEnvelopeHeartbeat | undefined;
    let heartbeatStoppedAndAwaited = false;
    let persistenceStarted = false;
    let persistenceCompleted = false;
    let outcome: RuntimeEnvelopeOutcome = 'COMPLETED';
    let topLevelErrorCode: string | undefined;

    const pushStage = (report: RuntimeEnvelopeStageReport) => stages.push(report);

    const runStage = async <T>(
      name: RuntimeEnvelopeStageName,
      phase: 'CONTROLLED' | 'FINALIZATION',
      operation: (stageSignal: AbortSignal, effectiveTimeoutMs: number) => Promise<T>,
      configuredTimeoutMs: number,
      minimumRequiredAtStartMs: number,
      deadlineMs: number,
      parentSignal: AbortSignal = signal,
    ): Promise<T> => {
      const remainingBeforeMs = Math.max(0, deadlineMs - now());
      if (remainingBeforeMs < minimumRequiredAtStartMs || remainingBeforeMs <= 0) {
        pushStage({
          name,
          phase,
          status: 'INSUFFICIENT_BUDGET',
          startedAtMs: null,
          durationMs: 0,
          remainingBeforeMs,
          remainingAfterMs: remainingBeforeMs,
          configuredTimeoutMs,
          effectiveTimeoutMs: 0,
          minimumRequiredAtStartMs,
          errorCode: 'RUNTIME_ENVELOPE_BUDGET_EXHAUSTED',
        });
        throw new RuntimeEnvelopeError('RUNTIME_ENVELOPE_BUDGET_EXHAUSTED', `No budget to start ${name}`, name);
      }
      const startedAtMs = now();
      const effectiveTimeoutMs = Math.min(configuredTimeoutMs, Math.max(1, remainingBeforeMs - Math.max(0, minimumRequiredAtStartMs)));
      const timeoutController = new AbortController();
      const combined = combineSignals(parentSignal, timeoutController.signal);
      pendingOperations += 1;
      const operationPromise = Promise.resolve().then(() => operation(combined.signal, effectiveTimeoutMs));
      operationPromise.catch(() => undefined);
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let status: RuntimeEnvelopeStageStatus = 'COMPLETED';
      let failureCode: string | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            timeoutController.abort();
            reject(new RuntimeEnvelopeError('RUNTIME_ENVELOPE_STAGE_TIMEOUT', `${name} timed out`, name));
          }, effectiveTimeoutMs);
        });
        return await Promise.race([operationPromise, timeoutPromise]);
      } catch (error) {
        status = parentSignal.aborted ? 'CANCELLED' : error instanceof RuntimeEnvelopeError && error.code === 'RUNTIME_ENVELOPE_STAGE_TIMEOUT' ? 'TIMED_OUT' : 'FAILED';
        failureCode = errorCode(error, 'RUNTIME_ENVELOPE_STAGE_FAILED');
        throw new RuntimeEnvelopeError(failureCode, `${name} failed`, name);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutController.abort();
        combined.cleanup();
        const operationFinished = await Promise.race([
          operationPromise.then(() => true, () => true),
          sleep(dependencies.config?.cleanupWaitMs ?? DOSSIER_RUNTIME_ENVELOPE_CONFIG.cleanupWaitMs).then(() => false),
        ]);
        if (operationFinished) pendingOperations -= 1;
        const durationMs = Math.max(0, now() - startedAtMs);
        pushStage({
          name,
          phase,
          status,
          startedAtMs,
          durationMs,
          remainingBeforeMs,
          remainingAfterMs: Math.max(0, deadlineMs - now()),
          configuredTimeoutMs,
          effectiveTimeoutMs,
          minimumRequiredAtStartMs,
          ...(failureCode ? { errorCode: failureCode } : {}),
        });
      }
    };

    const runControlled = async <T>(name: ControlledStageName, operation: (stageSignal: AbortSignal, effectiveTimeoutMs: number) => Promise<T>) =>
      runStage(name, 'CONTROLLED', operation, config.controlledStageTimeoutsMs[name], config.minimumControlledStageStartMs, finalizationDeadlineMs);

    const runFinalization = async <T>(
      name: SuccessFinalizationStageName | FailureFinalizationStageName,
      operation: (stageSignal: AbortSignal, effectiveTimeoutMs: number) => Promise<T>,
      remainingFinalizationStages: readonly RuntimeEnvelopeStageName[],
    ) => {
      const minimumRequiredAtStartMs = sumMinimums(config, remainingFinalizationStages);
      return runStage(
        name,
        'FINALIZATION',
        operation,
        config.finalizationStageTimeoutsMs[name],
        minimumRequiredAtStartMs,
        applicationDeadlineMs,
        finalizationController.signal,
      );
    };

    const stopHeartbeat = async (remaining: readonly RuntimeEnvelopeStageName[]) => {
      if (!heartbeat) return;
      await runFinalization('stop_heartbeat', signal => heartbeat!.stop(signal), remaining);
      heartbeatStoppedAndAwaited = true;
      if ((heartbeat.pendingOperations?.() ?? 0) > 0) {
        throw new RuntimeEnvelopeError('RUNTIME_ENVELOPE_HEARTBEAT_PENDING', 'Heartbeat still has pending operations', 'stop_heartbeat');
      }
    };

    try {
      await runControlled('validation', adapters.validation);
      await runControlled('authentication', adapters.authentication);
      await runControlled('load_run', adapters.loadRun);
      await runControlled('acquire_lease', adapters.acquireLease);
      heartbeat = await runControlled('start_heartbeat', adapters.startHeartbeat);
      await runControlled('pipeline', (stageSignal, effectiveTimeoutMs) => adapters.pipeline({ signal: stageSignal, effectiveTimeoutMs }));

      await stopHeartbeat(['stop_heartbeat', 'final_lease_validation', 'persistence', 'response']);
      await runFinalization('final_lease_validation', adapters.validateFinalLease, ['final_lease_validation', 'persistence', 'response']);
      persistenceStarted = true;
      await runFinalization('persistence', adapters.persistence, ['persistence', 'response']);
      persistenceCompleted = true;
      await runFinalization('response', adapters.response, ['response']);
    } catch (error) {
      topLevelErrorCode = errorCode(error, 'RUNTIME_ENVELOPE_STAGE_FAILED');
      outcome = signal.aborted ? 'CANCELLED' : topLevelErrorCode === 'RUNTIME_ENVELOPE_BUDGET_EXHAUSTED' || topLevelErrorCode === 'RUNTIME_ENVELOPE_STAGE_TIMEOUT' ? 'INSUFFICIENT_BUDGET' : 'FAILED';
      if (heartbeat && !heartbeatStoppedAndAwaited) {
        try {
          await stopHeartbeat(['stop_heartbeat', 'failure_finalization', 'reconciliation']);
        } catch (stopError) {
          topLevelErrorCode = errorCode(stopError, 'RUNTIME_ENVELOPE_HEARTBEAT_STOP_FAILED');
        }
      }
      if (!persistenceStarted) {
        try {
          await runFinalization('failure_finalization', adapters.failureFinalization, ['failure_finalization', 'reconciliation']);
        } catch (failureError) {
          topLevelErrorCode = errorCode(failureError, 'RUNTIME_ENVELOPE_FAILURE_FINALIZATION_FAILED');
          try {
            await runFinalization('reconciliation', adapters.reconciliation, ['reconciliation']);
          } catch (reconciliationError) {
            topLevelErrorCode = errorCode(reconciliationError, 'RUNTIME_ENVELOPE_RECONCILIATION_FAILED');
          }
        }
      } else {
        try {
          await runFinalization('reconciliation', adapters.reconciliation, ['reconciliation']);
        } catch (reconciliationError) {
          topLevelErrorCode = errorCode(reconciliationError, 'RUNTIME_ENVELOPE_RECONCILIATION_FAILED');
        }
      }
    }

    finalizationController.abort();
    const criticalPathMs = Math.max(0, now() - requestStartedAtMs);
    const observedPlatformMarginMs = config.vercelMaxDurationMs - criticalPathMs;
    if (pendingOperations > 0) {
      outcome = 'FAILED';
      topLevelErrorCode = 'RUNTIME_ENVELOPE_PENDING_OPERATION';
    }
    const controlledStagesRespected = stages
      .filter(stage => stage.phase === 'CONTROLLED')
      .every(stage => stage.remainingAfterMs >= 0);
    const finalizationReservePreserved = controlledStagesRespected;
    return {
      version: DOSSIER_RUNTIME_ENVELOPE_VERSION,
      outcome,
      requestStartedAtMs,
      applicationDeadlineMs,
      finalizationDeadlineMs,
      applicationBudgetMs: config.requestApplicationBudgetMs,
      vercelMaxDurationMs: config.vercelMaxDurationMs,
      platformMarginMs: config.platformMarginMs,
      observedPlatformMarginMs,
      finalizationReserveMs: config.finalizationReserveMs,
      finalizationReservePreserved,
      criticalPathMs,
      pendingOperations,
      persistenceStarted,
      persistenceCompleted,
      heartbeatStoppedAndAwaited,
      stages,
      ...(topLevelErrorCode ? { errorCode: topLevelErrorCode } : {}),
    };
  };
}
