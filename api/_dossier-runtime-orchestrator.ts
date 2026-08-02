import { createHash } from 'node:crypto';

import { runDossierGateway } from './_dossier-llm-gateway.js';
import {
  createDossierRunRpcClient,
  DossierRunRpcError,
  type DossierRunRpcAuth,
  type DossierRunRpcCaller,
} from './_dossier-run-rpc.js';
import {
  DossierServerPipelineError,
  createDossierServerPipeline,
  DOSSIER_SERVER_PIPELINE_VERSION,
  type DossierServerEvidenceSearchResult,
  type DossierServerLlmInput,
  type DossierServerLlmResult,
  type DossierServerPipelineDependencies,
  type DossierServerPipelineInput,
  type DossierServerPipelineOutput,
} from './_dossier-server-pipeline.js';
import {
  DossierPersistenceError,
  persistAndCompleteDossierRunAttempt,
  type PersistAndCompleteDossierAttemptInput,
} from './_dossier-persistence.js';
import { SHARED_FOUNDATION_BLOCK } from '../prompts/megaPrompts.js';
import type { DossierEvidenceContract, DossierUsage } from '../shared/dossierGatewayContracts.js';

export const DOSSIER_RUNTIME_LIMITS = Object.freeze({
  platformHardCapMs: 300_000,
  applicationDeadlineMs: 270_000,
  externalCallCutoffMs: 240_000,
  finalizationReserveMs: 30_000,
  maxTotalAttempts: 2,
  retryBackoffMs: 5_000,
  maxAggregateRetryBudgetMs: 20_000,
  retryWorkloadBudgetMs: 55_000,
  leaseSeconds: 60,
  heartbeatIntervalMs: 20_000,
  heartbeatRpcTimeoutMs: 5_000,
  finalizationRpcTimeoutMs: 10_000,
});

type DossierRuntimeLimits = { [K in keyof typeof DOSSIER_RUNTIME_LIMITS]: number };
export type DossierRuntimeLimitOverrides = Partial<DossierRuntimeLimits>;

export interface DossierRuntimeRequest {
  runId: string;
  companyName: string;
  cnpj?: string;
  context: string;
  evidence?: DossierEvidenceContract;
  correlationId: string;
  signal: AbortSignal;
}

export type DossierRuntimeAuth = DossierRunRpcAuth;

export interface DossierRuntimeResult {
  runId: string;
  dossierId: string;
  text: string;
  usage: DossierUsage;
  finishReason: string;
  status: 'COMPLETED';
  attemptNo: number;
  pipelineVersion: typeof DOSSIER_SERVER_PIPELINE_VERSION;
}

export type DossierRuntimeErrorCode =
  | 'REQUEST_ABORTED'
  | 'DEADLINE_EXCEEDED'
  | 'EXTERNAL_CALL_CUTOFF'
  | 'RUN_NOT_FOUND'
  | 'RUN_TERMINAL'
  | 'RUN_CANCEL_REQUESTED'
  | 'RUN_CANCELLATION_FINALIZATION_FAILED'
  | 'RUN_LEASE_UNAVAILABLE'
  | 'ATTEMPT_FENCE_MISMATCH'
  | 'ATTEMPT_LEASE_EXPIRED'
  | 'ATTEMPT_LIMIT_REACHED'
  | 'PIPELINE_VERSION_MISMATCH'
  | 'RETRY_NOT_ALLOWED'
  | 'CHECKPOINT_CONFLICT'
  | 'CHECKPOINT_OUT_OF_ORDER'
  | 'CHECKPOINT_PAYLOAD_TOO_LARGE'
  | 'RPC_TIMEOUT'
  | 'RPC_INVALID_RESPONSE'
  | 'PERSISTENCE_FAILED'
  | 'DOSSIER_CONFLICT'
  | 'DOSSIER_CONTENT_UNAVAILABLE'
  | 'SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT'
  | 'SERVER_PIPELINE_STAGE_TIMEOUT'
  | 'SERVER_PIPELINE_STAGE_FAILED'
  | 'INTERNAL_ERROR';

