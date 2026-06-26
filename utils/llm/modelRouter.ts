export const HYBRID_MODEL_MAP: Record<string, string> = {
  'Porte / Teia Societária': 'bedrock/deepseek.v3.2',
  'Teia Societaria — Identidade': 'bedrock/deepseek.v3.2',
  'Teia Societaria — Profundidade': 'bedrock/us.anthropic.claude-sonnet-4-6',
  'Operação / Cadeia de Valor': 'bedrock/us.anthropic.claude-sonnet-4-6',
  'Bordas de Controle': 'bedrock/deepseek.v3.2',
  'Riscos & Compliance': 'bedrock/deepseek.v3.2',
  'Caminho de Venda': 'bedrock/us.anthropic.claude-sonnet-4-6',
};
export const DEFAULT_MODEL = 'bedrock/deepseek.v3.2';
export const CRITICAL_MODEL = 'bedrock/us.anthropic.claude-sonnet-4-6';
export function selectModelForModule(moduleName: string): string {
  return HYBRID_MODEL_MAP[moduleName] ?? DEFAULT_MODEL;
}
export function isCriticalModule(moduleName: string): boolean {
  return HYBRID_MODEL_MAP[moduleName] === CRITICAL_MODEL;
}
export function getAllConfiguredModels(): string[] {
  return Array.from(new Set(Object.values(HYBRID_MODEL_MAP)));
}
