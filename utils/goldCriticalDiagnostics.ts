/**
 * LOTE GOLD P0 R2-B — eventos Gold de persistência GARANTIDA.
 *
 * Definição ÚNICA e compartilhada (cliente utils/diagnosticLog.ts e servidor
 * utils/serverDiagnostics.ts) dos eventos de diagnóstico do verifier que NÃO
 * podem depender de verbose nem do sampling de 10% de info. Evita política
 * duplicada silenciosamente entre as duas camadas (lição do R2-A: o
 * verifier-summary tinha exceção só no cliente e morria no servidor).
 *
 * Payload permitido nesses eventos: SOMENTE stage/hardFails/codes/codeCounts/
 * dossierRunId. Nunca reason, claim, texto Gold, CNPJ, pessoa ou conteúdo do
 * SafePack.
 */
export const GOLD_CRITICAL_DIAGNOSTIC_EVENTS: ReadonlySet<string> = new Set([
  'verifier-summary',
  'diagnostics-pre-compose',
  'diagnostics-post-preflight',
  'diagnostics-post-mermaid',
  'diagnostics-post-certainty',
  // RCA-07 (BRU-101): a razão do fallback pós-verifier precisa ser verificável
  // em TODO run — output-selected (kind/reason de estado, sem texto) e
  // contract-done (passed) são estruturais e entram na persistência garantida.
  'output-selected',
  'contract-done',
]);

export function isGoldCriticalDiagnosticEvent(area: string, event: string): boolean {
  return area === 'GoldSeam' && GOLD_CRITICAL_DIAGNOSTIC_EVENTS.has(event);
}
