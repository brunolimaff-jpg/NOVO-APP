import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const embedContentMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      embedContent: embedContentMock,
    };
  },
}));

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: class {
    index() {
      return {
        namespace() {
          return { query: queryMock };
        },
        query: queryMock,
      };
    }
  },
}));

describe('api/rag handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.PINECONE_API_KEY = 'test-pc-key';
  });

  const post = (body: unknown) => ({
    method: 'POST',
    body,
  } as VercelRequest);

  const response = () => {
    const res = {} as any;
    res.status = (code: number) => {
      res._status = code;
      return { json: (data: any) => { res._data = data; return res; } };
    };
    return res as VercelResponse;
  };

  it('deve retornar 405 para GET', async () => {
    const { default: handler } = await import('../api/rag');
    const req = { method: 'GET' } as VercelRequest;
    const res: any = response();
    await handler(req, res as any);
    expect(res._status).toBe(405);
  });

  it('deve retornar sinal de vazio quando não há matches', async () => {
    embedContentMock.mockResolvedValueOnce({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });
    queryMock.mockResolvedValueOnce({ matches: [] });

    const { default: handler } = await import('../api/rag');
    const req = post({ query: 'ERP agro proposta comercial' });
    const res: any = response();
    await handler(req, res as any);

    expect(res._status).toBe(200);
    expect(res._data.context).toContain('SEM DADOS DE PROPOSTAS ENCONTRADOS');
  });

  it('deve retornar sinal de vazio quando matches ficam abaixo do score mínimo', async () => {
    embedContentMock.mockResolvedValueOnce({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });
    queryMock.mockResolvedValueOnce({
      matches: [
        { score: 0.40, metadata: { source: 'proposta-1.pdf', text: 'Proposta antiga' } },
        { score: 0.38, metadata: { source: 'proposta-2.pdf', text: 'Proposta velha' } },
      ],
    });

    const { default: handler } = await import('../api/rag');
    const req = post({ query: 'ERP agro proposta comercial' });
    const res: any = response();
    await handler(req, res as any);

    expect(res._status).toBe(200);
    expect(res._data.context).toContain('SEM DADOS DE PROPOSTAS ENCONTRADOS');
  });

  it('deve incluir apenas matches com score >= 0.55', async () => {
    embedContentMock.mockResolvedValueOnce({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });
    queryMock.mockResolvedValueOnce({
      matches: [
        { score: 0.78, metadata: { source: 'proposta-boa.pdf', text: 'Conteúdo relevante' } },
        { score: 0.48, metadata: { source: 'proposta-ruim.pdf', text: 'Conteúdo irrelevante' } },
      ],
    });

    const { default: handler } = await import('../api/rag');
    const req = post({ query: 'ERP agro proposta comercial' });
    const res: any = response();
    await handler(req, res as any);

    expect(res._status).toBe(200);
    expect(res._data.context).toContain('proposta-boa.pdf');
    expect(res._data.context).toContain('Conteúdo relevante');
    expect(res._data.context).not.toContain('proposta-ruim.pdf');
  });
});
