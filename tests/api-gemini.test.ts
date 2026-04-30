import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const sendMessageMock = vi.hoisted(() => vi.fn());
const createChatMock = vi.hoisted(() => vi.fn(() => ({
  sendMessage: sendMessageMock,
})));
const generateContentMock = vi.hoisted(() => vi.fn());

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
  },
}));

describe('api/gemini handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GEMINI_API_KEY = 'test-key';
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
});
