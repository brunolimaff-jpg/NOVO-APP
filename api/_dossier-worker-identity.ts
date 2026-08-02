/**
 * 05D.2A-R2 — contrato local da identidade de banco do worker.
 *
 * Este módulo é somente desenho/harness: não abre conexão, não lê env,
 * não chama Supabase e não materializa role, segredo ou RPC.
 */

export const WORKER_DATABASE_ACCESS_MODE = 'DEDICATED_POSTGRES_LOGIN_VIA_SUPAVISOR_TRANSACTION_POOLER' as const;
export const WORKER_USER_TOKEN_PERSISTENCE = 'PROHIBITED' as const;
export const WORKER_SERVICE_ROLE_IDENTITY = 'REJECTED' as const;
export const WORKER_ANON_IDENTITY = 'REJECTED' as const;
export const WORKER_CUSTOM_USER_JWT_IDENTITY = 'REJECTED' as const;
export const CRON_SECRET_IS_DATABASE_IDENTITY = false as const;

export const WORKER_IDENTITY_DESIGN = {
  databaseRole: 'dossier_worker_runtime',
  credentialStorage: 'VERCEL_ENVIRONMENT_SECRET_DESIGN_ONLY',
  poolerMode: 'SUPAVISOR_TRANSACTION',
  grants: 'WORKER_RPC_ONLY_NO_GENERIC_TABLE_ACCESS',
  rotation: 'DUAL_SECRET_WINDOW_DESIGN_ONLY',
  auditFields: ['worker_id', 'run_id', 'tenant_id', 'attempt', 'correlation_id'] as const,
  ownerDerivation: 'LOCKED_DOSSIER_RUN_ROW',
  userTokenPersistence: WORKER_USER_TOKEN_PERSISTENCE,
} as const;

export const WORKER_RPC_NAMES = [
  'claim_dossier_work_worker',
  'renew_dossier_work_worker',
  'checkpoint_dossier_work_worker',
  'schedule_dossier_retry_worker',
  'request_dossier_work_cancel_worker',
  'reconcile_dossier_work_result_worker',
  'persist_and_complete_dossier_run_worker',
] as const;

export type WorkerIdentityErrorCode =
  | 'DATABASE_IDENTITY_REQUIRED'
  | 'DATABASE_CREDENTIAL_INVALID'
  | 'WORKER_ROLE_REJECTED'
  | 'RUN_NOT_ELIGIBLE'
  | 'TENANT_BINDING_REQUIRED'
  | 'CLAIM_OWNER_REQUIRED'
  | 'CLAIM_LEASE_REQUIRED'
  | 'RUN_ALREADY_CLAIMED'
  | 'RUN_TERMINAL';

export class WorkerIdentityError extends Error {
  readonly code: WorkerIdentityErrorCode;

  constructor(code: WorkerIdentityErrorCode, message: string) {
    super(message);
    this.name = 'WorkerIdentityError';
    this.code = code;
  }
}

export type CredentialKind = 'CRON_SECRET' | 'DATABASE_LOGIN' | 'USER_ACCESS_TOKEN';

export interface WorkerCredentialAssertion {
  readonly kind: CredentialKind;
  readonly role: string | null;
  readonly proofDigest: string;
}

export interface WorkerRunRecord {
  readonly runId: string;
  readonly tenantId: string;
  readonly ownerId: string;
  readonly status: 'PENDING' | 'RUNNING' | 'COMPLETED';
  readonly workerId: string | null;
  readonly leaseToken: string | null;
  readonly attempt: number;
}

export interface WorkerClaim extends WorkerRunRecord {
  readonly status: 'RUNNING';
  readonly workerId: string;
  readonly leaseToken: string;
  readonly attempt: number;
}

export interface WorkerIdentityHarnessOptions {
  readonly validDatabaseProofDigest?: string;
}

function requireText(value: string, label: string): string {
  if (!value.trim()) throw new WorkerIdentityError('TENANT_BINDING_REQUIRED', `${label} é obrigatório`);
  return value;
}

