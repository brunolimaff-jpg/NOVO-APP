import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  buildDossierContextRuntimeProvenanceReport,
  buildShadowDossierContext,
  DOSSIER_CONTEXT_RUNTIME_PROVENANCE,
} from '../../services/dossierContextRuntimeProvenance';
import { DOSSIER_EVIDENCE_CATEGORIES, type DossierEvidenceCategory } from '../../shared/dossierGatewayContracts';
import { formatarParaPrompt, type LookupResponse } from '../../services/clientLookupService';
import { getContextoConcorrentesRegionais } from '../../services/competitorService';
import { generatePortaContextForDeepDive } from '../../services/portaStateService';
import * as llmService from '../../services/llmService';
import * as dossierRuns from '../../lib/supabase/dossierRuns';
import { storage } from '../../services/storage';

type GoldenCase = { cnpj: string; companyName: string };

const goldenCase = JSON.parse(
  readFileSync('tests/fixtures/dossier/scheffer-04733767000180/case.json', 'utf8').replace(/^\uFEFF/, ''),
) as GoldenCase;
const lookupFixture = JSON.parse(
  readFileSync('tests/fixtures/dossier/scheffer-04733767000180/lookup.json', 'utf8').replace(/^\uFEFF/, ''),
) as LookupResponse;

function representativePreLlmSections() {
  const crmContext = formatarParaPrompt(lookupFixture);
  const regionalCompetitors = getContextoConcorrentesRegionais('MT');
  const portaContext = generatePortaContextForDeepDive('MEGA');
  const contents: Record<DossierEvidenceCategory, string> = {
    empresa: goldenCase.companyName,
    cnpj: goldenCase.cnpj,
    qsa: '- Guilherme M. Scheffer — sócio administrador (fonte cadastral oficial)',
    dados_cadastrais: 'Empresa: Scheffer & CIA LTDA\nUF: MT\nCNAE principal: produção agrícola',
    crm: crmContext,
    concorrentes: regionalCompetitors,
    porta: portaContext,
    // O waterfall só produz estas seções depois do primeiro LLM. Vazio é
    // intencional e representa indisponibilidade real, não dado sintético.
    modulos: '',
    benchmark: '',
    evidence_pack: '',
    fontes: '',
    historico: 'Usuário solicitou investigação forense do Grupo Scheffer.',
    contexto_visivel: `Contexto cadastral obrigatório: CNPJ ${goldenCase.cnpj}`,
  };

  return Object.fromEntries(
    DOSSIER_EVIDENCE_CATEGORIES.map(category => [
      category,
      {
        category,
        content: contents[category],
        itemCount: contents[category] ? 1 : 0,
        sourceCount: ['cnpj', 'qsa', 'dados_cadastrais', 'crm'].includes(category) ? 1 : 0,
      },
    ]),
  );
}

describe('dossierContextRuntimeProvenance', () => {
  it('mantém a matriz completa e identifica o primeiro LLM real', () => {
    const report = buildDossierContextRuntimeProvenanceReport();

    expect(DOSSIER_CONTEXT_RUNTIME_PROVENANCE).toHaveLength(13);
    expect(report.entries.map(entry => entry.category)).toEqual([...DOSSIER_EVIDENCE_CATEGORIES]);
    expect(report.firstLlmCall.primaryPath).toContain('generateDossierModule');
    expect(report.firstLlmCall.conditionalPaths.join('\n')).toContain('sendMessageToGemini');
  });

  it('falha fechado no shadow com dados reais pré-LLM sem chamar LLM, APIs ou lifecycle', async () => {
    const report = buildDossierContextRuntimeProvenanceReport();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch proibido no shadow'));
    const forbiddenSpies = [
      vi.spyOn(llmService, 'generateDossierModule'),
      vi.spyOn(llmService, 'generateContinuityQuestion'),
      vi.spyOn(dossierRuns, 'markDossierRunCompleted'),
      vi.spyOn(dossierRuns, 'markDossierRunFailed'),
      vi.spyOn(dossierRuns, 'markDossierRunCancelled'),
      vi.spyOn(dossierRuns, 'releaseDossierRunLease'),
      vi.spyOn(storage, 'saveDossierStrict'),
    ];

    await expect(
      buildShadowDossierContext({
        report,
        context: {
          companyName: goldenCase.companyName,
          cnpj: goldenCase.cnpj,
          sections: representativePreLlmSections(),
        },
      }),
    ).rejects.toMatchObject({
      code: 'CONTEXT_CONTRACT_INSUFFICIENT',
      llmDerivedCategories: ['modulos', 'evidence_pack'],
    });

    expect(report.status).toBe('INSUFFICIENT');
    expect(report.nonPreLlmCategories).toEqual(['modulos', 'benchmark', 'evidence_pack', 'fontes']);
    expect(report.llmDerivedCategories).toEqual(['modulos', 'evidence_pack']);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const spy of forbiddenSpies) expect(spy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    for (const spy of forbiddenSpies) spy.mockRestore();
  });
});
