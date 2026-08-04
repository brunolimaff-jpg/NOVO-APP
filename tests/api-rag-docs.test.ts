/**
 * RAG (Pinecone) — DESATIVADO até reindexação autorizada.
 *
 * O handler responde 503 RAG_DISABLED_PENDING_REINDEX enquanto
 * RAG_ENABLED !== 'true', sem nenhuma chamada externa (embeddings ou
 * Pinecone). Quando habilitado, usa embeddings via gateway LiteLLM
 * (utils/llm/embeddings.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const embedViaLiteLLMMock = vi.hoisted(() => vi.fn());
const pineconeQueryMock = vi.hoisted(() => vi.fn());
const pineconeNamespaceMock = vi.hoisted(() => vi.fn(() => ({ query: pineconeQueryMock })));

vi.mock('../utils/llm/embeddings.js', () => ({
  embedViaLiteLLM: embedViaLiteLLMMock,
  EMBEDDINGS_MODEL_ID: 'bedrock/amazon.titan-embed-text-v1',
}));

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: class {
    index() {
      return { query: pineconeQueryMock, namespace: pineconeNamespaceMock };
    }
  },
}));

function makeRes() {
  return {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as VercelResponse;
}

describe('api/rag handler (gate de reindexação)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.RAG_ENABLED;
  });

  it('rejeita método não-POST com 405', async () => {
    const { default: handler } = await import('../api/rag');
    await handler({ method: 'GET', body: {} } as VercelRequest, makeRes());
  });

  it('responde 503 RAG_DISABLED_PENDING_REINDEX antes de qualquer chamada externa', async () => {
    const { default: handler } = await import('../api/rag');
    const res = makeRes();
    await handler({ method: 'POST', body: { query: 'senior erp' } } as VercelRequest, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      context: '',
      error: 'RAG_DISABLED_PENDING_REINDEX',
      code: 'RAG_DISABLED_PENDING_REINDEX',
      retryable: false,
    });
    expect(embedViaLiteLLMMock).not.toHaveBeenCalled();
  });

  it('não chama embeddings nem Pinecone mesmo com query válida e RAG_ENABLED ausente', async () => {
    const { default: handler } = await import('../api/rag');
    const res = makeRes();
    await handler({ method: 'POST', body: { query: 'x'.repeat(500) } } as VercelRequest, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(embedViaLiteLLMMock).not.toHaveBeenCalled();
  });

  it('quando habilitado, usa embeddings via gateway LiteLLM e consulta o Pinecone', async () => {
    process.env.RAG_ENABLED = 'true';
    process.env.PINECONE_API_KEY = 'pcsk-teste';
    embedViaLiteLLMMock.mockResolvedValue({
      model: 'bedrock/amazon.titan-embed-text-v1',
      dimension: 1536,
      vectors: [[0.1, 0.2]],
    });
    pineconeQueryMock.mockResolvedValue({
      matches: [
        { score: 0.9, metadata: { source: 'senior-erp', text: 'trecho relevante' } },
        { score: 0.2, metadata: { source: 'outro', text: 'trecho irrelevante' } },
      ],
    });

    const { default: handler } = await import('../api/rag');
    const res = makeRes();
    await handler({ method: 'POST', body: { query: 'tms senior' } } as VercelRequest, res);

    expect(embedViaLiteLLMMock).toHaveBeenCalledWith(['tms senior']);
    expect(pineconeQueryMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.stringContaining('trecho relevante'),
      }),
    );
  });
});
