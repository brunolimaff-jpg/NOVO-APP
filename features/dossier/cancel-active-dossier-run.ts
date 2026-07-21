import { getActiveDossierRun } from './active-run-registry';
import { requestDossierRunCancellation } from '../../lib/supabase/dossierRuns';
import { scoutDiag } from '../../utils/diagnosticLog';

export async function requestCancellationForActiveDossierRun(sessionId: string, reason: string): Promise<boolean> {
  const active = getActiveDossierRun(sessionId);
  if (!active) return false;
  try {
    await requestDossierRunCancellation(active.runId);
    scoutDiag.info('DossierRunLifecycle', 'cancel-requested-success', { sessionId, runId: active.runId, reason });
  } catch (error) {
    scoutDiag.warn('DossierRunLifecycle', 'cancel-requested-failed', {
      sessionId,
      runId: active.runId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  return true;
}
