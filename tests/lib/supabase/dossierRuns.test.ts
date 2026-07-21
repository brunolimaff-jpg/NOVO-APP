import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../../lib/supabaseClient', () => ({ supabase: { rpc }, isSupabaseAvailable: () => true }));

import * as runs from '../../../lib/supabase/dossierRuns';

const run = { run_id: 'run', status: 'RUNNING' as const, lease_expires_at: 'future', cancel_requested_at: null };
type RpcResponse = { data: typeof run | null; error: { message: string; code?: string } | null };

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createBuilder(response: Promise<RpcResponse>) {
  let signal: AbortSignal | undefined;
  const abortSignal = vi.fn((nextSignal: AbortSignal) => {
    signal = nextSignal;
    return response;
  });
  return { abortSignal, signal: () => signal };
}

function successfulBuilder() {
  return createBuilder(Promise.resolve({ data: run, error: null }));
}

beforeEach(() => {
  vi.useRealTimers();
  rpc.mockReset();
  rpc.mockImplementation(successfulBuilder);
});

afterEach(() => vi.useRealTimers());

describe('dossier runs RPC', () => {
  it('usa somente RPCs, sem ownership browser, e encadeia AbortSignal no builder', async () => {
    await runs.createOrGetDossierRun({ sessionId: '00000000-0000-4000-8000-000000000001', idempotencyKey: 'key' });
    await runs.getDossierRun('run');
    await runs.acquireDossierRunLease('run', 'lease');
    await runs.renewDossierRunLease('run', 'lease');
    await runs.releaseDossierRunLease('run', 'lease');
    await runs.requestDossierRunCancellation('run');
    await runs.markDossierRunCancelled('run', 'lease');
    await runs.markDossierRunCompleted('run', 'lease', '00000000-0000-4000-8000-000000000002');
    await runs.markDossierRunFailed('run', 'lease', 'x', 'y');

    expect(rpc).toHaveBeenCalledTimes(9);
    for (const [, payload] of rpc.mock.calls) {
      expect(payload).not.toHaveProperty('owner_id');
      expect(payload).not.toHaveProperty('operator_id');
    }
    for (const builder of rpc.mock.results.map(result => result.value as ReturnType<typeof successfulBuilder>)) {
      expect(builder.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
      expect(builder.signal()?.aborted).toBe(false);
    }
  });

  it('preserva erro real do Supabase como causa', async () => {
    const supabaseError = { message: 'boom', code: '08006' };
    rpc.mockReturnValueOnce(createBuilder(Promise.resolve({ data: null, error: supabaseError })));
    await expect(runs.getDossierRun('run')).rejects.toMatchObject({ message: 'RPC get_own_dossier_run falhou: boom', cause: supabaseError });
  });

  it('required rejeita null, mas lease nullable devolve null', async () => {
    rpc.mockReturnValueOnce(createBuilder(Promise.resolve({ data: null, error: null })));
    await expect(runs.getDossierRun('run')).rejects.toThrow('RPC get_own_dossier_run retornou vazio');
    rpc.mockReturnValueOnce(createBuilder(Promise.resolve({ data: null, error: null })));
    await expect(runs.acquireDossierRunLease('run', 'lease')).resolves.toBeNull();
    rpc.mockReturnValueOnce(createBuilder(Promise.resolve({ data: null, error: null })));
    await expect(runs.renewDossierRunLease('run', 'lease')).resolves.toBeNull();
  });

  it('create e terminais continuam required', async () => {
    rpc.mockImplementation(() => createBuilder(Promise.resolve({ data: null, error: null })));
    await expect(runs.createOrGetDossierRun({ sessionId: 's', idempotencyKey: 'k' })).rejects.toThrow('vazio');
    await expect(runs.markDossierRunCompleted('run', 'lease', 'dossier')).rejects.toThrow('vazio');
    await expect(runs.markDossierRunFailed('run', 'lease', 'x', 'y')).rejects.toThrow('vazio');
  });

  it('timeout aborta fisicamente o request e preserva erro próprio', async () => {
    vi.useFakeTimers();
    const pending = createDeferred<RpcResponse>();
    const builder = createBuilder(pending.promise);
    rpc.mockReturnValueOnce(builder);
    const call = runs.acquireDossierRunLease('run', 'lease', { timeoutMs: 10 });
    const rejected = expect(call).rejects.toBeInstanceOf(runs.DossierRunRpcTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    expect(builder.signal()?.aborted).toBe(true);
    await rejected;
    pending.reject(new DOMException('fetch aborted', 'AbortError'));
    await Promise.resolve();
  });

  it('abort externo antes da RPC não chama builder', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runs.createOrGetDossierRun({ sessionId: 's', idempotencyKey: 'k' }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('abort externo cancela request real sem virar timeout', async () => {
    const pending = createDeferred<RpcResponse>();
    const builder = createBuilder(pending.promise);
    rpc.mockReturnValueOnce(builder);
    const controller = new AbortController();
    const call = runs.createOrGetDossierRun({ sessionId: 's', idempotencyKey: 'k' }, { signal: controller.signal, timeoutMs: 1_000 });
    const rejected = expect(call).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    expect(builder.signal()?.aborted).toBe(true);
    await rejected;
    pending.reject(new DOMException('fetch aborted', 'AbortError'));
    await Promise.resolve();
  });

  it('limpa timeout e listener externo após sucesso', async () => {
    vi.useFakeTimers();
    const builder = successfulBuilder();
    rpc.mockReturnValueOnce(builder);
    const controller = new AbortController();
    await expect(runs.getDossierRun('run', { signal: controller.signal, timeoutMs: 10 })).resolves.toEqual(run);
    controller.abort();
    await vi.advanceTimersByTimeAsync(20);
    expect(builder.signal()?.aborted).toBe(false);
  });

  it('chave é estável e normaliza CNPJ', () => {
    expect(runs.createDossierRunIdempotencyKey({ cnpj: '12.345.678/0001-90', mode: 'm', contractVersion: 'v', clientAttemptId: 'a' })).toBe('12345678000190:m:v:a');
  });
});
