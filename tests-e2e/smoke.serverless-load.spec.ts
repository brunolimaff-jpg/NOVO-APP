/**
 * P0-RUNTIME (2026-08-13) — regressão ESM do LOTE GOLD P0 R2-B.
 *
 * O smoke de páginas não cobria o núcleo serverless: /api/llm devolveu 500
 * FUNCTION_INVOCATION_FAILED (ERR_MODULE_NOT_FOUND no módulo novo
 * utils/goldCriticalDiagnostics) enquanto o deploy ficava READY/verde.
 *
 * Este smoke prova que os endpoints do grafo serverless CARREGAM no runtime
 * real sem chamar provider: GET responde 405 (handler executou até o check
 * de método). Um módulo que falha no carregamento responde 500 — o smoke
 * falha e o deploy fica vermelho, como deveria.
 */
import { test, expect } from '@playwright/test';

const SERVERLESS_ENDPOINTS = [
  '/api/llm',
  '/api/socio-search',
  '/api/extract-content',
  '/api/open-web-search',
];

test.describe('Scout smoke - carga do runtime serverless', () => {
  for (const endpoint of SERVERLESS_ENDPOINTS) {
    test(`GET ${endpoint} responde 405 (módulo carregou, sem provider)`, async ({ request }) => {
      const res = await request.get(endpoint);
      expect(res.status()).toBe(405);
    });
  }
});
