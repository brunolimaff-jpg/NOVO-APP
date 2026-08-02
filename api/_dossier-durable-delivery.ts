/**
 * 05D.2A — desenho local da entrega durável, identidade do worker e
 * checkpoints. Nenhum transporte ou banco é acessado neste arquivo.
 */

export const DURABLE_DELIVERY_RUNTIME = 'VERCEL_CRON_POLLING_SERVERLESS_WORKER' as const;
export const DURABLE_DELIVERY_TRIGGER = 'VERCEL_CRON_POLLING' as const;
export const DURABLE_WORKER_IDENTITY = 'DEDICATED_WORKER_SECRET_RESTRICTED_RPCS' as const;
export const DURABLE_USER_TOKEN_PERSISTENCE = 'PROHIBITED' as const;

export const DURABLE_DELIVERY_DESIGN = {
  runtime: DURABLE_DELIVERY_RUNTIME,
  trigger: DURABLE_DELIVERY_TRIGGER,
  targetSchedule: '* * * * *',
  scheduleStatus: 'DESIGN_ONLY_PLAN_LIMIT_UNVERIFIED',
  maxClaimsPerTick: 1,
  atLeastOnce: true,
  abandonedLeaseRecovery: true,
  maxAttempts: 3,
  deadLetterEquivalent: 'FAILED_RETRY_EXHAUSTED',
  workerIdentity: DURABLE_WORKER_IDENTITY,
  userTokenPersistence: DURABLE_USER_TOKEN_PERSISTENCE,
} as const;

export const DURABLE_CHECKPOINT_SCHEMA = {
  table: 'dossier_run_checkpoints',
  primaryKey: ['run_id', 'step_key'],
  columns: [
    'run_id',
    'step_key',
    'step_order',
    'status',
    'attempt',
    'input_digest',
    'output_digest',
    'output_payload',
    'next_attempt_at',
    'error_code',
    'error_stage',
    'worker_id',
    'lease_expires_at',
    'pipeline_version',
    'created_at',
    'started_at',
    'completed_at',
    'updated_at',
  ],
  statuses: ['PENDING', 'RUNNING', 'COMPLETED', 'RETRY_WAIT', 'CANCEL_REQUESTED', 'CANCELLED', 'FAILED', 'AMBIGUOUS'],
  sensitivePayloadPolicy: 'worker_rpc_only_redacted_bounded_retention',
  uniqueConstraints: ['(run_id, step_key)', '(run_id, step_order)'],
} as const;

export const DURABLE_WORKER_RPC_CONTRACT = [
  'enqueue_dossier_work',
  'claim_dossier_work',
  'renew_dossier_work',
  'checkpoint_dossier_work',
  'schedule_dossier_retry',
  'request_dossier_work_cancel',
  'mark_dossier_work_cancelled',
  'mark_dossier_work_failed',
  'reconcile_dossier_work_result',
  'persist_and_complete_dossier_run_worker',
] as const;

export type DeliveryWorkStatus = (typeof DURABLE_CHECKPOINT_SCHEMA.statuses)[number];

export interface DeliveryWorkItem {
  readonly runId: string;
  readonly stepKey: string;
  readonly stepOrder: number;
  readonly pipelineVersion: string;
  readonly status: DeliveryWorkStatus;
  readonly attempt: number;
  readonly workerId: string | null;
  readonly leaseExpiresAtMs: number | null;
  readonly nextAttemptAtMs: number | null;
  readonly inputDigest: string | null;
  readonly outputDigest: string | null;
  readonly errorCode: string | null;
  readonly errorStage: string | null;
  readonly cancelRequested: boolean;
}

export type DeliveryErrorCode =
  | 'WORK_NOT_FOUND'
  | 'WORK_ALREADY_EXISTS'
  | 'CLAIM_CONFLICT'
  | 'CLAIM_NOT_DUE'
  | 'CHECKPOINT_OWNER_REQUIRED'
  | 'CHECKPOINT_ATTEMPT_CONFLICT'
  | 'WORK_TERMINAL'
  | 'CANCEL_REQUESTED'
  | 'RETRY_EXHAUSTED';

