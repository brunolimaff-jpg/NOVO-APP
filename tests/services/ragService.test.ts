import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarContextoPinecone } from '../../services/ragService';

describe('ragService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('buscarContextoPinecone returns context on success', async () => {
    const mockResponse = { context: 'Some RAG context' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await buscarContextoPinecone('test query');
    expect(result.context).toBe('Some RAG context');
    expect(result.failed).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      '/api/rag',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'test query' }),
      }),
    );
  });

  it('buscarContextoPinecone returns empty and failed=true on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await buscarContextoPinecone('test query');
    expect(result.context).toBe('');
    expect(result.failed).toBe(true);
  });

  it('buscarContextoPinecone returns empty and failed=true on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await buscarContextoPinecone('test query');
    expect(result.context).toBe('');
    expect(result.failed).toBe(true);
  });

  it('não retenta e degrada quando o servidor responde 503 RAG_DISABLED_PENDING_REINDEX', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () =>
        Promise.resolve({
          context: '',
          error: 'RAG_DISABLED_PENDING_REINDEX',
          code: 'RAG_DISABLED_PENDING_REINDEX',
          retryable: false,
        }),
    });
    global.fetch = fetchMock;

    const result = await buscarContextoPinecone('test query');
    expect(result.context).toBe('');
    expect(result.failed).toBe(true);
    expect(result.disabled).toBe(true);
    // Sem retry: exatamente uma chamada ao endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('503 sem o código RAG_DISABLED segue a política de retry de 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'outra coisa' }),
    });
    global.fetch = fetchMock;

    const result = await buscarContextoPinecone('test query');
    expect(result.failed).toBe(true);
    expect(result.disabled).toBeUndefined();
    // Retry once em 5xx (política existente) — apenas o 503 com o código
    // RAG_DISABLED_PENDING_REINDEX degrada sem retry.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

});
