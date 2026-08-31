export const HYBRID_MODEL_MAP: Record<string, string> = {
  'Porte / Teia Societária': 'bedrock/deepseek.v3.2',
  'Teia Societaria — Identidade': 'bedrock/deepseek.v3.2',
  'Teia Societaria — Profundidade': 'bedrock/us.anthropic.claude-sonnet-4-6',
  'Operação / Cadeia de Valor': 'bedrock/us.anthropic.claude-sonnet-4-6',
  'Bordas de Controle': 'bedrock/deepseek.v3.2',
  'Riscos & Compliance': 'bedrock/deepseek.v3.2',
  'Caminho de Venda': 'bedrock/us.anthropic.claude-sonnet-4-6',
  'Reconciliação PORTA': 'bedrock/deepseek.v3.2',
};
export const DEFAULT_MODEL = 'bedrock/deepseek.v3.2';
export const CRITICAL_MODEL = 'bedrock/us.anthropic.claude-sonnet-4-6';
export function selectModelForModule(moduleName: string): string {
  return HYBRID_MODEL_MAP[moduleName] ?? DEFAULT_MODEL;
}

/**
 * Intenções neutras enviadas pelo cliente (nunca IDs de provedor no bundle).
 * A resolução para modelos concretos acontece exclusivamente aqui, no servidor.
 */
export const INTENT_MODEL_MAP: Record<string, string> = {
  'scout-router': 'bedrock/deepseek.v3.2',
  'scout-tactical': 'bedrock/deepseek.v3.2',
  'scout-deep-chat': 'bedrock/deepseek.v3.2',
  'scout-deep-research': 'bedrock/us.anthropic.claude-sonnet-4-6',
  // BRU-33 — intents neutros do Gold (V7 Preview Wiring): resolvem server-side
  // para a política V6 vencedora (DeepSeek V3.2 → DeepSeek V3.2). Nunca usar
  // scout-tactical/deep-chat aqui: uma troca futura do modelo de chat não pode
  // alterar silenciosamente a política Gold.
  'scout-gold-compact': 'bedrock/deepseek.v3.2',
  'scout-gold-compose': 'bedrock/deepseek.v3.2',
};
export function resolveIntentModel(intent?: string): string {
  if (intent && intent in INTENT_MODEL_MAP) return INTENT_MODEL_MAP[intent];
  return DEFAULT_MODEL;
}
export function isCriticalModule(moduleName: string): boolean {
  return HYBRID_MODEL_MAP[moduleName] === CRITICAL_MODEL;
}
export function getAllConfiguredModels(): string[] {
  return Array.from(new Set(Object.values(HYBRID_MODEL_MAP)));
}
