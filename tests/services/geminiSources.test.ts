import { describe, expect, it } from 'vitest';
import { normalizeGroundingSources } from '../../services/llm/sources';

describe('normalizeGroundingSources', () => {
  it('extrai fontes do groundingMetadata dentro de candidates', () => {
    const sources = normalizeGroundingSources({
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { title: 'BNDES', uri: 'https://www.bndes.gov.br/noticia' } },
              { web: { title: 'Duplicada', uri: 'https://www.bndes.gov.br/noticia' } },
              { retrievedContext: { title: 'RRP Energia', uri: 'https://rrpenergia.com.br/sobre' } },
            ],
          },
        },
      ],
    });

    expect(sources).toEqual([
      { title: 'BNDES', url: 'https://www.bndes.gov.br/noticia', verification: 'grounding' },
      { title: 'RRP Energia', url: 'https://rrpenergia.com.br/sobre', verification: 'grounding' },
    ]);
  });
});
