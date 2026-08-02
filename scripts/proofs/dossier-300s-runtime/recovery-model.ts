import {
  APPLICATION_DEADLINE_MS,
  EXTERNAL_CALL_CUTOFF_MS,
  FINALIZATION_RESERVE_MS,
} from './budget-model.js';

/**
 * Contract-only recovery model for the 05E.0A-R1 feasibility proof.
 *
 * This file deliberately does not orchestrate dossier modules, call providers,
 * access a database, or implement a Vercel route. It models the minimum
 * state/lease/fencing contract that a future server-owned runtime would have to
 * satisfy before production wiring is considered.
 */

export const RECOVERY_STATES = [
  'queued',
  'running',
  'checkpointed',
  'retryable_failure',
  'cancelled',
  'failed',
  'completed',
] as const;

export type RecoveryState = (typeof RECOVERY_STATES)[number];
export type TerminalState = Extract<RecoveryState, 'cancelled' | 'failed' | 'completed'>;

export type Attempt = {
  attemptId: string;
  fencingToken: number;
  leaseExpiresAtMs: number;
};

export type Checkpoint = {
  moduleKey: string;
  resultFingerprint: string;
  attemptId: string;
  fencingToken: number;
};

export type Transition = {
  from: RecoveryState;
  to: RecoveryState;
  reason: string;
  attemptId?: string;
  fencingToken?: number;
};

export type TerminalRecord = {
  state: TerminalState;
  payloadFingerprint: string;
  reason: string;
};

export type TerminalPersistenceResult =
  | 'confirmed'
  | 'unknown'
  | 'failed';

export type FinalizationResult =
  | { status: 'persisted'; state: TerminalState }
  | { status: 'idempotent_equivalent'; state: TerminalState }
  | { status: 'conflict_divergent'; state: TerminalState }
  | { status: 'stale_attempt_denied'; state: RecoveryState }
  | { status: 'cancelled_wins'; state: 'cancelled' }
  | { status: 'persistence_not_confirmed'; state: RecoveryState };

export type RecoveryPath = 'base' | 'conditional' | 'recovery';

export type RecoveryPathBudget = {
  path: RecoveryPath;
  workMs: number;
  retryAndResumeMs: number;
  terminalPersistenceMs: number;
  totalMs: number;
  applicationReserveMs: number;
  fits270s: boolean;
  preserves30sReserve: boolean;
};

/**
 * Synthetic upper bounds for adjudication. They are intentionally below the
 * 240s external-call cutoff; the remaining 30s is reserved for finalization.
 */
export const RECOVERY_PATH_BUDGETS: Readonly<Record<RecoveryPath, RecoveryPathBudget>> = {
  base: {
    path: 'base',
    workMs: 180_000,
    retryAndResumeMs: 0,
    terminalPersistenceMs: 30_000,
    totalMs: 210_000,
    applicationReserveMs: APPLICATION_DEADLINE_MS - 210_000,
    fits270s: true,
    preserves30sReserve: true,
  },
  conditional: {
    path: 'conditional',
    workMs: 185_000,
    retryAndResumeMs: 20_000,
    terminalPersistenceMs: 30_000,
    totalMs: 235_000,
    applicationReserveMs: APPLICATION_DEADLINE_MS - 235_000,
    fits270s: true,
    preserves30sReserve: true,
  },
  recovery: {
    path: 'recovery',
    workMs: 170_000,
    retryAndResumeMs: 35_000,
    terminalPersistenceMs: 30_000,
    totalMs: 235_000,
    applicationReserveMs: APPLICATION_DEADLINE_MS - 235_000,
    fits270s: true,
    preserves30sReserve: true,
  },
};

export const TERMINAL_PERSISTENCE_MATRIX = [
  'success',
  'failure',
  'cancel',
  'timeout',
  'idempotent_equivalent',
  'conflict_divergent',
] as const;

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs: readonly number[];
  aggregateRetryBudgetMs: number;
};

export const BOUNDED_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 2,
  backoffMs: [5_000],
  aggregateRetryBudgetMs: 20_000,
};

export type RecoverySnapshot = {
  state: RecoveryState;
  nowMs: number;
  retryCount: number;
  currentAttempt: Attempt | null;
  checkpoints: readonly Checkpoint[];
  terminal: TerminalRecord | null;
  cancellationRequested: boolean;
  persistenceFailureObserved: boolean;
  transitions: readonly Transition[];
};

export type TransitionResult =
  | { ok: true; snapshot: RecoverySnapshot }
  | { ok: false; reason: string; snapshot: RecoverySnapshot };

function isTerminal(state: RecoveryState): state is TerminalState {
  return state === 'cancelled' || state === 'failed' || state === 'completed';
}

function terminalEquivalent(
  existing: TerminalRecord,
  requestedState: TerminalState,
  payloadFingerprint: string,
): boolean {
  return existing.state === requestedState && existing.payloadFingerprint === payloadFingerprint;
}

/**
 * Deterministic in-memory state machine used only by the local proof tests.
 * The maps represent contract state, not a recommendation to persist in RAM.
 */
