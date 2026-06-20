import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  proxyGenerateContentMock,
  proxyChatSendMessageMock,
  executeOpenWebSearchToolMock,
  applyPromptLeakShieldMock,
  buscarContextoPineconeMock,
  buscarContextoDocsPineconeMock,
  lookupClienteMock,
} = vi.hoisted(() => ({
  proxyGenerateContentMock: vi.fn(),
  proxyChatSendMessageMock: vi.fn(),
  executeOpenWebSearchToolMock: vi.fn(),
  applyPromptLeakShieldMock: vi.fn(),
  buscarContextoPineconeMock: vi.fn(),
  buscarContextoDocsPineconeMock: vi.fn(),
  lookupClienteMock: vi.fn(),
}));

vi.mock('../../services/geminiProxy', () => ({
  proxyGenerateContent: proxyGenerateContentMock,
  proxyChatSendMessage: proxyChatSendMessageMock,
  executeOpenWebSearchTool: executeOpenWebSearchToolMock,
}));

vi.mock('../../services/ragService', () => ({
  buscarContextoPinecone: buscarContextoPineconeMock,
  buscarContextoDocsPinecone: buscarContextoDocsPineconeMock,
}));

vi.mock('../../services/clientLookupService', async () => {
  const actual = await vi.importActual<typeof import('../../services/clientLookupService')>(
    '../../services/clientLookupService',
  );
  return {
    ...actual,
    lookupCliente: lookupClienteMock,
    formatarParaPrompt: vi.fn().mockReturnValue('Lookup formatado'),
    isConcorrenteOuPropria: vi.fn().mockReturnValue(false),
    benchmarkClientes: vi.fn().mockResolvedValue([]),
    formatarBenchmarkParaPrompt: vi.fn().mockReturnValue(''),
    formatarComexParaPrompt: vi.fn().mockReturnValue(''),
  };
});

vi.mock('../../services/portaStateService', async () => {
  const actual = await vi.importActual<typeof import('../../services/portaStateService')>(
    '../../services/portaStateService',
  );
  return {
    ...actual,
    generatePortaContextForDeepDive: vi.fn().mockReturnValue('PORTA Score atual 74'),
    initPortaState: vi.fn(),
    resetPortaState: vi.fn(),
    setBaseScore: vi.fn(),
    getPortaState: vi.fn().mockReturnValue(null),
    addFeedAdjustment: vi.fn(),
    addFlagFeed: vi.fn(),
    addSegmentFeed: vi.fn(),
  };
});

vi.mock('../../utils/diagnosticLog', () => ({
  scoutDiag: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../utils/retry', () => ({
  withAutoRetry: vi.fn(async (_name: string, action: () => Promise<unknown>) => action()),
}));

vi.mock('../../utils/textCleaners', async () => {
  const actual = await vi.importActual<typeof import('../../utils/textCleaners')>('../../utils/textCleaners');
  return {
    ...actual,
    applyPromptLeakShield: applyPromptLeakShieldMock,
  };
});

import { generateDossierModule, sendMessageToGemini } from '../../services/geminiService';
import { Sender } from '../../types';