export class DurableDeliveryError extends Error {
  readonly code: DeliveryErrorCode;

  constructor(code: DeliveryErrorCode, message: string) {
    super(message);
    this.name = 'DurableDeliveryError';
    this.code = code;
  }
}

export interface DurableDeliveryHarnessOptions {
  readonly now?: () => number;
  readonly leaseDurationMs?: number;
  readonly maxAttempts?: number;
}

function requireText(value: string, label: string): string {
  if (!value.trim()) throw new DurableDeliveryError('WORK_NOT_FOUND', `${label} é obrigatório`);
  return value;
}

function cloneItem(item: DeliveryWorkItem): DeliveryWorkItem {
  return { ...item };
}

/**
 * Modelo síncrono do claim transacional `FOR UPDATE SKIP LOCKED`.
 * A ordem das chamadas é determinística para provar exclusão entre workers.
 */
export class DurableDeliveryHarness {
  private readonly items = new Map<string, DeliveryWorkItem>();
  private readonly runCancellation = new Set<string>();
  private readonly now: () => number;
  private readonly leaseDurationMs: number;
  private readonly maxAttempts: number;

  constructor(options: DurableDeliveryHarnessOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.leaseDurationMs = options.leaseDurationMs ?? 60_000;
    this.maxAttempts = options.maxAttempts ?? DURABLE_DELIVERY_DESIGN.maxAttempts;
  }

  enqueue(runId: string, stepKey: string, stepOrder: number, pipelineVersion = 'unknown'): DeliveryWorkItem {
    requireText(runId, 'runId');
    requireText(stepKey, 'stepKey');
    if (this.items.has(this.key(runId, stepKey))) {
      throw new DurableDeliveryError('WORK_ALREADY_EXISTS', 'O checkpoint único já existe');
    }
    const item: DeliveryWorkItem = {
      runId,
      stepKey,
      stepOrder,
      pipelineVersion,
      status: 'PENDING',
      attempt: 0,
      workerId: null,
      leaseExpiresAtMs: null,
      nextAttemptAtMs: null,
      inputDigest: null,
      outputDigest: null,
      errorCode: null,
      errorStage: null,
      cancelRequested: false,
    };
    this.items.set(this.key(runId, stepKey), item);
    return cloneItem(item);
  }

  get(runId: string, stepKey: string): DeliveryWorkItem {
    const item = this.items.get(this.key(runId, stepKey));
    if (!item) throw new DurableDeliveryError('WORK_NOT_FOUND', 'Checkpoint não encontrado');
    return cloneItem(item);
  }

  claimNext(workerId: string): DeliveryWorkItem | null {
    requireText(workerId, 'workerId');
    const candidate = [...this.items.values()]
      .filter(item => this.eligible(item))
      .sort((left, right) => left.stepOrder - right.stepOrder)[0];
    if (!candidate) return null;
    const claimed: DeliveryWorkItem = {
      ...candidate,
      status: 'RUNNING',
      attempt: candidate.attempt + 1,
      workerId,
      leaseExpiresAtMs: this.now() + this.leaseDurationMs,
      nextAttemptAtMs: null,
      errorCode: null,
      errorStage: null,
    };
    this.items.set(this.key(candidate.runId, candidate.stepKey), claimed);
    return cloneItem(claimed);
  }

  renew(runId: string, stepKey: string, workerId: string): DeliveryWorkItem {
    const item = this.requireOwned(runId, stepKey, workerId);
    const renewed: DeliveryWorkItem = { ...item, leaseExpiresAtMs: this.now() + this.leaseDurationMs };
    this.items.set(this.key(runId, stepKey), renewed);
    return cloneItem(renewed);
  }

