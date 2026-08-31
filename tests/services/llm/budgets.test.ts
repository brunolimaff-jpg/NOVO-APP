import { describe, expect, it } from 'vitest';
import {
  DOSSIER_OPTIONAL_STEP_TIMEOUT_MS,
  DOSSIER_REQUIRED_STEP_TIMEOUT_MS,
  LLM_PROXY_TIMEOUT_DEFAULT_MS,
  PORTA_RECONCILIATION_TIMEOUT_MS,
} from '../../../services/llm/budgets';

/**
 * BRU-157 — Zen-only stabilization: owner canônico do budget (REAL_PROVIDER_CALLS=0).
 *
 * Regressão observada em run e29ab677: `DossierModule:Operação / Cadeia de Valor
 * timeout after 90000ms` — o step interno abortou o consumidor antes do request
 * `/api/llm`/Zen terminar (proxy anuncia 210s, Vercel recebe HTTP 200 após o abort).
 *
 * Invariante: nenhum step interno pode abortar uma chamada que o proxy ainda
 * considera válida. O owner canônico é o budget do proxy (210s); os steps
 * internos derivam dele, sem números mágicos espalhados pelo código.
 */
describe('Budgets do pipeline LLM (BRU-157)', () => {
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
