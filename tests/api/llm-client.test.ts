import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const THINKING_TAG = 'redacted_' + 'thinking';

const fetchMock = vi.hoisted(() => vi.fn());

import {
  callLiteLLM,
  ensureMarkdownStart,
  isFallbackEnabled,
  isLiteLLMEnabled,
  isZenEnabled,
  LiteLLMRequestError,
  normalizeModelOutput,
  normalizeUsage,
  resolveLiteLLMClientTimeoutMs,
  resolveLiteLLMRequestBudgetMs,
} from '../../api/_llm-client.js';

describe('normalizeModelOutput', () => {
  it('remove <think> fechado', () => {
    const input = `<${THINKING_TAG}>raciocinio interno</${THINKING_TAG}>\n# Dossiê`;
    const result = normalizeModelOutput(input);
    expect(result.text).toBe('# Dossiê');
    expect(result.reasoningRemoved).toBe(true);
    expect(result.reasoningCharsRemoved).toBeGreaterThan(0);
  });

  it('remove <reasoning> fechado', () => {
    const input = '<reasoning>passo a passo</reasoning>\n# Teia Societária';
    const result = normalizeModelOutput(input);
    expect(result.text).toBe('# Teia Societária');
    expect(result.reasoningRemoved).toBe(true);
  });

  it('remove <analysis> fechado', () => {
    const input = '<analysis>detalhe</analysis>\n[[PORTA_FEED_O:7:ELOS:A]]';
    const result = normalizeModelOutput(input);
    expect(result.text).toBe('[[PORTA_FEED_O:7:ELOS:A]]');
    expect(result.reasoningRemoved).toBe(true);
  });

  it('remove tag sem fechamento', () => {
    const input = `<${THINKING_TAG}>raciocinio sem fim\n# Dossiê`;
    const result = normalizeModelOutput(input);
    expect(result.text).toBe('# Dossiê');
    expect(result.reasoningRemoved).toBe(true);
  });

  it('remove prosa antes do primeiro heading', () => {
    const input = 'Vou analisar a empresa agora.\n# Teia Societária\nConteúdo';
    const result = normalizeModelOutput(input);
    expect(result.text.startsWith('# Teia Societária')).toBe(true);
    expect(result.reasoningRemoved).toBe(true);
  });

  it('remove prefixo Let me analyze', () => {
    const input = 'Let me analyze this company first.\n# Raio-X Operacional';
    const result = normalizeModelOutput(input);
    expect(result.text).toBe('# Raio-X Operacional');
    expect(result.reasoningRemoved).toBe(true);
  });

  it('preserva JSON intacto', () => {
    const input = '{"module":"teia","score":7}';
    const result = normalizeModelOutput(input);
    expect(result.text).toBe(input);
    expect(result.reasoningRemoved).toBe(false);
  });

  it('preserva markers PORTA', () => {
    const input = '# Dossiê\n[[PORTA_FEED_O:7:ELOS:A]]\n[[PORTA_FEED_T:6:T1:7]]';
    const result = normalizeModelOutput(input);
    expect(result.text).toContain('[[PORTA_FEED_O:7:ELOS:A]]');
    expect(result.text).toContain('[[PORTA_FEED_T:6:T1:7]]');
  });

  it('remove thinking Kimi e preserva estrutura', () => {
    const input = '<reasoning>kimi chain</reasoning>\n# Teia Societária\n[[TEIA_COMPLEXIDADE:MEDIA]]';
    const result = normalizeModelOutput(input);
    expect(result.text).toContain('# Teia Societária');
    expect(result.text).toContain('[[TEIA_COMPLEXIDADE:MEDIA]]');
    expect(result.text).not.toContain('<reasoning>');
  });

  it('não remove texto longo válido sem reasoning', () => {
    const longValid = `# Teia Societária\n${'A'.repeat(1200)}\n[[PORTA_FEED_O:7:ELOS:A]]`;
    const result = normalizeModelOutput(longValid);
    expect(result.text.length).toBeGreaterThan(1000);
    expect(result.reasoningRemoved).toBe(false);
  });
});

describe('ensureMarkdownStart', () => {
  it('mantém heading ATX', () => {
    expect(ensureMarkdownStart('# Titulo')).toBe('# Titulo');
  });

  it('mantém marker PORTA sem heading', () => {
    expect(ensureMarkdownStart('[[PORTA_FEED_O:1:ELOS:A]]')).toBe('[[PORTA_FEED_O:1:ELOS:A]]');
  });
});

