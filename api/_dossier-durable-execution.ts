/**
 * Contrato local do Lote 05D.1 — execução durável de dossiê.
 *
 * Este módulo é deliberadamente puro: não importa Supabase, Vercel, fetch,
 * React ou qualquer transporte. Ele prova a máquina de estados e os invariantes
 * que um worker real precisará preservar antes de qualquer integração.
 */

export const DURABLE_EXECUTION_CONTRACT_VERSION = 'dossier-durable-execution.v1' as const;

export const DURABLE_API_CONTRACT = {
  accept: { method: 'POST', path: '/api/dossier-runs', responseStatus: 202 },
  status: { method: 'GET', path: '/api/dossier-runs/:runId', responseStatus: 200 },
  cancel: { method: 'POST', path: '/api/dossier-runs/:runId/cancel', responseStatus: 202 },
  recover: { method: 'POST', path: '/api/dossier-runs/:runId/recover', responseStatus: 202 },
} as const;

export const DURABLE_EXECUTION_MECHANISM = 'SUPABASE_POSTGRES_RUN_STATE_WORKER' as const;

export const DURABLE_MODULES = [1, 2, 3, 4, 5, 6] as const;
export type DurableModule = (typeof DURABLE_MODULES)[number];
export type DurableModuleState = `MODULE_${DurableModule}_${'RUNNING' | 'COMPLETED'}`;

export type DurableRunState =
  | 'ACCEPTED'
  | 'QUEUED'
  | 'LEASE_ACQUIRED'
  | 'LEASE_EXPIRED'
  | DurableModuleState
  | 'FINAL_CONSOLIDATION'
  | 'PERSISTING'
  | 'COMPLETED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'RETRY_WAIT'
  | 'FAILED'
  | 'RECOVERY_REQUIRED'
  | 'RESULT_AMBIGUOUS';

export type DurablePersistenceState = 'NOT_STARTED' | 'IN_FLIGHT' | 'COMMITTED' | 'AMBIGUOUS';

export type DurableExecutionErrorCode =
  | 'RUN_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'LEASE_REQUIRED'
  | 'LEASE_CONFLICT'
  | 'LEASE_EXPIRED'
  | 'MODULE_ORDER_VIOLATION'
  | 'MODULE_ALREADY_COMPLETED'
  | 'CANCELLATION_REQUESTED'
  | 'RUN_TERMINAL'
  | 'RETRY_NOT_DUE'
  | 'RESULT_RECONCILIATION_REQUIRED'
  | 'PERSISTENCE_REQUIRED';

export class DurableExecutionError extends Error {
  readonly code: DurableExecutionErrorCode;

  constructor(code: DurableExecutionErrorCode, message: string) {
    super(message);
    this.name = 'DurableExecutionError';
    this.code = code;
  }
}

export type DurableTransitionEvent =
  | 'ACCEPT'
  | 'QUEUE'
  | 'DELIVER'
  | 'LEASE_ACQUIRED'
  | 'LEASE_EXPIRED'
  | 'MODULE_STARTED'
  | 'MODULE_COMPLETED'
  | 'CONSOLIDATION_STARTED'
  | 'PERSISTENCE_STARTED'
  | 'PERSISTENCE_COMMITTED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'RETRY_SCHEDULED'
  | 'RETRY_READY'
  | 'FAILED'
  | 'WORKER_CRASHED'
  | 'RECOVERED'
  | 'RESULT_MARKED_AMBIGUOUS'
  | 'RESULT_RECONCILED';

export interface DurableTransition {
  readonly from: DurableRunState;
  readonly to: DurableRunState;
  readonly event: DurableTransitionEvent;
  readonly atMs: number;
  readonly workerId?: string;
  readonly module?: DurableModule;
}

export interface DurableRunSnapshot {
  readonly contractVersion: typeof DURABLE_EXECUTION_CONTRACT_VERSION;
  readonly mechanism: typeof DURABLE_EXECUTION_MECHANISM;
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly sessionId: string;
  readonly state: DurableRunState;
  readonly nextModule: DurableModule | null;
  readonly completedModules: readonly DurableModule[];
  readonly moduleDigests: Readonly<Partial<Record<DurableModule, string>>>;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAtMs: number | null;
  readonly deliveryCount: number;
  readonly attempt: number;
  readonly retryAtMs: number | null;
  readonly persistenceState: DurablePersistenceState;
  readonly dossierId: string | null;
  readonly lastError: { code: string; message: string } | null;
  readonly history: readonly DurableTransition[];
}

