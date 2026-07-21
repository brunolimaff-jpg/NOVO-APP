import { renewDossierRunLease } from '../../lib/supabase/dossierRuns';
import { scoutDiag } from '../../utils/diagnosticLog';

export const DOSSIER_RUN_HEARTBEAT_MS = 15_000;
type Input = { sessionId: string; runId: string; leaseOwner: string; renew?: typeof renewDossierRunLease; diagnose?: () => void; intervalMs?: number };
let active: { runId: string; cleanup: () => void } | null = null;

export function startDossierRunHeartbeat(input: Input): () => void {
  if (active?.runId === input.runId) return active.cleanup;
  active?.cleanup();
  let stopped = false;
  let inFlight = false;
  let consecutiveFailures = 0;
  const renew = input.renew ?? renewDossierRunLease;
  const cleanup = () => { if (!stopped) { stopped = true; clearInterval(timer); if (active?.runId === input.runId) active = null; } };
  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const run = await renew(input.runId, input.leaseOwner);
      if (!run) {
        consecutiveFailures += 1;
        scoutDiag.warn('DossierRunLifecycle', 'heartbeat-renew-not-acquired', {
          runId: input.runId,
          sessionId: input.sessionId,
          consecutiveFailures,
        });
        return cleanup();
      }
      consecutiveFailures = 0;
      if (
        run.status === 'COMPLETED' ||
        run.status === 'FAILED' ||
        run.status === 'CANCELLED' ||
        run.lease_expires_at === null ||
        Date.parse(run.lease_expires_at) <= Date.now()
      ) return cleanup();
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') input.diagnose?.();
    } catch (error) {
      consecutiveFailures += 1;
      scoutDiag.warn('DossierRunLifecycle', 'heartbeat-renew-failed', {
        runId: input.runId,
        sessionId: input.sessionId,
        consecutiveFailures,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(() => void tick(), input.intervalMs ?? DOSSIER_RUN_HEARTBEAT_MS);
  active = { runId: input.runId, cleanup };
  return cleanup;
}

export function resetDossierRunHeartbeatForTest(): void { active?.cleanup(); active = null; }
