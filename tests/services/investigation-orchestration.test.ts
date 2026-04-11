import { beforeEach, describe, expect, it, vi } from 'vitest';

const { proxyGenerateContentMock, applyPromptLeakShieldMock } = vi.hoisted(() => ({
  proxyGenerateContentMock: vi.fn(),
  applyPromptLeakShieldMock: vi.fn(),
}));

vi.mock('../../services/geminiProxy', () => ({
  proxyGenerateContent: proxyGenerateContentMock,
  proxyChatSendMessage: vi.fn(),
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
});
