import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const sendMessageMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    chats = {
      create: vi.fn(() => ({
        sendMessage: sendMessageMock,
      })),
    };

    models = {
      generateContent: vi.fn(),
    };
  },
}));

describe('api/gemini handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