export interface DurableRunInput {
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly sessionId: string;
  readonly nowMs?: number;
}

export interface DurableExecutionMachineOptions {
  readonly now?: () => number;
  readonly leaseDurationMs?: number;
  readonly retryBackoffMs?: number;
}

const DEFAULT_LEASE_DURATION_MS = 45_000;
const DEFAULT_RETRY_BACKOFF_MS = 5_000;

function assertNonEmpty(value: string, name: string): string {
  if (!value.trim()) throw new DurableExecutionError('IDEMPOTENCY_CONFLICT', `${name} é obrigatório`);
  return value;
}

function moduleRunningState(module: DurableModule): DurableModuleState {
  return `MODULE_${module}_RUNNING`;
}

function moduleCompletedState(module: DurableModule): DurableModuleState {
  return `MODULE_${module}_COMPLETED`;
}

function isModuleRunning(state: DurableRunState): state is `MODULE_${DurableModule}_RUNNING` {
  return /^MODULE_[1-6]_RUNNING$/.test(state);
}

function isModuleCompleted(state: DurableRunState): state is `MODULE_${DurableModule}_COMPLETED` {
  return /^MODULE_[1-6]_COMPLETED$/.test(state);
}

function stateModule(state: DurableRunState): DurableModule | null {
  const match = /^MODULE_([1-6])_(?:RUNNING|COMPLETED)$/.exec(state);
  return match ? Number(match[1]) as DurableModule : null;
}

function cloneSnapshot(snapshot: DurableRunSnapshot): DurableRunSnapshot {
  return {
    ...snapshot,
    completedModules: [...snapshot.completedModules],
    moduleDigests: { ...snapshot.moduleDigests },
    lastError: snapshot.lastError ? { ...snapshot.lastError } : null,
    history: [...snapshot.history],
  };
}

export function createDurableRun(input: DurableRunInput): DurableRunSnapshot {
  return {
    contractVersion: DURABLE_EXECUTION_CONTRACT_VERSION,
    mechanism: DURABLE_EXECUTION_MECHANISM,
    runId: assertNonEmpty(input.runId, 'runId'),
    idempotencyKey: assertNonEmpty(input.idempotencyKey, 'idempotencyKey'),
    sessionId: assertNonEmpty(input.sessionId, 'sessionId'),
    state: 'ACCEPTED',
    nextModule: 1,
    completedModules: [],
    moduleDigests: {},
    leaseOwner: null,
    leaseExpiresAtMs: null,
    deliveryCount: 0,
    attempt: 0,
    retryAtMs: null,
    persistenceState: 'NOT_STARTED',
    dossierId: null,
    lastError: null,
    history: [],
  };
}

/**
 * Registro local que representa o índice único (owner_id, idempotency_key).
 * Em produção, a unicidade deve ser garantida pelo banco/RPC, não por memória.
 */
export class DurableExecutionRegistry {
  private readonly byIdempotency = new Map<string, DurableExecutionMachine>();
  private readonly byRunId = new Map<string, DurableExecutionMachine>();
  private readonly options: DurableExecutionMachineOptions;

  constructor(options: DurableExecutionMachineOptions = {}) {
    this.options = options;
  }

  accept(input: DurableRunInput): { machine: DurableExecutionMachine; created: boolean } {
    const existing = this.byIdempotency.get(input.idempotencyKey);
    if (existing) {
      if (existing.snapshot.sessionId !== input.sessionId) {
        throw new DurableExecutionError('IDEMPOTENCY_CONFLICT', 'A chave já pertence a outra sessão');
      }
      existing.recordDelivery();
      return { machine: existing, created: false };
    }
    if (this.byRunId.has(input.runId)) {
      throw new DurableExecutionError('IDEMPOTENCY_CONFLICT', 'runId já está associado a outra chave');
    }
    const machine = new DurableExecutionMachine(createDurableRun(input), this.options);
    this.byIdempotency.set(input.idempotencyKey, machine);
    this.byRunId.set(input.runId, machine);
    return { machine, created: true };
  }

  get(runId: string): DurableExecutionMachine {
    const machine = this.byRunId.get(runId);
    if (!machine) throw new DurableExecutionError('RUN_NOT_FOUND', `Run não encontrado: ${runId}`);
    return machine;
  }
}

export class DurableExecutionMachine {
  private current: DurableRunSnapshot;
  private readonly now: () => number;
  private readonly leaseDurationMs: number;
  private readonly retryBackoffMs: number;

