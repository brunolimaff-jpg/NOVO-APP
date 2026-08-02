export const PLATFORM_HARD_CAP_MS = 300_000;
export const APPLICATION_DEADLINE_MS = 270_000;
export const FINALIZATION_RESERVE_MS = 30_000;
export const EXTERNAL_CALL_CUTOFF_MS = APPLICATION_DEADLINE_MS - FINALIZATION_RESERVE_MS;

export type VirtualClock = {
  now: () => number;
  advance: (durationMs: number) => void;
};

export function createVirtualClock(startMs = 0): VirtualClock {
  let currentMs = startMs;
  return {
    now: () => currentMs,
    advance: durationMs => {
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        throw new Error(`invalid virtual duration: ${durationMs}`);
      }
      currentMs += durationMs;
    },
  };
}

export type BudgetStage = {
  name: string;
  kind: 'external' | 'internal' | 'finalization';
  expectedMs: number;
  hardTimeoutMs: number;
  retryBudgetMs: number;
  bodyReadMs: number;
};

export type BudgetEvent = BudgetStage & {
  startedAtMs: number;
  endedAtMs: number;
  cumulativeBudgetMs: number;
  remainingFinalizationReserveMs: number;
  status: 'COMPLETED' | 'REJECTED_NO_BUDGET' | 'ABORTED' | 'AMBIGUOUS';
};

export type BudgetState = {
  clock: VirtualClock;
  events: BudgetEvent[];
  leaseAcquired: boolean;
  leaseReleased: boolean;
  persistenceConfirmed: boolean;
  completed: boolean;
  reconciled: boolean;
  responseAccepted: boolean;
  aborted: boolean;
};

export function createBudgetState(clock = createVirtualClock()): BudgetState {
  return {
    clock,
    events: [],
    leaseAcquired: false,
    leaseReleased: false,
    persistenceConfirmed: false,
    completed: false,
    reconciled: false,
    responseAccepted: false,
    aborted: false,
  };
}

export function remainingApplicationBudget(nowMs: number): number {
  return Math.max(0, APPLICATION_DEADLINE_MS - nowMs);
}

export function remainingExternalBudget(nowMs: number): number {
  return Math.max(0, EXTERNAL_CALL_CUTOFF_MS - nowMs);
}

export function childTimeoutBoundedByRemainingBudget(requestedMs: number, nowMs: number): number {
  if (!Number.isFinite(requestedMs) || requestedMs < 0) return 0;
  return Math.min(requestedMs, remainingExternalBudget(nowMs));
}

export function canStartExternalCall(totalExpectedMs: number, nowMs: number): boolean {
  return Number.isFinite(totalExpectedMs) && totalExpectedMs >= 0 && nowMs + totalExpectedMs <= EXTERNAL_CALL_CUTOFF_MS;
}

export function recordStage(state: BudgetState, stage: BudgetStage, status: BudgetEvent['status'] = 'COMPLETED'): BudgetEvent {
  const startedAtMs = state.clock.now();
  const totalMs = stage.expectedMs + stage.bodyReadMs + stage.retryBudgetMs;
  const allowed = stage.kind === 'external' ? canStartExternalCall(totalMs, startedAtMs) : startedAtMs + totalMs <= APPLICATION_DEADLINE_MS;
  const effectiveStatus = status === 'COMPLETED' && !allowed ? 'REJECTED_NO_BUDGET' : status;
  if (effectiveStatus === 'COMPLETED') state.clock.advance(totalMs);
  const endedAtMs = state.clock.now();
  const event: BudgetEvent = {
    ...stage,
    startedAtMs,
    endedAtMs,
    cumulativeBudgetMs: endedAtMs,
    remainingFinalizationReserveMs: Math.max(0, EXTERNAL_CALL_CUTOFF_MS - endedAtMs),
    status: effectiveStatus,
  };
  state.events.push(event);
  return event;
}

export function acquireLease(state: BudgetState): void {
  state.leaseAcquired = true;
}

export function releaseLease(state: BudgetState): void {
  if (state.leaseAcquired) state.leaseReleased = true;
}

export function markPersistence(state: BudgetState, result: 'CONFIRMED' | 'UNKNOWN' | 'FAILED'): void {
  if (result === 'CONFIRMED') state.persistenceConfirmed = true;
  if (result === 'UNKNOWN') {
    state.reconciled = true;
    state.completed = false;
  }
  if (result === 'FAILED') state.completed = false;
}

export function acceptResponse(state: BudgetState): boolean {
  if (state.clock.now() > APPLICATION_DEADLINE_MS || !state.persistenceConfirmed || state.aborted) {
    state.responseAccepted = false;
    return false;
  }
  state.responseAccepted = true;
  state.completed = true;
  return true;
}

export function abortRequest(state: BudgetState): void {
  state.aborted = true;
  state.completed = false;
  releaseLease(state);
}

export function sanitizeLogPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const forbidden = /prompt|content|token|secret|authorization|api.?key|body/i;
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !forbidden.test(key)));
}

export function assertNoOrphanLease(state: BudgetState): boolean {
  return !state.leaseAcquired || state.leaseReleased;
}
