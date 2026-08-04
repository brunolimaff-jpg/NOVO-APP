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

vi.mock('../../services/llmProxy', () => ({
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

import { generateDossierModule, sendMessageToGemini } from '../../services/llmService';
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

  it('marca como not_applicable quando não há grounding (sem fallback web)', async () => {
    const onGroundingSources = vi.fn();
    const onVerificationStatus = vi.fn();

    const result = await generateDossierModule(
      'Riscos & Compliance',
      'Grupo Piccini',
      'foundation block',
      'specialist block',
      'Sócio: João Piccini',
      { onGroundingSources, onVerificationStatus },
    );

    expect(result).toContain('Conclusão parcial');
    expect(executeOpenWebSearchToolMock).not.toHaveBeenCalled();
    expect(onVerificationStatus).toHaveBeenCalledWith('not_applicable', 'Riscos & Compliance');
  });

  it('preserva módulo sem grounding — verificação não aplicável', async () => {
    const onVerificationStatus = vi.fn();

    const result = await generateDossierModule(
      'Tech Stack',
      'Grupo Piccini',
      'foundation block',
      'specialist block',
      '',
      { onVerificationStatus },
    );

    expect(result).toContain('Conclusão parcial');
    expect(result).not.toContain('Módulo retido');
    expect(onVerificationStatus).toHaveBeenCalledWith('not_applicable', 'Tech Stack');
  });

  it('envia foundation e prompt do especialista como systemInstruction (sem cachedContent)', async () => {
    proxyGenerateContentMock.mockResolvedValueOnce({
      text: 'Módulo gerado',
      usageMetadata: { promptTokenCount: 900 },
    });

    await generateDossierModule(
      'Operação / Cadeia de Valor',
      'SCHEFFER & CIA LTDA',
      'foundation block',
      'specialist block',
      'extra context',
    );

    expect(proxyGenerateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining('Empresa alvo: SCHEFFER & CIA LTDA'),
        config: expect.objectContaining({
          systemInstruction: expect.stringContaining('foundation block'),
          temperature: 0.2,
          maxOutputTokens: 8192,
        }),
      }),
      undefined,
    );
    expect(proxyGenerateContentMock.mock.calls[0][0].config).not.toHaveProperty('cachedContent');
    expect(proxyGenerateContentMock.mock.calls[0][0].config).not.toHaveProperty('tools');
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
