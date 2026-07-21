import { getActiveDossierRun } from './active-run-registry';
import { requestDossierRunCancellation } from '../../lib/supabase/dossierRuns';
import { scoutDiag } from '../../utils/diagnosticLog';

export function requestCancellationForActiveDossierRun(sessionId: string, reason: string): boolean {
  const active = getActiveDossierRun(sessionId);
  if (!active) return false;
  requestDossierRunCancellation(active.runId)
    .then(() => {
      scoutDiag.info('DossierRunLifecycle', 'cancel-requested-success', { sessionId, runId: active.runId, reason });
    })
    .catch(err => {
      scoutDiag.warn('DossierRunLifecycle', 'cancel-requested-failed', {
        sessionId,
        runId: active.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  return true;
}
