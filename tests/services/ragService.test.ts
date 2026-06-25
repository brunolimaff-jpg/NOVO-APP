import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarContextoPinecone, buscarContextoDocsPinecone } from '../../services/ragService';

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

  it('buscarContextoDocsPinecone usa /api/rag com namespace padrão de docs', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ context: 'docs context' }),
    });

    const result = await buscarContextoDocsPinecone('test');
    expect(result.context).toBe('docs context');
    expect(result.failed).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      '/api/rag',
      expect.objectContaining({
        body: JSON.stringify({ query: 'test', namespace: 'senior-erp-docs' }),
      }),
    );
  });

  it('buscarContextoDocsPinecone preserva namespace explícito no /api/rag consolidado', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ context: 'competitor context' }),
    });

    const result = await buscarContextoDocsPinecone('concorrente', 'competitor-pdfs');
    expect(result.context).toBe('competitor context');
    expect(result.failed).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      '/api/rag',
      expect.objectContaining({
        body: JSON.stringify({ query: 'concorrente', namespace: 'competitor-pdfs' }),
      }),
    );
  });
});
