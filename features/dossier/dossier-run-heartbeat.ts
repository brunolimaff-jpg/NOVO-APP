import { renewDossierRunLease, DossierRunRpcTimeoutError } from '../../lib/supabase/dossierRuns';
import { scoutDiag } from '../../utils/diagnosticLog';

export const DOSSIER_RUN_HEARTBEAT_MS = 15_000;
// Timeout do renew — menor que metade do TTL (45s) para sobrar janela de retry.
export const DOSSIER_RUN_RENEW_TIMEOUT_MS = 10_000;
// Após N falhas consecutivas (timeout/exceção), o heartbeat encerra com diagnóstico.
export const DOSSIER_RUN_MAX_CONSECUTIVE_FAILURES = 5;
// Backoff de retry: intervalMs * 2^(falhas-1), limitado ao teto.
const DOSSIER_RUN_RETRY_BACKOFF_MAX_MS = 30_000;

type Input = {
  sessionId: string;
  runId: string;
  leaseOwner: string;
  renew?: typeof renewDossierRunLease;
  diagnose?: () => void;
  intervalMs?: number;
  renewTimeoutMs?: number;
  maxConsecutiveFailures?: number;
};

let active: { runId: string; cleanup: () => void } | null = null;
let tickSequence = 0;

export function startDossierRunHeartbeat(input: Input): () => void {
  if (active?.runId === input.runId) return active.cleanup;
  active?.cleanup();

  let stopped = false;
  let inFlight = false;
  let consecutiveFailures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const renew = input.renew ?? renewDossierRunLease;
  const intervalMs = input.intervalMs ?? DOSSIER_RUN_HEARTBEAT_MS;
  const renewTimeoutMs = input.renewTimeoutMs ?? DOSSIER_RUN_RENEW_TIMEOUT_MS;
  const maxConsecutiveFailures = input.maxConsecutiveFailures ?? DOSSIER_RUN_MAX_CONSECUTIVE_FAILURES;

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    if (active?.runId === input.runId) active = null;
  };

  const scheduleNext = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => void tick(), delayMs);
  };

  const visibilityState = (): string =>
    typeof document === 'undefined' ? 'unknown' : document.visibilityState;

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    const tickId = ++tickSequence;
    const startedAt = performance.now();
    const basePayload = {
      runId: input.runId,
      sessionId: input.sessionId,
      consecutiveFailures,
      visibilityState: visibilityState(),
    };
    scoutDiag.info('DossierRunLifecycle', 'tick_started', basePayload);
    try {
      const run = await renew(input.runId, input.leaseOwner, { timeoutMs: renewTimeoutMs });
      // Resposta tardia (após timeout/abort ou novo tick) não altera estado encerrado.
      if (stopped || tickId !== tickSequence) return;
      const durationMs = Math.round(performance.now() - startedAt);
      if (!run) {
        consecutiveFailures += 1;
        scoutDiag.warn('DossierRunLifecycle', 'renew_null', {
          ...basePayload,
          consecutiveFailures,
          durationMs,
        });
        // Fail-closed: owner/status/lease inválidos — não há renovação segura possível.
        cleanup();
        return;
      }
      if (
        run.status === 'COMPLETED' ||
        run.status === 'FAILED' ||
        run.status === 'CANCELLED' ||
        run.lease_expires_at === null ||
        Date.parse(run.lease_expires_at) <= Date.now()
      ) {
        scoutDiag.info('DossierRunLifecycle', 'tick_terminal', {
          ...basePayload,
          status: run.status,
          leaseExpiresAt: run.lease_expires_at,
        });
        cleanup();
        return;
      }
      consecutiveFailures = 0;
      scoutDiag.info('DossierRunLifecycle', 'tick_completed', {
        ...basePayload,
        consecutiveFailures: 0,
        durationMs,
        leaseExpiresAt: run.lease_expires_at,
      });
      if (visibilityState() !== 'hidden') input.diagnose?.();
    } catch (error) {
      if (stopped || tickId !== tickSequence) return;
      consecutiveFailures += 1;
      const durationMs = Math.round(performance.now() - startedAt);
      const isTimeout =
        error instanceof DossierRunRpcTimeoutError ||
        (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'TimeoutError');
      scoutDiag.warn('DossierRunLifecycle', isTimeout ? 'tick_timeout' : 'tick_failed', {
        ...basePayload,
        consecutiveFailures,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
      if (consecutiveFailures >= maxConsecutiveFailures) {
        scoutDiag.warn('DossierRunLifecycle', 'tick_terminal_failure', {
          ...basePayload,
          consecutiveFailures,
          durationMs,
        });
        cleanup();
        return;
      }
    } finally {
      inFlight = false;
      if (!stopped) {
        const backoffMs =
          consecutiveFailures === 0
            ? intervalMs
            : Math.min(intervalMs * 2 ** Math.min(consecutiveFailures - 1, 4), DOSSIER_RUN_RETRY_BACKOFF_MAX_MS);
        scheduleNext(backoffMs);
      }
    }
  };

  timer = setTimeout(() => void tick(), intervalMs);
  active = { runId: input.runId, cleanup };
  return cleanup;
}

export function resetDossierRunHeartbeatForTest(): void {
  active?.cleanup();
  active = null;
}
