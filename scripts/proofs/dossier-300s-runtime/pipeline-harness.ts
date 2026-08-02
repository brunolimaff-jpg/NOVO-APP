import {
  createDossierServerPipeline,
  type DossierServerEvidenceSearchResult,
  type DossierServerLlmInput,
  type DossierServerLlmResult,
} from '../../../api/_dossier-server-pipeline.js';
import { createVirtualClock, type VirtualClock } from './budget-model.js';

export type CanonicalPipelineCall = {
  stage: string;
  timeoutMs: number;
};

export type CanonicalPipelineProof = {
  providerCalls: readonly CanonicalPipelineCall[];
  searchCalls: readonly string[];
  benchmarkCalls: number;
  stages: readonly { name: string; status: string; llmCalls: number }[];
  outputStatus: 'COMPLETED' | 'FAILED';
  virtualDurationMs: number;
  clientDependenciesUsed: readonly [];
  terminalPersistenceAttempted: false;
};

const RUN_ID = '00000000-0000-4000-8000-000000000005';
const CNPJ = '12345678000195';

const MODULES = [
  'teia_identity',
  'teia_deep',
  'inteligencia_operacional',
  'compliance_risco_fiscal',
  'caminho_venda',
  'arquitetura_ti',
] as const;

function syntheticPlannerJson(): string {
  const queries = Array.from({ length: 12 }, (_, index) => ({
    id: `q-${String(index + 1).padStart(2, '0')}`,
    query: `fixture query ${index + 1} ${CNPJ}`,
    objective: index === 0 ? 'identity_resolution' : index === 1 ? 'cnpj_qsa' : 'operational_footprint',
    module: MODULES[index % MODULES.length],
    priority: index < 2 ? 1 : 2,
    expectedSource: 'A',
    homonimRisk: 'baixo',
    rationale: 'Fixture determinístico para exercitar o contrato sem consulta externa.',
  }));
  return JSON.stringify({ queries });
}

function syntheticLlmResult(input: DossierServerLlmInput, clock: VirtualClock): DossierServerLlmResult {
  clock.advance(input.stage === 'final_consolidation' ? 350 : 300);
  return {
    text: input.stage === 'evidence_planner'
      ? syntheticPlannerJson()
      : input.stage === 'final_consolidation'
        ? '# Dossiê fixture\n\nConteúdo sintético; nenhuma fonte real foi consultada.'
        : `Bloco sintético ${input.stage}`,
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    finishReason: 'fixture',
  };
}

function syntheticSearchResult(query: string, index: number): readonly DossierServerEvidenceSearchResult[] {
  return [{
    url: `https://fixture.invalid/source-${index + 1}`,
    title: `Fonte fixture ${index + 1}`,
    snippet: `Resultado sintético para ${query}; não é evidência de produção.`,
    provider: 'duckduckgo',
  }];
}

export async function runCanonicalPipelineProof(clock = createVirtualClock()): Promise<CanonicalPipelineProof> {
  const providerCalls: CanonicalPipelineCall[] = [];
  const searchCalls: string[] = [];
  let benchmarkCalls = 0;

  const pipeline = createDossierServerPipeline({
    now: clock.now,
    llm: async input => {
      if (input.signal.aborted) throw new DOMException('fixture aborted', 'AbortError');
      providerCalls.push({ stage: input.stage, timeoutMs: input.timeoutMs });
      return syntheticLlmResult(input, clock);
    },
    searchEvidence: async (query, signal) => {
      if (signal.aborted) throw new DOMException('fixture aborted', 'AbortError');
      searchCalls.push(query);
      clock.advance(25);
      return syntheticSearchResult(query, searchCalls.length - 1);
    },
    benchmark: async ({ signal }) => {
      if (signal.aborted) throw new DOMException('fixture aborted', 'AbortError');
      benchmarkCalls += 1;
      clock.advance(40);
      return 'Benchmark fixture indisponível para produção.';
    },
  });

  try {
    const output = await pipeline({
      runId: RUN_ID,
      companyName: 'Empresa Fixture Agro',
      cnpj: CNPJ,
      context: 'Contexto sintético controlado para prova local.',
      correlationId: 'corr-05e0a-fixture',
      signal: new AbortController().signal,
      runtimeBudgetMs: 270_000,
    });
    return {
      providerCalls,
      searchCalls,
      benchmarkCalls,
      stages: output.stages.map(stage => ({ name: stage.name, status: stage.status, llmCalls: stage.llmCalls })),
      outputStatus: 'COMPLETED',
      virtualDurationMs: clock.now(),
      clientDependenciesUsed: output.clientDependenciesUsed,
      terminalPersistenceAttempted: output.terminalPersistenceAttempted,
    };
  } catch {
    return {
      providerCalls,
      searchCalls,
      benchmarkCalls,
      stages: [],
      outputStatus: 'FAILED',
      virtualDurationMs: clock.now(),
      clientDependenciesUsed: [],
      terminalPersistenceAttempted: false,
    };
  }
}