describe('normalizeUsage', () => {
  it('mapeia prompt/completion tokens', () => {
    expect(
      normalizeUsage({
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
      }),
    ).toEqual({
      promptTokenCount: 100,
      candidatesTokenCount: 200,
      totalTokenCount: 300,
    });
  });
});

describe('feature flags', () => {
  it('isLiteLLMEnabled exige provider + key + base url', () => {
    expect(
      isLiteLLMEnabled({
        LLM_PROVIDER: 'litellm',
        LITELLM_API_KEY: 'sk-test',
        LITELLM_BASE_URL: 'https://litellm.example',
      }),
    ).toBe(true);

    expect(
      isLiteLLMEnabled({
        LLM_PROVIDER: 'outro',
        LITELLM_API_KEY: 'sk-test',
        LITELLM_BASE_URL: 'https://litellm.example',
      }),
    ).toBe(false);
  });

  it('isFallbackEnabled default false', () => {
    expect(isFallbackEnabled({})).toBe(false);
    expect(isFallbackEnabled({ LLM_FALLBACK_ENABLED: 'false' })).toBe(false);
  });
});

describe('isZenEnabled', () => {
  it('exige provider zen + base url + key + model', () => {
    expect(
      isZenEnabled({
        LLM_PROVIDER: 'zen',
        OPENCODE_ZEN_BASE_URL: 'https://opencode.ai/zen/v1',
        OPENCODE_ZEN_API_KEY: 'sk-test',
        OPENCODE_ZEN_MODEL: 'deepseek-v4-flash',
      }),
    ).toBe(true);

    expect(
      isZenEnabled({
        LLM_PROVIDER: 'litellm',
        OPENCODE_ZEN_BASE_URL: 'https://opencode.ai/zen/v1',
        OPENCODE_ZEN_API_KEY: 'sk-test',
        OPENCODE_ZEN_MODEL: 'deepseek-v4-flash',
      }),
    ).toBe(false);

    expect(
      isZenEnabled({
        LLM_PROVIDER: 'zen',
        OPENCODE_ZEN_BASE_URL: 'https://opencode.ai/zen/v1',
        OPENCODE_ZEN_API_KEY: 'sk-test',
      }),
    ).toBe(false);
  });
});

