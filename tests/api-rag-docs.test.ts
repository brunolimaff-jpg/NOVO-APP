import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const embedContentMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());
const namespaceMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock })));
const indexMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock, namespace: namespaceMock })));
const googleConstructorMock = vi.hoisted(() => vi.fn());
const pineconeConstructorMock = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor(options: unknown) {
      googleConstructorMock(options);
    }

    models = {
      embedContent: embedContentMock,
    };
  },
}));

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: class {
    constructor(options: unknown) {
      pineconeConstructorMock(options);
    }

    index = indexMock;
  },
}));

const NO_DOCS_SIGNAL =
  '[SEM DOCUMENTAÇÃO ENCONTRADA — NÃO complete com suposições. Informe que não há dados verificados disponíveis.]';

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

describe('api/rag handler — modo docs consolidado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    process.env.PINECONE_API_KEY = 'pinecone-test-key';
    delete process.env.PINECONE_DOCS_KEY;
    delete process.env.PINECONE_INDEX;
    delete process.env.PINECONE_DOCS_INDEX;
    delete process.env.PINECONE_NAMESPACE;
    delete process.env.PINECONE_DOCS_NAMESPACE;

    embedContentMock.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2, 0.3] }],
    });
  });

  it('retorna 405 para GET', async () => {
    const { default: handler } = await import('../api/rag');
    const res = response();

    await handler({ method: 'GET' } as VercelRequest, res);

    expect(res._status).toBe(405);
    expect(res._data).toMatchObject({ error: 'Method not allowed' });
  });

  it('retorna 400 para body inválido', async () => {
    const { default: handler } = await import('../api/rag');
    const res = response();

    await handler(post({ query: '' }), res);

    expect(res._status).toBe(400);
    expect(res._data).toMatchObject({ error: 'Invalid request' });
  });

  it('retorna sinal explícito quando não há matches', async () => {
    queryMock.mockResolvedValueOnce({ matches: [] });

    const { default: handler } = await import('../api/rag');
    const res = response();
    await handler(post({ query: 'erp agro', namespace: 'senior-erp-docs' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toBe(NO_DOCS_SIGNAL);
    expect(res._data?.matches).toEqual([]);
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

    const { default: handler } = await import('../api/rag');
    const res = response();
    await handler(post({ query: 'erp agro', namespace: 'senior-erp-docs' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toBe(NO_DOCS_SIGNAL);
    expect(res._data?.matches).toEqual([]);
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

    const { default: handler } = await import('../api/rag');
    const res = response();
    await handler(post({ query: 'gestão de safras', namespace: 'senior-erp-docs' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toContain('### ERP: Gestão de Safras');
    expect(res._data?.context).toContain('Controle operacional por safra e talhão.');
    expect(res._data?.context).toContain('(Fonte: https://documentacao.senior.com.br/safras)');
    expect(namespaceMock).toHaveBeenCalledWith('senior-erp-docs');
  });

  it('consulta o namespace documental explícito permitido', async () => {
    queryMock.mockResolvedValueOnce({
      matches: [
        match(0.75, {
          titulo: 'Concorrente',
          content: 'Conteúdo comparativo indexado.',
          url: 'https://example.com/concorrente',
        }),
      ],
    });

    const { default: handler } = await import('../api/rag');
    const res = response();
    await handler(post({ query: 'comparativo', namespace: 'competitor-pdfs' }), res);

    expect(res._status).toBe(200);
    expect(namespaceMock).toHaveBeenCalledWith('competitor-pdfs');
    expect(res._data?.matches).toEqual([
      expect.objectContaining({ content: 'Conteúdo comparativo indexado.' }),
    ]);
  });

  it('trima o namespace documental antes de consultar a allowlist', async () => {
    queryMock.mockResolvedValueOnce({
      matches: [match(0.7, { text: 'Documento válido.' })],
    });

    const { default: handler } = await import('../api/rag');
    const res = response();
    await handler(post({ query: 'documento', namespace: '  senior-erp-docs  ' }), res);

    expect(res._status).toBe(200);
    expect(namespaceMock).toHaveBeenCalledWith('senior-erp-docs');
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

    const { default: handler } = await import('../api/rag');
    const res = response();
    await handler(post({ query: 'documento sem texto', namespace: 'senior-erp-docs' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toBe(NO_DOCS_SIGNAL);
    expect(res._data?.matches).toEqual([urlOnlyMetadata]);
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
        match(0.59, {
          titulo: 'Documento abaixo do corte',
          text: 'Não deve aparecer nem em matches.',
        }),
      ],
    });

    const { default: handler } = await import('../api/rag');
    const res = response();
    await handler(post({ query: 'mix docs', namespace: 'senior-erp-docs' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toContain('Conteúdo indexado confiável.');
    expect(res._data?.context).not.toContain('[CONTEÚDO NÃO INDEXADO');
    expect(res._data?.matches).toHaveLength(2);
    expect(res._data?.matches).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ titulo: 'Documento abaixo do corte' })]),
    );
  });

  it('mantém namespace inválido retornando 400', async () => {
    const { default: handler } = await import('../api/rag');
    const res = response();

    await handler(post({ query: 'erp agro', namespace: 'private-docs' }), res);

    expect(res._status).toBe(400);
    expect(res._data).toMatchObject({
      error: 'Invalid namespace',
      allowed: ['senior-erp-docs', 'competitor-pdfs'],
    });
    expect(googleConstructorMock).not.toHaveBeenCalled();
    expect(pineconeConstructorMock).not.toHaveBeenCalled();
    expect(embedContentMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejeita namespace explícito composto apenas por whitespace antes de criar clientes', async () => {
    const { default: handler } = await import('../api/rag');
    const res = response();

    await handler(post({ query: 'erp agro', namespace: '   ' }), res);

    expect(res._status).toBe(400);
    expect(res._data).toMatchObject({
      error: 'Invalid namespace',
      allowed: ['senior-erp-docs', 'competitor-pdfs'],
    });
    expect(googleConstructorMock).not.toHaveBeenCalled();
    expect(pineconeConstructorMock).not.toHaveBeenCalled();
    expect(embedContentMock).not.toHaveBeenCalled();
  });

  it('preserva o contrato global sem namespace, incluindo credenciais, índice, threshold e formato', async () => {
    process.env.PINECONE_API_KEY = 'global-key';
    process.env.PINECONE_DOCS_KEY = 'docs-key';
    process.env.PINECONE_INDEX = 'global-index';
    process.env.PINECONE_DOCS_INDEX = 'docs-index';
    process.env.PINECONE_NAMESPACE = 'global-namespace';
    queryMock.mockResolvedValueOnce({
      matches: [
        match(0.36, { source: 'proposta-agro', text: 'Contexto global forte.' }),
        match(0.35, { source: 'limite', text: 'Não deve entrar.' }),
      ],
    });

    const { default: handler } = await import('../api/rag');
    const res = response();
    await handler(post({ query: 'contexto comercial' }), res);

    expect(res._status).toBe(200);
    expect(res._data?.context).toBe('[Proposta: proposta-agro]\nContexto global forte.');
    expect(res._data?.context).not.toContain('Não deve entrar.');
    expect(googleConstructorMock).toHaveBeenCalledWith({ apiKey: 'gemini-test-key' });
    expect(pineconeConstructorMock).toHaveBeenCalledWith({ apiKey: 'global-key' });
    expect(indexMock).toHaveBeenCalledWith('global-index');
    expect(namespaceMock).toHaveBeenCalledWith('global-namespace');
    expect(queryMock).toHaveBeenCalledWith({
      vector: [0.1, 0.2, 0.3],
      topK: 8,
      includeMetadata: true,
    });
  });

  it('mantém erro operacional do modo global como resposta degradada', async () => {
    queryMock.mockRejectedValueOnce(new Error('pinecone indisponível'));

    const { default: handler } = await import('../api/rag');
    const res = response();
    await handler(post({ query: 'contexto comercial' }), res);

    expect(res._status).toBe(200);
    expect(res._data).toMatchObject({
      context: '',
      degraded: true,
      detail: 'pinecone indisponível',
    });
  });
});
