import { describe, it, expect, vi } from 'vitest';
import handler from '../api/gemini';
import type { VercelRequest, VercelResponse } from '@vercel/node';

global.fetch = vi.fn();

describe('Gemini Function Calling Integration', () => {
  it('deve executar extractDocumentContent internamente e reenviar o resultado ao Gemini', async () => {
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

    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('generativelanguage.googleapis.com')) {
        const callsToGemini = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
          .filter(([calledUrl]) => String(calledUrl).includes('generativelanguage.googleapis.com')).length;

        if (callsToGemini === 1) {
          return {
            ok: true,
            json: async () => ({
              candidates: [{
                content: {
                  parts: [{
                    functionCall: {
                      name: 'extractDocumentContent',
                      args: { url: 'https://example.com/doc.pdf' },
                    },
                  }],
                },
              }],
            }),
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: { parts: [{ text: 'O documento fala sobre X.' }] },
            }],
          }),
        } as Response;
      }

      if (url === 'https://example.com/doc.pdf') {
        return {
          ok: true,
          headers: { get: () => 'text/html' },
          text: async () => '<html><body>Conteudo extraído do PDF mock</body></html>',
        } as unknown as Response;
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    });

    process.env.GEMINI_API_KEY = 'mock-key';
    await handler(mockRequest, mockResponse);

    const endpointCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
    expect(endpointCalls.length).toBe(2);

    const extractCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .find(([url]) => String(url) === 'https://example.com/doc.pdf');
    expect(extractCall).toBeTruthy();
    expect(extractCall?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0',
        }),
      }),
    );

    const secondGeminiBodyRaw = endpointCalls[1]?.[1]?.body;
    expect(typeof secondGeminiBodyRaw).toBe('string');
    const secondGeminiBody = JSON.parse(String(secondGeminiBodyRaw));
    const allParts = secondGeminiBody.contents.flatMap((item: { parts: unknown[] }) => item.parts);
    expect(allParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          functionResponse: expect.objectContaining({
            name: 'extractDocumentContent',
            response: expect.objectContaining({
              result: expect.stringContaining('Conteudo extraído do PDF mock'),
            }),
          }),
        }),
      ]),
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'O documento fala sobre X.',
      }),
    );
  });
});
