import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { normalizeCnpj } from '../../utils/cnpj';
import { resolveRuntimeAppVersion, resolveRuntimeEnvironment } from '../runtimeMetadata';

export type DossierRunStatus = 'PENDING' | 'RUNNING' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'COMPLETED' | 'FAILED';
export interface DossierRun {
  run_id: string; status: DossierRunStatus; cancel_requested_at: string | null; lease_expires_at: string | null; lease_owner?: string | null;
}
export interface DossierRunContext { sessionId: string; runId: string; leaseOwner: string; clientAttemptId: string; }
export type DossierRunTerminalResult = { status: 'COMPLETED' | 'CANCELLED'; runId: string } | { status: 'FAILED'; runId: string; errorCode?: string; errorStage?: string };

function requiredClient() {
  if (!isSupabaseAvailable() || !supabase) throw new Error('Supabase indisponível para lifecycle do dossiê');
  return supabase;
}
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await requiredClient().rpc(fn, args);
  if (error) throw new Error(`RPC ${fn} falhou: ${error.message}`);
  if (!data) throw new Error(`RPC ${fn} retornou vazio`);
  return data as T;
}
export function createDossierRunIdempotencyKey(input: { cnpj?: string | null; mode: string; contractVersion: string; clientAttemptId: string }): string {
  return [normalizeCnpj(input.cnpj ?? ''), input.mode.trim(), input.contractVersion.trim(), input.clientAttemptId.trim()].join(':');
}
export async function createOrGetDossierRun(input: { sessionId: string; idempotencyKey: string }): Promise<DossierRun> {
  return rpc('create_or_get_dossier_run', { p_idempotency_key: input.idempotencyKey, p_session_id: input.sessionId, p_environment: resolveRuntimeEnvironment(), p_app_version: resolveRuntimeAppVersion() });
}
export const getDossierRun = (runId: string) => rpc<DossierRun>('get_own_dossier_run', { p_run_id: runId });
export const acquireDossierRunLease = (runId: string, leaseOwner: string) => rpc<DossierRun>('acquire_dossier_run_lease', { p_run_id: runId, p_lease_owner: leaseOwner });
export const renewDossierRunLease = (runId: string, leaseOwner: string) => rpc<DossierRun>('renew_dossier_run_lease', { p_run_id: runId, p_lease_owner: leaseOwner });
export const releaseDossierRunLease = (runId: string, leaseOwner: string) => rpc<DossierRun>('release_dossier_run_lease', { p_run_id: runId, p_lease_owner: leaseOwner });
export const requestDossierRunCancellation = (runId: string) => rpc<DossierRun>('request_dossier_run_cancel', { p_run_id: runId });
export const markDossierRunCancelled = (runId: string, leaseOwner: string) => rpc<DossierRun>('mark_dossier_run_cancelled', { p_run_id: runId, p_lease_owner: leaseOwner });
export const markDossierRunCompleted = (runId: string, leaseOwner: string, dossierId: string) => rpc<DossierRun>('complete_dossier_run', { p_run_id: runId, p_lease_owner: leaseOwner, p_dossier_id: dossierId });
export const markDossierRunFailed = (runId: string, leaseOwner: string, errorCode: string, errorStage: string) => rpc<DossierRun>('fail_dossier_run', { p_run_id: runId, p_lease_owner: leaseOwner, p_error_code: errorCode, p_error_stage: errorStage });