describe('callLiteLLM', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: { content: `<${'redacted_' + 'thinking'}>x</${'redacted_' + 'thinking'}>\n# Dossiê` },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normaliza resposta do provider', async () => {
    const result = await callLiteLLM(
      {
        model: 'huawei/deepseek-r1-250528',
        userContent: 'gerar dossiê',
      },
      {
        LITELLM_API_KEY: 'sk-test',
        LITELLM_BASE_URL: 'https://litellm.example',
      },
    );

    expect(result.text).toBe('# Dossiê');
    expect(result.usage.promptTokenCount).toBe(10);
    expect(result.reasoningRemoved).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://litellm.example/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: 'huawei/deepseek-r1-250528',
      max_tokens: 8192,
      temperature: 0.1,
    });
  });

  it('roteia para OpenCode Zen quando LLM_PROVIDER=zen (uma única chamada, sem retry)', async () => {
    const result = await callLiteLLM(
      {
        model: 'ignored-by-zen',
        userContent: 'gerar dossiê',
      },
      {
        LLM_PROVIDER: 'zen',
        OPENCODE_ZEN_BASE_URL: 'https://opencode.ai/zen/v1',
        OPENCODE_ZEN_API_KEY: 'sk-zen-test',
        OPENCODE_ZEN_MODEL: 'deepseek-v4-flash',
      },
    );

    expect(result.text).toBe('# Dossiê');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://opencode.ai/zen/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-zen-test' }),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: 'deepseek-v4-flash',
      max_tokens: 8192,
    });
  });

  it('zen: não repete erro 429 transitório (zero retry automático)', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { type: 'rate_limit', message: 'too many' } }),
    });

    await expect(
      callLiteLLM(
        {
          model: 'deepseek-v4-flash',
          userContent: 'x',
        },
        {
          LLM_PROVIDER: 'zen',
          OPENCODE_ZEN_BASE_URL: 'https://opencode.ai/zen/v1',
          OPENCODE_ZEN_API_KEY: 'sk-zen-test',
          OPENCODE_ZEN_MODEL: 'deepseek-v4-flash',
        },
      ),
    ).rejects.toBeInstanceOf(LiteLLMRequestError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('zen: sem config completa lança GATEWAY_NOT_CONFIGURED', async () => {
    await expect(
      callLiteLLM(
        { model: 'deepseek-v4-flash', userContent: 'x' },
        { LLM_PROVIDER: 'zen', OPENCODE_ZEN_API_KEY: 'sk-zen-test' },
      ),
    ).rejects.toMatchObject({ code: 'GATEWAY_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserva timeout e defaults do caminho legado usado por api/llm', async () => {
    expect(resolveLiteLLMClientTimeoutMs()).toBe(120_000);
    expect(resolveLiteLLMClientTimeoutMs('150000')).toBe(150_000);
    expect(resolveLiteLLMClientTimeoutMs('999999')).toBe(180_000);
    const legacyText = 'Vou analisar sem remover este prefixo.\n<reasoning>conteúdo legado literal</reasoning>';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: legacyText } }] }),
    });

    const result = await callLiteLLM(
      { model: 'legacy-model', messages: [{ role: 'user', content: 'prompt legado' }] },
      { LITELLM_API_KEY: 'key', LITELLM_BASE_URL: 'https://litellm.example' },
    );

    expect(result).toBe(legacyText);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ temperature: 0.7, max_tokens: 4096 });
  });

  it('usa budget total inferior a 60s por padrão', async () => {
    expect(resolveLiteLLMRequestBudgetMs()).toBe(38_000);
    await callLiteLLM(
      { model: 'huawei/deepseek-v4-flash', userContent: 'gerar dossiê' },
      {
        LITELLM_API_KEY: 'sk-test',
        LITELLM_BASE_URL: 'https://litellm.example',
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('respeita timeout explícito válido', async () => {
    expect(resolveLiteLLMRequestBudgetMs('60000')).toBe(60_000);
    expect(resolveLiteLLMRequestBudgetMs('999999')).toBe(180_000);
    expect(resolveLiteLLMRequestBudgetMs('1000')).toBe(1000);
    await callLiteLLM(
      { model: 'huawei/deepseek-v4-flash', userContent: 'gerar dossiê' },
      {
        LITELLM_API_KEY: 'sk-test',
        LITELLM_BASE_URL: 'https://litellm.example',
        LITELLM_REQUEST_TIMEOUT_MS: '60000',
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('captura o corpo do gateway em erro 429 (instrumentação)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => '{"error":{"message":"rate limit exceeded","type":"rate_limit_error"}}',
    });

    const err = await callLiteLLM(
      { model: 'model', userContent: 'prompt' },
      {
        LITELLM_API_KEY: 'key',
        LITELLM_BASE_URL: 'https://litellm.example',
        LITELLM_MAX_RETRIES: '0',
      },
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LiteLLMRequestError);
    expect((err as LiteLLMRequestError).code).toBe('GATEWAY_HTTP_ERROR');
    expect((err as LiteLLMRequestError).retryable).toBe(true);
    expect((err as LiteLLMRequestError).gatewayBody).toContain('rate limit exceeded');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sanitiza corpo do gateway e captura retry-after/request-id (instrumentação)', async () => {
    const headers = new Headers({
      'retry-after': '7',
      'x-request-id': 'req_abc123',
      'x-ratelimit-remaining': '0',
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers,
      text: async () =>
        '{"error":{"message":"rate limit exceeded","api_key":"sk-LIVE-SECRET-12345678"}}',
    });

    const err = await callLiteLLM(
      { model: 'model', userContent: 'prompt' },
      {
        LITELLM_API_KEY: 'key',
        LITELLM_BASE_URL: 'https://litellm.example',
        LITELLM_MAX_RETRIES: '0',
      },
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LiteLLMRequestError);
    const llmErr = err as LiteLLMRequestError;
    expect(llmErr.retryable).toBe(true);
    expect(llmErr.gatewayBody).not.toContain('sk-LIVE-SECRET-12345678');
    expect(llmErr.gatewayBody).toContain('[REDACTED]');
    expect(llmErr.retryAfter).toBe('7');
    expect(llmErr.requestId).toBe('req_abc123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não repete erro 4xx permanente', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' });

    await expect(
      callLiteLLM(
        { model: 'model', userContent: 'prompt' },
        { LITELLM_API_KEY: 'key', LITELLM_BASE_URL: 'https://litellm.example' },
      ),
    ).rejects.toThrow('HTTP 401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não repete 429 com budget_exceeded', async () => {
    const body = JSON.stringify({
      error: { type: 'budget_exceeded', code: 'budget_exceeded' },
    });
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => body })
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => body });

    await expect(
      callLiteLLM(
        { model: 'model', userContent: 'prompt' },
        {
          LITELLM_API_KEY: 'key',
          LITELLM_BASE_URL: 'https://litellm.example',
          LITELLM_RETRY_BASE_DELAY_MS: '0',
        },
      ),
    ).rejects.toMatchObject({ code: 'GATEWAY_BUDGET_EXCEEDED', retryable: false, status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não trata code budget_exceeded fora de error.type como budget canônico', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ code: 'budget_exceeded' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: '# Recuperado' } }] }),
      });

    const result = await callLiteLLM(
      { model: 'model', userContent: 'prompt' },
      {
        LITELLM_API_KEY: 'key',
        LITELLM_BASE_URL: 'https://litellm.example',
        LITELLM_RETRY_BASE_DELAY_MS: '0',
      },
    );

    expect(result.text).toBe('# Recuperado');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('repete 429 transitório', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { type: 'rate_limit_error', code: 'rate_limit_error' } }),
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: '# Recuperado' } }] }),
    });

    const result = await callLiteLLM(
      { model: 'model', userContent: 'prompt' },
      {
        LITELLM_API_KEY: 'key',
        LITELLM_BASE_URL: 'https://litellm.example',
        LITELLM_RETRY_BASE_DELAY_MS: '0',
      },
    );

    expect(result.text).toBe('# Recuperado');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('repete erro transitório e respeita o budget agregado', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: '# Recuperado' } }] }),
    });

    const result = await callLiteLLM(
      { model: 'model', userContent: 'prompt' },
      {
        LITELLM_API_KEY: 'key',
        LITELLM_BASE_URL: 'https://litellm.example',
        LITELLM_REQUEST_TIMEOUT_MS: '5000',
        LITELLM_RETRY_BASE_DELAY_MS: '1',
      },
    );

    expect(result.text).toBe('# Recuperado');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejeita resposta vazia do provider', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: '   ' } }] }),
    });

    await expect(
      callLiteLLM(
        { model: 'model', userContent: 'prompt' },
        { LITELLM_API_KEY: 'key', LITELLM_BASE_URL: 'https://litellm.example' },
      ),
    ).rejects.toThrow('resposta vazia');
  });

  it('aplica o budget também à leitura do body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => new Promise<string>(() => undefined),
    });

    await expect(
      callLiteLLM(
        { model: 'model', userContent: 'prompt' },
        {
          LITELLM_API_KEY: 'key',
          LITELLM_BASE_URL: 'https://litellm.example',
          LITELLM_REQUEST_TIMEOUT_MS: '10',
          LITELLM_MAX_RETRIES: '0',
        },
      ),
    ).rejects.toThrow('budget');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('distingue timeout interno e remove o timer do transporte', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>(() => undefined),
    );

    const pending = callLiteLLM(
      { model: 'model', userContent: 'prompt', timeoutMs: 10 },
      {
        LITELLM_API_KEY: 'key',
        LITELLM_BASE_URL: 'https://litellm.example',
        LITELLM_MAX_RETRIES: '0',
      },
    );
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'GATEWAY_TIMEOUT',
    });

    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    expect(clearTimeoutSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('distingue abort externo e remove o listener do signal', async () => {
    const controller = new AbortController();
    const removeListenerSpy = vi.spyOn(controller.signal, 'removeEventListener');
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>(() => undefined),
    );

    const pending = callLiteLLM(
      { model: 'model', userContent: 'prompt', signal: controller.signal, timeoutMs: 5_000 },
      {
        LITELLM_API_KEY: 'key',
        LITELLM_BASE_URL: 'https://litellm.example',
        LITELLM_MAX_RETRIES: '0',
      },
    );
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'GATEWAY_ABORTED',
    });

    controller.abort();
    await assertion;
    expect(removeListenerSpy).toHaveBeenCalled();
  });
});