export class DossierRuntimeError extends Error {
  constructor(
    readonly code: DossierRuntimeErrorCode,
    message: string,
    readonly status: number,
    readonly stage: string,
    readonly retryable: boolean,
    readonly cancellationConfirmed = false,
  ) {
    super(message);
    this.name = 'DossierRuntimeError';
  }
}

export interface DossierRuntimeEvents {
  (event: string, data: {
    correlationId: string;
    runId: string;
    attemptNo?: number;
    attemptId?: string;
    stepKey?: string;
    errorCode?: string;
    remainingMs?: number;
  }): void;
}

export interface DossierRuntimeDependencies {
  rpc?: DossierRunRpcCaller;
  pipelineFactory?: (dependencies: DossierServerPipelineDependencies) => (input: DossierServerPipelineInput) => Promise<DossierServerPipelineOutput>;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  events?: DossierRuntimeEvents;
  limits?: DossierRuntimeLimitOverrides;
}

type AttemptRecord = {
  run_id: string;
  attempt_id: string;
  attempt_no: number;
  fence_token: string;
  pipeline_version: string;
  lease_expires_at?: string;
};

type ResumeCheckpoint = {
  checkpoint_id?: string;
  attempt_id?: string;
  step_key: string;
  step_ordinal: number;
  output_payload: unknown;
};

type ResumeState = {
  run_id?: string;
  status?: string;
  pipeline_version?: string;
  checkpoints?: ResumeCheckpoint[];
};

type CheckpointPayload = {
  kind: 'llm' | 'evidence_query' | 'benchmark';
  stage: string;
  output: unknown;
};

type AttemptContext = {
  attempt: AttemptRecord;
  resume: ResumeState;
  resumeByStep: Map<string, CheckpointPayload>;
  nextOrdinal: number;
  checkpointQueue: Promise<void>;
  heartbeat: Heartbeat;
  workloadController: AbortController;
};

type Heartbeat = {
  signal: AbortSignal;
  getError: () => DossierRuntimeError | undefined;
  stop: () => Promise<void>;
  cleanup: () => void;
};

function mergeLimits(overrides: DossierRuntimeLimitOverrides | undefined): DossierRuntimeLimits {
  return { ...DOSSIER_RUNTIME_LIMITS, ...(overrides ?? {}) };
}

function linkSignals(...signals: AbortSignal[]): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signals.some(signal => signal.aborted)) controller.abort();
  else signals.forEach(signal => signal.addEventListener('abort', abort, { once: true }));
  return {
    signal: controller.signal,
    cleanup: () => signals.forEach(signal => signal.removeEventListener('abort', abort)),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

async function boundedSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DossierRuntimeError('REQUEST_ABORTED', 'Espera cancelada', 499, 'retry_backoff', false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new DossierRuntimeError('REQUEST_ABORTED', 'Espera cancelada', 499, 'retry_backoff', false));
    };
    timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, Math.max(0, ms));
    signal.addEventListener('abort', abort, { once: true });
  });
}

function assertNotAborted(signal: AbortSignal, stage: string): void {
  if (signal.aborted) throw new DossierRuntimeError('REQUEST_ABORTED', 'Execução cancelada', 499, stage, false);
}

function assertWithinDeadline(now: () => number, deadlineAt: number, signal: AbortSignal, stage: string): void {
  assertNotAborted(signal, stage);
  if (now() >= deadlineAt) throw new DossierRuntimeError('DEADLINE_EXCEEDED', 'Prazo da aplicação excedido', 504, stage, false);
}

function assertBeforeCutoff(now: () => number, cutoffAt: number, deadlineAt: number, signal: AbortSignal, stage: string): void {
  assertWithinDeadline(now, deadlineAt, signal, stage);
  if (now() >= cutoffAt) throw new DossierRuntimeError('EXTERNAL_CALL_CUTOFF', 'Cutoff de chamadas externas atingido', 504, stage, false);
}

function remainingMs(now: () => number, deadlineAt: number): number {
  return Math.max(0, deadlineAt - now());
}

