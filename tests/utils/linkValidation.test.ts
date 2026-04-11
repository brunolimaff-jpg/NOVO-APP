// tests/utils/linkValidation.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchLinkStatuses } from '../../utils/linkValidation';

describe('fetchLinkStatuses', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna objeto vazio para array vazio', async () => {
    const result = await fetchLinkStatuses([]);
    expect(result).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retorna objeto vazio para array com valores falsy', async () => {
    const result = await fetchLinkStatuses(['', null as unknown as string, undefined as unknown as string]);
    expect(result).toEqual({});
  });

  it('retorna resultados em sucesso', async () => {
    const mockResults = {
      'https://example.com': { status: 'valid', httpStatus: 200 },
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults }),
    } as Response);

    const result = await fetchLinkStatuses(['https://example.com']);
    expect(result).toEqual(mockResults);
  });

  it('deduplica URLs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: {} }),
    } as Response);

    await fetchLinkStatuses(['https://a.com', 'https://a.com', 'https://b.com']);

    const requestInit = vi.mocked(fetch).mock.calls[0][1] as Parameters<typeof fetch>[1];
    const body = JSON.parse(requestInit?.body as string);
    const unique = new Set(body.urls);
    expect(unique.size).toBe(body.urls.length);
  });

  it('retorna {} quando resposta não é ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const result = await fetchLinkStatuses(['https://example.com']);
    expect(result).toEqual({});
  });

  it('retorna {} em caso de erro de rede (silencioso)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('network error'));

    const result = await fetchLinkStatuses(['https://example.com']);
    expect(result).toEqual({});
  });

  it('retorna {} quando payload não tem campo results', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'algo inesperado' }),
    } as Response);

    const result = await fetchLinkStatuses(['https://example.com']);
    expect(result).toEqual({});
  });
});
