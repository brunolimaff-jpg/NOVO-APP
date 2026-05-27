import { describe, expect, it } from 'vitest';
import { appendDossierSourcesFooter } from '../../utils/dossierSourcesFooter';
import type { AuditableSource } from '../../utils/textCleaners';

describe('appendDossierSourcesFooter', () => {
  it('adiciona secoes citadas e consultadas nao citadas', () => {
    const sources: AuditableSource[] = [
      {
        key: '1',
        citationIndex: 1,
        title: 'Citada',
        url: 'https://example.com/cited',
        sourceTypes: ['inline_citation'],
        contexts: [],
        requiresManualValidation: false,
      },
      {
        key: '2',
        citationIndex: null,
        title: 'Consultada',
        url: 'https://example.com/consulted',
        sourceTypes: ['consulted_not_cited'],
        contexts: ['Fonte consultada pelo grounding.'],
        requiresManualValidation: false,
      },
    ];

    const out = appendDossierSourcesFooter('# Corpo\n\nParagrafo.', sources);
    expect(out).toContain('## 📚 Fontes');
    expect(out).toContain('### Citadas no dossiê');
    expect(out).toContain('https://example.com/cited');
    expect(out).toContain('### Consultadas pela IA (não citadas inline)');
    expect(out).toContain('https://example.com/consulted');
  });
});
