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

});
