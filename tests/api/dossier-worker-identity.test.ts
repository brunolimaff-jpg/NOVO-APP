import { describe, expect, it } from 'vitest';
import {
  CRON_SECRET_IS_DATABASE_IDENTITY,
  WORKER_ANON_IDENTITY,
  WORKER_CUSTOM_USER_JWT_IDENTITY,
  WORKER_DATABASE_ACCESS_MODE,
  WORKER_IDENTITY_DESIGN,
  WORKER_SERVICE_ROLE_IDENTITY,
  WORKER_USER_TOKEN_PERSISTENCE,
  WorkerIdentityError,
  WorkerIdentityHarness,
  type WorkerCredentialAssertion,
} from '../../api/_dossier-worker-identity';

const validDatabaseCredential: WorkerCredentialAssertion = {
  kind: 'DATABASE_LOGIN',
  role: WORKER_IDENTITY_DESIGN.databaseRole,
  proofDigest: 'test-database-proof',
};

describe('dossier worker identity 05D.2A-R2', () => {
  it('congela pooler transaction e rejeita identidades amplas ou de usuário', () => {
    expect(WORKER_DATABASE_ACCESS_MODE).toBe('DEDICATED_POSTGRES_LOGIN_VIA_SUPAVISOR_TRANSACTION_POOLER');
    expect(WORKER_IDENTITY_DESIGN.poolerMode).toBe('SUPAVISOR_TRANSACTION');
    expect(WORKER_IDENTITY_DESIGN.grants).toBe('WORKER_RPC_ONLY_NO_GENERIC_TABLE_ACCESS');
    expect(WORKER_USER_TOKEN_PERSISTENCE).toBe('PROHIBITED');
    expect(WORKER_SERVICE_ROLE_IDENTITY).toBe('REJECTED');
    expect(WORKER_ANON_IDENTITY).toBe('REJECTED');
    expect(WORKER_CUSTOM_USER_JWT_IDENTITY).toBe('REJECTED');
    expect(CRON_SECRET_IS_DATABASE_IDENTITY).toBe(false);
  });

  it('mantém CRON_SECRET separado da identidade de banco', () => {
    const harness = new WorkerIdentityHarness();
    expect(() => harness.authenticateDatabase({ kind: 'CRON_SECRET', role: null, proofDigest: 'test-database-proof' }))
      .toThrowError(new WorkerIdentityError('DATABASE_IDENTITY_REQUIRED', 'CRON_SECRET/token de usuário não é identidade de banco'));
    expect(() => harness.authenticateDatabase({ kind: 'USER_ACCESS_TOKEN', role: null, proofDigest: 'test-database-proof' }))
      .toThrowError(new WorkerIdentityError('DATABASE_IDENTITY_REQUIRED', 'CRON_SECRET/token de usuário não é identidade de banco'));
  });

  it('credencial inválida não reclama nem conclui run', () => {
    const harness = new WorkerIdentityHarness();
    harness.registerRun('run-1', 'tenant-a', 'owner-a');
    const invalid: WorkerCredentialAssertion = {
      kind: 'DATABASE_LOGIN',
      role: WORKER_IDENTITY_DESIGN.databaseRole,
      proofDigest: 'invalid-proof',
    };
    expect(() => harness.claimNext(invalid, 'worker-a')).toThrowError('Prova da credencial de banco inválida');
    expect(harness.read('run-1').status).toBe('PENDING');
  });

  it('deriva tenant e owner da linha reclamada, sem entrada arbitrária do worker', () => {
    const harness = new WorkerIdentityHarness();
    harness.registerRun('run-1', 'tenant-a', 'owner-a');
    const claim = harness.claimNext(validDatabaseCredential, 'worker-a');
    expect(claim).toMatchObject({ runId: 'run-1', tenantId: 'tenant-a', ownerId: 'owner-a', workerId: 'worker-a' });
    expect(claim?.tenantId).not.toBe('tenant-b');
    expect(claim?.ownerId).not.toBe('owner-attacker');
  });

  it('mantém exclusão entre dois workers e não troca ownership', () => {
    const harness = new WorkerIdentityHarness();
    harness.registerRun('run-1', 'tenant-a', 'owner-a');
    const first = harness.claimNext(validDatabaseCredential, 'worker-a');
    const second = harness.claimNext(validDatabaseCredential, 'worker-b');
    expect(first?.workerId).toBe('worker-a');
    expect(second).toBeNull();
    expect(() => harness.complete(validDatabaseCredential, 'run-1', 'worker-b', first?.leaseToken ?? 'missing'))
      .toThrowError('Worker não possui o claim');
  });

  it('exige worker e lease atuais para conclusão atômica', () => {
    const harness = new WorkerIdentityHarness();
    harness.registerRun('run-1', 'tenant-a', 'owner-a');
    const claim = harness.claimNext(validDatabaseCredential, 'worker-a');
    expect(claim).not.toBeNull();
    expect(() => harness.complete(validDatabaseCredential, 'run-1', 'worker-a', 'wrong-lease'))
      .toThrowError('Lease não corresponde ao claim');
    const completed = harness.complete(validDatabaseCredential, 'run-1', 'worker-a', claim?.leaseToken ?? 'missing');
    expect(completed.status).toBe('COMPLETED');
    expect(() => harness.complete(validDatabaseCredential, 'run-1', 'worker-a', claim?.leaseToken ?? 'missing'))
      .toThrowError('Run já terminal');
  });

  it('não permite role diferente nem worker escolher owner_id', () => {
    const harness = new WorkerIdentityHarness();
    harness.registerRun('run-1', 'tenant-a', 'owner-a');
    expect(() => harness.authenticateDatabase({
      kind: 'DATABASE_LOGIN',
      role: 'service_role',
      proofDigest: 'test-database-proof',
    })).toThrowError('Role não é a role dedicada do worker');
    const claim = harness.claimNext(validDatabaseCredential, 'worker-a');
    expect(claim?.ownerId).toBe('owner-a');
  });

  it('expõe apenas o contrato de RPC worker-only, sem permissão genérica', () => {
    expect(WORKER_IDENTITY_DESIGN.auditFields).toContain('tenant_id');
    expect(WORKER_IDENTITY_DESIGN.ownerDerivation).toBe('LOCKED_DOSSIER_RUN_ROW');
  });
});
