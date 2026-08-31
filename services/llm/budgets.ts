/**
 * Budgets de tempo do pipeline LLM (BRU-157).
 *
 * Fonte única dos limites de tempo — sem números mágicos espalhados pelo
 * código. Invariante: NENHUM step interno pode abortar uma chamada que o
 * proxy ainda considera válida (step >= chamada).
 *
 * Cadeia coerente por camada:
 * - serverless: investigação pesada até ~180s (api/_llm-client, request budget);
 * - proxy do cliente: LLM_PROXY_TIMEOUT_DEFAULT_MS = 210s, consumido por
 *   services/llmProxy.ts (sem override por env — sem drift possível);
 * - step interno: proxy + headroom — o timeout do proxy produz o erro canônico;
 *   - função Vercel api/llm.ts: maxDuration 300s (vercel.json).
 *
 * Regressão observada em run e29ab677: steps internos de 60s/90s abortavam
 * chamadas válidas de investigação (Operação / Cadeia de Valor timeout 90s),
 * enquanto /api/llm continuava HTTP 200.
 */
export const LLM_PROXY_TIMEOUT_DEFAULT_MS = 210_000;

/** Folga entre o budget do proxy e o step interno (deixa o erro canônico do proxy vencer). */
export const LLM_STEP_HEADROOM_MS = 15_000;

/**
 * Budget de request do serverless (api/_llm-client): acima do proxy (210s)
 * para que o erro canônico continue sendo o do proxy, e abaixo do maxDuration
 * da função Vercel (300s). Regressão do run real 94ae20c4: cap de 180s abortava
 * investigação pesada do Zen (Teia Societaria — Identidade) antes do proxy.
 */
export const LLM_REQUEST_BUDGET_MS = LLM_PROXY_TIMEOUT_DEFAULT_MS + LLM_STEP_HEADROOM_MS;

/** Step de módulo obrigatório (Teia Identity / Operação): cobre o proxy + headroom. */
export const DOSSIER_REQUIRED_STEP_TIMEOUT_MS = LLM_PROXY_TIMEOUT_DEFAULT_MS + LLM_STEP_HEADROOM_MS;

/** Step de módulo opcional: mesma base — chamada válida não é abortada por ser "opcional". */
export const DOSSIER_OPTIONAL_STEP_TIMEOUT_MS = DOSSIER_REQUIRED_STEP_TIMEOUT_MS;

/** Race externo da reconciliação PORTA (pode reexecutar módulos com LLM): cobre o step mais longo. */
export const PORTA_RECONCILIATION_TIMEOUT_MS = DOSSIER_REQUIRED_STEP_TIMEOUT_MS + LLM_STEP_HEADROOM_MS;
