import { afterEach, describe, expect, it, vi } from 'vitest';

const scoutDiagMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock('../../../utils/diagnosticLog', () => ({ scoutDiag: scoutDiagMock }));

const rpcTimeoutMock = vi.hoisted(() => ({ DossierRunRpcTimeoutError: class DossierRunRpcTimeoutError extends Error {} }));
vi.mock('../../../lib/supabase/dossierRuns', () => ({ renewDossierRunLease: vi.fn(), DossierRunRpcTimeoutError: rpcTimeoutMock.DossierRunRpcTimeoutError }));

import { DOSSIER_RUN_RENEW_TIMEOUT_MS, resetDossierRunHeartbeatForTest, startDossierRunHeartbeat } from '../../../features/dossier/dossier-run-heartbeat';

const running = { run_id: 'r', status: 'RUNNING' as const, lease_expires_at: new Date(Date.now() + 60_000).toISOString(), cancel_requested_at: null };

afterEach(() => {
  resetDossierRunHeartbeatForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('dossier run heartbeat — contrato limitado e observável', () => {
  it('renova uma vez por timer; segundo start do mesmo run reusa o mesmo heartbeat', async () => {
    vi.useFakeTimers();
    const renew = vi.fn().mockResolvedValue(running);
    const cleanup = startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(renew).toHaveBeenCalledWith('r', 'l', { timeoutMs: DOSSIER_RUN_RENEW_TIMEOUT_MS });
    expect(scoutDiagMock.info).toHaveBeenCalledWith('DossierRunLifecycle', 'tick_started', expect.anything());
    expect(scoutDiagMock.info).toHaveBeenCalledWith('DossierRunLifecycle', 'tick_completed', expect.objectContaining({ consecutiveFailures: 0 }));
    cleanup();
    await vi.advanceTimersByTimeAsync(50);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('renew que nunca resolve é limitado por timeout: tick_timeout, inFlight liberado e retry recupera', async () => {
    vi.useFakeTimers();
    const renew = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject(new rpcTimeoutMock.DossierRunRpcTimeoutError('renew')), 5)))
      .mockResolvedValueOnce(running)
      .mockResolvedValue(running);
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10, renewTimeoutMs: 5, maxConsecutiveFailures: 3 });

    await vi.advanceTimersByTimeAsync(10); // tick 1: renew pendurada começa
    await vi.advanceTimersByTimeAsync(10); // timeout do mock (5ms) dispara → tick_timeout
    expect(renew).toHaveBeenCalledTimes(1);
    expect(scoutDiagMock.warn).toHaveBeenCalledWith('DossierRunLifecycle', 'tick_timeout', expect.objectContaining({ consecutiveFailures: 1 }));

    // Backoff: intervalMs * 2^0 = 10ms → próximo tick tenta de novo e recupera
    await vi.advanceTimersByTimeAsync(20);
    expect(renew).toHaveBeenCalledTimes(3);
    expect(scoutDiagMock.warn).not.toHaveBeenCalledWith('DossierRunLifecycle', 'tick_terminal_failure', expect.anything());
  });

  it('resposta tardia após cleanup é ignorada (não altera estado encerrado)', async () => {
    vi.useFakeTimers();
    let resolveLate!: (run: typeof running) => void;
    const renew = vi.fn(() => new Promise<typeof running>(resolve => { resolveLate = resolve; }));
    const cleanup = startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(renew).toHaveBeenCalledTimes(1);

    cleanup();
    resolveLate(running); // resposta tardia chega após o encerramento
    await vi.advanceTimersByTimeAsync(50);

    expect(renew).toHaveBeenCalledTimes(1); // nenhum tick novo
    const tickCompleted = scoutDiagMock.info.mock.calls.filter(c => c[1] === 'tick_completed');
    expect(tickCompleted).toHaveLength(0); // a resposta tardia não registra sucesso
  });

  it('retry limitado: falhas consecutivas até o limite encerram com tick_terminal_failure', async () => {
    vi.useFakeTimers();
    const renew = vi.fn().mockRejectedValue(new Error('rede indisponível'));
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10, maxConsecutiveFailures: 3 });

    await vi.advanceTimersByTimeAsync(10); // falha 1 → backoff 10ms
    await vi.advanceTimersByTimeAsync(20); // falha 2 → backoff 20ms
    await vi.advanceTimersByTimeAsync(40); // falha 3 → terminal
    expect(scoutDiagMock.warn).toHaveBeenCalledWith('DossierRunLifecycle', 'tick_failed', expect.objectContaining({ consecutiveFailures: 2 }));
    expect(scoutDiagMock.warn).toHaveBeenCalledWith('DossierRunLifecycle', 'tick_terminal_failure', expect.objectContaining({ consecutiveFailures: 3 }));

    await vi.advanceTimersByTimeAsync(200);
    expect(renew).toHaveBeenCalledTimes(3); // encerrado — nenhuma chamada nova
  });

  it('renew null encerra fail-closed com renew_null (owner/status/lease inválidos não recuperam)', async () => {
    vi.useFakeTimers();
    const renew = vi.fn().mockResolvedValue(null);
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(scoutDiagMock.warn).toHaveBeenCalledWith('DossierRunLifecycle', 'renew_null', expect.objectContaining({ consecutiveFailures: 1 }));
    await vi.advanceTimersByTimeAsync(100);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it.each(['COMPLETED', 'FAILED', 'CANCELLED'] as const)('status terminal %s encerra heartbeat com tick_terminal', async status => {
    vi.useFakeTimers();
    const renew = vi.fn().mockResolvedValue({ ...running, status });
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(30);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(scoutDiagMock.info).toHaveBeenCalledWith('DossierRunLifecycle', 'tick_terminal', expect.objectContaining({ status }));
  });

  it('CANCEL_REQUESTED com lease válida segue como renovação válida', async () => {
    vi.useFakeTimers();
    const renew = vi.fn().mockResolvedValue({ ...running, status: 'CANCEL_REQUESTED' as const });
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    expect(renew).toHaveBeenCalledTimes(2);
    expect(scoutDiagMock.warn).not.toHaveBeenCalled();
  });

  it('aba hidden continua observável: tick_started/tick_completed logam; diagnose não roda', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const renew = vi.fn().mockResolvedValue(running);
    const diagnose = vi.fn();
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, diagnose, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(renew).toHaveBeenCalledOnce();
    expect(diagnose).not.toHaveBeenCalled();
    expect(scoutDiagMock.info).toHaveBeenCalledWith('DossierRunLifecycle', 'tick_started', expect.objectContaining({ visibilityState: 'hidden' }));
    expect(scoutDiagMock.info).toHaveBeenCalledWith('DossierRunLifecycle', 'tick_completed', expect.objectContaining({ visibilityState: 'hidden' }));
  });

  it('lease expirada retornada pelo renew encerra (tick_terminal) sem novas tentativas', async () => {
    vi.useFakeTimers();
    const expired = { ...running, lease_expires_at: new Date(Date.now() - 1).toISOString() };
    const renew = vi.fn().mockResolvedValue(expired);
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(30);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(scoutDiagMock.info).toHaveBeenCalledWith('DossierRunLifecycle', 'tick_terminal', expect.anything());
  });
});
