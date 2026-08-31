/**
 * P0-RUNTIME (2026-08-13) — regressão ESM do LOTE GOLD P0 R2-B.
 *
 * O R2-B criou utils/goldCriticalDiagnostics.ts e o importou SEM extensão
 * `.js` a partir de utils/serverDiagnostics.ts e utils/diagnosticLog.ts —
 * ambos no grafo serverless (api/llm.ts, api/socio-search.ts,
 * api/extract-content.ts, api/open-web-search.ts).
 *
 * LOCAL→REMOTE PACKAGING GAP: o typecheck local (moduleResolution: "bundler")
 * aceita imports relativos sem extensão, mas o runtime Node ESM do Vercel
 * NÃO resolve `./goldCriticalDiagnostics` → ERR_MODULE_NOT_FOUND →
 * /api/llm devolve 500 FUNCTION_INVOCATION_FAILED no Preview
 * (confirmado nos logs Vercel do deployment do head 072e72a2).
 *
 * Este teste reproduz o mecanismo real do build serverless em um processo
 * Node puro (mesma família de build do repo — esbuild transpila TS→JS — e
 * Node ESM puro resolve os imports, como o runtime do Vercel). Falha hoje
 * (RED) com ERR_MODULE_NOT_FOUND; passa quando os imports relativos
 * carregarem.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TRANSPILE_AND_LOAD_SCRIPT = `
const { build } = require('esbuild');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const outDir = process.argv[1];
  await build({
    entryPoints: [
      path.join(process.cwd(), 'utils', 'serverDiagnostics.ts'),
      path.join(process.cwd(), 'utils', 'goldCriticalDiagnostics.ts'),
    ],
    outdir: outDir,
    bundle: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  await import(pathToFileURL(path.join(outDir, 'serverDiagnostics.js')).href);
  console.log('ESM-LOAD-OK');
})().catch((e) => {
  console.error(e && (e.code || e.message));
  process.exit(1);
});
`;

describe('goldCriticalDiagnostics — carregamento server-side real (Node ESM)', () => {
  it('serverDiagnostics.js transpilado carrega no Node ESM sem ERR_MODULE_NOT_FOUND', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gold-esm-load-'));
    try {
      const stdout = execFileSync(
        process.execPath,
        ['-e', TRANSPILE_AND_LOAD_SCRIPT, join(dir, 'out')],
        { encoding: 'utf8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
      );
      expect(stdout).toContain('ESM-LOAD-OK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
