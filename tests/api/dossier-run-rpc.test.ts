import { describe, expect, it, vi } from 'vitest';
import {
  createDossierRunRpcClient,
  DOSSIER_RUN_RPC_NAMES,
  DossierRunRpcError,
} from '../../api/_dossier-run-rpc';

const AUTH = {
  url: 'https://example.supabase.co/',
  token: 'secret-user-token',
  anonKey: 'anon-key',
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stalledResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: () => new Promise<string>(() => undefined),
  } as Response;
}

describe('dossier run RPC client', () => {
  it('usa somente os RPCs do contrato, envia headers/body e nunca ativa keepalive', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse([{ status: 'OK' }]));
    vi.stubGlobal('fetch', fetchSpy);
    const client = createDossierRunRpcClient(AUTH);
    const controller = new AbortController();

    for (const rpcName of DOSSIER_RUN_RPC_NAMES) {
      await expect(client(rpcName, { p_run_id: 'run-1' }, controller.signal, { timeoutMs: 100 })).resolves.toMatchObject({ status: 'OK' });
    }

    expect(fetchSpy).toHaveBeenCalledTimes(DOSSIER_RUN_RPC_NAMES.length);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, NonNullable<Parameters<typeof fetch>[1]>];
    expect(url).toBe('https://example.supabase.co/rest/v1/rpc/begin_dossier_run_attempt');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBeUndefined();
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${AUTH.token}`,
      apikey: AUTH.anonKey,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual({ p_run_id: 'run-1' });
  });

  it('não inicia fetch quando o chamador já cancelou e propaga cancelamento real', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const client = createDossierRunRpcClient(AUTH);
    const controller = new AbortController();
    controller.abort();

    await expect(client('begin_dossier_run_attempt', {}, controller.signal, { timeoutMs: 100 })).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
      status: 499,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('aborta fetch que fica pendente dentro do prazo da operação', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn((_url: string, init: NonNullable<Parameters<typeof fetch>[1]>) => {
      requestSignal = init.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const client = createDossierRunRpcClient(AUTH);

    await expect(client('get_dossier_run_resume_state', {}, new AbortController().signal, { timeoutMs: 20 })).rejects.toMatchObject({
      code: 'RPC_TIMEOUT',
      status: 504,
    });
    expect(requestSignal?.aborted).toBe(true);
  });

  it('aplica o mesmo deadline à leitura do corpo e não deixa body stalled pendurado', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn(async (_url: string, init: NonNullable<Parameters<typeof fetch>[1]>) => {
      requestSignal = init.signal as AbortSignal;
      await new Promise(resolve => setTimeout(resolve, 12));
      return stalledResponse();
    });
    vi.stubGlobal('fetch', fetchSpy);
    const client = createDossierRunRpcClient(AUTH);
    const startedAt = Date.now();

    await expect(client('record_dossier_run_checkpoint', {}, new AbortController().signal, { timeoutMs: 25 })).rejects.toMatchObject({
      code: 'RPC_TIMEOUT',
      status: 504,
    });
    expect(Date.now() - startedAt).toBeLessThan(150);
    expect(requestSignal?.aborted).toBe(true);
  });

  it('mapeia JSON inválido e erros HTTP sem expor token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 500 })));
    const client = createDossierRunRpcClient(AUTH);
    await expect(client('fail_dossier_run_attempt', {}, new AbortController().signal, { timeoutMs: 100 })).rejects.toMatchObject({
      code: 'RPC_INVALID_RESPONSE',
      status: 502,
    });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ code: 'ATTEMPT_FENCE_MISMATCH', token: AUTH.token }, 409)));
    await expect(client('fail_dossier_run_attempt', {}, new AbortController().signal, { timeoutMs: 100 })).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(DossierRunRpcError);
      expect((error as Error).message).not.toContain(AUTH.token);
      return (error as DossierRunRpcError).code === 'ATTEMPT_FENCE_MISMATCH';
    });
  });
});
