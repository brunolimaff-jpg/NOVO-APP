import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { rpc }, isSupabaseAvailable: () => true }));
import * as runs from '../../../lib/supabase/dossierRuns';
beforeEach(() => rpc.mockResolvedValue({ data: { run_id: 'run', status: 'RUNNING', lease_expires_at: 'x', cancel_requested_at: null }, error: null }));
describe('dossier runs RPC', () => {
  it('usa somente RPCs e sem ownership browser', async () => {
    await runs.createOrGetDossierRun({ sessionId: '00000000-0000-4000-8000-000000000001', idempotencyKey: 'key' });
    await runs.getDossierRun('run'); await runs.acquireDossierRunLease('run','lease'); await runs.renewDossierRunLease('run','lease'); await runs.releaseDossierRunLease('run','lease'); await runs.requestDossierRunCancellation('run'); await runs.markDossierRunCancelled('run','lease'); await runs.markDossierRunCompleted('run','lease','00000000-0000-4000-8000-000000000002'); await runs.markDossierRunFailed('run','lease','x','y');
    expect(rpc).toHaveBeenCalledTimes(9); for (const [, payload] of rpc.mock.calls) { expect(payload).not.toHaveProperty('owner_id'); expect(payload).not.toHaveProperty('operator_id'); }
  });
  it('chave é estável e normaliza CNPJ', () => {
    expect(runs.createDossierRunIdempotencyKey({ cnpj:'12.345.678/0001-90',mode:'m',contractVersion:'v',clientAttemptId:'a' })).toBe('12345678000190:m:v:a');
    expect(runs.createDossierRunIdempotencyKey({ cnpj:'12345678000190',mode:'m',contractVersion:'v',clientAttemptId:'a' })).not.toBe(runs.createDossierRunIdempotencyKey({ cnpj:'12345678000190',mode:'m',contractVersion:'v',clientAttemptId:'b' }));
  });
  it('propaga erro e vazio', async () => { rpc.mockResolvedValueOnce({ data:null,error:{message:'boom'} }); await expect(runs.getDossierRun('run')).rejects.toThrow('boom'); rpc.mockResolvedValueOnce({ data:null,error:null }); await expect(runs.getDossierRun('run')).rejects.toThrow('vazio'); });
});
