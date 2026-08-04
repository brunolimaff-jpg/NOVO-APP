import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const sendMessageMock = vi.hoisted(() => vi.fn());
type ChatCreateFn = (param: {
  model: unknown;
  history: unknown;
  config: {
    systemInstruction: unknown;
    temperature: number;
    maxOutputTokens: number;
    thinkingConfig: { thinkingLevel: unknown };
    tools: Array<Record<string, unknown>> | undefined;
  };
}) => { sendMessage: typeof sendMessageMock };

const createChatMock = vi.hoisted(() =>
  vi.fn<ChatCreateFn>((_param) => ({
    sendMessage: sendMessageMock,
  })),
);
const generateContentMock = vi.hoisted(() => vi.fn());
const createCacheMock = vi.hoisted(() => vi.fn());
const deleteCacheMock = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  ThinkingLevel: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
  },
  GoogleGenAI: class {
    chats = {
      create: createChatMock,
    };

    models = {
      generateContent: generateContentMock,
    };

    caches = {
      create: createCacheMock,
      delete: deleteCacheMock,
    };
  },
}));

describe('api/gemini handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_API_KEY_FALLBACK;
    delete process.env.GEMINI_FOUNDATION_CACHE_ENABLED;
    delete process.env.LLM_PROVIDER;
    delete process.env.LITELLM_API_KEY;
    delete process.env.LITELLM_BASE_URL;
  });

  it('rejeita health antes de qualquer chamada ao provedor', async () => {
    const { default: handler } = await import('../api/gemini');
    const req = { method: 'POST', body: { action: 'health' } } as VercelRequest;
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid request' }));
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(createChatMock).not.toHaveBeenCalled();
  });

  it('transforma erro HTTP do open-web-search em functionResponse de erro', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Tool failed upstream' }),
    } as Response);

    sendMessageMock
      .mockResolvedValueOnce({
        functionCalls: [
          {
            name: 'performWebSearch',
            args: { query: 'KODYAK' },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'resposta final',
        candidates: [{ groundingMetadata: { groundingChunks: [] } }],
      });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'chatSendMessage',
        message: 'investigue',
        useOpenWebSearch: true,
      },
    } as VercelRequest;

    let statusCode = 0;
    let payload: unknown;
    const res = {
      setHeader: vi.fn(),
      status: (code: number) => {
        statusCode = code;
        return {
          json: (json: unknown) => {
            payload = json;
            return { code, json };
          },
        };
      },
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(statusCode).toBe(200);
    expect(payload).toMatchObject({ text: 'resposta final' });
    expect(sendMessageMock).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([
        expect.objectContaining({
          functionResponse: expect.objectContaining({
            name: 'performWebSearch',
            response: expect.objectContaining({
              error: 'Tool failed upstream',
            }),
          }),
        }),
      ]),
    );
  });

  it('usa thinkingLevel=high por padrão quando nenhum campo de thinking é enviado', async () => {
    sendMessageMock.mockResolvedValueOnce({
      text: 'ok',
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'chatSendMessage',
        message: 'analise a conta',
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(createChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          thinkingConfig: { thinkingLevel: 'HIGH' },
        }),
      }),
    );
  });

  it('prioriza thinkingLevel explícito sobre thinkingMode legado', async () => {
    sendMessageMock.mockResolvedValueOnce({
      text: 'ok',
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'chatSendMessage',
        message: 'analise a conta',
        thinkingLevel: 'medium',
        thinkingMode: true,
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(createChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          thinkingConfig: { thinkingLevel: 'MEDIUM' },
        }),
      }),
    );
  });

  it('mapeia thinkingMode=false legado para thinkingLevel=low', async () => {
    sendMessageMock.mockResolvedValueOnce({
      text: 'ok',
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'chatSendMessage',
        message: 'analise a conta',
        thinkingMode: false,
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(createChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          thinkingConfig: { thinkingLevel: 'LOW' },
        }),
      }),
    );
  });

  it('repassa tools no generateContent para permitir grounding por módulo', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: 'ok',
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'generateContent',
        model: 'gemini-test',
        contents: 'pesquise',
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: 'use fontes',
        },
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          tools: [{ googleSearch: {} }],
          systemInstruction: 'use fontes',
        }),
      }),
    );
  });

  it('extrai texto de candidates quando o SDK não preenche response.text em generateContent', async () => {
    generateContentMock.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [{ text: 'OK_GEMINI_35_FLASH' }],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
    });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'generateContent',
        model: 'gemini-3.5-flash',
        contents: 'Responda OK',
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'OK_GEMINI_35_FLASH',
        fallbackUsed: false,
      }),
    );
  });

  it('marca fallbackUsed=true quando a rotação de chave recupera uma geração 200', async () => {
    process.env.GEMINI_API_KEY_FALLBACK = 'fallback-key';
    generateContentMock
      .mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED'))
      .mockResolvedValueOnce({ text: 'recuperado pela segunda chave' });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'generateContent',
        model: 'gemini-test',
        contents: 'Responda OK',
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'recuperado pela segunda chave',
        fallbackUsed: true,
      }),
    );
  });

  it('extrai texto de candidates quando o SDK não preenche response.text em chatSendMessage', async () => {
    sendMessageMock.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [{ text: 'Dossiê gerado com sucesso.' }],
            role: 'model',
          },
          groundingMetadata: { groundingChunks: [] },
          finishReason: 'STOP',
        },
      ],
    });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'chatSendMessage',
        model: 'gemini-3.5-flash',
        message: 'analise a conta',
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Dossiê gerado com sucesso.',
        fallbackUsed: false,
      }),
    );
  });

  it('marca fallbackUsed=true quando grounding falha e o chat recupera sem grounding', async () => {
    sendMessageMock
      .mockRejectedValueOnce(new Error('grounding tool timeout'))
      .mockResolvedValueOnce({
        text: 'recuperado sem grounding',
        candidates: [{ groundingMetadata: { groundingChunks: [] } }],
      });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'chatSendMessage',
        message: 'analise a conta',
        useGrounding: true,
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(createChatMock).toHaveBeenCalledTimes(2);
    expect(createChatMock.mock.calls[0][0].config.tools).toEqual([{ googleSearch: {} }]);
    expect(createChatMock.mock.calls[1][0].config.tools).toBeUndefined();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'recuperado sem grounding',
        groundingUsed: false,
        fallbackUsed: true,
      }),
    );
  });

  it('mantém fallbackUsed=false quando grounding responde 200 sem chunks', async () => {
    sendMessageMock.mockResolvedValueOnce({
      text: 'resposta sem fontes',
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'chatSendMessage',
        message: 'analise a conta',
        useGrounding: true,
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        groundingUsed: false,
        fallbackUsed: false,
      }),
    );
  });

  it('retorna 403 em createCachedContent quando foundation cache está desligado', async () => {
    delete process.env.GEMINI_FOUNDATION_CACHE_ENABLED;

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'createCachedContent',
        systemInstruction: 'foundation block',
      },
    } as VercelRequest;

    let statusCode = 0;
    const res = {
      setHeader: vi.fn(),
      status: (code: number) => {
        statusCode = code;
        return { json: vi.fn() };
      },
    } as unknown as VercelResponse;

    await handler(req, res);
    expect(statusCode).toBe(403);
    expect(createCacheMock).not.toHaveBeenCalled();
  });

  it('cria cached content com tools quando foundation cache está habilitado', async () => {
    process.env.GEMINI_FOUNDATION_CACHE_ENABLED = '1';
    createCacheMock.mockResolvedValueOnce({
      name: 'cachedContents/test-cache',
      expireTime: '2026-05-26T12:10:00Z',
      usageMetadata: { totalTokenCount: 15000 },
    });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'createCachedContent',
        model: 'gemini-3-flash-preview',
        systemInstruction: 'foundation + static context',
        ttl: '600s',
        tools: [{ googleSearch: {} }],
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(createCacheMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3-flash-preview',
        config: expect.objectContaining({
          systemInstruction: 'foundation + static context',
          ttl: '600s',
          tools: [{ googleSearch: {} }],
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'cachedContents/test-cache',
      }),
    );
  });

  it('prioriza cachedContent em generateContent e retorna usageMetadata', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: 'ok',
      usageMetadata: {
        cachedContentTokenCount: 12000,
        promptTokenCount: 900,
      },
    });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'generateContent',
        model: 'gemini-3-flash-preview',
        contents: 'dynamic prompt',
        config: {
          cachedContent: 'cachedContents/test-cache',
          systemInstruction: 'nao deve ir',
          tools: [{ googleSearch: {} }],
        },
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          cachedContent: 'cachedContents/test-cache',
        }),
      }),
    );
    expect(generateContentMock.mock.calls[0][0].config).not.toHaveProperty('systemInstruction');
    expect(generateContentMock.mock.calls[0][0].config).not.toHaveProperty('tools');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'ok',
        usageMetadata: expect.objectContaining({
          cachedContentTokenCount: 12000,
        }),
      }),
    );
  });

  it('deleta cached content quando foundation cache está habilitado', async () => {
    process.env.GEMINI_FOUNDATION_CACHE_ENABLED = '1';
    deleteCacheMock.mockResolvedValueOnce(undefined);

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'deleteCachedContent',
        name: 'cachedContents/test-cache',
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(deleteCacheMock).toHaveBeenCalledWith({ name: 'cachedContents/test-cache' });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
