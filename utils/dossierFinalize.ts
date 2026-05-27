import { applyDossierLinkIntegrity } from './dossierLinkIntegrity';
import { appendDossierSourcesFooter } from './dossierSourcesFooter';
import type { DossierSourceRef } from './dossierSourcePool';
import { buildAuditableSources, type AuditableSource } from './textCleaners';

export interface FinalizeDossierResult {
  text: string;
  auditableSources: AuditableSource[];
}

/**
 * Pipeline final do dossiê: integridade de links, auditoria de fontes, rodapé Fontes.
 */
export function finalizeDossierMarkdown(
  rawText: string,
  groundingSources: Array<{ title: string; url: string; verification?: 'grounding' | 'fallback' }>,
  sourcePool: DossierSourceRef[],
): FinalizeDossierResult {
  const cleaned = applyDossierLinkIntegrity(rawText, {
    allowedPool: sourcePool,
    renumberUrgencySection: true,
  });
  const auditableSources = buildAuditableSources(cleaned, groundingSources);
  const text = appendDossierSourcesFooter(cleaned, auditableSources);
  return { text, auditableSources };
}