  constructor(snapshot: DurableRunSnapshot, options: DurableExecutionMachineOptions = {}) {
    this.current = cloneSnapshot(snapshot);
    this.now = options.now ?? (() => Date.now());
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
    this.retryBackoffMs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  }

  get snapshot(): DurableRunSnapshot {
    return cloneSnapshot(this.current);
  }

  recordDelivery(): DurableRunSnapshot {
    this.current = { ...this.current, deliveryCount: this.current.deliveryCount + 1 };
    return this.snapshot;
  }

  queue(): DurableRunSnapshot {
    if (this.current.state !== 'ACCEPTED') {
      if (this.current.state === 'QUEUED') return this.snapshot;
      throw new DurableExecutionError('INVALID_TRANSITION', `Não pode enfileirar a partir de ${this.current.state}`);
    }
    return this.transition('QUEUED', 'QUEUE');
  }

  acquireLease(workerId: string): DurableRunSnapshot {
    assertNonEmpty(workerId, 'workerId');
    this.assertNotTerminal();
    if (this.current.leaseOwner && !this.leaseIsValid()) {
      this.transition('RECOVERY_REQUIRED', 'LEASE_EXPIRED', {
        leaseOwner: null,
        leaseExpiresAtMs: null,
        lastError: { code: 'LEASE_EXPIRED', message: 'Lease expirada; recuperar do último checkpoint' },
      });
    }
    if (this.current.state === 'RESULT_AMBIGUOUS') {
      throw new DurableExecutionError('RESULT_RECONCILIATION_REQUIRED', 'Resultado ambíguo exige reconciliação antes de retomar');
    }
    if (this.current.leaseOwner && this.current.leaseOwner !== workerId && this.leaseIsValid()) {
      throw new DurableExecutionError('LEASE_CONFLICT', 'Outra execução possui a lease ativa');
    }
    if (this.current.state === 'RETRY_WAIT') {
      if (this.current.retryAtMs !== null && this.now() < this.current.retryAtMs) {
        throw new DurableExecutionError('RETRY_NOT_DUE', 'Retry ainda não atingiu o backoff');
      }
      this.current = { ...this.current, state: 'QUEUED', retryAtMs: null };
    }
    if (this.current.state === 'CANCEL_REQUESTED' && this.current.leaseOwner === null) {
      return this.transition('CANCEL_REQUESTED', 'LEASE_ACQUIRED', {
        leaseOwner: workerId,
        leaseExpiresAtMs: this.now() + this.leaseDurationMs,
        attempt: this.current.attempt + 1,
      });
    }
    if (!['QUEUED', 'RECOVERY_REQUIRED'].includes(this.current.state)) {
      if (this.current.leaseOwner === workerId && this.leaseIsValid()) return this.snapshot;
      throw new DurableExecutionError('INVALID_TRANSITION', `Lease não pode iniciar em ${this.current.state}`);
    }
    return this.transition('LEASE_ACQUIRED', 'LEASE_ACQUIRED', {
      leaseOwner: workerId,
      leaseExpiresAtMs: this.now() + this.leaseDurationMs,
      attempt: this.current.attempt + 1,
      lastError: null,
    });
  }

  startNextModule(workerId: string): DurableRunSnapshot {
    this.assertLease(workerId);
    if (this.current.state === 'CANCEL_REQUESTED') throw this.cancelError();
    if (this.current.nextModule === null) {
      throw new DurableExecutionError('MODULE_ORDER_VIOLATION', 'Não há módulo pendente');
    }
    if (this.current.state !== 'LEASE_ACQUIRED' && !isModuleCompleted(this.current.state)) {
      throw new DurableExecutionError('INVALID_TRANSITION', `Módulo não pode iniciar em ${this.current.state}`);
    }
    return this.transition(moduleRunningState(this.current.nextModule), 'MODULE_STARTED', { module: this.current.nextModule });
  }

  completeModule(workerId: string, module: DurableModule, digest: string): DurableRunSnapshot {
    this.assertLease(workerId);
    assertNonEmpty(digest, 'digest');
    const completedDigest = this.current.moduleDigests[module];
    if (completedDigest) {
      if (this.current.state === moduleCompletedState(module) && completedDigest === digest) return this.snapshot;
      throw new DurableExecutionError('MODULE_ORDER_VIOLATION', `Módulo ${module} já foi concluído e não pode ser repetido`);
    }
    if (this.current.state !== moduleRunningState(module) || this.current.nextModule !== module) {
      throw new DurableExecutionError('MODULE_ORDER_VIOLATION', `Módulo ${module} não é o módulo em execução`);
    }
    const completedModules = [...this.current.completedModules, module];
    const nextModule = module === 6 ? null : (module + 1) as DurableModule;
    return this.transition(moduleCompletedState(module), 'MODULE_COMPLETED', {
      module,
      completedModules,
      nextModule,
      moduleDigests: { ...this.current.moduleDigests, [module]: digest },
    });
  }

