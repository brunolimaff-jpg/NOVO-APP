import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/supabase/dossierRuns', () => ({ getDossierRun: get }));

import {
  assertDossierRunCanContinue,
  DossierRunCancelledError,
  DossierRunLeaseLostError,
  DossierRunReadError,
  isDossierRunControlError,
} from '../../../features/dossier/dossier-run-control';

const valid = { run_id: 'r', status: 'RUNNING' as const, cancel_requested_at: null, lease_expires_at: new Date(Date.now() + 60_000).toISOString(), lease_owner: 'l' };
const signal = () => new AbortController().signal;
const assert = (input: Partial<Parameters<typeof assertDossierRunCanContinue>[0]> = {}) =>
  assertDossierRunCanContinue({ runId: 'r', leaseOwner: 'l', signal: signal(), stage: 'before_benchmark', ...input });

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(valid);
});

describe('dossier run control', () => {
  it('abort local não consulta remoto', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(assert({ signal: controller.signal })).rejects.toBeInstanceOf(DossierRunCancelledError);
    expect(get).not.toHaveBeenCalled();
  });

  it.each([{ status: 'CANCEL_REQUESTED' }, { status: 'CANCELLED' }, { cancel_requested_at: 'x' }])('cancel remoto lido não sofre retry', async patch => {
    get.mockResolvedValue({ ...valid, ...patch });
    await expect(assert()).rejects.toBeInstanceOf(DossierRunCancelledError);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each([{ status: 'COMPLETED' }, { status: 'FAILED' }, { lease_owner: 'other' }])('terminal ou lease perdida lidos não sofrem retry', async patch => {
    get.mockResolvedValue({ ...valid, ...patch });
    await expect(assert()).rejects.toBeInstanceOf(DossierRunLeaseLostError);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('primeira e segunda falha podem recuperar sem cache entre checkpoints', async () => {
    get.mockRejectedValueOnce(new Error('first')).mockResolvedValueOnce(valid);
    await expect(assert()).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledTimes(2);

    get.mockRejectedValueOnce(new Error('first')).mockRejectedValueOnce(new Error('second')).mockResolvedValueOnce(valid);
    await expect(assert()).resolves.toBeUndefined();
    expect(get).toHaveBeenCalledTimes(5);
  });

  it('três falhas fecham com última causa e stage', async () => {
    const first = new Error('first');
    const second = new Error('second');
    const last = new Error('last');
    get.mockRejectedValueOnce(first).mockRejectedValueOnce(second).mockRejectedValueOnce(last);
    await expect(assert({ stage: 'after_query_collector' })).rejects.toMatchObject({
      name: 'DossierRunReadError',
      cause: last,
      message: 'Falha ao consultar lifecycle do dossiê na etapa after_query_collector',
    });
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('abort durante backoff encerra imediatamente', async () => {
    get.mockRejectedValueOnce(new Error('network'));
    const controller = new AbortController();
    const pending = assert({ signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    controller.abort();
    await rejected;
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('reconhece somente erros de controle do lifecycle', () => {
    expect(isDossierRunControlError(new DossierRunCancelledError('remote_cancel'))).toBe(true);
    expect(isDossierRunControlError(new DossierRunLeaseLostError())).toBe(true);
    expect(isDossierRunControlError(new DossierRunReadError('rpc'))).toBe(true);
    expect(isDossierRunControlError(new Error('rpc'))).toBe(false);
  });
});
