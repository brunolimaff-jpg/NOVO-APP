import { getDossierRun } from '../../lib/supabase/dossierRuns';

export class DossierRunCancelledError extends Error { constructor(public readonly reason: 'local_abort' | 'remote_cancel') { super(reason); } }
export class DossierRunLeaseLostError extends Error { constructor() { super('Lease do dossiê perdida'); } }
export async function assertDossierRunCanContinue(input: { runId?: string; leaseOwner?: string; signal: AbortSignal; stage: string }): Promise<void> {
  if (input.signal.aborted) throw new DossierRunCancelledError('local_abort');
  if (!input.runId || !input.leaseOwner) return;
  const run = await getDossierRun(input.runId);
  if (run.status === 'CANCEL_REQUESTED' || run.status === 'CANCELLED' || run.cancel_requested_at) throw new DossierRunCancelledError('remote_cancel');
  if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status !== 'RUNNING' || run.lease_owner !== input.leaseOwner || !run.lease_expires_at || Date.parse(run.lease_expires_at) <= Date.now()) throw new DossierRunLeaseLostError();
}
