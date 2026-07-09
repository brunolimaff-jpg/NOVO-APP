import { describe, expect, it, vi } from 'vitest';

import { executeLlmRoute, selectGenerateContentRoute } from '../../api/_llm-routing';

describe('selectGenerateContentRoute', () => {
  it('seleciona LiteLLM para modulo elegivel quando o provider esta habilitado', () => {
    expect(
      selectGenerateContentRoute({
        liteLlmEnabled: true,
        requestedModel: 'gemini-3-flash-preview',
        moduleName: 'Caminho de Venda',
        hasCachedContent: false,
        hasSystemInstruction: true,
        hasGrounding: false,
      }),
    ).toEqual({
      provider: 'litellm',
      reason: 'litellm_enabled',
      model: 'bedrock/us.anthropic.claude-sonnet-4-6',
      module: 'Caminho de Venda',
    });
  });

  it('declara Foundation Cache como motivo para usar Gemini', () => {
    expect(
      selectGenerateContentRoute({
        liteLlmEnabled: true,
        requestedModel: 'gemini-3-flash-preview',
        moduleName: 'Porte / Teia Societária',
        hasCachedContent: true,
        hasSystemInstruction: false,
        hasGrounding: false,
      }),
    ).toEqual({
      provider: 'gemini',
      reason: 'foundation_cache',
      model: 'gemini-3-flash-preview',
      module: 'Porte / Teia Societária',
    });
  });

  it('declara grounding como motivo para usar Gemini e nao registra modulo livre', () => {
    expect(
      selectGenerateContentRoute({
        liteLlmEnabled: true,
        requestedModel: 'gemini-3-flash-preview',
        moduleName: 'Empresa 12.345.678/0001-90',
        hasCachedContent: false,
        hasSystemInstruction: true,
        hasGrounding: true,
      }),
    ).toEqual({
      provider: 'gemini',
      reason: 'grounding_required',
      model: 'gemini-3-flash-preview',
      module: null,
    });
  });

  it('prioriza Foundation Cache quando cache e grounding chegam juntos', () => {
    expect(
      selectGenerateContentRoute({
        liteLlmEnabled: true,
        requestedModel: 'gemini-3-flash-preview',
        moduleName: 'Caminho de Venda',
        hasCachedContent: true,
        hasSystemInstruction: false,
        hasGrounding: true,
      }),
    ).toMatchObject({
      provider: 'gemini',
      reason: 'foundation_cache',
    });
  });
});

describe('executeLlmRoute', () => {
  it('emite apenas metadados seguros de selecao e conclusao', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      executeLlmRoute(
        {
          provider: 'litellm',
          reason: 'litellm_enabled',
          model: 'bedrock/deepseek.v3.2',
          module: 'Porte / Teia Societária',
        },
        async () => 'ok',
      ),
    ).resolves.toBe('ok');

    const serializedLogs = JSON.stringify(warn.mock.calls);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(serializedLogs).toContain('provider:selected');
    expect(serializedLogs).toContain('provider:completed');
    expect(serializedLogs).not.toContain('contents');
    expect(serializedLogs).not.toContain('companyName');
    expect(serializedLogs).not.toContain('cnpj');
  });

  it('registra falha sem vazar erro, modelo ou modulo nao confiaveis', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unsafeModel = '12.345.678/0001-90';
    const unsafeModule = 'Empresa 12.345.678/0001-90';
    const upstreamError = 'upstream rejected CNPJ 12.345.678/0001-90';

    await expect(
      executeLlmRoute(
        {
          provider: 'gemini',
          reason: 'foundation_cache',
          model: unsafeModel,
          module: unsafeModule,
        },
        async () => {
          throw new Error(upstreamError);
        },
      ),
    ).rejects.toThrow(upstreamError);

    expect(warn).toHaveBeenLastCalledWith(
      '[LlmRoute]',
      expect.objectContaining({ event: 'provider:failed', model: null, module: null }),
    );

    const serializedLogs = JSON.stringify(warn.mock.calls);
    expect(serializedLogs).not.toContain('12.345.678/0001-90');
    expect(serializedLogs).not.toContain('upstream rejected');
  });
});
