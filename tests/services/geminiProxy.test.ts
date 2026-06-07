import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyGenerateContent, resolveGeminiApiEndpoint } from '../../services/geminiProxy';

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('resolveGeminiApiEndpoint', () => {
  it('uses same-origin /api endpoint for localhost in dev', () => {
    expect(resolveGeminiApiEndpoint('localhost', true)).toBe('/api/gemini');
  });

  it('uses same-origin /api endpoint for 127.0.0.1 in dev', () => {
    expect(resolveGeminiApiEndpoint('127.0.0.1', true)).toBe('/api/gemini');
  });

  it('keeps relative endpoint outside local dev', () => {
    expect(resolveGeminiApiEndpoint('scoutagro.vercel.app', false)).toBe('/api/gemini');
  });
});

describe('proxyGenerateContent', () => {
  it('le o body como texto antes de parsear JSON da resposta OK', async () => {
    const text = vi.fn(async () => JSON.stringify({ text: 'ok', usageMetadata: { totalTokenCount: 12 } }));
    const json = vi.fn(async () => ({ text: 'json-path' }));
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, text, json }) as unknown as Response);

    await expect(proxyGenerateContent({ model: 'test-model', contents: 'prompt' })).resolves.toEqual({
      text: 'ok',
      usageMetadata: { totalTokenCount: 12 },
    });

    expect(text).toHaveBeenCalledTimes(1);
    expect(json).not.toHaveBeenCalled();
  });

  it('interrompe leitura de body pendente quando o signal externo aborta', async () => {
    const text = vi.fn(() => new Promise<string>(() => {}));
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, text }) as unknown as Response);
    const controller = new AbortController();

    const pending = proxyGenerateContent({ model: 'test-model', contents: 'prompt' }, controller.signal);
    await Promise.resolve();

    controller.abort();

    const result = await Promise.race([
      pending.then(
        () => 'resolved',
        error => error,
      ),
      new Promise(resolve => setTimeout(() => resolve('pending'), 20)),
    ]);

    expect(result).toMatchObject({ name: 'AbortError' });
  });
});
