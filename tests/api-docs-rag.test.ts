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
      };
    }
  },
}));

vi.mock('../api/_shared/document-extractor', () => ({
  universalExtract: vi.fn(),
}));

describe('api/docs-rag handler', () => {
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
    const { default: handler } = await import('../api/docs-rag');
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

    const { default: handler } = await import('../api/docs-rag');
    const req = post({ query: 'ERP Senior módulo fiscal' });
    const res: any = response();
    await handler(req, res as any);

    expect(res._status).toBe(200);
    expect(res._data.context).toContain('SEM DOCUMENTAÇÃO ENCONTRADA');
  });

  it('deve retornar sinal de vazio quando matches ficam abaixo do score mínimo', async () => {
    embedContentMock.mockResolvedValueOnce({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });
    queryMock.mockResolvedValueOnce({
      matches: [
        { score: 0.45, metadata: { titulo: 'Módulo Fiscal', url: 'https://doc.senior.com.br/fiscal' } },
        { score: 0.40, metadata: { titulo: 'Módulo RH', url: 'https://doc.senior.com.br/rh' } },
      ],
    });

    const { default: handler } = await import('../api/docs-rag');
    const req = post({ query: 'ERP Senior módulo fiscal' });
    const res: any = response();
    await handler(req, res as any);

    expect(res._status).toBe(200);
    expect(res._data.context).toContain('SEM DOCUMENTAÇÃO ENCONTRADA');
    expect(res._data.matches).toHaveLength(2);
  });

  it('deve incluir matches com score >= 0.60', async () => {
    embedContentMock.mockResolvedValueOnce({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });
    queryMock.mockResolvedValueOnce({
      matches: [
        {
          score: 0.72,
          metadata: {
            titulo: 'Módulo Fiscal',
            categoria: 'ERP',
            url: 'https://doc.senior.com.br/fiscal',
            text: 'O módulo fiscal do ERP Senior permite...',
          },
        },
        { score: 0.45, metadata: { titulo: 'Módulo RH', url: 'https://doc.senior.com.br/rh' } },
      ],
    });

    const { default: handler } = await import('../api/docs-rag');
    const req = post({ query: 'ERP Senior módulo fiscal' });
    const res: any = response();
    await handler(req, res as any);

    expect(res._status).toBe(200);
    expect(res._data.context).toContain('Módulo Fiscal');
    expect(res._data.context).toContain('O módulo fiscal do ERP Senior permite');
    expect(res._data.context).not.toContain('Módulo RH');
  });

  it('deve extrair conteúdo quando text e content estão vazios mas url existe', async () => {
    embedContentMock.mockResolvedValueOnce({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });
    queryMock.mockResolvedValueOnce({
      matches: [
        {
          score: 0.68,
          metadata: {
            titulo: 'Módulo GATEC',
            categoria: 'Agro',
            url: 'https://doc.senior.com.br/gatec',
            text: '',
            content: '',
          },
        },
      ],
    });

    const { universalExtract } = await import('../api/_shared/document-extractor');
    (universalExtract as any).mockResolvedValueOnce({
      text: 'Conteúdo real da página do GATEC extraído via Cheerio.',
      length: 52,
    });

    const { default: handler } = await import('../api/docs-rag');
    const req = post({ query: 'GATEC módulo agro' });
    const res: any = response();
    await handler(req, res as any);

    expect(res._status).toBe(200);
    expect(res._data.context).toContain('[FONTE VERIFICADA]');
    expect(res._data.context).toContain('Conteúdo real da página do GATEC');
    expect(res._data.extractionStats.extractionsAttempted).toBe(1);
    expect(res._data.extractionStats.extractionsSucceeded).toBe(1);
  });

  it('deve marcar extração falha quando extração retorna texto vazio', async () => {
    embedContentMock.mockResolvedValueOnce({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });
    queryMock.mockResolvedValueOnce({
      matches: [
        {
          score: 0.68,
          metadata: {
            titulo: 'Módulo Offline',
            url: 'https://doc.senior.com.br/offline',
            text: '',
          },
        },
      ],
    });

    const { universalExtract } = await import('../api/_shared/document-extractor');
    (universalExtract as any).mockResolvedValueOnce({
      text: '',
      length: 0,
      error: 'Timeout',
    });

    const { default: handler } = await import('../api/docs-rag');
    const req = post({ query: 'sistema offline' });
    const res: any = response();
    await handler(req, res as any);

    expect(res._status).toBe(200);
    expect(res._data.context).toContain('CONTEÚDO NÃO EXTRAÍDO');
    expect(res._data.extractionStats.extractionsSucceeded).toBe(0);
    expect(res._data.extractionStats.extractionsFailed).toBe(1);
  });
});
