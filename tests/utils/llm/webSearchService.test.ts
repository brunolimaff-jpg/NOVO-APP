import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enrichDossierWithWebSearch } from '../../../utils/llm/webSearchService';

describe('webSearchService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('consome sources do endpoint open-web-search ao montar o grounding block', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        source: 'Brave Search API',
        sources: [
          {
            title: 'Scheffer sustentabilidade',
            url: 'https://www.scheffer.agr.br/sustentabilidade',
            snippet: '<b>Grupo Scheffer</b> publica dados de agricultura regenerativa.',
          },
        ],
        _debug: {
          braveAttempted: true,
          brave: { rawCount: 2, afterFinalLimitCount: 1 },
        },
      }),
    } as Response);

    const result = await enrichDossierWithWebSearch('Scheffer');

    expect(fetch).toHaveBeenCalledTimes(5);
    expect(result.holding).toEqual([
      expect.objectContaining({
        title: 'Scheffer sustentabilidade',
        snippet: 'Grupo Scheffer publica dados de agricultura regenerativa.',
      }),
    ]);
    expect(result.groundingBlock).toContain('Scheffer sustentabilidade');
    expect(result.groundingBlock).toContain('https://www.scheffer.agr.br/sustentabilidade');
  });
});
