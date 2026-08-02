import { describe, expect, it } from 'vitest';
import {
  buildDeterministicDossierContext,
  buildGenerateDossierRequest,
  DOSSIER_CONTEXT_CONTRACT_VERSION,
} from '../../services/dossierContextContract';
import { DOSSIER_EVIDENCE_CATEGORIES, type DossierEvidenceCategory } from '../../shared/dossierGatewayContracts';

function sectionsFixture(order: readonly DossierEvidenceCategory[] = DOSSIER_EVIDENCE_CATEGORIES) {
  return Object.fromEntries(
    order.map(category => [
      category,
      {
        category,
        content: `${category} determinístico ${DOSSIER_EVIDENCE_CATEGORIES.indexOf(category) + 1}`,
        itemCount: DOSSIER_EVIDENCE_CATEGORIES.indexOf(category) + 1,
        sourceCount: DOSSIER_EVIDENCE_CATEGORIES.indexOf(category) % 3,
      },
    ]),
  );
}

describe('dossierContextContract', () => {
  it('monta todas as seções em ordem canônica e produz digest verificável', async () => {
    const result = await buildDeterministicDossierContext({
      companyName: '  Grupo Scheffer\r\n',
      cnpj: '04733767000180',
      sections: sectionsFixture(),
    });

    expect(result.version).toBe(DOSSIER_CONTEXT_CONTRACT_VERSION);
    expect(result.context).toContain('[DOSSIER_CONTEXT_VERSION:dossier-context.v1]');
    expect(result.context).toContain('[DOSSIER_CONTEXT_SECTION:empresa]');
    expect(result.context).toContain('[DOSSIER_CONTEXT_SECTION:contexto_visivel]');
    expect(result.sections.map(section => section.category)).toEqual([...DOSSIER_EVIDENCE_CATEGORIES]);
    expect(result.evidence.categories).toEqual(result.sections);
    expect(result.evidence.sanitizedContextDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('é reproduzível mesmo quando a ordem de inserção das seções muda', async () => {
    const reversed = [...DOSSIER_EVIDENCE_CATEGORIES].reverse();
    const first = await buildDeterministicDossierContext({ companyName: 'Acme', sections: sectionsFixture() });
    const second = await buildDeterministicDossierContext({ companyName: 'Acme', sections: sectionsFixture(reversed) });

    expect(second.context).toBe(first.context);
    expect(second.evidence).toEqual(first.evidence);
  });

  it('falha fechado quando uma seção obrigatória está ausente', async () => {
    const missing = { ...sectionsFixture() };
    delete missing.fontes;

    await expect(
      buildDeterministicDossierContext({ companyName: 'Acme', sections: missing }),
    ).rejects.toMatchObject({
      code: 'MISSING_SECTION',
      category: 'fontes',
    });
  });

  it('aceita seção vazia explicitamente, sem confundir ausência com insuficiência silenciosa', async () => {
    const sections = sectionsFixture();
    sections.fontes = { category: 'fontes', content: '', itemCount: 0, sourceCount: 0 };
    const result = await buildDeterministicDossierContext({ companyName: 'Acme', sections });

    expect(result.evidence.categories.find(entry => entry.category === 'fontes')).toEqual({
      category: 'fontes',
      present: false,
      itemCount: 0,
      sourceCount: 0,
    });
    expect(result.context).toContain('(sem evidência determinística disponível)');
  });

  it('recusa payload acima do limite antes de qualquer integração', async () => {
    const sections = sectionsFixture();
    sections.empresa = { category: 'empresa', content: 'x'.repeat(500), itemCount: 1, sourceCount: 0 };

    await expect(
      buildDeterministicDossierContext({ companyName: 'Acme', sections, maxChars: 100 }),
    ).rejects.toMatchObject({ code: 'CONTEXT_TOO_LARGE' });
  });

  it('produz GenerateDossierRequest sem importar LLM, fetch ou lifecycle', async () => {
    const request = await buildGenerateDossierRequest({
      runId: 'run-05a',
      companyName: 'Acme',
      sections: sectionsFixture(),
    });

    expect(request).toMatchObject({ action: 'generate', runId: 'run-05a', companyName: 'Acme' });
    expect(request.context).toContain('dossier-context.v1');
    expect(request.evidence?.version).toBe('dossier-evidence.v1');
  });
});
