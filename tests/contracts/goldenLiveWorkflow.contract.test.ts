import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('golden dossier live workflow contract', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const specPath = path.join(process.cwd(), 'tests-e2e', 'golden-dossier-live.spec.ts');
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'golden-dossier-live.yml');
  const spec = fs.readFileSync(specPath, 'utf8');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  it('deve existir o script test:e2e:golden-live apontando para a spec existente', () => {
    expect(pkg.scripts['test:e2e:golden-live']).toBe('playwright test tests-e2e/golden-dossier-live.spec.ts');
    expect(fs.existsSync(specPath)).toBe(true);
  });

  it('a spec deve falhar explicitamente quando pré-condições estiverem ausentes', () => {
    // Sem credenciais autorizadas, o golden live NÃO pode iniciar chamada real.
    expect(spec).toContain('E2E_AUTH_PASSWORD');
    expect(spec).toContain('throw new Error');
    expect(spec).toContain('proíbe auth simulada');
  });

  it('o workflow deve chamar o script pelo npm e exigir URL HTTPS + SHA do deployment', () => {
    expect(workflow).toContain('run: npm run test:e2e:golden-live');
    expect(workflow).toContain('preview_url deve usar HTTPS');
    expect(workflow).toContain('deployment_sha deve ser um SHA Git completo');
  });

  it('o workflow deve prover as credenciais via secrets, nunca em claro', () => {
    expect(workflow).toContain('${{ secrets.GOLDEN_E2E_OPERATOR_EMAIL }}');
    expect(workflow).toContain('${{ secrets.GOLDEN_E2E_AUTH_PASSWORD }}');
    expect(workflow).not.toMatch(/E2E_AUTH_PASSWORD:\s*['"][^$]/);
    expect(workflow).not.toContain('GOLDEN_E2E_AUTH_PASSWORD:');
  });

  it('a spec não deve usar /api/gemini como rota canônica', () => {
    expect(spec).not.toMatch(/\/api\/gemini/);
  });
});