  startConsolidation(workerId: string): DurableRunSnapshot {
    this.assertLease(workerId);
    if (!['MODULE_6_COMPLETED', 'LEASE_ACQUIRED'].includes(this.current.state) || this.current.completedModules.length !== 6) {
      throw new DurableExecutionError('MODULE_ORDER_VIOLATION', 'Consolidação exige os seis módulos confirmados');
    }
    return this.transition('FINAL_CONSOLIDATION', 'CONSOLIDATION_STARTED');
  }

  startPersistence(workerId: string): DurableRunSnapshot {
    this.assertLease(workerId);
    if (this.current.state !== 'FINAL_CONSOLIDATION') {
      throw new DurableExecutionError('PERSISTENCE_REQUIRED', 'Persistência só inicia após consolidação');
    }
    return this.transition('PERSISTING', 'PERSISTENCE_STARTED', { persistenceState: 'IN_FLIGHT' });
  }

  markPersistenceCommitted(workerId: string, dossierId: string): DurableRunSnapshot {
    this.assertLease(workerId);
    assertNonEmpty(dossierId, 'dossierId');
    if (this.current.state !== 'PERSISTING' || this.current.persistenceState !== 'IN_FLIGHT') {
      if (this.current.state === 'COMPLETED' && this.current.dossierId === dossierId) return this.snapshot;
      throw new DurableExecutionError('PERSISTENCE_REQUIRED', 'Não há persistência em andamento');
    }
    return this.transition('COMPLETED', 'PERSISTENCE_COMMITTED', {
      dossierId,
      persistenceState: 'COMMITTED',
      leaseOwner: null,
      leaseExpiresAtMs: null,
    });
  }

  requestCancel(): DurableRunSnapshot {
    this.assertNotTerminal();
    if (this.current.state === 'CANCEL_REQUESTED') return this.snapshot;
    return this.transition('CANCEL_REQUESTED', 'CANCEL_REQUESTED');
  }

  observeCancellation(workerId: string): DurableRunSnapshot {
    this.assertLease(workerId);
    if (this.current.state !== 'CANCEL_REQUESTED') {
      throw new DurableExecutionError('INVALID_TRANSITION', 'Cancelamento ainda não foi solicitado');
    }
    return this.transition('CANCELLED', 'CANCELLED', { leaseOwner: null, leaseExpiresAtMs: null });
  }

  scheduleRetry(workerId: string, errorCode: string, message: string, retryAtMs = this.now() + this.retryBackoffMs): DurableRunSnapshot {
    this.assertLease(workerId);
    if (this.current.state === 'CANCEL_REQUESTED') throw this.cancelError();
    assertNonEmpty(errorCode, 'errorCode');
    return this.transition('RETRY_WAIT', 'RETRY_SCHEDULED', {
      retryAtMs,
      lastError: { code: errorCode, message },
      leaseOwner: null,
      leaseExpiresAtMs: null,
    });
  }

  requeueAfterRetry(): DurableRunSnapshot {
    if (this.current.state !== 'RETRY_WAIT') throw new DurableExecutionError('INVALID_TRANSITION', 'Run não está aguardando retry');
    if (this.current.retryAtMs !== null && this.now() < this.current.retryAtMs) {
      throw new DurableExecutionError('RETRY_NOT_DUE', 'Retry ainda não atingiu o backoff');
    }
    return this.transition('QUEUED', 'RETRY_READY', { retryAtMs: null });
  }

  fail(workerId: string, errorCode: string, message: string): DurableRunSnapshot {
    this.assertLease(workerId);
    assertNonEmpty(errorCode, 'errorCode');
    return this.transition('FAILED', 'FAILED', {
      lastError: { code: errorCode, message },
      leaseOwner: null,
      leaseExpiresAtMs: null,
    });
  }

