import { describe, expect, it } from 'vitest';
import { buildAuditableSources } from '../../utils/textCleaners';
import { extractPromotableInlineSources } from '../../utils/webVerification';

describe('buildAuditableSources', () => {
  it('deduplicates same URL between inline and grounding', () => {
    const text = 'Veja [Doc](https://example.com/docs) para detalhes.';
    const sources = buildAuditableSources(text, [{ title: 'Docs', url: 'https://example.com/docs' }]);
    const deduped = sources.filter((s) => s.url === 'https://example.com/docs');

    expect(deduped).toHaveLength(1);
    expect(deduped[0].sourceTypes).toContain('inline_citation');
    expect(deduped[0].sourceTypes).toContain('grounding_consulted');
    expect(deduped[0].citationIndex).toBe(1);
  });

  it('creates inferred source when markdown has fonte nao disponivel marker', () => {
    const text = '**Relatorio XPTO** *[fonte não disponível]*';
    const sources = buildAuditableSources(text, []);
    const inferred = sources.find((s) => s.sourceTypes.includes('inferred_without_url'));

    expect(inferred).toBeDefined();
    expect(inferred?.citationIndex).toBeNull();
    expect(inferred?.requiresManualValidation).toBe(true);
  });

  it('deduplicates URLs that differ only by tracking params', () => {
    const text = 'Veja https://example.com/docs?utm_source=google e também [Doc](https://example.com/docs).';
    const sources = buildAuditableSources(text, []);
    const canonical = sources.filter((s) => s.url === 'https://example.com/docs');

    expect(canonical).toHaveLength(1);
    expect(canonical[0].citationIndex).toBe(1);
  });
});

describe('extractPromotableInlineSources', () => {
  it('promove links públicos reais e ignora domínios fake', () => {
    const sources = extractPromotableInlineSources(
      'Veja [BNDES](https://www.bndes.gov.br/noticia?utm_source=google) e [Fake](https://example.com/fake).',
      [],
    );

    expect(sources).toEqual([
      {
        title: 'BNDES',
        url: 'https://www.bndes.gov.br/noticia',
        verification: 'fallback',
      },
    ]);
  });
});
