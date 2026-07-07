import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { callLiteLLM, isLiteLLMEnabled } from '../../api/_llm-client.js';

const fetchMock = vi.hoisted(() => vi.fn());

describe('isLiteLLMEnabled', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('retorna true quando provider + key + base url estão configurados', () => {
    process.env.LLM_PROVIDER = 'litellm';
    process.env.LITELLM_API_KEY = 'sk-test';
    process.env.LITELLM_BASE_URL = 'https://litellm.example';
    expect(isLiteLLMEnabled()).toBe(true);
  });

  it('retorna false quando provider não é litellm', () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.LITELLM_API_KEY = 'sk-test';
    process.env.LITELLM_BASE_URL = 'https://litellm.example';
    expect(isLiteLLMEnabled()).toBe(false);
  });

  it('retorna false quando faltam configs', () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LITELLM_API_KEY;
    delete process.env.LITELLM_BASE_URL;
    expect(isLiteLLMEnabled()).toBe(false);
  });
});

describe('callLiteLLM', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    process.env.LITELLM_BASE_URL = 'https://litellm.example';
    process.env.LITELLM_API_KEY = 'sk-test';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
  });

  it('retorna texto da resposta do provider', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '# Dossiê' } }],
      }),
    });

    const result = await callLiteLLM({
      model: 'huawei/deepseek-r1-250528',
      messages: [{ role: 'user', content: 'gerar dossiê' }],
    });

    expect(result).toBe('# Dossiê');
  });

  it('usa os headers e body corretos', async () => {
    process.env.LITELLM_BASE_URL = 'https://litellm.example';
    process.env.LITELLM_API_KEY = 'sk-test';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
      }),
    });

    await callLiteLLM({
      model: 'model-test',
      messages: [{ role: 'user', content: 'prompt' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://litellm.example/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: 'model-test',
      max_tokens: 4096,
      temperature: 0.7,
    });
  });

  it('repete erro transitório uma vez', async () => {
    process.env.LITELLM_BASE_URL = 'https://litellm.example';
    process.env.LITELLM_API_KEY = 'sk-test';

    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '# Recuperado' } }] }),
      });

    const result = await callLiteLLM({
      model: 'model',
      messages: [{ role: 'user', content: 'prompt' }],
    });

    expect(result).toBe('# Recuperado');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lança erro em resposta 4xx sem repetir', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' });

    await expect(
      callLiteLLM({
        model: 'model',
        messages: [{ role: 'user', content: 'prompt' }],
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lança erro em resposta vazia', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    });

    await expect(
      callLiteLLM({
        model: 'model',
        messages: [{ role: 'user', content: 'prompt' }],
      }),
    ).rejects.toThrow('LiteLLM');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
