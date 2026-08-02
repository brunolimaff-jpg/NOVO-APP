import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertDossierEvidenceContract,
  DOSSIER_EVIDENCE_CATEGORIES,
  sanitizeDossierEvidenceContract,
  type DossierEvidenceContract,
} from '../../shared/dossierGatewayContracts';

const waterfallSource = readFileSync(
  resolve(process.cwd(), 'features/dossier/waterfall-orchestrator.ts'),
  'utf8',
);
const SHA256_FIXTURE = `sha256:${'a'.repeat(64)}`;

function completeEvidenceContract(): DossierEvidenceContract {
  return {
    version: 'dossier-evidence.v1',
    categories: DOSSIER_EVIDENCE_CATEGORIES.map(category => ({
      category,
      present: true,
      itemCount: 1,
      sourceCount: category === 'fontes' || category === 'evidence_pack' ? 1 : 0,
    })),
    sanitizedContextDigest: SHA256_FIXTURE,
  };
}

describe('DOSSIER-FLOW-02 — paridade de evidências', () => {
  it('congela as categorias produzidas pelo waterfall atual sem registrar valores reais', () => {
    const markers = [
      '[QSA OFICIAL]',
      '[CONCORRENTES]',
      '[PORTA STATE]',
      'buildStaticDossierContext',
      'runDossierBenchmarkStage',
      'waterfallGroundingSources',
      'sessionSourcePool',
      'waterfallClienteSeniorData',
      'historyToPass',
    ];

    for (const marker of markers) expect(waterfallSource).toContain(marker);
  });

  it('exige o mapa completo de categorias e rejeita o payload reduzido histórico', () => {
    const complete = completeEvidenceContract();
    expect(() => assertDossierEvidenceContract(complete)).not.toThrow();

    const sparse = {
      version: 'dossier-evidence.v1',
      categories: ['empresa', 'cnpj', 'historico', 'contexto_visivel'].map(category => ({
        category,
        present: true,
        itemCount: 1,
        sourceCount: 0,
      })),
    };
    expect(() => assertDossierEvidenceContract(sparse)).toThrow(/omite|omits/i);
  });

  it('rejeita campos extras e não transporta valores arbitrários para persistência', () => {
    const withSecret = {
      ...completeEvidenceContract(),
      rawSourceText: 'não persistir',
    };
    expect(() => assertDossierEvidenceContract(withSecret)).toThrow(/contract|fields/i);

    const categoryWithSecret = {
      ...completeEvidenceContract(),
      categories: completeEvidenceContract().categories.map(entry => ({
        ...entry,
        rawValue: 'não persistir',
      })),
    };
    expect(() => sanitizeDossierEvidenceContract(categoryWithSecret)).toThrow(/category|fields/i);

    const sanitized = sanitizeDossierEvidenceContract(completeEvidenceContract());
    expect(JSON.stringify(sanitized)).not.toContain('rawSourceText');
    expect(JSON.stringify(sanitized)).not.toContain('rawValue');
    expect(() => sanitizeDossierEvidenceContract({
      ...completeEvidenceContract(),
      sanitizedContextDigest: 'sha256:conteudo-sensivel',
    })).toThrow(/digest/i);
  });

  it('não chama nenhum LLM: o contrato é somente metadata e marcadores do pipeline', () => {
    expect(waterfallSource).not.toContain('runDossierGateway(');
    expect(waterfallSource).not.toContain('callLiteLLM(');
  });
});