  crash(workerId: string, reason: string): DurableRunSnapshot {
    this.assertLease(workerId);
    assertNonEmpty(reason, 'reason');
    if (this.current.state === 'PERSISTING') {
      return this.transition('RESULT_AMBIGUOUS', 'RESULT_MARKED_AMBIGUOUS', {
        persistenceState: 'AMBIGUOUS',
        lastError: { code: 'PERSISTENCE_RESULT_AMBIGUOUS', message: reason },
        leaseOwner: null,
        leaseExpiresAtMs: null,
      });
    }
    return this.transition('RECOVERY_REQUIRED', 'WORKER_CRASHED', {
      lastError: { code: 'WORKER_CRASHED', message: reason },
      leaseOwner: null,
      leaseExpiresAtMs: null,
    });
  }

  recover(): DurableRunSnapshot {
    if (this.current.state === 'RESULT_AMBIGUOUS') {
      throw new DurableExecutionError('RESULT_RECONCILIATION_REQUIRED', 'Resultado ambíguo exige reconciliação antes de retomar');
    }
    if (this.current.state !== 'RECOVERY_REQUIRED') {
      throw new DurableExecutionError('INVALID_TRANSITION', 'Run não exige recuperação');
    }
    return this.transition('QUEUED', 'RECOVERED', { leaseOwner: null, leaseExpiresAtMs: null });
  }

  reconcilePersistedResult(result: { readonly exists: boolean; readonly dossierId?: string }): DurableRunSnapshot {
    if (this.current.state !== 'RESULT_AMBIGUOUS') {
      throw new DurableExecutionError('RESULT_RECONCILIATION_REQUIRED', 'Run não possui resultado ambíguo');
    }
    if (result.exists) {
      const dossierId = assertNonEmpty(result.dossierId ?? '', 'dossierId');
      return this.transition('COMPLETED', 'RESULT_RECONCILED', {
        dossierId,
        persistenceState: 'COMMITTED',
        leaseOwner: null,
        leaseExpiresAtMs: null,
      });
    }
    return this.transition('QUEUED', 'RESULT_RECONCILED', {
      persistenceState: 'NOT_STARTED',
      leaseOwner: null,
      leaseExpiresAtMs: null,
    });
  }

  private assertNotTerminal(): void {
    if (['COMPLETED', 'CANCELLED', 'FAILED'].includes(this.current.state)) {
      throw new DurableExecutionError('RUN_TERMINAL', `Run terminal: ${this.current.state}`);
    }
  }

  private assertLease(workerId: string): void {
    this.assertNotTerminal();
    if (this.current.leaseOwner !== workerId) {
      throw new DurableExecutionError('LEASE_REQUIRED', 'Worker não possui a lease do run');
    }
    if (!this.leaseIsValid()) {
      throw new DurableExecutionError('LEASE_EXPIRED', 'Lease do worker expirou');
    }
  }

  private leaseIsValid(): boolean {
    return this.current.leaseOwner !== null
      && this.current.leaseExpiresAtMs !== null
      && this.current.leaseExpiresAtMs > this.now();
  }

  private cancelError(): DurableExecutionError {
    return new DurableExecutionError('CANCELLATION_REQUESTED', 'Cancelamento solicitado antes de nova etapa');
  }

  private transition(
    state: DurableRunState,
    event: DurableTransitionEvent,
    patch: Partial<DurableRunSnapshot> & { module?: DurableModule } = {},
  ): DurableRunSnapshot {
    const { module, ...snapshotPatch } = patch;
    const transition: DurableTransition = {
      from: this.current.state,
      to: state,
      event,
      atMs: this.now(),
      ...(module ? { module } : {}),
      ...(this.current.leaseOwner ? { workerId: this.current.leaseOwner } : {}),
    };
    this.current = {
      ...this.current,
      ...snapshotPatch,
      state,
      history: [...this.current.history, transition],
    };
    return this.snapshot;
  }
}

export function isTerminalDurableState(state: DurableRunState): boolean {
  return state === 'COMPLETED' || state === 'CANCELLED' || state === 'FAILED';
}

export function isSafeToRetry(state: DurableRunState): boolean {
  return state === 'QUEUED' || state === 'RETRY_WAIT' || state === 'RECOVERY_REQUIRED';
}

export function getLastCompletedModule(snapshot: DurableRunSnapshot): DurableModule | null {
  return snapshot.completedModules.length > 0
    ? snapshot.completedModules[snapshot.completedModules.length - 1]
    : null;
}

export function getCurrentModule(snapshot: DurableRunSnapshot): DurableModule | null {
  return isModuleRunning(snapshot.state) ? stateModule(snapshot.state) : snapshot.nextModule;
}

export function isModuleExecutionState(state: DurableRunState): boolean {
  return isModuleRunning(state) || isModuleCompleted(state);
}
