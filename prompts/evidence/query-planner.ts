// Prompt do sistema para o planejador de queries (Pipeline V2).
// Extraído do waterfall-orchestrator.ts para cumprir a regra:
// "prompts devem viver em prompts/, nunca inline".
export const QUERY_PLANNER_SYSTEM_PROMPT =
  'Você é um planejador de investigação. Retorne APENAS JSON válido.';
