import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  DOSSIER_OPTIONAL_STEP_TIMEOUT_MS,
  DOSSIER_REQUIRED_STEP_TIMEOUT_MS,
  LLM_PROXY_TIMEOUT_DEFAULT_MS,
  LLM_REQUEST_BUDGET_MS,
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
    // Espelha o default consumido por services/llmProxy.ts via budgets.ts.
    expect(LLM_PROXY_TIMEOUT_DEFAULT_MS).toBe(210_000);
    // Steps internos nunca podem estourar o maxDuration da função Vercel.
    expect(DOSSIER_REQUIRED_STEP_TIMEOUT_MS).toBeLessThan(300_000);
    expect(DOSSIER_OPTIONAL_STEP_TIMEOUT_MS).toBeLessThan(300_000);
    expect(PORTA_RECONCILIATION_TIMEOUT_MS).toBeLessThan(300_000);
  });

  it('llmProxy consome o budget canônico — sem override por env (BRU-157)', () => {
    const src = readFileSync(resolve(__dirname, '../../../services/llmProxy.ts'), 'utf-8');
    expect(src).not.toMatch(/VITE_LLM_PROXY_TIMEOUT_MS/);
    expect(src).toMatch(/LLM_PROXY_TIMEOUT_DEFAULT_MS/);
  });

  it('request budget do serverless cobre o proxy e fica sob o maxDuration (run Zen real 94ae20c4)', () => {
    // Regressão do run real: cap de 180s abortava investigação pesada do Zen
    // (Teia Societaria — Identidade, 504 GATEWAY_TIMEOUT) antes do erro
    // canônico do proxy (210s). O request budget deriva do mesmo par
    // proxy+headroom e nunca estoura o maxDuration da função (300s).
    expect(LLM_REQUEST_BUDGET_MS).toBe(225_000);
    expect(LLM_REQUEST_BUDGET_MS).toBeGreaterThanOrEqual(LLM_PROXY_TIMEOUT_DEFAULT_MS);
    expect(LLM_REQUEST_BUDGET_MS).toBeLessThan(300_000);
  });

  it('api/_llm-client deriva o cap do budget canônico — sem número mágico de 180s', () => {
    const src = readFileSync(resolve(__dirname, '../../../api/_llm-client.ts'), 'utf-8');
    expect(src).not.toMatch(/180_000/);
    expect(src).toMatch(/LLM_REQUEST_BUDGET_MS/);
  });
});