function rpcTimeout(now: () => number, deadlineAt: number, requested: number): number {
  return Math.max(1, Math.min(requested, remainingMs(now, deadlineAt)));
}

function normalizeError(error: unknown, stage: string, signal: AbortSignal): DossierRuntimeError {
  if (error instanceof DossierRuntimeError) return error;
  if (signal.aborted) return new DossierRuntimeError('REQUEST_ABORTED', 'Execução cancelada', 499, stage, false);
  if (error instanceof DossierRunRpcError) {
    const code = error.code as DossierRuntimeErrorCode;
    return new DossierRuntimeError(code, 'Falha na operação de lifecycle', error.status, error.stage, error.retryable);
  }
  if (error instanceof DossierPersistenceError) {
    return new DossierRuntimeError(error.code as DossierRuntimeErrorCode, 'Persistência terminal falhou', error.status, 'persistence', error.retryable);
  }
  if (error instanceof DossierServerPipelineError) {
    const code = error.code === 'SERVER_PIPELINE_CANCELLED' ? 'REQUEST_ABORTED' : error.code as DossierRuntimeErrorCode;
    return new DossierRuntimeError(code, error.message, code === 'REQUEST_ABORTED' ? 499 : 502, error.stage, error.retryable);
  }
  return new DossierRuntimeError('INTERNAL_ERROR', 'Falha interna na execução do dossiê', 500, stage, true);
}

function validateAttempt(value: unknown, expectedRunId: string): AttemptRecord {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (
    record.run_id !== expectedRunId ||
    typeof record.attempt_id !== 'string' ||
    typeof record.fence_token !== 'string' ||
    typeof record.pipeline_version !== 'string' ||
    typeof record.attempt_no !== 'number'
  ) {
    throw new DossierRuntimeError('INTERNAL_ERROR', 'Resposta begin inválida', 502, 'begin_attempt', true);
  }
  return {
    run_id: record.run_id,
    attempt_id: record.attempt_id,
    attempt_no: record.attempt_no,
    fence_token: record.fence_token,
    pipeline_version: record.pipeline_version,
    ...(typeof record.lease_expires_at === 'string' ? { lease_expires_at: record.lease_expires_at } : {}),
  };
}

function validateResume(value: unknown, runId: string): ResumeState {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const checkpoints = Array.isArray(record.checkpoints) ? record.checkpoints : [];
  const normalized = checkpoints
    .filter(item => item && typeof item === 'object')
    .map(item => item as Record<string, unknown>)
    .filter(item => typeof item.step_key === 'string' && typeof item.step_ordinal === 'number')
    .map(item => ({
      ...(typeof item.checkpoint_id === 'string' ? { checkpoint_id: item.checkpoint_id } : {}),
      ...(typeof item.attempt_id === 'string' ? { attempt_id: item.attempt_id } : {}),
      step_key: item.step_key as string,
      step_ordinal: item.step_ordinal as number,
      output_payload: item.output_payload,
    }))
    .sort((left, right) => left.step_ordinal - right.step_ordinal);
  if (record.run_id !== undefined && record.run_id !== runId) {
    throw new DossierRuntimeError('RUN_NOT_FOUND', 'Resume de run divergente', 404, 'resume', false);
  }
  return {
    ...(typeof record.run_id === 'string' ? { run_id: record.run_id } : { run_id: runId }),
    ...(typeof record.status === 'string' ? { status: record.status } : {}),
    ...(typeof record.pipeline_version === 'string' ? { pipeline_version: record.pipeline_version } : {}),
    checkpoints: normalized,
  };
}

function checkpointKey(kind: CheckpointPayload['kind'], stage: string): string {
  if (kind !== 'evidence_query') return `${kind}:${stage}`;
  return `evidence_query:${createHash('sha256').update(stage).digest('hex').slice(0, 32)}`;
}

function payloadFromCheckpoint(value: unknown): CheckpointPayload | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const payload = value as Record<string, unknown>;
  if ((payload.kind !== 'llm' && payload.kind !== 'evidence_query' && payload.kind !== 'benchmark') || typeof payload.stage !== 'string') return undefined;
  return payload as unknown as CheckpointPayload;
}

