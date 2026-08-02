import { describe, expect, it } from 'vitest';
import {
  BOUNDED_RETRY_POLICY,
  RECOVERY_PATH_BUDGETS,
  RECOVERY_STATES,
  RecoveryHarness,
  TERMINAL_PERSISTENCE_MATRIX,
  recoveryModelContractGates,
  recoveryPathBudgetGates,
} from '../../../scripts/proofs/dossier-300s-runtime/recovery-model';

describe('05E.0A-R1 — recovery/reconciliação/persistência contratual', () => {
  it('define os sete estados exigidos sem duplicar a pipeline', () => {
    expect(RECOVERY_STATES).toEqual([
      'queued',
      'running',
      'checkpointed',
      'retryable_failure',
      'cancelled',
      'failed',
      'completed',
    ]);
  });

  it('usa fencing token monotônico e bloqueia finalização de tentativa obsoleta', () => {
    const harness = new RecoveryHarness();
    const first = harness.start('attempt-1');
    expect(first.ok).toBe(true);
    const firstAttempt = first.ok ? first.snapshot.currentAttempt! : null;
    expect(harness.markRetryableFailure('attempt-1', firstAttempt!.fencingToken).ok).toBe(true);
    harness.advance(5_000);
    const second = harness.start('attempt-2');
    expect(second.ok).toBe(true);
    expect(firstAttempt?.fencingToken).toBe(1);
    expect(harness.persistTerminal('attempt-1', 1, 'completed', 'result-a', 'confirmed')).toEqual({
      status: 'stale_attempt_denied',
      state: 'running',
    });
  });

  it('renova lease somente pela tentativa dona e limita a renovação ao deadline', () => {
    const harness = new RecoveryHarness();
    const started = harness.start('attempt-1', 10_000);
    expect(started.ok).toBe(true);
    const attempt = started.ok ? started.snapshot.currentAttempt! : null;
    expect(harness.renewLease('other', attempt!.fencingToken, 10_000).ok).toBe(false);
    expect(harness.renewLease('attempt-1', attempt!.fencingToken, 1_000_000).ok).toBe(true);
    expect(harness.snapshot().currentAttempt?.leaseExpiresAtMs).toBe(270_000);
  });

  it('retoma somente o que não foi confirmado e não duplica resultado de módulo', () => {
    const harness = new RecoveryHarness();
    const started = harness.start('attempt-1');
    const attempt = started.ok ? started.snapshot.currentAttempt! : null;
    expect(harness.checkpoint('attempt-1', attempt!.fencingToken, 'identity', 'hash-1').ok).toBe(true);
    expect(harness.checkpoint('attempt-1', attempt!.fencingToken, 'identity', 'hash-1').ok).toBe(true);
    expect(harness.checkpoint('attempt-1', attempt!.fencingToken, 'identity', 'hash-2').ok).toBe(false);
    expect(harness.snapshot().checkpoints).toHaveLength(1);
  });

  it('limita retries e mantém erro retryable separado do estado terminal', () => {
    const harness = new RecoveryHarness();
    const started = harness.start('attempt-1');
    const attempt = started.ok ? started.snapshot.currentAttempt! : null;
    expect(harness.markRetryableFailure('attempt-1', attempt!.fencingToken).ok).toBe(true);
    expect(harness.snapshot().state).toBe('retryable_failure');
    harness.advance(5_000);
    const retry = harness.start('attempt-2');
    expect(retry.ok).toBe(true);
    const retryAttempt = retry.ok ? retry.snapshot.currentAttempt! : null;
    expect(harness.markRetryableFailure('attempt-2', retryAttempt!.fencingToken).ok).toBe(false);
    expect(BOUNDED_RETRY_POLICY.maxAttempts).toBe(2);
  });

  it('cancellation vence finalização tardia e libera a lease', () => {
    const harness = new RecoveryHarness();
    const started = harness.start('attempt-1');
    const attempt = started.ok ? started.snapshot.currentAttempt! : null;
    expect(harness.requestCancellation().ok).toBe(true);
    expect(harness.persistTerminal('attempt-1', attempt!.fencingToken, 'completed', 'hash-final', 'confirmed')).toEqual({
      status: 'cancelled_wins',
      state: 'cancelled',
    });
    expect(harness.snapshot().currentAttempt).toBeNull();
    expect(harness.snapshot().state).toBe('cancelled');
  });

  it('timeout fecha em failed sem lease órfã e nega resposta tardia', () => {
    const harness = new RecoveryHarness();
    const started = harness.start('attempt-1', 1_000);
    const attempt = started.ok ? started.snapshot.currentAttempt! : null;
    harness.advance(1_000);
    expect(harness.expireLease().ok).toBe(true);
    expect(harness.snapshot().currentAttempt).toBeNull();
    expect(harness.persistTerminal('attempt-1', attempt!.fencingToken, 'completed', 'hash-final', 'confirmed')).toEqual({
      status: 'conflict_divergent',
      state: 'failed',
    });
  });

  it('não marca sucesso quando a persistência falha ou fica ambígua', () => {
    const failed = new RecoveryHarness();
    const failedStart = failed.start('attempt-failed');
    const failedAttempt = failedStart.ok ? failedStart.snapshot.currentAttempt! : null;
    expect(failed.persistTerminal('attempt-failed', failedAttempt!.fencingToken, 'completed', 'hash-a', 'failed')).toEqual({
      status: 'persistence_not_confirmed',
      state: 'failed',
    });
    expect(failed.snapshot().state).toBe('failed');

    const unknown = new RecoveryHarness();
    const unknownStart = unknown.start('attempt-unknown');
    const unknownAttempt = unknownStart.ok ? unknownStart.snapshot.currentAttempt! : null;
    expect(unknown.persistTerminal('attempt-unknown', unknownAttempt!.fencingToken, 'completed', 'hash-a', 'unknown')).toEqual({
      status: 'persistence_not_confirmed',
      state: 'running',
    });
    expect(unknown.snapshot().state).not.toBe('completed');
    expect(unknown.snapshot().persistenceFailureObserved).toBe(true);
  });

  it('aceita repetição idempotente equivalente e rejeita conflito divergente', () => {
    const harness = new RecoveryHarness();
    const started = harness.start('attempt-1');
    const attempt = started.ok ? started.snapshot.currentAttempt! : null;
    expect(harness.persistTerminal('attempt-1', attempt!.fencingToken, 'completed', 'hash-a', 'confirmed')).toEqual({
      status: 'persisted',
      state: 'completed',
    });
    expect(harness.persistTerminal('attempt-1', attempt!.fencingToken, 'completed', 'hash-a', 'confirmed')).toEqual({
      status: 'idempotent_equivalent',
      state: 'completed',
    });
    expect(harness.persistTerminal('attempt-1', attempt!.fencingToken, 'completed', 'hash-b', 'confirmed')).toEqual({
      status: 'conflict_divergent',
      state: 'completed',
    });
  });

  it('expõe a matriz de persistência terminal e os gates de orçamento', () => {
    expect(TERMINAL_PERSISTENCE_MATRIX).toEqual([
      'success',
      'failure',
      'cancel',
      'timeout',
      'idempotent_equivalent',
      'conflict_divergent',
    ]);
    for (const budget of Object.values(RECOVERY_PATH_BUDGETS)) {
      expect(budget.totalMs).toBeLessThanOrEqual(240_000);
      expect(budget.totalMs + budget.applicationReserveMs).toBe(270_000);
      expect(budget.applicationReserveMs).toBeGreaterThanOrEqual(30_000);
    }
    expect(Object.values(recoveryModelContractGates()).every(Boolean)).toBe(true);
    expect(Object.values(recoveryPathBudgetGates()).every(Boolean)).toBe(true);
  });
});
