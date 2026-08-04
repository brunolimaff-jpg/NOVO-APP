import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  scripts?: Record<string, string>;
}

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'),
) as PackageManifest;

describe('package scripts usados pelos gates', () => {
  it('expõe os dois comandos live com seus specs canônicos', () => {
    expect(manifest.scripts?.['test:e2e:report-ready']).toBe(
      'playwright test tests-e2e/report-ready.spec.ts',
    );
    expect(manifest.scripts?.['test:e2e:golden-live']).toBe(
      'playwright test tests-e2e/golden-dossier-live.spec.ts',
    );
  });

  it('mantém todos os scripts referenciados pelos workflows', () => {
    const workflowRoot = resolve(import.meta.dirname, '../../.github/workflows');
    const referencedScripts = readdirSync(workflowRoot)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
      .flatMap(file => {
        const workflow = readFileSync(resolve(workflowRoot, file), 'utf8');
        return Array.from(workflow.matchAll(/npm run ([A-Za-z0-9:_-]+)/g), match => match[1]);
      });
    const missingScripts = Array.from(new Set(referencedScripts)).filter(
      script => !manifest.scripts?.[script],
    );

    expect(missingScripts).toEqual([]);
  });
});