  checkpoint(
    runId: string,
    stepKey: string,
    workerId: string,
    attempt: number,
    inputDigest: string,
    outputDigest: string,
  ): DeliveryWorkItem {
    const item = this.requireOwned(runId, stepKey, workerId);
    if (item.attempt !== attempt) {
      throw new DurableDeliveryError('CHECKPOINT_ATTEMPT_CONFLICT', 'Tentativa não corresponde ao claim atual');
    }
    if (item.cancelRequested || this.runCancellation.has(runId)) {
      throw new DurableDeliveryError('CANCEL_REQUESTED', 'Cancelamento solicitado antes do checkpoint');
    }
    const completed: DeliveryWorkItem = {
      ...item,
      status: 'COMPLETED',
      inputDigest: requireText(inputDigest, 'inputDigest'),
      outputDigest: requireText(outputDigest, 'outputDigest'),
      workerId: null,
      leaseExpiresAtMs: null,
    };
    this.items.set(this.key(runId, stepKey), completed);
    return cloneItem(completed);
  }

  scheduleRetry(runId: string, stepKey: string, workerId: string, errorCode: string, nextAttemptAtMs: number): DeliveryWorkItem {
    const item = this.requireOwned(runId, stepKey, workerId);
    requireText(errorCode, 'errorCode');
    if (item.attempt >= this.maxAttempts) {
      const failed: DeliveryWorkItem = {
        ...item,
        status: 'FAILED',
        errorCode: 'RETRY_EXHAUSTED',
        errorStage: errorCode,
        workerId: null,
        leaseExpiresAtMs: null,
      };
      this.items.set(this.key(runId, stepKey), failed);
      return cloneItem(failed);
    }
    const retry: DeliveryWorkItem = {
      ...item,
      status: 'RETRY_WAIT',
      nextAttemptAtMs,
      errorCode,
      errorStage: stepKey,
      workerId: null,
      leaseExpiresAtMs: null,
    };
    this.items.set(this.key(runId, stepKey), retry);
    return cloneItem(retry);
  }

  requestCancel(runId: string): void {
    this.runCancellation.add(requireText(runId, 'runId'));
    for (const [key, item] of this.items.entries()) {
      if (item.runId !== runId || item.status === 'COMPLETED' || item.status === 'FAILED' || item.status === 'CANCELLED') continue;
      this.items.set(key, { ...item, cancelRequested: true, status: item.status === 'PENDING' ? 'CANCEL_REQUESTED' : item.status });
    }
  }

  markCancelled(runId: string, stepKey: string, workerId: string): DeliveryWorkItem {
    const item = this.requireOwned(runId, stepKey, workerId);
    if (!item.cancelRequested && !this.runCancellation.has(runId)) {
      throw new DurableDeliveryError('CANCEL_REQUESTED', 'Cancelamento ainda não foi solicitado');
    }
    const cancelled: DeliveryWorkItem = { ...item, status: 'CANCELLED', workerId: null, leaseExpiresAtMs: null };
    this.items.set(this.key(runId, stepKey), cancelled);
    return cloneItem(cancelled);
  }

  private eligible(item: DeliveryWorkItem): boolean {
    if (this.runCancellation.has(item.runId) || item.cancelRequested) return false;
    if (item.status === 'PENDING') return true;
    if (item.status === 'RETRY_WAIT') return item.nextAttemptAtMs !== null && item.nextAttemptAtMs <= this.now();
    return item.status === 'RUNNING' && item.leaseExpiresAtMs !== null && item.leaseExpiresAtMs <= this.now();
  }

  private requireOwned(runId: string, stepKey: string, workerId: string): DeliveryWorkItem {
    const item = this.items.get(this.key(runId, stepKey));
    if (!item) throw new DurableDeliveryError('WORK_NOT_FOUND', 'Checkpoint não encontrado');
    if (item.status === 'COMPLETED' || item.status === 'FAILED' || item.status === 'CANCELLED') {
      throw new DurableDeliveryError('WORK_TERMINAL', `Checkpoint terminal: ${item.status}`);
    }
    if (item.workerId !== workerId) throw new DurableDeliveryError('CHECKPOINT_OWNER_REQUIRED', 'Worker não possui o claim');
    if (item.leaseExpiresAtMs === null || item.leaseExpiresAtMs <= this.now()) {
      throw new DurableDeliveryError('CLAIM_CONFLICT', 'Claim expirado');
    }
    return item;
  }

  private key(runId: string, stepKey: string): string {
    return `${runId}:${stepKey}`;
  }
}
