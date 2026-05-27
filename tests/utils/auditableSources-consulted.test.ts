import { describe, expect, it } from 'vitest';
import { buildAuditableSources } from '../../utils/textCleaners';

describe('buildAuditableSources consulted_not_cited', () => {
  it('marca URL de grounding sem citacao inline como consulted_not_cited', () => {
    const text = 'Sem links inline no corpo.';
    const sources = buildAuditableSources(text, [
      { title: 'Extra', url: 'https://example.com/extra', verification: 'grounding' },
    ]);

    const consulted = sources.find(s => s.url === 'https://example.com/extra');
    expect(consulted?.sourceTypes).toContain('consulted_not_cited');
    expect(consulted?.citationIndex).toBeNull();
  });

  it('mantem inline e grounding no mesmo URL', () => {
    const text = 'Veja [Doc](https://example.com/docs).';
    const sources = buildAuditableSources(text, [
      { title: 'Docs', url: 'https://example.com/docs', verification: 'grounding' },
    ]);
    const item = sources.find(s => s.url === 'https://example.com/docs');
    expect(item?.sourceTypes).toContain('inline_citation');
    expect(item?.sourceTypes).toContain('grounding_consulted');
    expect(item?.citationIndex).toBe(1);
  });
});
