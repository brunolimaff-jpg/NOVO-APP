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
  outputMode?: 'FULL_DOSSIER' | 'DISCOVERY_BRIEF' | 'ENRICHMENT_REQUIRED',
): FinalizeDossierResult {
  // Output mode banner
  if (outputMode === 'ENRICHMENT_REQUIRED') {
    rawText = '> ⚠️ **DOSSIÊ PARCIAL** — fontes insuficientes. Tese comercial requer enriquecimento.\n\n' + rawText;
  } else if (outputMode === 'DISCOVERY_BRIEF') {
    rawText = '> ℹ️ **BRIEF DE DESCOBERTA** — hipóteses a validar, não tese confirmada.\n\n' + rawText;
  }

  const cleaned = applyDossierLinkIntegrity(rawText, {
    allowedPool: sourcePool,
    renumberUrgencySection: true,
  });
  const auditableSources = buildAuditableSources(cleaned, groundingSources);
  const text = appendDossierSourcesFooter(cleaned, auditableSources);
  return { text, auditableSources };
}
