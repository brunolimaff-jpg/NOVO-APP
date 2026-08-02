import { describe, expect, it } from 'vitest';
import {
  DURABLE_API_CONTRACT,
  DURABLE_EXECUTION_CONTRACT_VERSION,
  DURABLE_EXECUTION_MECHANISM,
  DurableExecutionError,
  DurableExecutionRegistry,
  getCurrentModule,
  getLastCompletedModule,
  isSafeToRetry,
  isTerminalDurableState,
} from '../../api/_dossier-durable-execution';

function setupRun(nowRef: { value: number }, suffix: string) {
  const registry = new DurableExecutionRegistry({
    now: () => nowRef.value,
    leaseDurationMs: 100,
    retryBackoffMs: 50,
  });
  const accepted = registry.accept({
    runId: `run-${suffix}`,
    idempotencyKey: `idem-${suffix}`,
    sessionId: `session-${suffix}`,
  });
  accepted.machine.queue();
  return { registry, machine: accepted.machine };
}

function completeAllModules(machine: ReturnType<typeof setupRun>['machine'], workerId = 'worker-1') {
  for (let module = 1; module <= 6; module += 1) {
    machine.startNextModule(workerId);
    machine.completeModule(workerId, module as 1 | 2 | 3 | 4 | 5 | 6, `digest-${module}`);
  }
}

