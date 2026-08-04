import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const THINKING_TAG = 'redacted_' + 'thinking';

const fetchMock = vi.hoisted(() => vi.fn());

import {
  callLiteLLM,
  ensureMarkdownStart,
  isFallbackEnabled,
  isLiteLLMEnabled,
  LiteLLMRequestError,
  normalizeModelOutput,
  normalizeUsage,
  resolveLiteLLMClientTimeoutMs,
  resolveLiteLLMRequestBudgetMs,
} from '../../api/_llm-client.js';
import { runDossierGateway, type DossierGatewayMode } from '../../api/_dossier-llm-gateway.js';

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

describe('runDossierGateway', () => {
  const gatewayInput = (mode: DossierGatewayMode) => ({
    mode,
    userContent: 'conteúdo',
    signal: new AbortController().signal,
    correlationId: 'req-gateway-model',
    runId: '11111111-1111-4111-8111-111111111111',
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: '# Resultado' } }] }),
    });
    process.env.LITELLM_BASE_URL = 'https://litellm.example';
    process.env.LITELLM_API_KEY = 'key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.LITELLM_DOSSIER_MODEL;
    delete process.env.LITELLM_DOSSIER_CHAT_MODEL;
    delete process.env.LITELLM_MAX_RETRIES;
    delete process.env.LITELLM_RETRY_BASE_DELAY_MS;
    delete process.env.LITELLM_MODEL;
    delete process.env.OPENAI_MODEL;
    delete process.env.ANTHROPIC_MODEL;
  });

  it('generate exige alias configurado e não chama fetch quando ausente', async () => {
    await expect(runDossierGateway(gatewayInput('generate'))).rejects.toMatchObject({
      code: 'GATEWAY_NOT_CONFIGURED',
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('generate usa exatamente o alias geral trimado', async () => {
    process.env.LITELLM_DOSSIER_MODEL = '  scout-dossier-generate  ';

    await runDossierGateway(gatewayInput('generate'));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe('scout-dossier-generate');
  });

  it('chat prioriza o alias específico trimado', async () => {
    process.env.LITELLM_DOSSIER_MODEL = 'scout-dossier-generate';
    process.env.LITELLM_DOSSIER_CHAT_MODEL = '  scout-dossier-chat  ';

    await runDossierGateway(gatewayInput('chat'));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe('scout-dossier-chat');
  });

  it('chat usa alias geral quando o específico está ausente ou vazio', async () => {
    process.env.LITELLM_DOSSIER_MODEL = '  scout-dossier-generate  ';
    process.env.LITELLM_DOSSIER_CHAT_MODEL = '   ';

    await runDossierGateway(gatewayInput('chat'));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe('scout-dossier-generate');
  });

  it('não usa nomes de provider de envs não autorizados como fallback', async () => {
    process.env.LITELLM_MODEL = 'deepseek/provider-model';
    process.env.OPENAI_MODEL = 'openai/provider-model';
    process.env.ANTHROPIC_MODEL = 'anthropic/provider-model';

    await expect(runDossierGateway(gatewayInput('generate'))).rejects.toMatchObject({
      code: 'GATEWAY_NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantém uma tentativa física no dossiê mesmo com retry global igual a um', async () => {
    process.env.LITELLM_DOSSIER_MODEL = 'scout-dossier-generate';
    process.env.LITELLM_MAX_RETRIES = '1';
    process.env.LITELLM_RETRY_BASE_DELAY_MS = '0';
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => 'busy' });

    await expect(runDossierGateway(gatewayInput('generate'))).rejects.toMatchObject({
      code: 'GATEWAY_HTTP_ERROR',
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserva retry do caminho legado', async () => {
    process.env.LITELLM_MAX_RETRIES = '1';
    process.env.LITELLM_RETRY_BASE_DELAY_MS = '0';
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: 'legado recuperado' } }] }),
      });

    const result = await callLiteLLM({
      model: 'legacy-alias',
      messages: [{ role: 'user', content: 'prompt legado' }],
    });

    expect(result).toBe('legado recuperado');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