function makeResumeMap(resume: ResumeState): Map<string, CheckpointPayload> {
  const map = new Map<string, CheckpointPayload>();
  for (const checkpoint of resume.checkpoints ?? []) {
    const payload = payloadFromCheckpoint(checkpoint.output_payload);
    if (!payload) continue;
    map.set(checkpointKey(payload.kind, payload.stage), payload);
  }
  return map;
}

function assertCheckpointSize(payload: CheckpointPayload): void {
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > 1_048_576) {
    throw new DossierRuntimeError('CHECKPOINT_PAYLOAD_TOO_LARGE', 'Checkpoint excede 1 MiB', 413, 'checkpoint', false);
  }
}

function startHeartbeat(
  input: DossierRuntimeRequest,
  auth: DossierRuntimeAuth,
  rpc: DossierRunRpcCaller,
  attempt: AttemptRecord,
  workloadController: AbortController,
  now: () => number,
  deadlineAt: number,
  cutoffAt: number,
  limits: DossierRuntimeLimits,
  events?: DossierRuntimeEvents,
): Heartbeat {
  const heartbeatController = new AbortController();
  let stopped = false;
  let inFlight = false;
  let inFlightPromise: Promise<void> | undefined;
  let heartbeatError: DossierRuntimeError | undefined;
  const renew = async (): Promise<void> => {
    if (stopped || inFlight || heartbeatController.signal.aborted) return;
    if (now() >= cutoffAt || now() >= deadlineAt) return;
    inFlight = true;
    try {
      assertNotAborted(heartbeatController.signal, 'heartbeat');
      const renewed = await rpc<Record<string, unknown>>(
        'renew_dossier_run_attempt_lease',
        {
          p_run_id: input.runId,
          p_attempt_id: attempt.attempt_id,
          p_fence_token: attempt.fence_token,
          p_lease_seconds: limits.leaseSeconds,
        },
        heartbeatController.signal,
        { stage: 'heartbeat', timeoutMs: rpcTimeout(now, deadlineAt, limits.heartbeatRpcTimeoutMs) },
      );
      if (!renewed || renewed.attempt_id !== attempt.attempt_id || renewed.fence_token !== attempt.fence_token) {
        throw new DossierRuntimeError('ATTEMPT_FENCE_MISMATCH', 'Lease não renovada', 409, 'heartbeat', true);
      }
      events?.('heartbeat:renewed', { correlationId: input.correlationId, runId: input.runId, attemptNo: attempt.attempt_no, attemptId: attempt.attempt_id, remainingMs: remainingMs(now, deadlineAt) });
    } catch (error) {
      if (!stopped && !heartbeatController.signal.aborted) {
        heartbeatError = normalizeError(error, 'heartbeat', heartbeatController.signal);
        workloadController.abort();
        events?.('heartbeat:failed', { correlationId: input.correlationId, runId: input.runId, attemptNo: attempt.attempt_no, attemptId: attempt.attempt_id, errorCode: heartbeatError.code });
      }
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(() => {
    if (stopped || inFlight) return;
    inFlightPromise = renew();
  }, limits.heartbeatIntervalMs);
  return {
    signal: heartbeatController.signal,
    getError: () => heartbeatError,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      heartbeatController.abort();
      await Promise.race([inFlightPromise?.catch(() => undefined) ?? Promise.resolve(), delay(2_000)]);
    },
    cleanup: () => {
      stopped = true;
      clearInterval(timer);
      heartbeatController.abort();
    },
  };
}

function terminalizationController(deadlineAt: number, now: () => number): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, deadlineAt - now()));
  return { controller, cleanup: () => { clearTimeout(timer); controller.abort(); } };
}

function shouldRetry(error: DossierRuntimeError, attemptNo: number, now: () => number, deadlineAt: number, limits: DossierRuntimeLimits, retrySpentMs: number): boolean {
  if (!error.retryable || attemptNo >= limits.maxTotalAttempts || retrySpentMs >= limits.maxAggregateRetryBudgetMs) return false;
  const required = limits.retryBackoffMs + limits.retryWorkloadBudgetMs + limits.finalizationReserveMs;
  return remainingMs(now, deadlineAt) >= required;
}