function expectDurableError(action: () => unknown, code: DurableExecutionError['code']) {
  try {
    action();
    throw new Error('expected action to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(DurableExecutionError);
    expect((error as DurableExecutionError).code).toBe(code);
  }
}

describe('dossier durable execution 05D.1', () => {
  it('seleciona o mecanismo baseado em Postgres/RPC existente e propõe contrato assíncrono', () => {
    expect(DURABLE_EXECUTION_CONTRACT_VERSION).toBe('dossier-durable-execution.v1');
    expect(DURABLE_EXECUTION_MECHANISM).toBe('SUPABASE_POSTGRES_RUN_STATE_WORKER');
    expect(DURABLE_API_CONTRACT.accept).toEqual({ method: 'POST', path: '/api/dossier-runs', responseStatus: 202 });
    expect(DURABLE_API_CONTRACT.status.responseStatus).toBe(200);
    expect(DURABLE_API_CONTRACT.cancel.responseStatus).toBe(202);
    expect(DURABLE_API_CONTRACT.recover.responseStatus).toBe(202);
  });

  it('mantém uma execução lógica em redelivery e respeita a chave de idempotência', () => {
    const nowRef = { value: 0 };
    const { registry, machine } = setupRun(nowRef, 'idempotent');
    const redelivery = registry.accept({ runId: 'run-idempotent', idempotencyKey: 'idem-idempotent', sessionId: 'session-idempotent' });

    expect(redelivery.created).toBe(false);
    expect(redelivery.machine).toBe(machine);
    expect(machine.snapshot.deliveryCount).toBe(1);
    expect(machine.snapshot.runId).toBe('run-idempotent');
    expect(() => registry.accept({ runId: 'run-other', idempotencyKey: 'idem-idempotent', sessionId: 'session-other' }))
      .toThrowError('A chave já pertence a outra sessão');
  });

  it('garante owner único da lease e permite recuperação após expiração', () => {
    const nowRef = { value: 0 };
    const { machine } = setupRun(nowRef, 'lease');
    machine.acquireLease('worker-1');
    expectDurableError(() => machine.acquireLease('worker-2'), 'LEASE_CONFLICT');

    nowRef.value = 101;
    machine.acquireLease('worker-2');
    expect(machine.snapshot.state).toBe('LEASE_ACQUIRED');
    expect(machine.snapshot.leaseOwner).toBe('worker-2');
    expect(machine.snapshot.history.at(-2)?.event).toBe('LEASE_EXPIRED');
  });

  it('executa módulos, consolida e persiste atomicamente sem repetir etapa confirmada', () => {
    const nowRef = { value: 0 };
    const { machine } = setupRun(nowRef, 'success');
    machine.acquireLease('worker-1');

    machine.startNextModule('worker-1');
    machine.completeModule('worker-1', 1, 'digest-1');
    const historyAfterFirst = machine.snapshot.history.length;
    machine.completeModule('worker-1', 1, 'digest-1');
    expect(machine.snapshot.history.length).toBe(historyAfterFirst);

    for (let module = 2; module <= 6; module += 1) {
      machine.startNextModule('worker-1');
      machine.completeModule('worker-1', module as 1 | 2 | 3 | 4 | 5 | 6, `digest-${module}`);
    }
    expect(getLastCompletedModule(machine.snapshot)).toBe(6);
    expect(getCurrentModule(machine.snapshot)).toBeNull();

    machine.startConsolidation('worker-1');
    machine.startPersistence('worker-1');
    machine.markPersistenceCommitted('worker-1', 'dossier-1');

    expect(machine.snapshot.state).toBe('COMPLETED');
    expect(machine.snapshot.persistenceState).toBe('COMMITTED');
    expect(machine.snapshot.leaseOwner).toBeNull();
    expect(isTerminalDurableState(machine.snapshot.state)).toBe(true);
    expectDurableError(() => machine.requestCancel(), 'RUN_TERMINAL');
  });

  it('retoma do último checkpoint após crash entre módulos sem duplicar o módulo concluído', () => {
    const nowRef = { value: 0 };
    const { machine } = setupRun(nowRef, 'checkpoint');
    machine.acquireLease('worker-1');
    machine.startNextModule('worker-1');
    machine.completeModule('worker-1', 1, 'digest-1');
    machine.crash('worker-1', 'processo interrompido entre módulos');

    expect(machine.snapshot.state).toBe('RECOVERY_REQUIRED');
    expect(machine.snapshot.completedModules).toEqual([1]);
    machine.recover();
    machine.acquireLease('worker-2');
    expect(getCurrentModule(machine.snapshot)).toBe(2);
    machine.startNextModule('worker-2');
    expectDurableError(() => machine.completeModule('worker-2', 1, 'digest-1'), 'MODULE_ORDER_VIOLATION');
    machine.completeModule('worker-2', 2, 'digest-2');
    expect(machine.snapshot.completedModules).toEqual([1, 2]);
  });

  it('retoma o mesmo módulo após crash durante a etapa', () => {
    const nowRef = { value: 0 };
    const { machine } = setupRun(nowRef, 'module-crash');
    machine.acquireLease('worker-1');
    machine.startNextModule('worker-1');
    machine.crash('worker-1', 'crash durante LLM');
    machine.recover();
    machine.acquireLease('worker-2');
    expect(getCurrentModule(machine.snapshot)).toBe(1);
    machine.startNextModule('worker-2');
    machine.completeModule('worker-2', 1, 'digest-1-retry');
    expect(machine.snapshot.completedModules).toEqual([1]);
    expect(machine.snapshot.attempt).toBe(2);
  });

  it('marca persistência ambígua e reconcilia antes de permitir novo commit', () => {
    const nowRef = { value: 0 };
    const { machine } = setupRun(nowRef, 'ambiguous');
    machine.acquireLease('worker-1');
    completeAllModules(machine);
    machine.startConsolidation('worker-1');
    machine.startPersistence('worker-1');
    machine.crash('worker-1', 'resposta perdida após possível commit');

    expect(machine.snapshot.state).toBe('RESULT_AMBIGUOUS');
    expectDurableError(() => machine.acquireLease('worker-2'), 'RESULT_RECONCILIATION_REQUIRED');
    machine.reconcilePersistedResult({ exists: true, dossierId: 'dossier-after-reconcile' });
    expect(machine.snapshot.state).toBe('COMPLETED');
    expect(machine.snapshot.dossierId).toBe('dossier-after-reconcile');
    expect(machine.snapshot.history.filter(item => item.event === 'PERSISTENCE_COMMITTED')).toHaveLength(0);
  });

  it('reabre somente a consolidação quando a reconciliação confirma que nada foi persistido', () => {
    const nowRef = { value: 0 };
    const { machine } = setupRun(nowRef, 'ambiguous-empty');
    machine.acquireLease('worker-1');
    completeAllModules(machine);
    machine.startConsolidation('worker-1');
    machine.startPersistence('worker-1');
    machine.crash('worker-1', 'resultado não observável');
    machine.reconcilePersistedResult({ exists: false });
    machine.acquireLease('worker-2');
    machine.startConsolidation('worker-2');
    machine.startPersistence('worker-2');
    machine.markPersistenceCommitted('worker-2', 'dossier-retry');
    expect(machine.snapshot.state).toBe('COMPLETED');
  });

  it('impede novas etapas quando cancelado entre módulos ou durante uma etapa', () => {
    const nowRef = { value: 0 };
    const between = setupRun(nowRef, 'cancel-between').machine;
    between.acquireLease('worker-1');
    between.requestCancel();
    expectDurableError(() => between.startNextModule('worker-1'), 'CANCELLATION_REQUESTED');
    between.observeCancellation('worker-1');
    expect(between.snapshot.state).toBe('CANCELLED');

    const during = setupRun(nowRef, 'cancel-during').machine;
    during.acquireLease('worker-1');
    during.startNextModule('worker-1');
    during.requestCancel();
    expectDurableError(() => during.completeModule('worker-1', 1, 'digest-1'), 'MODULE_ORDER_VIOLATION');
    during.observeCancellation('worker-1');
    expect(during.snapshot.completedModules).toEqual([]);
  });

  it('aplica retry com backoff e não mascara falha permanente como COMPLETED', () => {
    const nowRef = { value: 0 };
    const { machine } = setupRun(nowRef, 'retry');
    machine.acquireLease('worker-1');
    machine.startNextModule('worker-1');
    machine.scheduleRetry('worker-1', 'LLM_TIMEOUT', 'provider demorou', 50);
    expect(machine.snapshot.state).toBe('RETRY_WAIT');
    expect(isSafeToRetry(machine.snapshot.state)).toBe(true);
    expectDurableError(() => machine.requeueAfterRetry(), 'RETRY_NOT_DUE');
    nowRef.value = 50;
    machine.requeueAfterRetry();
    machine.acquireLease('worker-2');
    machine.startNextModule('worker-2');
    machine.fail('worker-2', 'PROVIDER_PERMANENT', 'falha não recuperável');
    expect(machine.snapshot.state).toBe('FAILED');
    expect(isTerminalDurableState(machine.snapshot.state)).toBe(true);
    expect(machine.snapshot.dossierId).toBeNull();
  });

  it('permite cancelamento solicitado antes da primeira lease sem liberar um owner inexistente', () => {
    const nowRef = { value: 0 };
    const { machine } = setupRun(nowRef, 'cancel-before-lease');
    machine.requestCancel();
    expect(machine.snapshot.leaseOwner).toBeNull();
    machine.acquireLease('worker-1');
    machine.observeCancellation('worker-1');
    expect(machine.snapshot.state).toBe('CANCELLED');
    expect(machine.snapshot.leaseOwner).toBeNull();
  });
});