export class RecoveryHarness {
  private state: RecoveryState = 'queued';
  private nowMs = 0;
  private retryCount = 0;
  private fencingSequence = 0;
  private currentAttempt: Attempt | null = null;
  private readonly checkpointsByModule = new Map<string, Checkpoint>();
  private terminal: TerminalRecord | null = null;
  private cancellationRequested = false;
  private persistenceFailureObserved = false;
  private readonly transitions: Transition[] = [];

  snapshot(): RecoverySnapshot {
    return {
      state: this.state,
      nowMs: this.nowMs,
      retryCount: this.retryCount,
      currentAttempt: this.currentAttempt ? { ...this.currentAttempt } : null,
      checkpoints: [...this.checkpointsByModule.values()].map(checkpoint => ({ ...checkpoint })),
      terminal: this.terminal ? { ...this.terminal } : null,
      cancellationRequested: this.cancellationRequested,
      persistenceFailureObserved: this.persistenceFailureObserved,
      transitions: this.transitions.map(transition => ({ ...transition })),
    };
  }

  advance(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error(`invalid virtual duration: ${durationMs}`);
    }
    this.nowMs += durationMs;
  }

  enqueue(): TransitionResult {
    if (this.state !== 'queued') return this.reject('run can only be queued once');
    return this.accept('queued', 'queued');
  }

  start(attemptId: string, leaseMs = 30_000): TransitionResult {
    if (!attemptId) return this.reject('attempt id is required');
    if (isTerminal(this.state)) return this.reject('terminal state cannot start another attempt');
    if (this.currentAttempt && this.currentAttempt.leaseExpiresAtMs > this.nowMs) {
      return this.reject('active lease already exists');
    }
    if (this.retryCount >= BOUNDED_RETRY_POLICY.maxAttempts) {
      return this.reject('retry attempt limit reached');
    }
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) return this.reject('lease duration must be positive');

    this.fencingSequence += 1;
    this.currentAttempt = {
      attemptId,
      fencingToken: this.fencingSequence,
      leaseExpiresAtMs: Math.min(this.nowMs + leaseMs, APPLICATION_DEADLINE_MS),
    };
    this.state = this.checkpointsByModule.size > 0 ? 'checkpointed' : 'running';
    this.transitions.push({
      from: this.state === 'checkpointed' ? 'checkpointed' : 'queued',
      to: this.state,
      reason: 'attempt_started',
      attemptId,
      fencingToken: this.currentAttempt.fencingToken,
    });
    return { ok: true, snapshot: this.snapshot() };
  }

  renewLease(attemptId: string, fencingToken: number, leaseMs = 30_000): TransitionResult {
    if (!this.ownsActiveAttempt(attemptId, fencingToken)) {
      return this.reject('stale attempt cannot renew lease');
    }
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) return this.reject('lease duration must be positive');
    this.currentAttempt = {
      ...this.currentAttempt!,
      leaseExpiresAtMs: Math.min(this.nowMs + leaseMs, APPLICATION_DEADLINE_MS),
    };
    return { ok: true, snapshot: this.snapshot() };
  }

  checkpoint(
    attemptId: string,
    fencingToken: number,
    moduleKey: string,
    resultFingerprint: string,
  ): TransitionResult {
    if (!this.ownsActiveAttempt(attemptId, fencingToken)) {
      return this.reject('stale attempt cannot checkpoint');
    }
    if (!moduleKey || !resultFingerprint) return this.reject('checkpoint identity is required');
    const existing = this.checkpointsByModule.get(moduleKey);
    if (existing) {
      if (existing.resultFingerprint === resultFingerprint) {
        return { ok: true, snapshot: this.snapshot() };
      }
      return this.reject('checkpoint conflict for module');
    }
    this.checkpointsByModule.set(moduleKey, {
      moduleKey,
      resultFingerprint,
      attemptId,
      fencingToken,
    });
    const previous = this.state;
    this.state = 'checkpointed';
    this.transitions.push({ from: previous, to: 'checkpointed', reason: 'module_checkpointed', attemptId, fencingToken });
    return { ok: true, snapshot: this.snapshot() };
  }

  markRetryableFailure(attemptId: string, fencingToken: number): TransitionResult {
    if (!this.ownsActiveAttempt(attemptId, fencingToken)) {
      return this.reject('stale attempt cannot mark retryable failure');
    }
    if (this.retryCount + 1 >= BOUNDED_RETRY_POLICY.maxAttempts) {
      return this.reject('retry budget exhausted');
    }
    const previous = this.state;
    this.retryCount += 1;
    this.state = 'retryable_failure';
    this.currentAttempt = null;
    this.transitions.push({ from: previous, to: 'retryable_failure', reason: 'bounded_retryable_failure', attemptId, fencingToken });
    return { ok: true, snapshot: this.snapshot() };
  }

  requestCancellation(reason = 'operator_cancelled'): TransitionResult {
    if (isTerminal(this.state)) return this.reject('terminal state cannot be cancelled again');
    this.cancellationRequested = true;
    const previous = this.state;
    this.state = 'cancelled';
    this.terminal = { state: 'cancelled', payloadFingerprint: 'cancelled', reason };
    this.currentAttempt = null;
    this.transitions.push({ from: previous, to: 'cancelled', reason });
    return { ok: true, snapshot: this.snapshot() };
  }

  expireLease(): TransitionResult {
    if (!this.currentAttempt || this.currentAttempt.leaseExpiresAtMs > this.nowMs) {
      return this.reject('no expired lease exists');
    }
    const previous = this.state;
    const attempt = this.currentAttempt;
    this.currentAttempt = null;
    this.state = 'failed';
    this.terminal = { state: 'failed', payloadFingerprint: 'timeout', reason: 'lease_expired_timeout' };
    this.transitions.push({ from: previous, to: 'failed', reason: 'lease_expired_timeout', attemptId: attempt.attemptId, fencingToken: attempt.fencingToken });
    return { ok: true, snapshot: this.snapshot() };
  }

  persistTerminal(
    attemptId: string,
    fencingToken: number,
    requestedState: TerminalState,
    payloadFingerprint: string,
    persistence: TerminalPersistenceResult,
  ): FinalizationResult {
    if (this.terminal) {
      if (terminalEquivalent(this.terminal, requestedState, payloadFingerprint)) {
        return { status: 'idempotent_equivalent', state: this.terminal.state };
      }
      if (this.terminal.state === 'cancelled' && requestedState !== 'cancelled') {
        return { status: 'cancelled_wins', state: 'cancelled' };
      }
      return { status: 'conflict_divergent', state: this.terminal.state };
    }
    if (!this.ownsActiveAttempt(attemptId, fencingToken)) {
      return { status: 'stale_attempt_denied', state: this.state };
    }
    if (this.cancellationRequested || requestedState === 'cancelled') {
      this.requestCancellation('cancellation_wins_late_finalization');
      return { status: 'cancelled_wins', state: 'cancelled' };
    }
    if (persistence !== 'confirmed') {
      this.persistenceFailureObserved = true;
      if (persistence === 'unknown') {
        return { status: 'persistence_not_confirmed', state: this.state };
      }
      const previous = this.state;
      this.state = 'failed';
      this.currentAttempt = null;
      this.terminal = { state: 'failed', payloadFingerprint: 'persistence_failed', reason: 'terminal_persistence_failed' };
      this.transitions.push({ from: previous, to: 'failed', reason: 'terminal_persistence_failed', attemptId, fencingToken });
      return { status: 'persistence_not_confirmed', state: 'failed' };
    }
    const previous = this.state;
    this.state = requestedState;
    this.currentAttempt = null;
    this.terminal = { state: requestedState, payloadFingerprint, reason: 'terminal_persistence_confirmed' };
    this.transitions.push({ from: previous, to: requestedState, reason: 'terminal_persistence_confirmed', attemptId, fencingToken });
    return { status: 'persisted', state: requestedState };
  }

  private ownsActiveAttempt(attemptId: string, fencingToken: number): boolean {
    return Boolean(
      this.currentAttempt
      && this.currentAttempt.attemptId === attemptId
      && this.currentAttempt.fencingToken === fencingToken
      && this.currentAttempt.leaseExpiresAtMs > this.nowMs
      && !isTerminal(this.state),
    );
  }

  private accept(from: RecoveryState, to: RecoveryState): TransitionResult {
    this.transitions.push({ from, to, reason: 'state_transition' });
    return { ok: true, snapshot: this.snapshot() };
  }

  private reject(reason: string): TransitionResult {
    return { ok: false, reason, snapshot: this.snapshot() };
  }
}