function toPipelineError(error: unknown, stage: string, signal: AbortSignal, retryable = true): DossierServerPipelineError {
  if (error instanceof DossierServerPipelineError) return error;
  const normalized = normalizeError(error, stage, signal);
  return new DossierServerPipelineError(
    normalized.code === 'REQUEST_ABORTED' ? 'SERVER_PIPELINE_CANCELLED' : 'SERVER_PIPELINE_STAGE_FAILED',
    normalized.message,
    stage,
    normalized.retryable && retryable,
  );
}


/** The only production entrypoint for the server-owned generate path. */
export async function runDossierRuntime(
  auth: DossierRuntimeAuth,
  input: DossierRuntimeRequest,
  dependencies: DossierRuntimeDependencies = {},
): Promise<DossierRuntimeResult> {
  const now = dependencies.now ?? Date.now;
  const limits = mergeLimits(dependencies.limits);
  const pipelineFactory = dependencies.pipelineFactory ?? createDossierServerPipeline;
  const rpc = dependencies.rpc ?? createDossierRunRpcClient(auth);
  const startedAt = now();
  const deadlineAt = startedAt + limits.applicationDeadlineMs;
  const cutoffAt = startedAt + limits.externalCallCutoffMs;
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => deadlineController.abort(), Math.max(1, deadlineAt - now()));
  const root = linkSignals(input.signal, deadlineController.signal);
  const sleep = dependencies.sleep ?? boundedSleep;
  let retrySpentMs = 0;

  const emit = (event: string, data: Omit<Parameters<DossierRuntimeEvents>[1], 'correlationId' | 'runId'> = {}) => {
    dependencies.events?.(event, { correlationId: input.correlationId, runId: input.runId, ...data });
  };

  const callLifecycle = async <T>(
    rpcName: Parameters<DossierRunRpcCaller>[0],
    body: Record<string, unknown>,
    signal: AbortSignal,
    stage: string,
    timeoutMs = limits.finalizationRpcTimeoutMs,
  ): Promise<T> => {
    assertWithinDeadline(now, deadlineAt, signal, stage);
    return rpc<T>(rpcName, body, signal, { stage, timeoutMs: rpcTimeout(now, deadlineAt, timeoutMs) });
  };

  const callFinalization = async <T>(
    rpcName: Parameters<DossierRunRpcCaller>[0],
    body: Record<string, unknown>,
    signal: AbortSignal,
    stage: string,
  ): Promise<T> => {
    assertNotAborted(signal, stage);
    return rpc<T>(rpcName, body, signal, { stage, timeoutMs: rpcTimeout(now, deadlineAt, limits.finalizationRpcTimeoutMs) });
  };

  const finalizeCancel = async (attempt: AttemptRecord | undefined): Promise<boolean> => {
    const finalizer = terminalizationController(deadlineAt, now);
    try {
      const result = await callFinalization<Record<string, unknown>>(
        'cancel_dossier_run_attempt',
        {
          p_run_id: input.runId,
          p_attempt_id: attempt?.attempt_id ?? null,
          p_fence_token: attempt?.fence_token ?? null,
        },
        finalizer.controller.signal,
        'cancel',
      );
      return result.status === 'CANCELLED';
    } catch {
      return false;
    } finally {
      finalizer.cleanup();
    }
  };

  const finalizeFailure = async (attempt: AttemptRecord, error: DossierRuntimeError): Promise<boolean> => {
    const finalizer = terminalizationController(deadlineAt, now);
    try {
      const result = await callFinalization<Record<string, unknown>>(
        'fail_dossier_run_attempt',
        {
          p_run_id: input.runId,
          p_attempt_id: attempt.attempt_id,
          p_fence_token: attempt.fence_token,
          p_error_code: error.code,
          p_error_stage: error.stage,
        },
        finalizer.controller.signal,
        'fail',
      );
      return result.status === 'FAILED';
    } catch {
      return false;
    } finally {
      finalizer.cleanup();
    }
  };

  const executeAttempt = async (begin: AttemptRecord, resume: ResumeState): Promise<DossierRuntimeResult> => {
    const workloadController = new AbortController();
    const attemptSignal = linkSignals(root.signal, workloadController.signal);
    const heartbeat = startHeartbeat(input, auth, rpc, begin, workloadController, now, deadlineAt, cutoffAt, limits, dependencies.events);
    const checkpoints = resume.checkpoints ?? [];
    const context: AttemptContext = {
      attempt: begin,
      resume,
      resumeByStep: makeResumeMap(resume),
      nextOrdinal: checkpoints.reduce((max, item) => Math.max(max, item.step_ordinal + 1), 0),
      checkpointQueue: Promise.resolve(),
      heartbeat,
      workloadController,
    };
    let lastAdapterError: unknown;
    const enqueueCheckpoint = (kind: CheckpointPayload['kind'], stage: string, output: unknown): Promise<void> => {
      const payload: CheckpointPayload = { kind, stage, output };
      assertCheckpointSize(payload);
      const stepKey = checkpointKey(kind, stage);
      const ordinal = context.nextOrdinal++;
      const operation = context.checkpointQueue.then(async () => {
        assertBeforeCutoff(now, cutoffAt, deadlineAt, attemptSignal.signal, 'checkpoint');
        await callLifecycle(
          'record_dossier_run_checkpoint',
          {
            p_run_id: input.runId,
            p_attempt_id: begin.attempt_id,
            p_fence_token: begin.fence_token,
            p_pipeline_version: DOSSIER_SERVER_PIPELINE_VERSION,
            p_step_key: stepKey,
            p_step_ordinal: ordinal,
            p_output_payload: payload,
          },
          attemptSignal.signal,
          'checkpoint',
        );
        emit('checkpoint:confirmed', { attemptNo: begin.attempt_no, attemptId: begin.attempt_id, stepKey, remainingMs: remainingMs(now, deadlineAt) });
      });
      context.checkpointQueue = operation.catch(() => undefined);
      return operation;
    };

    const cachedLlm = (stage: string): DossierServerLlmResult | undefined => {
      const cached = context.resumeByStep.get(checkpointKey('llm', stage));
      if (!cached || cached.kind !== 'llm' || typeof cached.output !== 'object' || !cached.output) return undefined;
      const output = cached.output as Record<string, unknown>;
      return typeof output.text === 'string'
        ? {
          text: output.text,
          usage: (output.usage && typeof output.usage === 'object' ? output.usage : { promptTokens: 0, completionTokens: 0, totalTokens: 0 }) as DossierUsage,
          ...(typeof output.finishReason === 'string' ? { finishReason: output.finishReason } : {}),
        }
        : undefined;
    };

    const llm = async (llmInput: DossierServerLlmInput): Promise<DossierServerLlmResult> => {
      assertBeforeCutoff(now, cutoffAt, deadlineAt, attemptSignal.signal, llmInput.stage);
      const cached = cachedLlm(llmInput.stage);
      if (cached) return cached;
      try {
        const result = await runDossierGateway({
          mode: 'generate',
          userContent: `${SHARED_FOUNDATION_BLOCK}\n\n${llmInput.prompt}`,
          dossierContext: llmInput.context,
          signal: llmInput.signal,
          correlationId: input.correlationId,
          runId: input.runId,
          timeoutMs: Math.min(llmInput.timeoutMs, rpcTimeout(now, cutoffAt, llmInput.timeoutMs)),
        });
        const output: DossierServerLlmResult = {
          text: result.text,
          usage: {
            promptTokens: result.usage.promptTokenCount ?? 0,
            completionTokens: result.usage.candidatesTokenCount ?? 0,
            totalTokens: result.usage.totalTokenCount ?? 0,
          },
          finishReason: result.finishReason ?? 'unknown',
        };
        await enqueueCheckpoint('llm', llmInput.stage, output);
        return output;
      } catch (error) {
        lastAdapterError = error;
        throw toPipelineError(error, llmInput.stage, attemptSignal.signal);
      }
    };

    const searchEvidence = async (query: string, signal: AbortSignal): Promise<readonly DossierServerEvidenceSearchResult[]> => {
      assertBeforeCutoff(now, cutoffAt, deadlineAt, signal, 'evidence_collector');
      const cached = context.resumeByStep.get(checkpointKey('evidence_query', query));
      if (cached?.kind === 'evidence_query' && Array.isArray(cached.output)) return cached.output as DossierServerEvidenceSearchResult[];
      try {
        // The provider adapter remains explicitly unavailable until a later provider card.
        const results: readonly DossierServerEvidenceSearchResult[] = [];
        await enqueueCheckpoint('evidence_query', query, results);
        return results;
      } catch (error) {
        lastAdapterError = error;
        throw toPipelineError(error, 'evidence_collector', signal);
      }
    };

    const benchmark = async (benchmarkInput: { companyName: string; cnpj?: string; context: string; signal: AbortSignal }): Promise<string> => {
      assertBeforeCutoff(now, cutoffAt, deadlineAt, benchmarkInput.signal, 'benchmark');
      const cached = context.resumeByStep.get(checkpointKey('benchmark', 'benchmark'));
      if (cached?.kind === 'benchmark' && typeof cached.output === 'string') return cached.output;
      try {
        const output = '';
        await enqueueCheckpoint('benchmark', 'benchmark', output);
        return output;
      } catch (error) {
        lastAdapterError = error;
        throw toPipelineError(error, 'benchmark', benchmarkInput.signal);
      }
    };

    let pipelineOutput: DossierServerPipelineOutput | undefined;
    try {
      assertBeforeCutoff(now, cutoffAt, deadlineAt, attemptSignal.signal, 'helper');
      const pipeline = pipelineFactory({ llm, searchEvidence, benchmark });
      emit('helper:start', { attemptNo: begin.attempt_no, attemptId: begin.attempt_id, remainingMs: remainingMs(now, deadlineAt) });
      pipelineOutput = await pipeline({
        runId: input.runId,
        companyName: input.companyName,
        ...(input.cnpj ? { cnpj: input.cnpj } : {}),
        context: input.context,
        ...(input.evidence ? { evidence: input.evidence } : {}),
        correlationId: input.correlationId,
        signal: attemptSignal.signal,
        runtimeBudgetMs: Math.min(limits.retryWorkloadBudgetMs, Math.max(1, remainingMs(now, cutoffAt))),
      });
      await context.checkpointQueue;
      if (heartbeat.getError()) throw heartbeat.getError();
      assertWithinDeadline(now, deadlineAt, root.signal, 'persistence');
      emit('helper:complete', { attemptNo: begin.attempt_no, attemptId: begin.attempt_id, remainingMs: remainingMs(now, deadlineAt) });
    } catch (error) {
      throw normalizeError(lastAdapterError ?? error, 'helper', attemptSignal.signal);
    } finally {
      await heartbeat.stop();
      attemptSignal.cleanup();
    }

    if (!pipelineOutput) throw new DossierRuntimeError('DOSSIER_CONTENT_UNAVAILABLE', 'Pipeline sem resultado', 502, 'helper', false);
    const finalizer = terminalizationController(deadlineAt, now);
    try {
      assertNotAborted(root.signal, 'persistence');
      const persistenceInput: PersistAndCompleteDossierAttemptInput = {
        runId: input.runId,
        attemptId: begin.attempt_id,
        fenceToken: begin.fence_token,
        pipelineVersion: DOSSIER_SERVER_PIPELINE_VERSION,
        dossierId: input.runId,
        companyName: input.companyName,
        ...(input.cnpj ? { cnpj: input.cnpj } : {}),
        pipelineOutput,
        ...(input.evidence ? { evidence: input.evidence } : {}),
      };
      const persisted = await persistAndCompleteDossierRunAttempt(auth, persistenceInput, finalizer.controller.signal, rpc);
      emit('terminal:completed', { attemptNo: begin.attempt_no, attemptId: begin.attempt_id, remainingMs: remainingMs(now, deadlineAt) });
      return {
        runId: persisted.runId,
        dossierId: persisted.dossierId,
        text: pipelineOutput.text,
        usage: pipelineOutput.usage,
        finishReason: pipelineOutput.finishReason,
        status: 'COMPLETED',
        attemptNo: begin.attempt_no,
        pipelineVersion: DOSSIER_SERVER_PIPELINE_VERSION,
      };
    } finally {
      finalizer.cleanup();
    }
  };

  try {
    while (true) {
      assertWithinDeadline(now, deadlineAt, root.signal, 'begin_attempt');
      const begin = validateAttempt(
        await callLifecycle(
          'begin_dossier_run_attempt',
          { p_run_id: input.runId, p_pipeline_version: DOSSIER_SERVER_PIPELINE_VERSION, p_lease_seconds: limits.leaseSeconds },
          root.signal,
          'begin_attempt',
        ),
        input.runId,
      );
      emit('attempt:begun', { attemptNo: begin.attempt_no, attemptId: begin.attempt_id, remainingMs: remainingMs(now, deadlineAt) });
      const resume = validateResume(
        await callLifecycle(
          'get_dossier_run_resume_state',
          { p_run_id: input.runId, p_pipeline_version: DOSSIER_SERVER_PIPELINE_VERSION },
          root.signal,
          'resume',
        ),
        input.runId,
      );
      if (resume.pipeline_version && resume.pipeline_version !== DOSSIER_SERVER_PIPELINE_VERSION) {
        throw new DossierRuntimeError('PIPELINE_VERSION_MISMATCH', 'Versão de resume incompatível', 409, 'resume', false);
      }

      try {
        return await executeAttempt(begin, resume);
      } catch (error) {
        const normalized = normalizeError(error, 'runtime', root.signal);
        const cancelled = normalized.code === 'REQUEST_ABORTED' || normalized.code === 'RUN_CANCEL_REQUESTED' || input.signal.aborted || deadlineController.signal.aborted;
        if (cancelled) {
          const cancellationConfirmed = await finalizeCancel(begin);
          if (cancellationConfirmed) {
            throw new DossierRuntimeError('RUN_CANCEL_REQUESTED', 'Dossier run cancellation requested', 409, 'cancel', false, true);
          }
          throw new DossierRuntimeError('RUN_CANCELLATION_FINALIZATION_FAILED', 'Dossier run cancellation could not be finalized', 502, 'cancel', true);
        }
        if (shouldRetry(normalized, begin.attempt_no, now, deadlineAt, limits, retrySpentMs)) {
          try {
            const scheduled = await callLifecycle<Record<string, unknown>>(
              'schedule_dossier_run_retry',
              {
                p_run_id: input.runId,
                p_attempt_id: begin.attempt_id,
                p_fence_token: begin.fence_token,
                p_error_code: normalized.code,
                p_error_stage: normalized.stage,
              },
              root.signal,
              'retry_schedule',
            );
            const nextRetryAt = typeof scheduled.next_retry_at === 'string' ? Date.parse(scheduled.next_retry_at) : now() + limits.retryBackoffMs;
            const waitMs = Math.min(limits.retryBackoffMs, Math.max(0, Number.isFinite(nextRetryAt) ? nextRetryAt - now() : limits.retryBackoffMs));
            retrySpentMs += waitMs;
            emit('retry:scheduled', { attemptNo: begin.attempt_no, attemptId: begin.attempt_id, errorCode: normalized.code, remainingMs: remainingMs(now, deadlineAt) });
            await sleep(waitMs, root.signal);
            continue;
          } catch (scheduleError) {
            const scheduleFailure = normalizeError(scheduleError, 'retry_schedule', root.signal);
            await finalizeFailure(begin, scheduleFailure);
            throw normalized;
          }
        }
        await finalizeFailure(begin, normalized);
        throw normalized;
      }
    }
  } finally {
    clearTimeout(deadlineTimer);
    deadlineController.abort();
    root.cleanup();
  }
}
