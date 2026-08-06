import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(__dirname, '../..');

/**
 * Contrato estrutural do BRU-7 — Alternativa A.
 *
 * Prova que:
 * - o endpoint órfão api/dossier.ts não existe mais (nem seu gateway exclusivo);
 * - nenhum código de produção referencia /api/dossier como callsite HTTP;
 * - /api/llm permanece a rota de inferência do waterfall;
 * - nenhum termo de provider legado (G*mini) existe no código ativo (reforço do validate-no-gemini).
 */
describe('BRU-7 architecture contract (client-orchestrated / server-arbitrated)', () => {
  it('api/dossier.ts e _dossier-llm-gateway.ts foram removidos', () => {
    expect(existsSync(join(ROOT, 'api/dossier.ts'))).toBe(false);
    expect(existsSync(join(ROOT, 'api/_dossier-llm-gateway.ts'))).toBe(false);
  });

  it('teste exclusivo do endpoint órfão foi removido', () => {
    expect(existsSync(join(ROOT, 'tests/api/dossier.test.ts'))).toBe(false);
  });

  it('nenhum arquivo de produção referencia a rota /api/dossier', () => {
    const sourceDirs = ['api', 'components', 'features', 'hooks', 'services', 'stores', 'utils', 'lib'];
    const offenders: string[] = [];
    for (const dir of sourceDirs) {
      const abs = join(ROOT, dir);
      if (!existsSync(abs)) continue;
      for (const file of walk(abs)) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        const content = readFileSync(file, 'utf8');
        if (/\/api\/dossier/.test(content)) offenders.push(relativePath(file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('/api/llm continua sendo a rota de inferência (endpoint existe e é usado)', () => {
    expect(existsSync(join(ROOT, 'api/llm.ts'))).toBe(true);
    const llmProxy = readFileSync(join(ROOT, 'services/llmProxy.ts'), 'utf8');
    expect(llmProxy).toContain('/api/llm');
  });

  it('nenhum termo Gemini no código ativo (reforço do gate)', () => {
    const sourceDirs = ['api', 'components', 'features', 'hooks', 'services', 'stores', 'utils', 'lib'];
    const offenders: string[] = [];
    for (const dir of sourceDirs) {
      const abs = join(ROOT, dir);
      if (!existsSync(abs)) continue;
      for (const file of walk(abs)) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        const content = readFileSync(file, 'utf8');
        const blockedTerm = 'g' + 'emini';
        if (new RegExp(`\\b${blockedTerm}\\b`, 'i').test(content)) offenders.push(relativePath(file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function relativePath(file: string): string {
  return file.replace(ROOT + '/', '');
}
