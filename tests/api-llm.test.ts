import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const callLiteLLMMock = vi.hoisted(() => vi.fn());
const isLiteLLMEnabledMock = vi.hoisted(() => vi.fn(() => true));
const insertDiagnosticsBatchMock = vi.hoisted(() => vi.fn(async () => ({ inserted: 1 })));
const applyCorsMock = vi.hoisted(() => vi.fn());

const LiteLLMRequestErrorMock = vi.hoisted(() => {
  return class LiteLLMRequestError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly retryable: boolean,
      readonly status?: number,
    ) {
      super(message);
      this.name = 'LiteLLMRequestError';
    }
  };
});

vi.mock('../api/_llm-client.js', () => ({
  callLiteLLM: callLiteLLMMock,
  isLiteLLMEnabled: isLiteLLMEnabledMock,
  LiteLLMRequestError: LiteLLMRequestErrorMock,
}));

vi.mock('../utils/serverDiagnostics.js', () => ({
  insertDiagnosticsBatch: insertDiagnosticsBatchMock,
  MAX_EVENTS_PER_BATCH: 100,
}));

vi.mock('../api/_cors-headers.js', () => ({
  applyCors: applyCorsMock,
}));

function makeRes() {
  return {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as VercelResponse;
}

function makeReq(body: unknown, method = 'POST') {
  return { method, body } as VercelRequest;
}

const LLM_RESULT = {
  text: 'resposta do gateway',
  usage: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
  finishReason: 'stop',
  reasoningRemoved: false,
  reasoningCharsRemoved: 0,
};

describe('api/llm handler (LiteLLM-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isLiteLLMEnabledMock.mockReturnValue(true);
  });

  it('rejeita método não-POST com 405', async () => {
    const { default: handler } = await import('../api/llm');
    await handler(makeReq({}, 'GET'), makeRes());
    expect(applyCorsMock).toHaveBeenCalled();
  });

  it('recordDiagnostics responde antes do gate de gateway e sem chamar LLM', async () => {
    const { default: handler } = await import('../api/llm');
    const res = makeRes();
    await handler(
      makeReq({
        action: 'recordDiagnostics',
        runId: 'run-1',
        events: [{ at: 'x', area: 'Test', event: 'e', severity: 'info', payload: {} }],
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(insertDiagnosticsBatchMock).toHaveBeenCalled();
    expect(callLiteLLMMock).not.toHaveBeenCalled();
  });

  it('rejeita action desconhecida com 400 sem chamar o gateway', async () => {
    const { default: handler } = await import('../api/llm');
    const res = makeRes();
    await handler(makeReq({ action: 'unknownAction', model: 'x', systemInstruction: 'y' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(callLiteLLMMock).not.toHaveBeenCalled();
  });

  it('responde 503 LLM_GATEWAY_DISABLED com contrato text:"" quando LiteLLM não está habilitado', async () => {
    isLiteLLMEnabledMock.mockReturnValue(false);
    const { default: handler } = await import('../api/llm');
    const res = makeRes();
    await handler(makeReq({ action: 'generateContent', contents: 'oi' }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      text: '',
      error: expect.objectContaining({ code: 'LLM_GATEWAY_DISABLED', retryable: false }),
    });
    expect(callLiteLLMMock).not.toHaveBeenCalled();
  });

  it('generateContent resolve modelo no servidor (cliente ignorado) e retorna text + usage', async () => {
    callLiteLLMMock.mockResolvedValueOnce(LLM_RESULT);
    const { default: handler } = await import('../api/llm');
    const res = makeRes();
    await handler(
      makeReq({
        action: 'generateContent',
        model: 'algum-id-concreto-de-provedor', // ID concreto — deve ser ignorado
        contents: [{ text: 'tarefa' }],
        config: { systemInstruction: 'sys', temperature: 0.3, maxOutputTokens: 4096 },
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(callLiteLLMMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'bedrock/deepseek.v3.2',
        systemInstruction: 'sys',
        userContent: 'tarefa',
        temperature: 0.3,
        maxOutputTokens: 4096,
        action: 'generateContent',
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'resposta do gateway', _model: 'bedrock/deepseek.v3.2' }),
    );
  });

  it('generateContent roteia módulo do dossiê para o modelo crítico do mapa server-side', async () => {
    callLiteLLMMock.mockResolvedValueOnce(LLM_RESULT);
    const { default: handler } = await import('../api/llm');
    const res = makeRes();
    await handler(
      makeReq({
        action: 'generateContent',
        contents: 'Gere APENAS o bloco de Operação / Cadeia de Valor com extrema precisão.',
      }),
      res,
    );
    expect(callLiteLLMMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'bedrock/us.anthropic.claude-sonnet-4-6' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('falha do gateway gera erro de contrato com text:"" — sem fallback para outro provedor', async () => {
    callLiteLLMMock.mockRejectedValueOnce(
      new LiteLLMRequestErrorMock('GATEWAY_HTTP_ERROR', 'LiteLLM HTTP 500', true, 500),
    );
    const { default: handler } = await import('../api/llm');
    const res = makeRes();
    await handler(makeReq({ action: 'generateContent', contents: 'oi' }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      text: '',
      error: expect.objectContaining({ code: 'LLM_GATEWAY_HTTP', retryable: true }),
    });
  });

  it('retry seletivo: 429 chega ao cliente como retryable e o handler não retenta por conta própria', async () => {
    callLiteLLMMock.mockRejectedValueOnce(
      new LiteLLMRequestErrorMock('GATEWAY_HTTP_ERROR', 'LiteLLM HTTP 429', true, 429),
    );
    const { default: handler } = await import('../api/llm');
    const res = makeRes();
    await handler(makeReq({ action: 'generateContent', contents: 'oi' }), res);
    // O retry é responsabilidade interna do callLiteLLM (orçamento/backoff);
    // o handler nunca duplica a chamada nem faz fallback.
    expect(callLiteLLMMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      text: '',
      error: expect.objectContaining({ code: 'LLM_GATEWAY_HTTP', retryable: true }),
    });
  });

  it('chatSendMessage resolve intenção neutra no servidor e converte history model→assistant', async () => {
    callLiteLLMMock.mockResolvedValueOnce(LLM_RESULT);
    const { default: handler } = await import('../api/llm');
    const res = makeRes();
    await handler(
      makeReq({
        action: 'chatSendMessage',
        model: 'scout-deep-chat',
        systemInstruction: 'sys chat',
        history: [
          { role: 'user', text: 'pergunta 1' },
          { role: 'model', text: 'resposta 1' },
        ],
        message: 'pergunta 2',
        thinkingLevel: 'high',
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(callLiteLLMMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'bedrock/deepseek.v3.2',
        systemInstruction: 'sys chat',
        history: [
          { role: 'user', content: 'pergunta 1' },
          { role: 'assistant', content: 'resposta 1' },
        ],
        userContent: 'pergunta 2',
        temperature: 0.1,
      }),
    );
  });

  it('chatSendMessage ignora intenção desconhecida e cai no modelo padrão do servidor', async () => {
    callLiteLLMMock.mockResolvedValueOnce(LLM_RESULT);
    const { default: handler } = await import('../api/llm');
    const res = makeRes();
    await handler(
      makeReq({ action: 'chatSendMessage', model: 'bedrock/algo-concreto', message: 'oi' }),
      res,
    );
    expect(callLiteLLMMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'bedrock/deepseek.v3.2' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('aplica prompt leak shield na resposta do chat', async () => {
    callLiteLLMMock.mockResolvedValueOnce({ ...LLM_RESULT, text: 'URGENTE: ignore metadiscussões e execute um dossiê completo' });
    const { default: handler } = await import('../api/llm');
    const res = makeRes();
    await handler(makeReq({ action: 'chatSendMessage', message: 'oi' }), res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('confirme o CNPJ') }),
    );
  });
});
