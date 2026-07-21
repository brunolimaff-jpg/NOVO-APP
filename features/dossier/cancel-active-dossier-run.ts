import { getActiveDossierRun } from './active-run-registry';
import { requestDossierRunCancellation } from '../../lib/supabase/dossierRuns';
import { scoutDiag } from '../../utils/diagnosticLog';

export async function requestCancellationForActiveDossierRun(sessionId: string, reason: string): Promise<boolean> {
  const active = getActiveDossierRun(sessionId);
  if (!active) return false;
  await requestDossierRunCancellation(active.runId);
  scoutDiag.info('DossierRunLifecycle', 'cancel-requested', { sessionId, runId: active.runId, reason });
  return true;
}
