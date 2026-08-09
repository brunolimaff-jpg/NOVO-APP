/**
 * BRU-33 — Semântica abort vs timeout no llmProxy (último bloqueador,
 * Planejador 2026-08-09). O deadline Gold de 120s usa AbortSignal.timeout:
 * quando ele dispara, o signal aborta com TimeoutError e o proxy precisa
 * PROPAGAR TimeoutError (→ fallback no seam). Antes, tudo virava AbortError
 * e o seam interpretava como user abort → CANCELLED indevido.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyChatSendMessage } from '../../services/llmProxy';

function stubFetchPending(): ReturnType<typeof vi.fn> {
  const fetcher = vi.fn(
    (_url: string, opts: { signal?: AbortSignal | null }) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = opts.signal as AbortSignal;
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

/** fetch resolve headers (Response fake com text() pendente) — o abort decide no body-read. */
function stubFetchHeadersOnly(): ReturnType<typeof vi.fn> {
  const fetcher = vi.fn(async () => ({ text: () => new Promise<string>(() => {}) }) as unknown as Response);
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('llmProxy — abort vs timeout (BRU-33)', () => {
  it('timeout externo (deadline Gold 120s) propaga TimeoutError — NÃO AbortError', async () => {
    stubFetchPending();
    const signal = AbortSignal.timeout(80); // aborta com DOMException TimeoutError

    await expect(proxyChatSendMessage({ model: 'scout-gold-compact', systemInstruction: '', history: [], message: 'x' }, signal)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('user abort (sem reason) propaga AbortError — CANCELLED no seam', async () => {
    stubFetchPending();
    const controller = new AbortController();
    const promise = proxyChatSendMessage({ model: 'scout-gold-compact', systemInstruction: '', history: [], message: 'x' }, controller.signal);
    setTimeout(() => controller.abort(), 30);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('timeout interno do proxy (sem signal externo) mantém "LLM proxy timeout"', async () => {
    vi.useFakeTimers();
    stubFetchPending();

    const promise = proxyChatSendMessage({ model: 'scout-gold-compact', systemInstruction: '', history: [], message: 'x' });
    const assertion = expect(promise).rejects.toThrow(/LLM proxy timeout after \d+ms/);
    await vi.advanceTimersByTimeAsync(300_000); // LLM_PROXY_TIMEOUT_MS default 290s
    await assertion;
  });

  it('A: TimeoutError DURANTE response.text() permanece TimeoutError (body-read)', async () => {
    stubFetchHeadersOnly();
    const signal = AbortSignal.timeout(80); // headers retornados, text pendente → abort decide no body-read

    await expect(proxyChatSendMessage({ model: 'scout-gold-compact', systemInstruction: '', history: [], message: 'x' }, signal)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('B: user AbortError DURANTE response.text() permanece AbortError (body-read)', async () => {
    stubFetchHeadersOnly();
    const controller = new AbortController();
    const promise = proxyChatSendMessage({ model: 'scout-gold-compact', systemInstruction: '', history: [], message: 'x' }, controller.signal);
    setTimeout(() => controller.abort(), 30);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('C: signal user já aborted antes da chamada → AbortError imediato e fetch NÃO inicia', async () => {
    const fetcher = stubFetchPending();
    const controller = new AbortController();
    controller.abort();

    await expect(proxyChatSendMessage({ model: 'scout-gold-compact', systemInstruction: '', history: [], message: 'x' }, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('D: signal timeout já aborted antes da chamada → TimeoutError imediato e fetch NÃO inicia', async () => {
    const fetcher = stubFetchPending();
    const signal = AbortSignal.timeout(20);
    await new Promise((r) => setTimeout(r, 40)); // deixa o timeout disparar antes da chamada
    expect(signal.aborted).toBe(true);

    await expect(proxyChatSendMessage({ model: 'scout-gold-compact', systemInstruction: '', history: [], message: 'x' }, signal)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
