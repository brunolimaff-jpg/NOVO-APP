import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createDossierServerPipeline,
  DossierServerPipelineError,
  estimateDossierServerPipelineRuntime,
} from '../../api/_dossier-server-pipeline';
import { DOSSIER_EVIDENCE_CATEGORIES, type DossierEvidenceContract } from '../../shared/dossierGatewayContracts';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

function evidenceFixture(): DossierEvidenceContract {
  return {
    version: 'dossier-evidence.v1',
    categories: DOSSIER_EVIDENCE_CATEGORIES.map((category, index) => ({
      category,
      present: true,
      itemCount: index + 1,
      sourceCount: index === 1 ? 1 : 0,
    })),
  };
}

function plannerResponse(): string {
  return JSON.stringify({
    queries: Array.from({ length: 12 }, (_, index) => ({
      id: `q-${String(index + 1).padStart(2, '0')}`,
      query: `Scheffer fonte oficial ${index + 1}`,
      objective: index === 0 ? 'identity_resolution' : 'operational_footprint',
      module: index % 2 === 0 ? 'teia_identity' : 'inteligencia_operacional',
      priority: index < 4 ? 1 : 2,
      expectedSource: index < 4 ? 'A' : 'B',
      homonimRisk: 'baixo',
      rationale: 'Consulta de teste baseada no caso representativo Golden.',
    })),
  });
}

function input(signal: AbortSignal, runtimeBudgetMs?: number) {
  return {
    runId: RUN_ID,
    companyName: 'Scheffer & CIA LTDA',
    cnpj: '04733767000180',
    context: '[DOSSIER_CONTEXT_VERSION:dossier-context.v1]\nEmpresa: Scheffer & CIA LTDA\n[CNPJ confirmado no CRM]',
    evidence: evidenceFixture(),
    correlationId: 'corr-05c-0001',
    signal,
    ...(runtimeBudgetMs === undefined ? {} : { runtimeBudgetMs }),
  };
}

describe('dossier server pipeline 05C.1', () => {
  it('não importa runtime de browser, LLM client-side, lifecycle ou persistência', () => {
    const source = readFileSync('api/_dossier-server-pipeline.ts', 'utf8');

    expect(source).not.toMatch(/llmService|localStorage|window\.|document\.|storage\.saveDossierStrict|dossierRuns|\/api\/gemini|\/api\/dossier/);
  });

  it('produz módulos, evidence pack, benchmark, fontes e consolidação somente no servidor', async () => {
    const llm = vi.fn(async ({ stage }: { stage: string }) => ({
      text: stage === 'evidence_planner' ? plannerResponse() : `Conteúdo server-side da etapa ${stage}.`,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    }));
    const searchEvidence = vi.fn(async () => [
      {
        title: 'Receita Federal — cadastro',
        url: 'https://www.gov.br/receitafederal/cadastro-scheffer',
        snippet: 'Scheffer & CIA LTDA CNPJ 04733767000180 fonte oficial.',
        provider: 'gemini_grounding' as const,
      },
    ]);
    const benchmark = vi.fn(async () => 'Benchmark Senior server-side: 3 clientes comparáveis.');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const pipeline = createDossierServerPipeline({ llm, searchEvidence, benchmark });
    const result = await pipeline(input(new AbortController().signal));

    expect(llm).toHaveBeenCalledTimes(8);
    expect(searchEvidence).toHaveBeenCalledTimes(12);
    expect(benchmark).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.version).toBe('dossier-server-pipeline.v1');
    expect(result.text).toContain('final_consolidation');
    expect(Object.keys(result.modulos)).toHaveLength(6);
    expect(result.evidencePackStatus).toBe('COMPLETED');
    expect(result.evidencePack.items).toHaveLength(12);
    expect(result.benchmarkStatus).toBe('COMPLETED');
    expect(result.fontes).toHaveLength(12);
    expect(result.usage).toEqual({ promptTokens: 80, completionTokens: 40, totalTokens: 120 });
    expect(result.stages.filter(stage => stage.llmCalls === 1)).toHaveLength(8);
    expect(result.stages.every(stage => stage.status === 'COMPLETED')).toBe(true);
    expect(result.categoryStatuses.find(category => category.category === 'modulos')).toMatchObject({ status: 'GENERATED', origin: 'SERVER_LLM' });
    expect(result.categoryStatuses.find(category => category.category === 'evidence_pack')).toMatchObject({ status: 'GENERATED', origin: 'SERVER_LLM' });
    expect(result.terminalPersistenceAttempted).toBe(false);
    expect(result.clientDependenciesUsed).toEqual([]);

    fetchSpy.mockRestore();
  });

  it('falha antes de qualquer LLM quando o pior caso excede o orçamento do endpoint', async () => {
    const llm = vi.fn();
    const pipeline = createDossierServerPipeline({ llm });
    const budget = estimateDossierServerPipelineRuntime({ runtimeBudgetMs: 49_999 });

    expect(budget.status).toBe('INSUFFICIENT');
    await expect(pipeline(input(new AbortController().signal, 49_999))).rejects.toMatchObject({
      code: 'SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT',
      stage: 'budget',
    });
    expect(llm).not.toHaveBeenCalled();
  });

  it('propaga cancelamento com etapa identificável e não persiste resultado parcial', async () => {
    const controller = new AbortController();
    const llm = vi.fn(async () => {
      controller.abort();
      return { text: 'não deve concluir', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    });
    const pipeline = createDossierServerPipeline({ llm });

    await expect(pipeline(input(controller.signal))).rejects.toMatchObject({
      code: 'SERVER_PIPELINE_CANCELLED',
      stage: 'modulo_teia_deep',
    });
    expect(llm).toHaveBeenCalledOnce();
  });

  it('identifica a etapa LLM que falhou sem executar consolidação ou persistência', async () => {
    const llm = vi.fn(async ({ stage }: { stage: string }) => {
      if (stage === 'modulo_tech') throw new Error('provider down');
      return { text: `ok ${stage}`, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
    });
    const pipeline = createDossierServerPipeline({ llm });

    await expect(pipeline(input(new AbortController().signal))).rejects.toMatchObject({
      code: 'SERVER_PIPELINE_STAGE_FAILED',
      stage: 'modulo_tech',
    } satisfies Partial<DossierServerPipelineError>);
    expect(llm).toHaveBeenCalledTimes(4);
    expect(llm.mock.calls.some(([call]) => call.stage === 'final_consolidation')).toBe(false);
  });
});
