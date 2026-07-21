import { describe, expect, it, vi } from 'vitest';

const getActiveDossierRunMock = vi.hoisted(() => vi.fn());
const requestDossierRunCancellationMock = vi.hoisted(() => vi.fn());
const scoutDiagMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));

vi.mock('../../../features/dossier/active-run-registry', () => ({ getActiveDossierRun: getActiveDossierRunMock }));
vi.mock('../../../lib/supabase/dossierRuns', () => ({ requestDossierRunCancellation: requestDossierRunCancellationMock }));
vi.mock('../../../utils/diagnosticLog', () => ({ scoutDiag: scoutDiagMock }));

import { requestCancellationForActiveDossierRun } from '../../../features/dossier/cancel-active-dossier-run';

describe('requestCancellationForActiveDossierRun', () => {
  it('retorna sem aguardar RPC e diagnostica rejeição remota', async () => {
    getActiveDossierRunMock.mockReturnValue({ sessionId: 'session-1', runId: 'run-1', leaseOwner: 'lease-1', clientAttemptId: 'attempt-1' });
    requestDossierRunCancellationMock.mockRejectedValue(new Error('RPC offline'));

    expect(requestCancellationForActiveDossierRun('session-1', 'user_stop')).toBe(true);
    expect(requestDossierRunCancellationMock).toHaveBeenCalledWith('run-1');
    await Promise.resolve();
    await Promise.resolve();
    expect(scoutDiagMock.warn).toHaveBeenCalledWith(
      'DossierRunLifecycle',
      'cancel-requested-failed',
      expect.objectContaining({ sessionId: 'session-1', runId: 'run-1', error: 'RPC offline' }),
    );
  });
});
