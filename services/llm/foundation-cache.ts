/**
 * Contexto estático do dossiê (helpers puros).
 *
 * O foundation cache de contexto foi removido integralmente
 * integralmente — era otimização exclusiva do SDK antigo e o LiteLLM não
 * suporta cachedContent. O contexto estático agora é sempre embutido inline
 * em cada chamada de módulo.
 */

export interface StaticDossierContextInput {
  dossierSeedContext: string;
  waterfallLookupContext: string;
  seniorEvidenceContext: string;
  teiaResearchText: string;
}

export function buildStaticDossierContext(input: StaticDossierContextInput): string {
  return [input.dossierSeedContext, input.waterfallLookupContext, input.seniorEvidenceContext, input.teiaResearchText]
    .filter(Boolean)
    .join('\n\n');
}

export function joinDossierExtraContext(staticContext: string, dynamicContext: string): string {
  return [staticContext, dynamicContext].filter(Boolean).join('\n\n');
}

export function buildDynamicDossierContext(
  contextHint: string,
  accumulatedTextSnapshot: string,
  windowChars: number,
): string {
  return [
    contextHint ? `Objetivo desta passada:\n${contextHint}` : '',
    accumulatedTextSnapshot ? `Contexto anterior consolidado:\n${accumulatedTextSnapshot.slice(-windowChars)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
