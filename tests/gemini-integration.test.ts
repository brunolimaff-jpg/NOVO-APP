import { describe, it, expect, vi } from 'vitest';
import handler from '../api/gemini';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock do GoogleGenAI
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    chats: {
      create: vi.fn().mockReturnValue({
        sendMessage: vi.fn(),
      }),
    },
  })),
}));

// Mock do fetch global para as chamadas internas de API
global.fetch = vi.fn();

describe('Gemini Function Calling Integration', () => {
  it('deve rotear chamadas de extractDocumentContent para /api/extract-content', async () => {
    const mockRequest = {
      method: 'POST',
      body: {
        action: 'chatSendMessage',
        message: 'Analise este link: https://example.com/doc.pdf',
        useOpenWebSearch: true,
      },
    } as VercelRequest;

    const mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as VercelResponse;

    // Mock do chatSession
    const mockChat = {
      sendMessage: vi.fn()
        // Primeiro retorno: O modelo decide chamar a ferramenta
        .mockResolvedValueOnce({
          functionCalls: [{
            name: 'extractDocumentContent',
            args: { url: 'https://example.com/doc.pdf' }
          }]
        })
        // Segundo retorno: O modelo recebe o texto e responde final
        .mockResolvedValueOnce({
          text: 'O documento fala sobre X.',
          candidates: [{ content: { parts: [{ text: 'O documento fala sobre X.' }] } }]
        }),
    };

    const { GoogleGenAI } = await import('@google/genai');
    (GoogleGenAI as any).mockImplementationOnce(() => ({
      chats: {
        create: vi.fn().mockReturnValue(mockChat),
      },
    }));

    // Mock da API de extracao
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'Conteudo extraído do PDF mock', length: 30 }),
    });

    // Executa o handler
    process.env.GEMINI_API_KEY = 'mock-key';
    await handler(mockRequest, mockResponse);

    // Verifica se o fetch interno foi para a rota correta
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/extract-content'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('https://example.com/doc.pdf')
      })
    );

    // Verifica se o chat recebeu a resposta da ferramenta
    expect(mockChat.sendMessage).toHaveBeenCalledTimes(2);
    const secondCall = mockChat.sendMessage.mock.calls[1][0];
    expect(secondCall[0].functionResponse.name).toBe('extractDocumentContent');
    expect(secondCall[0].functionResponse.response.result.text).toBe('Conteudo extraído do PDF mock');
  });
});
