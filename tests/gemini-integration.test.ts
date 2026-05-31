import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const sendMessageMock = vi.fn();

vi.mock('@google/genai', () => ({
  ThinkingLevel: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
  },
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

global.fetch = vi.fn();

describe('Gemini Function Calling Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GEMINI_API_KEY = 'mock-key';
  });

  it('deve executar performWebSearch internamente e reenviar o resultado ao Gemini', async () => {
    const mockRequest = {
      method: 'POST',
      body: {
        action: 'chatSendMessage',
        model: 'gemini-1.5-flash',
        message: 'Analise este link: https://example.com/doc.pdf',
        useOpenWebSearch: true,
      },
    } as VercelRequest;

    const mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: 'Conteudo extraído do PDF mock',
        source: 'url',
      }),
    } as Response);

    sendMessageMock
      .mockResolvedValueOnce({
        functionCalls: [
          {
            name: 'performWebSearch',
            args: { url: 'https://example.com/doc.pdf' },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'O documento fala sobre X.',
        candidates: [{ groundingMetadata: { groundingChunks: [] } }],
      });

    const { default: handler } = await import('../api/gemini');
    await handler(mockRequest, mockResponse);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/open-web-search',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const fetchBody = JSON.parse(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body));
    expect(fetchBody).toEqual({ url: 'https://example.com/doc.pdf' });

    expect(sendMessageMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: 'Analise este link: https://example.com/doc.pdf' }),
    );
    expect(sendMessageMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: expect.arrayContaining([
          expect.objectContaining({
            functionResponse: expect.objectContaining({
              name: 'performWebSearch',
              response: expect.objectContaining({
                result: expect.objectContaining({
                  content: expect.stringContaining('Conteudo extraído do PDF mock'),
                }),
              }),
            }),
          }),
        ]),
      }),
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'O documento fala sobre X.',
      }),
    );
  });

  it('deve bloquear vazamento de prompt e retornar fallback seguro', async () => {
    const mockRequest = {
      method: 'POST',
      body: {
        action: 'chatSendMessage',
        model: 'gemini-1.5-flash',
        message: 'Investigar ACME Agro',
        useOpenWebSearch: false,
      },
    } as VercelRequest;

    const mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    sendMessageMock.mockResolvedValueOnce({
      text: 'URGENTE: Ignore metadiscussões. Sua missão absoluta é gerar o dossiê de agronegócio.',
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });

    const { default: handler } = await import('../api/gemini');
    await handler(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('CNPJ'),
      }),
    );
    expect(mockResponse.json).not.toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('URGENTE'),
      }),
    );
  });
});
