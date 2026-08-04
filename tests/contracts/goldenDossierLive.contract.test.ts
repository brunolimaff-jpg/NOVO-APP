import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const spec = readFileSync(resolve(import.meta.dirname, '../../tests-e2e/golden-dossier-live.spec.ts'), 'utf8');

describe('contrato do Golden Dossier Live', () => {
  it('observa geração e lifecycle reais, sem reintroduzir rota legada', () => {
    expect(spec).toContain("pathname === '/api/gemini'");
    expect(spec).toContain("'create_or_get_dossier_run'");
    expect(spec).toContain("'acquire_dossier_run_lease'");
    expect(spec).toContain("'complete_dossier_run'");
    expect(spec).not.toContain('/api/llm-experiment');
    expect(spec).not.toContain('/api/dossier');
    expect(spec).not.toContain('createRun');
    expect(spec).not.toContain('finalizeRun');
    expect(spec).toContain('duas execuções consecutivas');
    expect(spec).toContain('assertServedDeploymentSha');
    expect(spec).toContain('evaluateDossierGolden');
    expect(spec).toContain('assertExternalSources');
  });

  it('não persiste credenciais, cookies ou corpo sensível em capturas e artefatos', () => {
    for (const forbidden of [
      /authorization/i,
      /bearer/i,
      /(?:request|response)\s*\.\s*headers/i,
      /(?:request|response)\s*\(\s*\)\s*\.\s*headers/i,
      /headers\s*\(/i,
      /headersarray/i,
      /getheader/i,
      /allheaders/i,
      /postdata/i,
      /localstorage/i,
      /storagestate/i,
      /headervalue/i,
      /authheader/i,
      /access_token/i,
      /refresh_token/i,
      /experimentcaptures/i,
      /cookie/i,
      /session/i,
    ]) {
      expect(spec).not.toMatch(forbidden);
    }
    expect(spec).toContain('lifecycleCaptures');
    expect(spec).toContain('generationCaptures');
    expect(spec).toContain('await response.json()');
    expect(spec).toContain("typeof fallbackValue === 'boolean'");
    expect(spec).toContain('fallbackUsed');
    expect(spec).toContain('BLOCKED_OBSERVABILITY_GAP');
    expect(spec).toContain('SUPERSEDED_BY_REPORT_AND_RUBRIC');
    expect(spec).toContain('SUPERSEDED_BY_RUBRIC');
    expect(spec).toContain('OBSERVED_FROM_COMPLETE_DOSSIER_RUN');
    expect(spec.indexOf('golden-round-${round}-live-captures')).toBeLessThan(
      spec.indexOf('BLOCKED_OBSERVABILITY_GAP'),
    );
  });
});
