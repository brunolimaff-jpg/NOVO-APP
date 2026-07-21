import { describe, expect, it, vi } from 'vitest';

const getActiveDossierRunMock = vi.hoisted(() => vi.fn());
const requestDossierRunCancellationMock = vi.hoisted(() => vi.fn());
const scoutDiagMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));

vi.mock('../../../features/dossier/active-run-registry', () => ({ getActiveDossierRun: getActiveDossierRunMock }));
vi.mock('../../../lib/supabase/dossierRuns', () => ({ requestDossierRunCancellation: requestDossierRunCancellationMock }));
vi.mock('../../../utils/diagnosticLog', () => ({ scoutDiag: scoutDiagMock }));

import { requestCancellationForActiveDossierRun } from '../../../features/dossier/cancel-active-dossier-run';

describe('requestCancellationForActiveDossierRun', () => {
  it('permite abort local sem aguardar RPC e propaga rejeição diagnosticada', async () => {
    getActiveDossierRunMock.mockReturnValue({ sessionId: 'session-1', runId: 'run-1', leaseOwner: 'lease-1', clientAttemptId: 'attempt-1' });
    let reject!: (error: Error) => void;
    requestDossierRunCancellationMock.mockReturnValue(new Promise<void>((_, rejectRpc) => { reject = rejectRpc; }));

    const cancellation = requestCancellationForActiveDossierRun('session-1', 'user_stop');
    expect(requestDossierRunCancellationMock).toHaveBeenCalledWith('run-1');
    const controller = new AbortController();
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
    reject(new Error('RPC offline'));
    await expect(cancellation).rejects.toThrow('RPC offline');
    await Promise.resolve();
    expect(scoutDiagMock.warn).toHaveBeenCalledWith(
      'DossierRunLifecycle',
      'cancel-requested-failed',
      expect.objectContaining({ sessionId: 'session-1', runId: 'run-1', reason: 'user_stop', error: 'RPC offline' }),
    );
    expect(scoutDiagMock.warn).toHaveBeenCalledTimes(1);
  });

  it('retorna false sem run ativo', async () => {
    getActiveDossierRunMock.mockReturnValue(null);
    await expect(requestCancellationForActiveDossierRun('session-1', 'user_stop')).resolves.toBe(false);
    expect(requestDossierRunCancellationMock).not.toHaveBeenCalled();
  });
});
