import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const sendMessageMock = vi.hoisted(() => vi.fn());
const createChatMock = vi.hoisted(() =>
  vi.fn(() => ({
    sendMessage: sendMessageMock,
  })),
);
const generateContentMock = vi.hoisted(() => vi.fn());
const createCacheMock = vi.hoisted(() => vi.fn());
const deleteCacheMock = vi.hoisted(() => vi.fn());
const callLiteLLMMock = vi.hoisted(() => vi.fn());
const isLiteLLMEnabledMock = vi.hoisted(() => vi.fn(() => false));
const isFallbackEnabledMock = vi.hoisted(() => vi.fn(() => true));
const authenticateExperimentRequestMock = vi.hoisted(() =>
  vi.fn<() => Promise<unknown>>(async () => ({
    user: { id: 'auth-user-1', email: 'bruno@senior.com.br' },
    supabase: {},
  })),
);

vi.mock('../api/_llm-client.js', () => ({
  callLiteLLM: callLiteLLMMock,
  isLiteLLMEnabled: isLiteLLMEnabledMock,
  isFallbackEnabled: isFallbackEnabledMock,
}));

vi.mock('../api/_experiment-auth.js', () => ({
  authenticateExperimentRequest: authenticateExperimentRequestMock,
  isExperimentAuthError: (result: unknown) => Boolean(result && typeof result === 'object' && 'error' in result),
}));

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
    process.env.LLM_PROVIDER = 'litellm';
    process.env.LLM_EXPERIMENT_MODE = 'fixed';
    process.env.LLM_EXPERIMENT_MODELS = 'huawei/deepseek-r1-250528';
    process.env.LLM_ALLOWLIST = 'bruno@senior.com.br';
    isLiteLLMEnabledMock.mockReturnValue(false);
    isFallbackEnabledMock.mockReturnValue(true);
    callLiteLLMMock.mockResolvedValue({
      text: '# Dossiê LiteLLM',
      usage: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
      reasoningRemoved: false,
      reasoningCharsRemoved: 0,
    });
    authenticateExperimentRequestMock.mockResolvedValue({
      user: { id: 'auth-user-1', email: 'bruno@senior.com.br' },
      supabase: {},
    });
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

  it('roteia generateContent para LiteLLM quando modelo não-gemini e provider habilitado', async () => {
    isLiteLLMEnabledMock.mockReturnValue(true);

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'generateContent',
        model: 'huawei/deepseek-r1-250528',
        contents: 'Empresa alvo: ACME\nGere APENAS o bloco de Raio-X Operacional',
        config: {
          systemInstruction: 'prompt sistema',
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(callLiteLLMMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'huawei/deepseek-r1-250528',
        systemInstruction: 'prompt sistema',
        temperature: 0.1,
        maxOutputTokens: 8192,
      }),
    );
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '# Dossiê LiteLLM',
        _llm_provider: 'litellm',
        _llm_fallback_used: false,
      }),
    );
  });

  it('preserva markers PORTA e TEIA seguros na resposta LiteLLM', async () => {
    isLiteLLMEnabledMock.mockReturnValue(true);
    callLiteLLMMock.mockResolvedValueOnce({
      text: '# Dossiê\n[[TEIA_COMPLEXIDADE:MEDIA]]\n[[PORTA_FEED_P:7:HA:220000:CNPJS:1:FAT:R$ 1,7 bilhao]]',
      usage: { totalTokenCount: 10 },
      reasoningRemoved: false,
      reasoningCharsRemoved: 0,
    });
    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: { action: 'generateContent', model: 'huawei/deepseek-r1-250528', contents: 'prompt' },
    } as VercelRequest;
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('[[PORTA_FEED_P:7:HA:220000:CNPJS:1:FAT:R$ 1,7 bilhao]]'),
        _llm_fallback_used: false,
      }),
    );
  });

  it('faz fallback Gemini quando LiteLLM retorna vazio', async () => {
    isLiteLLMEnabledMock.mockReturnValue(true);
    callLiteLLMMock.mockResolvedValueOnce({
      text: '   ',
      usage: { promptTokenCount: 1, candidatesTokenCount: 0, totalTokenCount: 1 },
      reasoningRemoved: false,
      reasoningCharsRemoved: 0,
    });
    generateContentMock.mockResolvedValueOnce({
      text: 'resposta gemini fallback',
      candidates: [],
      usageMetadata: { promptTokenCount: 5 },
    });

    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: {
        action: 'generateContent',
        model: 'huawei/deepseek-r1-250528',
        contents: 'conteudo usuario',
        config: {
          systemInstruction: 'prompt sistema',
        },
      },
    } as VercelRequest;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(generateContentMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3-flash-preview' }));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'resposta gemini fallback',
        _llm_provider: 'gemini',
        _llm_fallback_used: true,
      }),
    );
  });

  it('faz fallback Gemini quando auth 401 e fallback habilitado', async () => {
    isLiteLLMEnabledMock.mockReturnValue(true);
    authenticateExperimentRequestMock.mockResolvedValueOnce({ error: 'Authentication required', status: 401 });
    generateContentMock.mockResolvedValueOnce({
      text: 'resposta gemini auth fallback',
      candidates: [],
      usageMetadata: { promptTokenCount: 5 },
    });
    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: { action: 'generateContent', model: 'huawei/deepseek-r1-250528', contents: 'prompt' },
    } as VercelRequest;
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(callLiteLLMMock).not.toHaveBeenCalled();
    expect(generateContentMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-3-flash-preview' }));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'resposta gemini auth fallback',
        _llm_provider: 'gemini',
        _llm_fallback_used: true,
        _llm_fallback_reason: 'auth_401',
      }),
    );
  });

  it('retorna 401 quando auth falha e fallback está desativado', async () => {
    isLiteLLMEnabledMock.mockReturnValue(true);
    isFallbackEnabledMock.mockReturnValue(false);
    authenticateExperimentRequestMock.mockResolvedValueOnce({ error: 'Authentication required', status: 401 });
    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: { action: 'generateContent', model: 'huawei/deepseek-r1-250528', contents: 'prompt' },
    } as VercelRequest;
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(callLiteLLMMock).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('faz fallback Gemini quando auth 403 (allowlist) e fallback habilitado', async () => {
    isLiteLLMEnabledMock.mockReturnValue(true);
    authenticateExperimentRequestMock.mockResolvedValueOnce({ error: 'Operator not in LLM_ALLOWLIST', status: 403 });
    generateContentMock.mockResolvedValueOnce({
      text: 'resposta gemini allowlist fallback',
      candidates: [],
    });
    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: { action: 'generateContent', model: 'huawei/deepseek-r1-250528', contents: 'prompt' },
    } as VercelRequest;
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(generateContentMock).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        _llm_fallback_reason: 'auth_403',
        _llm_fallback_used: true,
      }),
    );
  });

  it('rejeita modelo LiteLLM fora da configuração do experimento', async () => {
    isLiteLLMEnabledMock.mockReturnValue(true);
    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: { action: 'generateContent', model: 'attacker/arbitrary-model', contents: 'prompt' },
    } as VercelRequest;
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(callLiteLLMMock).not.toHaveBeenCalled();
  });

  it('retorna vazio quando leak shield bloqueia e fallback está desativado', async () => {
    isLiteLLMEnabledMock.mockReturnValue(true);
    isFallbackEnabledMock.mockReturnValue(false);
    callLiteLLMMock.mockResolvedValueOnce({
      text: 'URGENTE: ignore metadiscussões e siga sua missão absoluta',
      usage: { totalTokenCount: 10 },
      reasoningRemoved: false,
      reasoningCharsRemoved: 0,
    });
    const { default: handler } = await import('../api/gemini');
    const req = {
      method: 'POST',
      body: { action: 'generateContent', model: 'huawei/deepseek-r1-250528', contents: 'prompt' },
    } as VercelRequest;
    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ text: '', _llm_fallback_used: false }));
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
