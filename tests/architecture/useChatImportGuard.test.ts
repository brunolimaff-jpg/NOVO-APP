import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '../..');
const PRODUCTION_DIRS = ['components', 'contexts', 'features', 'hooks', 'services', 'utils', 'api'];
const ALLOWED_FILES = new Set([
  path.join(REPO_ROOT, 'hooks/useChat.ts'),
]);
const IMPORT_PATTERNS = [
  /from\s+['"][^'"]*hooks\/useChat['"]/,
  /import\s+['"][^'"]*hooks\/useChat['"]/,
];

function collectFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    files.push(fullPath);
  }

  return files;
}

describe('architecture guardrails', () => {
  it('blocks new production imports of hooks/useChat.ts', () => {
    const offenders: string[] = [];

    for (const dir of PRODUCTION_DIRS) {
      const absDir = path.join(REPO_ROOT, dir);
      if (!fs.existsSync(absDir)) continue;

      for (const file of collectFiles(absDir)) {
        if (ALLOWED_FILES.has(file)) continue;
        const content = fs.readFileSync(file, 'utf8');
        if (IMPORT_PATTERNS.some(pattern => pattern.test(content))) {
          offenders.push(path.relative(REPO_ROOT, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
