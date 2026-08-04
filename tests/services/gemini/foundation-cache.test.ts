import { describe, expect, it } from 'vitest';

import {
  buildDynamicDossierContext,
  buildStaticDossierContext,
  joinDossierExtraContext,
} from '../../../services/llm/foundation-cache';

describe('foundation-cache (helpers de contexto — cache Gemini removido)', () => {
  it('monta contexto estático do dossiê na ordem esperada', () => {
    const result = buildStaticDossierContext({
      dossierSeedContext: 'seed',
      waterfallLookupContext: 'lookup',
      seniorEvidenceContext: 'senior',
      teiaResearchText: 'teia',
    });

    expect(result).toBe('seed\n\nlookup\n\nsenior\n\nteia');
  });

  it('separa contexto dinâmico com hint e janela de acumulado', () => {
    const accumulated = `${'x'.repeat(13000)}ultimo-bloco`;
    const dynamic = buildDynamicDossierContext('refinar PORTA', accumulated, 12000);

    expect(dynamic).toContain('Objetivo desta passada:\nrefinar PORTA');
    expect(dynamic).toContain('ultimo-bloco');
    expect(dynamic).not.toContain('x'.repeat(13000));
  });

  it('junta contexto estático e dinâmico', () => {
    expect(joinDossierExtraContext('static', 'dynamic')).toBe('static\n\ndynamic');
    expect(joinDossierExtraContext('static', '')).toBe('static');
  });
});
