import { renewDossierRunLease, type DossierRun } from '../../lib/supabase/dossierRuns';

export const DOSSIER_RUN_HEARTBEAT_MS = 20_000;
type Input = { sessionId: string; runId: string; leaseOwner: string; renew?: typeof renewDossierRunLease; diagnose?: () => void; intervalMs?: number };
let active: { runId: string; cleanup: () => void } | null = null;

export function startDossierRunHeartbeat(input: Input): () => void {
  if (active?.runId === input.runId) return active.cleanup;
  active?.cleanup();
  let stopped = false;
  const renew = input.renew ?? renewDossierRunLease;
  const cleanup = () => { if (!stopped) { stopped = true; clearInterval(timer); if (active?.runId === input.runId) active = null; } };
  const tick = async () => {
    if (stopped) return;
    try {
      const run: DossierRun = await renew(input.runId, input.leaseOwner);
      if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED' || run.lease_expires_at === null) return cleanup();
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') input.diagnose?.();
    } catch { /* próximo tick controlado pelo único intervalo existente */ }
  };
  const timer = setInterval(() => void tick(), input.intervalMs ?? DOSSIER_RUN_HEARTBEAT_MS);
  active = { runId: input.runId, cleanup };
  return cleanup;
}

export function resetDossierRunHeartbeatForTest(): void { active?.cleanup(); active = null; }
