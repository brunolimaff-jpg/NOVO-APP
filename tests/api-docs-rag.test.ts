import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const embedContentMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());
const namespaceMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock })));
const indexMock = vi.hoisted(() => vi.fn(() => ({ namespace: namespaceMock })));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      embedContent: embedContentMock,
    };
  },
}));

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: class {
    index = indexMock;
  },
}));

const NO_DOCS_SIGNAL = '[SEM DOCUMENTAÇÃO ENCONTRADA — NÃO complete com suposições. Informe que não há dados verificados disponíveis.]';

type ApiPayload = {
  context?: string;
  matches?: unknown[];
  error?: string;
  allowed?: string[];
  details?: unknown;
};

type TestResponse = VercelResponse & {
  _status: number;
  _data?: ApiPayload;
};

function response(): TestResponse {
  const res = {
    _status: 0,
    _data: undefined,
  } as TestResponse;

  res.status = vi.fn((code: number) => {
    res._status = code;
    return res;
  }) as TestResponse['status'];

  res.json = vi.fn((payload: ApiPayload) => {
    res._data = payload;
    return res;
  }) as TestResponse['json'];

  return res;
}

function post(body: unknown): VercelRequest {
  return {
    method: 'POST',
    body,
  } as VercelRequest;
}

function match(score: number, metadata: Record<string, unknown>) {
  return { score, metadata };
}

describe('api/docs-rag handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    process.env.PINECONE_API_KEY = 'pinecone-test-key';
    delete process.env.PINECONE_DOCS_NAMESPACE;

    embedContentMock.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });
  });

  it('retorna 405 para GET', async () => {
    const { default: handler } = await import('../api/docs-rag');
    const res = response();

    await handler({ method: 'GET' } as VercelRequest, res);

    expect(res._status).toBe(405);
    expect(res._data).toMatchObject({ error: 'Method not allowed' });
  });

  it('retorna 400 para body inválido', async () => {
    const { default: handler } = await import('../api/docs-rag');
    const res = response();

    await handler(post({ query: '' }), res);

    expect(res._status).toBe(400);
    expect(res._data).toMatchObject({ error: 'Invalid request' });
  });

  it('retorna sinal explícito quando não há matches', async () => {
    queryMock.mockResolvedValueOnce({ matches: [] });

    const { default: handler } = await import('../api/docs-rag');
    const res = response();
    await handler(post({ query: 'erp agro' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toBe(NO_DOCS_SIGNAL);
  });

  it('retorna sinal explícito quando matches ficam abaixo do score mínimo', async () => {
    const lowScoreMetadata = {
      titulo: 'Documento fraco',
      categoria: 'Geral',
      text: 'Texto não forte o bastante.',
      url: 'https://documentacao.senior.com.br/fraco',
    };
    queryMock.mockResolvedValueOnce({
      matches: [match(0.59, lowScoreMetadata)],
    });

    const { default: handler } = await import('../api/docs-rag');
    const res = response();
    await handler(post({ query: 'erp agro' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toBe(NO_DOCS_SIGNAL);

  });

  it('inclui match forte com texto indexado e preserva fonte', async () => {
    queryMock.mockResolvedValueOnce({
      matches: [
        match(0.6, {
          titulo: 'Gestão de Safras',
          categoria: 'ERP',
          text: 'Controle operacional por safra e talhão.',
          url: 'https://documentacao.senior.com.br/safras',
        }),
      ],
    });

    const { default: handler } = await import('../api/docs-rag');
    const res = response();
    await handler(post({ query: 'gestão de safras' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toContain('### ERP: Gestão de Safras');
    expect(res._data?.context).toContain('Controle operacional por safra e talhão.');
    expect(res._data?.context).toContain('(Fonte: https://documentacao.senior.com.br/safras)');
  });

  it('não cria contexto evidencial quando match forte tem apenas URL sem texto indexado', async () => {
    const urlOnlyMetadata = {
      titulo: 'Página sem texto',
      categoria: 'ERP',
      url: 'https://documentacao.senior.com.br/url-only',
    };
    queryMock.mockResolvedValueOnce({
      matches: [match(0.91, urlOnlyMetadata)],
    });

    const { default: handler } = await import('../api/docs-rag');
    const res = response();
    await handler(post({ query: 'documento sem texto' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toBe(NO_DOCS_SIGNAL);

  });

  it('mantém aviso conservador para match forte sem texto quando há outro match textual', async () => {
    queryMock.mockResolvedValueOnce({
      matches: [
        match(0.86, {
          titulo: 'Documento textual',
          categoria: 'ERP',
          content: 'Conteúdo indexado confiável.',
          url: 'https://documentacao.senior.com.br/textual',
        }),
        match(0.88, {
          titulo: 'Documento só com URL',
          categoria: 'ERP',
          url: 'https://documentacao.senior.com.br/url-only',
        }),
      ],
    });

    const { default: handler } = await import('../api/docs-rag');
    const res = response();
    await handler(post({ query: 'mix docs' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toContain('Conteúdo indexado confiável.');
    expect(res._data?.context).not.toContain('[CONTEÚDO NÃO INDEXADO');
  });

  it('mantém namespace inválido retornando 400', async () => {
    const { default: handler } = await import('../api/docs-rag');
    const res = response();

    await handler(post({ query: 'erp agro', namespace: 'private-docs' }), res);

    expect(res._status).toBe(400);
    expect(res._data).toMatchObject({
      error: 'Invalid namespace',
      allowed: ['senior-erp-docs', 'competitor-pdfs'],
    });
    expect(queryMock).not.toHaveBeenCalled();
  });
});