function cloneRun(run: WorkerRunRecord): WorkerRunRecord {
  return { ...run };
}

/**
 * Harness síncrono do limite de segurança entre endpoint Cron e banco.
 * A linha do run é a autoridade de tenant/owner; o worker não os recebe como
 * argumento de autoridade.
 */
export class WorkerIdentityHarness {
  private readonly runs = new Map<string, WorkerRunRecord>();
  private readonly validDatabaseProofDigest: string;

  constructor(options: WorkerIdentityHarnessOptions = {}) {
    this.validDatabaseProofDigest = options.validDatabaseProofDigest ?? 'test-database-proof';
  }

  registerRun(runId: string, tenantId: string, ownerId: string): WorkerRunRecord {
    requireText(runId, 'runId');
    requireText(tenantId, 'tenantId');
    requireText(ownerId, 'ownerId');
    if (this.runs.has(runId)) throw new WorkerIdentityError('RUN_ALREADY_CLAIMED', 'Run já registrado');
    const run: WorkerRunRecord = {
      runId,
      tenantId,
      ownerId,
      status: 'PENDING',
      workerId: null,
      leaseToken: null,
      attempt: 0,
    };
    this.runs.set(runId, run);
    return cloneRun(run);
  }

  authenticateDatabase(assertion: WorkerCredentialAssertion): string {
    if (assertion.kind !== 'DATABASE_LOGIN') {
      throw new WorkerIdentityError('DATABASE_IDENTITY_REQUIRED', 'CRON_SECRET/token de usuário não é identidade de banco');
    }
    if (assertion.role !== WORKER_IDENTITY_DESIGN.databaseRole) {
      throw new WorkerIdentityError('WORKER_ROLE_REJECTED', 'Role não é a role dedicada do worker');
    }
    if (assertion.proofDigest !== this.validDatabaseProofDigest) {
      throw new WorkerIdentityError('DATABASE_CREDENTIAL_INVALID', 'Prova da credencial de banco inválida');
    }
    return assertion.role;
  }

  claimNext(assertion: WorkerCredentialAssertion, workerId: string): WorkerClaim | null {
    this.authenticateDatabase(assertion);
    requireText(workerId, 'workerId');
    const run = [...this.runs.values()].find(candidate => candidate.status === 'PENDING');
    if (!run) return null;
    const claim: WorkerClaim = {
      ...run,
      status: 'RUNNING',
      workerId,
      leaseToken: `lease:${run.runId}:${run.attempt + 1}`,
      attempt: run.attempt + 1,
    };
    this.runs.set(run.runId, claim);
    return { ...claim };
  }

  complete(
    assertion: WorkerCredentialAssertion,
    runId: string,
    workerId: string,
    leaseToken: string,
  ): WorkerRunRecord {
    this.authenticateDatabase(assertion);
    const run = this.runs.get(requireText(runId, 'runId'));
    if (!run) throw new WorkerIdentityError('RUN_NOT_ELIGIBLE', 'Run não existe');
    if (run.status === 'COMPLETED') throw new WorkerIdentityError('RUN_TERMINAL', 'Run já terminal');
    if (run.status !== 'RUNNING') throw new WorkerIdentityError('RUN_NOT_ELIGIBLE', 'Run ainda não foi reclamado');
    if (run.workerId !== workerId) throw new WorkerIdentityError('CLAIM_OWNER_REQUIRED', 'Worker não possui o claim');
    if (run.leaseToken !== leaseToken) throw new WorkerIdentityError('CLAIM_LEASE_REQUIRED', 'Lease não corresponde ao claim');
    const completed: WorkerRunRecord = { ...run, status: 'COMPLETED', workerId: null, leaseToken: null };
    this.runs.set(run.runId, completed);
    return cloneRun(completed);
  }

  read(runId: string): WorkerRunRecord {
    const run = this.runs.get(requireText(runId, 'runId'));
    if (!run) throw new WorkerIdentityError('RUN_NOT_ELIGIBLE', 'Run não existe');
    return cloneRun(run);
  }
}
