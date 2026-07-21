import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { rpc }, isSupabaseAvailable: () => true }));

import * as runs from '../../../lib/supabase/dossierRuns';

const run = { run_id: 'run', status: 'RUNNING' as const, lease_expires_at: 'future', cancel_requested_at: null };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.useRealTimers();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: run, error: null });
});

describe('dossier runs RPC', () => {
  it('usa somente RPCs e sem ownership browser', async () => {
    await runs.createOrGetDossierRun({ sessionId: '00000000-0000-4000-8000-000000000001', idempotencyKey: 'key' });
    await runs.getDossierRun('run'); await runs.acquireDossierRunLease('run', 'lease'); await runs.renewDossierRunLease('run', 'lease'); await runs.releaseDossierRunLease('run', 'lease'); await runs.requestDossierRunCancellation('run'); await runs.markDossierRunCancelled('run', 'lease'); await runs.markDossierRunCompleted('run', 'lease', '00000000-0000-4000-8000-000000000002'); await runs.markDossierRunFailed('run', 'lease', 'x', 'y');
    expect(rpc).toHaveBeenCalledTimes(9);
    for (const [, payload] of rpc.mock.calls) {
      expect(payload).not.toHaveProperty('owner_id');
      expect(payload).not.toHaveProperty('operator_id');
    }
  });

  it('chave é estável e normaliza CNPJ', () => {
    expect(runs.createDossierRunIdempotencyKey({ cnpj: '12.345.678/0001-90', mode: 'm', contractVersion: 'v', clientAttemptId: 'a' })).toBe('12345678000190:m:v:a');
  });

  it('preserva erro real do Supabase como causa', async () => {
    const supabaseError = { message: 'boom', code: '08006' };
    rpc.mockResolvedValueOnce({ data: null, error: supabaseError });
    await expect(runs.getDossierRun('run')).rejects.toMatchObject({ message: 'RPC get_own_dossier_run falhou: boom', cause: supabaseError });
  });

  it('required rejeita null, mas lease nullable devolve null', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(runs.getDossierRun('run')).rejects.toThrow('RPC get_own_dossier_run retornou vazio');
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(runs.acquireDossierRunLease('run', 'lease')).resolves.toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(runs.renewDossierRunLease('run', 'lease')).resolves.toBeNull();
  });

  it('create e transições terminais continuam required', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(runs.createOrGetDossierRun({ sessionId: 's', idempotencyKey: 'k' })).rejects.toThrow('vazio');
    await expect(runs.markDossierRunCompleted('run', 'lease', 'dossier')).rejects.toThrow('vazio');
    await expect(runs.markDossierRunFailed('run', 'lease', 'x', 'y')).rejects.toThrow('vazio');
  });

  it('timeout é erro próprio, não conflito de lease', async () => {
    vi.useFakeTimers();
    const late = deferred<{ data: typeof run; error: null }>();
    rpc.mockReturnValueOnce(late.promise);
    const pending = runs.acquireDossierRunLease('run', 'lease', { timeoutMs: 10 });
    const rejected = expect(pending).rejects.toBeInstanceOf(runs.DossierRunRpcTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    late.resolve({ data: run, error: null });
    await Promise.resolve();
  });

  it('AbortSignal já abortado e abort durante RPC rejeitam imediatamente', async () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(runs.createOrGetDossierRun({ sessionId: 's', idempotencyKey: 'k' }, { signal: alreadyAborted.signal })).rejects.toMatchObject({ name: 'AbortError' });

    const pendingRpc = deferred<{ data: typeof run; error: null }>();
    rpc.mockReturnValueOnce(pendingRpc.promise);
    const controller = new AbortController();
    const pending = runs.createOrGetDossierRun({ sessionId: 's', idempotencyKey: 'k' }, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    pendingRpc.resolve({ data: run, error: null });
    await Promise.resolve();
  });
});
