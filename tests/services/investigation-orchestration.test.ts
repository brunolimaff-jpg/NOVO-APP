import { beforeEach, describe, expect, it, vi } from 'vitest';

const { proxyGenerateContentMock, executeOpenWebSearchToolMock, applyPromptLeakShieldMock } = vi.hoisted(() => ({
  proxyGenerateContentMock: vi.fn(),
  executeOpenWebSearchToolMock: vi.fn(),
  applyPromptLeakShieldMock: vi.fn(),
}));

vi.mock('../../services/geminiProxy', () => ({
  proxyGenerateContent: proxyGenerateContentMock,
  proxyChatSendMessage: vi.fn(),
  executeOpenWebSearchTool: executeOpenWebSearchToolMock,
}));

vi.mock('../../utils/textCleaners', async () => {
  const actual = await vi.importActual<typeof import('../../utils/textCleaners')>('../../utils/textCleaners');
  return {
    ...actual,
    applyPromptLeakShield: applyPromptLeakShieldMock,
  };
});

import { generateDossierModule } from '../../services/gemini/investigation-orchestration';

describe('investigation-orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
