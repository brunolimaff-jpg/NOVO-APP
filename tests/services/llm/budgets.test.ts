import { describe, expect, it } from 'vitest';
import {
  DOSSIER_OPTIONAL_STEP_TIMEOUT_MS,
  DOSSIER_REQUIRED_STEP_TIMEOUT_MS,
  LLM_PROXY_TIMEOUT_DEFAULT_MS,
  PORTA_RECONCILIATION_TIMEOUT_MS,
} from '../../../services/llm/budgets';

/**
 * BRU-155 — budgets externos/internos (REAL_PROVIDER_CALLS=0).
 *
 * Regressão observada em run a970a808: Teia Identity abortou em 90s e
 * Riscos & Compliance em 60s — steps internos menores que o budget real da
 * chamada (proxy 210s, serverless pesado até 180s) matavam chamadas válidas.
 *
 * Invariante: nenhum step interno pode abortar uma chamada que o proxy ainda
 * considera válida. Os budgets vêm de uma única fonte (services/llm/budgets.ts),
 * sem números mágicos espalhados pelo código.
 */
describe('Budgets do pipeline LLM (BRU-155)', () => {
  it('nenhum step interno aborta chamada que o proxy ainda considera válida', () => {
    expect(DOSSIER_REQUIRED_STEP_TIMEOUT_MS).toBeGreaterThanOrEqual(LLM_PROXY_TIMEOUT_DEFAULT_MS);
    expect(DOSSIER_OPTIONAL_STEP_TIMEOUT_MS).toBeGreaterThanOrEqual(LLM_PROXY_TIMEOUT_DEFAULT_MS);
  });

  it('a reconciliação PORTA (que pode reexecutar módulo) cobre o step mais longo', () => {
    expect(PORTA_RECONCILIATION_TIMEOUT_MS).toBeGreaterThanOrEqual(DOSSIER_REQUIRED_STEP_TIMEOUT_MS);
  });

  it('cadeia coerente: proxy(210s) <= step interno < função serverless(300s)', () => {
    // Espelha o default de VITE_LLM_PROXY_TIMEOUT_MS em services/llmProxy.ts.
    expect(LLM_PROXY_TIMEOUT_DEFAULT_MS).toBe(210_000);
    // Steps internos nunca podem estourar o maxDuration da função Vercel.
    expect(DOSSIER_REQUIRED_STEP_TIMEOUT_MS).toBeLessThan(300_000);
    expect(DOSSIER_OPTIONAL_STEP_TIMEOUT_MS).toBeLessThan(300_000);
    expect(PORTA_RECONCILIATION_TIMEOUT_MS).toBeLessThan(300_000);
  });
});