describe('investigation-orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookupClienteMock.mockResolvedValue({
      ok: true,
      query: 'SCHEFFER & CIA LTDA',
      encontrado: true,
      total: 1,
      results: [
        {
          grupo: 'SCHEFFER & CIA LTDA',
          razoes_sociais: ['SCHEFFER & CIA LTDA'],
          linhas_produto: [],
          familias_presentes: [],
          modulos_por_familia: {},
          gaps_crosssell: [],
          total_modulos: 0,
          eh_cliente_senior: false,
          tem_gatec: false,
          tem_erp: false,
          tem_hcm: false,
          tem_logistica: false,
          matchType: 'exact',
        },
      ],
    });
    proxyChatSendMessageMock.mockResolvedValue({ text: 'Resposta consolidada.' });
    proxyGenerateContentMock.mockResolvedValue({
      text: 'Conclusão parcial.\n[[PORTA_FEED_O:7:ELOS:Plantio,Armazenagem]]',
    });
    executeOpenWebSearchToolMock.mockResolvedValue({ content: 'Nenhum resultado encontrado.' });
    applyPromptLeakShieldMock.mockImplementation((text: string) => ({
      text,
      blocked: false,
      detected: false,
      indicators: [],
      fingerprint: null,
    }));
  });

  it('preserva markers internos no fluxo de módulo quando não há vazamento real', async () => {
    const result = await generateDossierModule(
      'Raio-X Operacional',
      'SCHEFFER & CIA LTDA',
      'foundation block',
      'specialist block',
      'extra context',
    );

    expect(applyPromptLeakShieldMock).toHaveBeenCalledTimes(1);
    const [, options] = applyPromptLeakShieldMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(options).toMatchObject({
      companyHint: 'SCHEFFER & CIA LTDA',
      preserveInternalMarkersWhenSafe: true,
    });
    expect(result).toContain('[[PORTA_FEED_O:7:ELOS:Plantio,Armazenagem]]');
  });

  it('marca como unverified quando grounding nao retorna fontes (sem fallback web)', async () => {
    const onGroundingSources = vi.fn();
    const onVerificationStatus = vi.fn();

    const result = await generateDossierModule(
      'Riscos & Compliance',
      'Grupo Piccini',
      'foundation block',
      'specialist block',
      'Sócio: João Piccini',
      { useGrounding: true, onGroundingSources, onVerificationStatus },
    );

    expect(result).toContain('Conclusão parcial');
    expect(executeOpenWebSearchToolMock).not.toHaveBeenCalled();
    expect(onVerificationStatus).toHaveBeenCalledWith('unverified', 'Riscos & Compliance');
  });

  it('preserva módulo como não verificado quando grounding e fallback não retornam fontes', async () => {
    const onVerificationStatus = vi.fn();

    const result = await generateDossierModule(
      'Tech Stack',
      'Grupo Piccini',
      'foundation block',
      'specialist block',
      '',
      { useGrounding: true, onVerificationStatus },
    );

    expect(result).toContain('Conclusão parcial');
    expect(result).not.toContain('Módulo retido');
    expect(onVerificationStatus).toHaveBeenCalledWith('unverified', 'Tech Stack');
  });

  it('usa cachedContent e dynamic prompt quando foundationCacheName está definido', async () => {
    proxyGenerateContentMock.mockResolvedValueOnce({
      text: 'Módulo cacheado',
      usageMetadata: { cachedContentTokenCount: 12000, promptTokenCount: 900 },
    });

    await generateDossierModule(
      'Operação / Cadeia de Valor',
      'SCHEFFER & CIA LTDA',
      'foundation block',
      'specialist block',
      'extra context',
      { foundationCacheName: 'cachedContents/test-cache' },
    );

    expect(proxyGenerateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining('specialist block'),
        config: expect.objectContaining({
          cachedContent: 'cachedContents/test-cache',
        }),
      }),
      undefined,
    );
    expect(proxyGenerateContentMock.mock.calls[0][0].config).not.toHaveProperty('systemInstruction');
    expect(proxyGenerateContentMock.mock.calls[0][0].config).not.toHaveProperty('tools');
  });

  it('usa LiteLLM sem googleSearch quando selectedModel não é gemini', async () => {
    const onLlmMetadata = vi.fn();
    proxyGenerateContentMock.mockResolvedValueOnce({
      text: 'Módulo LiteLLM',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
      _llm_provider: 'litellm',
      _llm_fallback_used: false,
    });
    await generateDossierModule(
      'Teia Societaria — Identidade',
      'SCHEFFER & CIA LTDA',
      'foundation block',
      'specialist block',
      'extra context',
      { selectedModel: 'huawei/deepseek-r1-250528', temperature: 0.1, onLlmMetadata },
    );

    expect(proxyGenerateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'huawei/deepseek-r1-250528',
        config: expect.objectContaining({
          temperature: 0.1,
          maxOutputTokens: 4096,
        }),
      }),
      undefined,
    );
    expect(proxyGenerateContentMock.mock.calls[0][0].config).not.toHaveProperty('tools');
    expect(proxyGenerateContentMock.mock.calls[0][0].config).not.toHaveProperty('cachedContent');
    expect(proxyGenerateContentMock.mock.calls[0][0].contents).toContain(
      'não conclua sem emitir os markers [[PORTA_*]]',
    );
    expect(onLlmMetadata).toHaveBeenCalledWith(
      {
        provider: 'litellm',
        fallbackUsed: false,
        usage: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
      },
      'Teia Societaria — Identidade',
    );
  });

  it('ignora foundation cache quando selectedModel LiteLLM está ativo', async () => {
    await generateDossierModule(
      'Operação / Cadeia de Valor',
      'SCHEFFER & CIA LTDA',
      'foundation block',
      'specialist block',
      'extra context',
      {
        foundationCacheName: 'cachedContents/test-cache',
        selectedModel: 'huawei/deepseek-v4-flash',
      },
    );

    expect(proxyGenerateContentMock.mock.calls[0][0].config).not.toHaveProperty('cachedContent');
    expect(proxyGenerateContentMock.mock.calls[0][0].config).toMatchObject({
      systemInstruction: expect.stringContaining('foundation block'),
    });
  });

  it('não consulta Pinecone quando o dossiê segue pela trilha mega prompt', async () => {
    await sendMessageToGemini(
      'Dossiê completo de [SCHEFFER & CIA LTDA]. Contexto cadastral obrigatório: CNPJ 04.733.767/0001-80.',
      [{ id: 'user-1', sender: Sender.User, text: 'Investigue Scheffer', timestamp: new Date() }],
      'system',
      {
        onText: vi.fn(),
        onStatus: vi.fn(),
        hintedCompany: 'SCHEFFER & CIA LTDA',
      },
      true,
    );

    expect(buscarContextoPineconeMock).not.toHaveBeenCalled();
    expect(buscarContextoDocsPineconeMock).not.toHaveBeenCalled();
    expect(proxyChatSendMessageMock).toHaveBeenCalledTimes(1);
    expect(proxyChatSendMessageMock.mock.calls[0][0].systemInstruction).not.toContain('[CONTEXTO RAG]');
    expect(proxyChatSendMessageMock.mock.calls[0][0].systemInstruction).not.toContain('[DOCS RAG]');
  });
});
