import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { normalizeCnpj } from '../../utils/cnpj';
import { resolveRuntimeAppVersion, resolveRuntimeEnvironment } from '../runtimeMetadata';

export type DossierRunStatus = 'PENDING' | 'RUNNING' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'COMPLETED' | 'FAILED';
export interface DossierRun {
  run_id: string; status: DossierRunStatus; cancel_requested_at: string | null; lease_expires_at: string | null; lease_owner?: string | null;
}
export interface DossierRunContext { sessionId: string; runId: string; leaseOwner: string; clientAttemptId: string; }
export type DossierRunTerminalResult = { status: 'COMPLETED' | 'CANCELLED'; runId: string } | { status: 'FAILED'; runId: string; errorCode?: string; errorStage?: string };

export const DOSSIER_RUN_RPC_TIMEOUT_MS = 15_000;
export class DossierRunRpcTimeoutError extends Error {
  constructor(operationName: string) {
    super(`RPC do lifecycle do dossiê excedeu o timeout: ${operationName}`);
    this.name = 'DossierRunRpcTimeoutError';
  }
}
export type RpcOptions = { signal?: AbortSignal; timeoutMs?: number };
type RpcAbortContext = {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
};

function requiredClient() {
  if (!isSupabaseAvailable() || !supabase) throw new Error('Supabase indisponível para lifecycle do dossiê');
  return supabase;
}
export async function withAbortAndTimeout<T>(operation: PromiseLike<T>, options: RpcOptions | undefined, operationName: string): Promise<T> {
  const signal = options?.signal;
  if (signal?.aborted) throw new DOMException(`RPC abortada: ${operationName}`, 'AbortError');
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  try {
    const races: Array<Promise<T>> = [Promise.resolve(operation)];
    if (signal) {
      races.push(new Promise<T>((_, reject) => {
        abortListener = () => reject(new DOMException(`RPC abortada: ${operationName}`, 'AbortError'));
        signal.addEventListener('abort', abortListener, { once: true });
      }));
    }
    const timeoutMs = options?.timeoutMs;
    if (timeoutMs !== undefined) {
      races.push(new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new DossierRunRpcTimeoutError(operationName)), timeoutMs);
      }));
    }
    return await Promise.race(races);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (signal && abortListener) signal.removeEventListener('abort', abortListener);
  }
}

function abortError(operationName: string): DOMException {
  return new DOMException(`RPC abortada: ${operationName}`, 'AbortError');
}

function createRpcAbortContext(options: RpcOptions | undefined, operationName: string): RpcAbortContext {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const externalSignal = options?.signal;
  const onExternalAbort = () => controller.abort();

  if (externalSignal) externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  if (options?.timeoutMs !== undefined) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

async function awaitAbortableRpc<T>(
  request: PromiseLike<T>,
  context: RpcAbortContext,
  operationName: string,
): Promise<T> {
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(context.didTimeout() ? new DossierRunRpcTimeoutError(operationName) : abortError(operationName));
    context.signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([Promise.resolve(request), aborted]);
  } catch (error) {
    if (context.didTimeout()) throw new DossierRunRpcTimeoutError(operationName);
    if (context.signal.aborted) throw abortError(operationName);
    throw error;
  } finally {
    if (onAbort) context.signal.removeEventListener('abort', onAbort);
  }
}

async function rpcNullable<T>(fn: string, args: Record<string, unknown>, options?: RpcOptions): Promise<T | null> {
  if (options?.signal?.aborted) throw abortError(fn);
  const context = createRpcAbortContext(options, fn);
  try {
    const request = requiredClient().rpc(fn, args).abortSignal(context.signal);
    const { data, error } = await awaitAbortableRpc(request, context, fn);
    if (error) throw new Error(`RPC ${fn} falhou: ${error.message}`, { cause: error });
    return data === null ? null : data as T;
  } finally {
    context.cleanup();
  }
}
async function rpcRequired<T>(fn: string, args: Record<string, unknown>, options?: RpcOptions): Promise<T> {
  const data = await rpcNullable<T>(fn, args, options);
  if (data === null) throw new Error(`RPC ${fn} retornou vazio`);
  return data;
}
export function createDossierRunIdempotencyKey(input: { cnpj?: string | null; mode: string; contractVersion: string; clientAttemptId: string }): string {
  return [normalizeCnpj(input.cnpj ?? ''), input.mode.trim(), input.contractVersion.trim(), input.clientAttemptId.trim()].join(':');
}
export async function createOrGetDossierRun(input: { sessionId: string; idempotencyKey: string }, options?: RpcOptions): Promise<DossierRun> {
  return rpcRequired('create_or_get_dossier_run', { p_idempotency_key: input.idempotencyKey, p_session_id: input.sessionId, p_environment: resolveRuntimeEnvironment(), p_app_version: resolveRuntimeAppVersion() }, options);
}
export const getDossierRun = (runId: string, options?: RpcOptions) => rpcRequired<DossierRun>('get_own_dossier_run', { p_run_id: runId }, options);
export const acquireDossierRunLease = (runId: string, leaseOwner: string, options?: RpcOptions) => rpcNullable<DossierRun>('acquire_dossier_run_lease', { p_run_id: runId, p_lease_owner: leaseOwner }, options);
export const renewDossierRunLease = (runId: string, leaseOwner: string, options?: RpcOptions) => rpcNullable<DossierRun>('renew_dossier_run_lease', { p_run_id: runId, p_lease_owner: leaseOwner }, options);
export const releaseDossierRunLease = (runId: string, leaseOwner: string, options?: RpcOptions) => rpcNullable<DossierRun>('release_dossier_run_lease', { p_run_id: runId, p_lease_owner: leaseOwner }, options);
export const requestDossierRunCancellation = (runId: string, options?: RpcOptions) => rpcRequired<DossierRun>('request_dossier_run_cancel', { p_run_id: runId }, options);
export const markDossierRunCancelled = (runId: string, leaseOwner: string, options?: RpcOptions) => rpcRequired<DossierRun>('mark_dossier_run_cancelled', { p_run_id: runId, p_lease_owner: leaseOwner }, options);
export const markDossierRunCompleted = (runId: string, leaseOwner: string, dossierId: string, options?: RpcOptions) => rpcRequired<DossierRun>('complete_dossier_run', { p_run_id: runId, p_lease_owner: leaseOwner, p_dossier_id: dossierId }, options);
export const markDossierRunFailed = (runId: string, leaseOwner: string, errorCode: string, errorStage: string, options?: RpcOptions) => rpcRequired<DossierRun>('fail_dossier_run', { p_run_id: runId, p_lease_owner: leaseOwner, p_error_code: errorCode, p_error_stage: errorStage }, options);
