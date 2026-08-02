import { describe, expect, it } from 'vitest';
import {
  DURABLE_CHECKPOINT_SCHEMA,
  DURABLE_DELIVERY_DESIGN,
  DURABLE_DELIVERY_RUNTIME,
  DURABLE_DELIVERY_TRIGGER,
  DURABLE_USER_TOKEN_PERSISTENCE,
  DURABLE_WORKER_IDENTITY,
  DurableDeliveryError,
  DurableDeliveryHarness,
} from '../../api/_dossier-durable-delivery';

function expectDeliveryError(action: () => unknown, code: DurableDeliveryError['code']): void {
  try {
    action();
    throw new Error('expected delivery action to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(DurableDeliveryError);
    expect((error as DurableDeliveryError).code).toBe(code);
  }
}

function setup(nowRef: { value: number }) {
  const harness = new DurableDeliveryHarness({ now: () => nowRef.value, leaseDurationMs: 100, maxAttempts: 3 });
  harness.enqueue('run-1', 'module-1', 1, 'pipeline-v1');
  return harness;
}

describe('dossier durable delivery 05D.2A', () => {
  it('seleciona runtime/trigger/identidade sem persistir token de usuário', () => {
    expect(DURABLE_DELIVERY_RUNTIME).toBe('VERCEL_CRON_POLLING_SERVERLESS_WORKER');
    expect(DURABLE_DELIVERY_TRIGGER).toBe('VERCEL_CRON_POLLING');
    expect(DURABLE_WORKER_IDENTITY).toBe('DEDICATED_WORKER_SECRET_RESTRICTED_RPCS');
    expect(DURABLE_USER_TOKEN_PERSISTENCE).toBe('PROHIBITED');
    expect(DURABLE_DELIVERY_DESIGN.maxClaimsPerTick).toBe(1);
    expect(DURABLE_DELIVERY_DESIGN.scheduleStatus).toBe('DESIGN_ONLY_PLAN_LIMIT_UNVERIFIED');
  });

  it('define checkpoint separado, chave única por run/etapa e payload protegido por RPC', () => {
    expect(DURABLE_CHECKPOINT_SCHEMA.table).toBe('dossier_run_checkpoints');
    expect(DURABLE_CHECKPOINT_SCHEMA.primaryKey).toEqual(['run_id', 'step_key']);
    expect(DURABLE_CHECKPOINT_SCHEMA.uniqueConstraints).toContain('(run_id, step_order)');
    expect(DURABLE_CHECKPOINT_SCHEMA.sensitivePayloadPolicy).toContain('worker_rpc_only');
  });

  it('prova exclusão: dois workers não reclamam a mesma tentativa', () => {
    const nowRef = { value: 0 };
    const harness = setup(nowRef);
    const first = harness.claimNext('worker-a');
    const second = harness.claimNext('worker-b');
    expect(first?.workerId).toBe('worker-a');
    expect(first?.attempt).toBe(1);
    expect(second).toBeNull();
  });

  it('recupera claim abandonado por expiração com nova tentativa', () => {
    const nowRef = { value: 0 };
    const harness = setup(nowRef);
    harness.claimNext('worker-a');
    nowRef.value = 101;
    const redelivery = harness.claimNext('worker-b');
    expect(redelivery?.workerId).toBe('worker-b');
    expect(redelivery?.attempt).toBe(2);
  });

  it('exige owner e attempt atuais para gravar checkpoint, sem concluir duas vezes', () => {
    const nowRef = { value: 0 };
    const harness = setup(nowRef);
    const claim = harness.claimNext('worker-a');
    expect(claim).not.toBeNull();
    expectDeliveryError(() => harness.checkpoint('run-1', 'module-1', 'worker-b', 1, 'in', 'out'), 'CHECKPOINT_OWNER_REQUIRED');
    expectDeliveryError(() => harness.checkpoint('run-1', 'module-1', 'worker-a', 2, 'in', 'out'), 'CHECKPOINT_ATTEMPT_CONFLICT');
    const completed = harness.checkpoint('run-1', 'module-1', 'worker-a', 1, 'input-digest', 'output-digest');
    expect(completed.status).toBe('COMPLETED');
    expect(harness.claimNext('worker-b')).toBeNull();
  });

  it('aplica retry/backoff e dead-letter equivalente após o máximo de tentativas', () => {
    const nowRef = { value: 0 };
    const harness = setup(nowRef);
    harness.claimNext('worker-a');
    harness.scheduleRetry('run-1', 'module-1', 'worker-a', 'LLM_TIMEOUT', 50);
    expect(harness.claimNext('worker-b')).toBeNull();
    nowRef.value = 50;
    harness.claimNext('worker-b');
    harness.scheduleRetry('run-1', 'module-1', 'worker-b', 'LLM_TIMEOUT', 100);
    nowRef.value = 100;
    harness.claimNext('worker-c');
    const exhausted = harness.scheduleRetry('run-1', 'module-1', 'worker-c', 'LLM_TIMEOUT', 150);
    expect(exhausted.status).toBe('FAILED');
    expect(exhausted.errorCode).toBe('RETRY_EXHAUSTED');
  });

  it('cancela o run e impede claim/checkpoint posterior', () => {
    const nowRef = { value: 0 };
    const harness = setup(nowRef);
    harness.requestCancel('run-1');
    expect(harness.claimNext('worker-a')).toBeNull();
    const fresh = new DurableDeliveryHarness({ now: () => nowRef.value, leaseDurationMs: 100 });
    fresh.enqueue('run-2', 'module-1', 1);
    fresh.claimNext('worker-a');
    fresh.requestCancel('run-2');
    const cancelled = fresh.markCancelled('run-2', 'module-1', 'worker-a');
    expect(cancelled.status).toBe('CANCELLED');
    expectDeliveryError(() => fresh.checkpoint('run-2', 'module-1', 'worker-a', 1, 'in', 'out'), 'WORK_TERMINAL');
  });

  it('impõe backpressure de uma claim por tick e ordena as etapas', () => {
    const nowRef = { value: 0 };
    const harness = new DurableDeliveryHarness({ now: () => nowRef.value, leaseDurationMs: 100 });
    harness.enqueue('run-1', 'module-2', 2);
    harness.enqueue('run-1', 'module-1', 1);
    const first = harness.claimNext('worker-a');
    expect(first?.stepKey).toBe('module-1');
    expect(DURABLE_DELIVERY_DESIGN.maxClaimsPerTick).toBe(1);
  });

  it('não permite gravação após expiração nem transferência implícita de ownership', () => {
    const nowRef = { value: 0 };
    const harness = setup(nowRef);
    harness.claimNext('worker-a');
    nowRef.value = 101;
    expectDeliveryError(() => harness.renew('run-1', 'module-1', 'worker-a'), 'CLAIM_CONFLICT');
    expectDeliveryError(() => harness.checkpoint('run-1', 'module-1', 'worker-b', 1, 'in', 'out'), 'CHECKPOINT_OWNER_REQUIRED');
  });
});
