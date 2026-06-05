/** Mensagens de backoff quando módulos opcionais do waterfall falham (failureCount > 0). */
export function getLoadingBackoffMessage(failureCount: number): string | null {
  if (failureCount === 1) return 'Refinando sinais para alta precisão...';
  if (failureCount === 2) return 'Ajustando filtros de profundidade executiva...';
  if (failureCount >= 3) return 'Finalizando orquestração de dados complexos...';
  return null;
}

export function resolveActiveLoadingStageLabel(processingStage: string, failureCount: number): string {
  const real =
    processingStage.trim() || 'Preparando análise...';
  return getLoadingBackoffMessage(failureCount) ?? real;
}
