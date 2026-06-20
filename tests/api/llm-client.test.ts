import { describe, expect, it, vi, beforeEach } from 'vitest';

const THINKING_TAG = 'redacted_' + 'thinking';

const createMock = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    };

    constructor(_config: unknown) {
      // noop — config validated by callLiteLLM tests via createMock args
    }
  },
}));

import {
  callLiteLLM,
  ensureMarkdownStart,
  isFallbackEnabled,
  isLiteLLMEnabled,
  normalizeModelOutput,
  normalizeUsage,
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
        LLM_PROVIDER: 'gemini',
        LITELLM_API_KEY: 'sk-test',
        LITELLM_BASE_URL: 'https://litellm.example',
      }),
    ).toBe(false);
  });

  it('isFallbackEnabled default true', () => {
    expect(isFallbackEnabled({})).toBe(true);
    expect(isFallbackEnabled({ LLM_FALLBACK_ENABLED: 'false' })).toBe(false);
  });
});

describe('callLiteLLM', () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({
      choices: [
        {
          message: { content: `<${'redacted_' + 'thinking'}>x</${'redacted_' + 'thinking'}>\n# Dossiê` },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
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
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'huawei/deepseek-r1-250528',
        max_tokens: 8192,
        temperature: 0.1,
      }),
    );
  });
});
