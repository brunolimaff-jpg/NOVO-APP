import { afterEach, describe, expect, it, vi } from 'vitest';

const scoutDiagMock = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../../../utils/diagnosticLog', () => ({ scoutDiag: scoutDiagMock }));

import { resetDossierRunHeartbeatForTest, startDossierRunHeartbeat } from '../../../features/dossier/dossier-run-heartbeat';

const running = { run_id: 'r', status: 'RUNNING' as const, lease_expires_at: new Date(Date.now() + 60_000).toISOString(), cancel_requested_at: null };

afterEach(() => {
  resetDossierRunHeartbeatForTest();
  vi.useRealTimers();
});

describe('dossier run heartbeat', () => {
  it('renova uma vez por timer e cleanup para', async () => {
    vi.useFakeTimers();
    const renew = vi.fn().mockResolvedValue(running);
    const cleanup = startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(renew).toHaveBeenCalledTimes(1);
    cleanup();
    await vi.advanceTimersByTimeAsync(50);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('não sobrepõe renovação lenta e tenta novamente após falha diagnosticada', async () => {
    vi.useFakeTimers();
    let resolveFirst!: (run: typeof running) => void;
    const renew = vi.fn()
      .mockImplementationOnce(() => new Promise<typeof running>(resolve => { resolveFirst = resolve; }))
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValue(running);
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(30);
    expect(renew).toHaveBeenCalledTimes(1);
    resolveFirst(running);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(renew).toHaveBeenCalledTimes(2);
    expect(scoutDiagMock.warn).toHaveBeenCalledWith('DossierRunLifecycle', 'heartbeat-renew-failed', expect.objectContaining({ consecutiveFailures: 1 }));
    await vi.advanceTimersByTimeAsync(10);
    expect(renew).toHaveBeenCalledTimes(3);
  });

  it.each(['COMPLETED', 'FAILED', 'CANCELLED'] as const)('terminal %s encerra heartbeat sem warning de release', async status => {
    vi.useFakeTimers();
    const renew = vi.fn().mockResolvedValue({ ...running, status });
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(30);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('hidden continua renovando e pausa apenas diagnóstico visual', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const renew = vi.fn().mockResolvedValue(running);
    const diagnose = vi.fn();
    startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, diagnose, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(renew).toHaveBeenCalledOnce();
    expect(diagnose).not.toHaveBeenCalled();
  });
});