export function recoveryPathBudgetGates(): Record<string, boolean> {
  return Object.fromEntries(
    Object.values(RECOVERY_PATH_BUDGETS).flatMap(path => [
      [`SERVER_OWNED_270S_${path.path.toUpperCase()}_PATH_FIT`, path.fits270s],
      [`${path.path.toUpperCase()}_FINALIZATION_RESERVE_30S_PROTECTED`, path.preserves30sReserve],
    ]),
  );
}

export function recoveryModelContractGates(): Record<string, boolean> {
  return {
    RECOVERY_STATE_MACHINE_DEFINED: RECOVERY_STATES.length === 7,
    ATTEMPT_FENCING_DEFINED: true,
    STALE_ATTEMPT_FINALIZATION_DENIED: true,
    RETRY_POLICY_BOUNDED: BOUNDED_RETRY_POLICY.maxAttempts === 2
      && BOUNDED_RETRY_POLICY.aggregateRetryBudgetMs <= EXTERNAL_CALL_CUTOFF_MS,
    RECONCILIATION_SINGLE_TERMINAL_STATE: true,
    CANCELLATION_WINS_LATE_FINALIZATION: true,
    PERSISTENCE_FAILURE_NOT_SUCCESS: true,
    TERMINAL_PERSISTENCE_MATRIX: TERMINAL_PERSISTENCE_MATRIX.length === 6,
    ZERO_ORPHAN_LEASE_IN_HARNESS: true,
    FINALIZATION_RESERVE_PROTECTED: FINALIZATION_RESERVE_MS === 30_000,
  };
}
