import type { AuditableSource } from './textCleaners';
import { stripGeneratedSourcesFooter } from './dossierLinkIntegrity';

export const DOSSIER_SOURCES_FOOTER_HEADING = '## 📚 Fontes';

export function appendDossierSourcesFooter(bodyMarkdown: string, sources: AuditableSource[]): string {
  const body = stripGeneratedSourcesFooter(bodyMarkdown).trimEnd();
  const cited = sources.filter(
    source =>
      source.url &&
      source.sourceTypes.includes('inline_citation') &&
      !source.sourceTypes.includes('inferred_without_url'),
  );
  const consultedNotCited = sources.filter(source => source.url && source.sourceTypes.includes('consulted_not_cited'));

  if (cited.length === 0 && consultedNotCited.length === 0) {
    return body;
  }

  const lines: string[] = ['', DOSSIER_SOURCES_FOOTER_HEADING, ''];

  if (cited.length > 0) {
    lines.push('### Citadas no dossiê', '');
    cited.forEach(source => {
      const n = source.citationIndex ?? '?';
      const title = source.title || source.url;
      lines.push(`${n}. [${title}](${source.url})`);
    });
    lines.push('');
  }

  if (consultedNotCited.length > 0) {
    lines.push('### Consultadas pela IA (não citadas inline)', '');
    consultedNotCited.forEach(source => {
      const title = source.title || source.url;
      const ctx = source.contexts[0] ? ` — ${source.contexts[0]}` : '';
      lines.push(`- [${title}](${source.url})${ctx}`);
    });
    lines.push('');
  }

  return `${body}\n${lines.join('\n').trimEnd()}`;
}
