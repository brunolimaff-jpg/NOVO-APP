import { getDossierRun, renewDossierRunLease, type DossierRun } from '../../lib/supabase/dossierRuns';
import { scoutDiag } from '../../utils/diagnosticLog';
import { DOSSIER_RUN_RENEW_TIMEOUT_MS } from './dossier-run-heartbeat';

export class DossierRunCancelledError extends Error { constructor(public readonly reason: 'local_abort' | 'remote_cancel') { super(reason); } }
export class DossierRunLeaseLostError extends Error { constructor() { super('Lease do dossiê perdida'); } }
export class DossierRunReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'DossierRunReadError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
export function isDossierRunControlError(error: unknown): boolean {
  return (
    error instanceof DossierRunCancelledError ||
    error instanceof DossierRunLeaseLostError ||
    error instanceof DossierRunReadError
  );
}
const DOSSIER_RUN_READ_BACKOFF_MS = [0, 150, 400] as const;
// Janela para renovação preventiva: quando faltar menos que isso para o
// lease expirar, o checkpoint tenta renovar (best-effort) antes de seguir.
const DOSSIER_RUN_RENEWAL_WINDOW_MS = 30_000;

function waitForReadRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Lifecycle abortado durante retry', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException('Lifecycle abortado durante retry', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function getDossierRunWithRetry(runId: string, signal: AbortSignal, stage: string): Promise<DossierRun> {
  let lastError: unknown;
  for (let attempt = 0; attempt < DOSSIER_RUN_READ_BACKOFF_MS.length; attempt += 1) {
    if (signal.aborted) throw new DossierRunCancelledError('local_abort');
    if (attempt > 0) await waitForReadRetry(DOSSIER_RUN_READ_BACKOFF_MS[attempt], signal);
    try {
      return await getDossierRun(runId, { signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      lastError = error;
    }
  }
  throw new DossierRunReadError(`Falha ao consultar lifecycle do dossiê na etapa ${stage}`, { cause: lastError });
}
export async function assertDossierRunCanContinue(input: { runId?: string; leaseOwner?: string; signal: AbortSignal; stage: string }): Promise<void> {
  if (input.signal.aborted) throw new DossierRunCancelledError('local_abort');
  if (!input.runId || !input.leaseOwner) return;
  let run: DossierRun;
  try {
    run = await getDossierRunWithRetry(input.runId, input.signal, input.stage);
  } catch (error) {
    if (error instanceof DossierRunCancelledError || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    if (error instanceof DossierRunReadError) throw error;
    throw new DossierRunReadError(
      `Falha ao consultar lifecycle do dossiê na etapa ${input.stage}`,
      { cause: error },
    );
  }
  if (run.status === 'CANCEL_REQUESTED' || run.status === 'CANCELLED' || run.cancel_requested_at) throw new DossierRunCancelledError('remote_cancel');
  if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status !== 'RUNNING' || run.lease_owner !== input.leaseOwner || !run.lease_expires_at || Date.parse(run.lease_expires_at) <= Date.now()) throw new DossierRunLeaseLostError();
}

/**
 * Checkpoint de liveness para etapas longas (benchmark, PORTA, persistência,
 * mark completed). Mantém o fail-closed do assert simples e adiciona:
 * - renovação preventiva best-effort quando o lease está perto de expirar;
 * - nunca reacquirir lease expirado (lease expirado → DossierRunLeaseLostError);
 * - diagnóstico explícito de liveness (liveness_* em DossierRunLifecycle).
 */
export async function assertDossierRunCanContinueWithRenewal(input: {
  runId?: string;
  leaseOwner?: string;
  signal: AbortSignal;
  stage: string;
  renew?: typeof renewDossierRunLease;
  renewTimeoutMs?: number;
}): Promise<void> {
  if (input.signal.aborted) throw new DossierRunCancelledError('local_abort');
  if (!input.runId || !input.leaseOwner) return;
  const run = await getDossierRunWithRetry(input.runId, input.signal, input.stage);
  if (run.status === 'CANCEL_REQUESTED' || run.status === 'CANCELLED' || run.cancel_requested_at) throw new DossierRunCancelledError('remote_cancel');
  if (
    run.status === 'COMPLETED' ||
    run.status === 'FAILED' ||
    run.status !== 'RUNNING' ||
    run.lease_owner !== input.leaseOwner ||
    !run.lease_expires_at
  ) {
    throw new DossierRunLeaseLostError();
  }
  const expiresAt = Date.parse(run.lease_expires_at);
  if (expiresAt <= Date.now()) {
    scoutDiag.warn('DossierRunLifecycle', 'liveness_lease_expired', {
      runId: input.runId,
      stage: input.stage,
      leaseExpiresAt: run.lease_expires_at,
    });
    throw new DossierRunLeaseLostError();
  }
  if (expiresAt - Date.now() > DOSSIER_RUN_RENEWAL_WINDOW_MS) return;
  const renew = input.renew ?? renewDossierRunLease;
  try {
    const renewed = await renew(input.runId, input.leaseOwner, {
      signal: input.signal,
      timeoutMs: input.renewTimeoutMs ?? DOSSIER_RUN_RENEW_TIMEOUT_MS,
    });
    if (!renewed) {
      scoutDiag.warn('DossierRunLifecycle', 'liveness_renewal_null', {
        runId: input.runId,
        stage: input.stage,
        leaseExpiresAt: run.lease_expires_at,
      });
      throw new DossierRunLeaseLostError();
    }
    scoutDiag.info('DossierRunLifecycle', 'liveness_renewal_ok', {
      runId: input.runId,
      stage: input.stage,
      leaseExpiresAt: renewed.lease_expires_at,
    });
  } catch (error) {
    if (error instanceof DossierRunLeaseLostError) throw error;
    if (error instanceof DossierRunCancelledError || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    // Falha transitória do renew preventivo: o lease ainda é válido — segue;
    // o fail-closed permanece para lease efetivamente expirado.
    scoutDiag.warn('DossierRunLifecycle', 'liveness_renewal_failed', {
      runId: input.runId,
      stage: input.stage,
      leaseExpiresAt: run.lease_expires_at,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
