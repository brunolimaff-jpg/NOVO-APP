import {
  buildEntityResolutionFromContext,
  planQueries,
  type BraveSearchResult,
  type DossierModule,
  type EvidencePack,
  type QueryPlan,
} from '../services/llm/query-planner.js';
import { runDossierGateway } from './_dossier-llm-gateway.js';
import {
  DOSSIER_EVIDENCE_CATEGORIES,
  type DossierEvidenceCategory,
  type DossierEvidenceContract,
  type DossierUsage,
} from '../shared/dossierGatewayContracts.js';
import {
  PROMPT_CAMINHO_DE_VENDA,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_TEIA_DEEP_MODULE,
  PROMPT_TEIA_IDENTITY_MODULE,
  SHARED_FOUNDATION_BLOCK,
} from '../prompts/megaPrompts.js';

export const DOSSIER_SERVER_PIPELINE_VERSION = 'dossier-server-pipeline.v1' as const;
type DossierServerPipelineConfig = {
  runtimeBudgetMs: number;
  stageTimeoutMs: number;
  evidenceCollectionTimeoutMs: number;
  benchmarkTimeoutMs: number;
  reconciliationMarginMs: number;
  maxContextChars: number;
  maxFinalContextChars: number;
};

export const DOSSIER_SERVER_PIPELINE_CONFIG: Readonly<DossierServerPipelineConfig> = Object.freeze({
  runtimeBudgetMs: 55_000,
  stageTimeoutMs: 5_000,
  evidenceCollectionTimeoutMs: 5_000,
  benchmarkTimeoutMs: 3_000,
  reconciliationMarginMs: 2_000,
  maxContextChars: 200_000,
  maxFinalContextChars: 180_000,
});

const MODULE_STAGES = [
  { name: 'modulo_teia_identity', label: 'Porte / Teia Societária — Identidade', prompt: PROMPT_TEIA_IDENTITY_MODULE },
  { name: 'modulo_teia_deep', label: 'Porte / Teia Societária — Profundidade', prompt: PROMPT_TEIA_DEEP_MODULE },
  { name: 'modulo_operacao', label: 'Operação / Cadeia de Valor', prompt: PROMPT_RAIO_X_OPERACIONAL_ATAQUE },
  { name: 'modulo_tech', label: 'Bordas de Controle', prompt: PROMPT_TECH_STACK_GOD_MODE_ATAQUE },
  { name: 'modulo_riscos', label: 'Riscos & Compliance', prompt: PROMPT_RISCOS_COMPLIANCE_GOD_MODE },
  { name: 'modulo_venda', label: 'Caminho de Venda', prompt: PROMPT_CAMINHO_DE_VENDA },
] as const;

const LLM_STAGE_COUNT = MODULE_STAGES.length + 2; // planner de evidência + consolidação final
export type DossierServerPipelineStageStatus = 'COMPLETED' | 'DEGRADED' | 'FAILED' | 'CANCELLED';

export type DossierServerPipelineStage = {
  name: string;
  status: DossierServerPipelineStageStatus;
  durationMs: number;
  llmCalls: number;
  usage: DossierUsage;
  errorCode?: string;
};

export type DossierServerPipelineCategoryStatus = 'PROVIDED' | 'GENERATED' | 'UNAVAILABLE';

export type DossierServerPipelineCategory = {
  category: DossierEvidenceCategory;
  status: DossierServerPipelineCategoryStatus;
  origin: 'INPUT_DETERMINISTIC' | 'SERVER_LLM' | 'SERVER_FORMATTING' | 'UNAVAILABLE';
  contentChars: number;
};

export type DossierServerPipelineInput = {
  runId: string;
  companyName: string;
  cnpj?: string;
  context: string;
  evidence?: DossierEvidenceContract;
  correlationId: string;
  signal: AbortSignal;
  runtimeBudgetMs?: number;
};

export type DossierServerLlmInput = {
  stage: string;
  prompt: string;
  context: string;
  runId: string;
  correlationId: string;
  signal: AbortSignal;
  timeoutMs: number;
};

export type DossierServerLlmResult = {
  text: string;
  usage: DossierUsage;
  finishReason?: string;
};

export type DossierServerEvidenceSearchResult = {
  url: string;
  title: string;
  snippet: string;
  provider?: 'gemini_grounding' | 'duckduckgo';
};

export type DossierServerPipelineDependencies = {
  llm?: (input: DossierServerLlmInput) => Promise<DossierServerLlmResult>;
  searchEvidence?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly DossierServerEvidenceSearchResult[]>;
  benchmark?: (input: {
    companyName: string;
    cnpj?: string;
    context: string;
    signal: AbortSignal;
  }) => Promise<string>;
  now?: () => number;
};

export type DossierServerPipelineOutput = {
  version: typeof DOSSIER_SERVER_PIPELINE_VERSION;
  runId: string;
  companyName: string;
  cnpj?: string;
  text: string;
  modulos: Readonly<Record<string, string>>;
  evidencePack: EvidencePack;
  evidencePackStatus: 'COMPLETED' | 'UNAVAILABLE';
  benchmark: string;
  benchmarkStatus: 'COMPLETED' | 'UNAVAILABLE';
  fontes: readonly { title: string; url: string; snippet: string }[];
  categoryStatuses: readonly DossierServerPipelineCategory[];
  usage: DossierUsage;
  finishReason: string;
  stages: readonly DossierServerPipelineStage[];
  runtimeBudget: DossierServerPipelineRuntimeBudgetReport;
  terminalPersistenceAttempted: false;
  clientDependenciesUsed: readonly [];
};

export type DossierServerPipelineRuntimeBudgetReport = {
  runtimeBudgetMs: number;
  estimatedWorstCaseMs: number;
  llmStageCount: number;
  llmStageTimeoutMs: number;
  evidenceCollectionTimeoutMs: number;
  benchmarkTimeoutMs: number;
  reconciliationMarginMs: number;
  status: 'SUFFICIENT' | 'INSUFFICIENT';
};

export type DossierServerPipelineErrorCode =
  | 'INVALID_INPUT'
  | 'SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT'
  | 'SERVER_PIPELINE_STAGE_TIMEOUT'
  | 'SERVER_PIPELINE_STAGE_FAILED'
  | 'SERVER_PIPELINE_CANCELLED'
  | 'DOSSIER_CONTENT_UNAVAILABLE';

export class DossierServerPipelineError extends Error {
  constructor(
    readonly code: DossierServerPipelineErrorCode,
    message: string,
    readonly stage: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'DossierServerPipelineError';
  }
}

function emptyUsage(): DossierUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function normalizeUsage(usage: DossierUsage | undefined): DossierUsage {
  const promptTokens = Number.isFinite(usage?.promptTokens) && (usage?.promptTokens ?? 0) >= 0
    ? Math.floor(usage?.promptTokens ?? 0)
    : 0;
  const completionTokens = Number.isFinite(usage?.completionTokens) && (usage?.completionTokens ?? 0) >= 0
    ? Math.floor(usage?.completionTokens ?? 0)
    : 0;
  const totalTokens = Number.isFinite(usage?.totalTokens) && (usage?.totalTokens ?? 0) >= 0
    ? Math.floor(usage?.totalTokens ?? 0)
    : promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

function addUsage(first: DossierUsage, second: DossierUsage): DossierUsage {
  return {
    promptTokens: first.promptTokens + second.promptTokens,
    completionTokens: first.completionTokens + second.completionTokens,
    totalTokens: first.totalTokens + second.totalTokens,
  };
}

function validateInput(input: DossierServerPipelineInput): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.runId)) {
    throw new DossierServerPipelineError('INVALID_INPUT', 'runId inválido', 'validation', false);
  }
  if (!input.companyName.trim()) {
    throw new DossierServerPipelineError('INVALID_INPUT', 'companyName obrigatório', 'validation', false);
  }
  if (!input.context.trim() || input.context.length > DOSSIER_SERVER_PIPELINE_CONFIG.maxContextChars) {
    throw new DossierServerPipelineError('INVALID_INPUT', 'context fora do limite', 'validation', false);
  }
  if (input.cnpj !== undefined && !/^\d{14}$/.test(input.cnpj)) {
    throw new DossierServerPipelineError('INVALID_INPUT', 'cnpj inválido', 'validation', false);
  }
  if (input.evidence) {
    const categories = input.evidence.categories.map(entry => entry.category);
    if (
      categories.length !== DOSSIER_EVIDENCE_CATEGORIES.length ||
      categories.some((category, index) => category !== DOSSIER_EVIDENCE_CATEGORIES[index])
    ) {
      throw new DossierServerPipelineError('INVALID_INPUT', 'evidence fora da ordem canônica', 'validation', false);
    }
  }
}

export function estimateDossierServerPipelineRuntime(
  overrides: Partial<DossierServerPipelineConfig> = {},
): DossierServerPipelineRuntimeBudgetReport {
  const config = { ...DOSSIER_SERVER_PIPELINE_CONFIG, ...overrides };
  const estimatedWorstCaseMs =
    LLM_STAGE_COUNT * config.stageTimeoutMs +
    config.evidenceCollectionTimeoutMs +
    config.benchmarkTimeoutMs +
    config.reconciliationMarginMs;
  return {
    runtimeBudgetMs: config.runtimeBudgetMs,
    estimatedWorstCaseMs,
    llmStageCount: LLM_STAGE_COUNT,
    llmStageTimeoutMs: config.stageTimeoutMs,
    evidenceCollectionTimeoutMs: config.evidenceCollectionTimeoutMs,
    benchmarkTimeoutMs: config.benchmarkTimeoutMs,
    reconciliationMarginMs: config.reconciliationMarginMs,
    status: estimatedWorstCaseMs < config.runtimeBudgetMs ? 'SUFFICIENT' : 'INSUFFICIENT',
  };
}

function assertRuntimeBudget(report: DossierServerPipelineRuntimeBudgetReport): void {
  if (report.status === 'SUFFICIENT') return;
  throw new DossierServerPipelineError(
    'SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT',
    `SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT OBSERVED_OR_WORST_CASE_DURATION=${report.estimatedWorstCaseMs} REQUIRED_ARCHITECTURAL_DECISION=SYNC_ENDPOINT_OR_DURABLE_EXECUTION`,
    'budget',
    false,
  );
}

function combineSignals(first: AbortSignal, second: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (first.aborted || second.aborted) controller.abort();
  else {
    first.addEventListener('abort', abort, { once: true });
    second.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      first.removeEventListener('abort', abort);
      second.removeEventListener('abort', abort);
    },
  };
}

async function withinStageBudget<T>(
  stage: string,
  timeoutMs: number,
  signal: AbortSignal,
  operation: (stageSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (signal.aborted) {
    throw new DossierServerPipelineError('SERVER_PIPELINE_CANCELLED', 'Pipeline cancelado', stage, false);
  }
  const timeoutController = new AbortController();
  const combined = combineSignals(signal, timeoutController.signal);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const operationPromise = operation(combined.signal);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timeoutController.abort();
      reject(new DossierServerPipelineError('SERVER_PIPELINE_STAGE_TIMEOUT', `Etapa ${stage} excedeu o orçamento`, stage, true));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } catch (error) {
    if (signal.aborted) {
      throw new DossierServerPipelineError('SERVER_PIPELINE_CANCELLED', 'Pipeline cancelado', stage, false);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    combined.cleanup();
  }
}

function mapLlmUsage(usage: DossierServerLlmResult['usage']): DossierUsage {
  return normalizeUsage(usage);
}

async function defaultLlm(input: DossierServerLlmInput): Promise<DossierServerLlmResult> {
  const result = await runDossierGateway({
    mode: 'generate',
    userContent: `${SHARED_FOUNDATION_BLOCK}\n\n${input.prompt}`,
    dossierContext: input.context,
    signal: input.signal,
    correlationId: input.correlationId,
    runId: input.runId,
    timeoutMs: input.timeoutMs,
  });
  return {
    text: result.text,
    usage: {
      promptTokens: result.usage.promptTokenCount ?? 0,
      completionTokens: result.usage.candidatesTokenCount ?? 0,
      totalTokens: result.usage.totalTokenCount ?? 0,
    },
    finishReason: result.finishReason,
  };
}

async function defaultSearchEvidence(
  _query: string,
  _signal: AbortSignal,
): Promise<readonly DossierServerEvidenceSearchResult[]> {
  // Provider wiring is intentionally injected in 05C.1. An absent provider is
  // an explicit unavailable evidence pack, never a silent client-side fallback.
  return [];
}

async function defaultBenchmark(_input: {
  companyName: string;
  cnpj?: string;
  context: string;
  signal: AbortSignal;
}): Promise<string> {
  return '';
}

function classifyTier(url: string): 'A' | 'B' | 'C' | 'D' {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('.gov.br') || host.endsWith('.jus.br') || host.includes('receita')) return 'A';
    if (host.includes('cnpj.ws') || host.includes('casadosdados') || host.includes('econodata')) return 'B';
    if (host.includes('linkedin') || host.includes('youtube') || host.includes('noticiasagricolas')) return 'C';
    return 'D';
  } catch {
    return 'D';
  }
}

function classifyEntityMatch(snippet: string, cnpj: string): 'exact' | 'likely' | 'weak' | 'rejected' {
  if (cnpj && snippet.includes(cnpj)) return 'exact';
  if (/empresa|grupo|cnpj|s[oó]cio|agro/i.test(snippet)) return 'likely';
  return 'weak';
}

function buildEmptyEvidencePack(): EvidencePack {
  return {
    items: [],
    confidenceProfile: {
      totalUrls: 0,
      uniqueUrls: 0,
      tierACount: 0,
      tierBCount: 0,
      tierCCount: 0,
      tierDCount: 0,
      modulesCovered: [],
    },
    collectedAt: new Date().toISOString(),
  };
}

async function collectEvidenceServerSide(
  plan: QueryPlan,
  searchEvidence: DossierServerPipelineDependencies['searchEvidence'],
  signal: AbortSignal,
  now: () => number,
): Promise<EvidencePack> {
  if (!searchEvidence) return buildEmptyEvidencePack();
  const raw: Array<{ queryId: string; query: string; module: DossierModule; result: DossierServerEvidenceSearchResult }> = [];
  const concurrency = 4;
  for (let index = 0; index < plan.queries.length; index += concurrency) {
    const batch = plan.queries.slice(index, index + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async query => {
        const results = await searchEvidence(query.query, signal);
        return results.map(result => ({ queryId: query.id, query: query.query, module: query.module, result }));
      }),
    );
    for (const item of settled) if (item.status === 'fulfilled') raw.push(...item.value);
  }

  const items = raw.map((entry, index) => {
    const tier = classifyTier(entry.result.url);
    const entityMatch = classifyEntityMatch(entry.result.snippet, plan.entityResolutionId);
    const usable = tier !== 'D' && entityMatch !== 'rejected';
    const sourceResult: BraveSearchResult = {
      queryId: entry.queryId,
      query: entry.query,
      url: entry.result.url,
      title: entry.result.title || entry.result.url,
      snippet: entry.result.snippet.slice(0, 1_000),
      provider: entry.result.provider ?? 'gemini_grounding',
      retrievedAt: new Date(now()).toISOString(),
    };
    return {
      id: `ev-${String(index + 1).padStart(3, '0')}`,
      sourceResult,
      evidenceTier: tier,
      entityMatch,
      usableForReport: usable,
      ...(usable ? {} : { reasonIfRejected: `Tier ${tier} ou match ${entityMatch}` }),
      queryOrigin: entry.queryId,
      module: entry.module,
      extractedClaim: sourceResult.snippet.slice(0, 200),
    };
  });
  const modulesCovered = [...new Set(items.filter(item => item.usableForReport).map(item => item.module))];
  return {
    items,
    confidenceProfile: {
      totalUrls: items.length,
      uniqueUrls: new Set(items.map(item => item.sourceResult.url)).size,
      tierACount: items.filter(item => item.evidenceTier === 'A').length,
      tierBCount: items.filter(item => item.evidenceTier === 'B').length,
      tierCCount: items.filter(item => item.evidenceTier === 'C').length,
      tierDCount: items.filter(item => item.evidenceTier === 'D').length,
      modulesCovered,
    },
    collectedAt: new Date(now()).toISOString(),
  };
}

function formatEvidenceForPrompt(pack: EvidencePack): string {
  if (pack.items.length === 0) return '[EVIDENCE_PACK: indisponível nesta rodada; não invente fontes]';
  return pack.items
    .filter(item => item.usableForReport)
    .map(item => `- ${item.sourceResult.title} | ${item.sourceResult.url}\n  ${item.extractedClaim}`)
    .join('\n');
}

function formatSources(pack: EvidencePack): readonly { title: string; url: string; snippet: string }[] {
  return pack.items
    .filter(item => item.usableForReport)
    .map(item => ({
      title: item.sourceResult.title,
      url: item.sourceResult.url,
      snippet: item.sourceResult.snippet,
    }));
}

function buildFinalContext(input: DossierServerPipelineInput, modules: Readonly<Record<string, string>>, benchmark: string, pack: EvidencePack): string {
  const moduleText = Object.entries(modules)
    .map(([name, text]) => `## ${name}\n${text || '[módulo indisponível]'}`)
    .join('\n\n');
  const combined = [
    input.context,
    '[MODULOS_SERVER_SIDE]',
    moduleText,
    '[BENCHMARK_SERVER_SIDE]',
    benchmark || '[benchmark indisponível nesta rodada]',
    '[EVIDENCE_PACK_SERVER_SIDE]',
    formatEvidenceForPrompt(pack),
  ].join('\n\n');
  if (combined.length <= DOSSIER_SERVER_PIPELINE_CONFIG.maxFinalContextChars) return combined;
  return `${combined.slice(0, DOSSIER_SERVER_PIPELINE_CONFIG.maxFinalContextChars)}\n\n[CONTEXTO_TRUNCADO_POR_LIMITE_SERVER_SIDE]`;
}

function buildCategoryStatuses(
  input: DossierServerPipelineInput,
  modules: Readonly<Record<string, string>>,
  evidencePack: EvidencePack,
  benchmark: string,
  fontes: readonly { title: string; url: string; snippet: string }[],
): readonly DossierServerPipelineCategory[] {
  const evidenceByCategory = new Map(input.evidence?.categories.map(entry => [entry.category, entry]) ?? []);
  const moduleChars = Object.values(modules).reduce((total, value) => total + value.length, 0);
  return DOSSIER_EVIDENCE_CATEGORIES.map(category => {
    if (category === 'modulos') {
      return { category, status: moduleChars > 0 ? 'GENERATED' : 'UNAVAILABLE', origin: moduleChars > 0 ? 'SERVER_LLM' : 'UNAVAILABLE', contentChars: moduleChars };
    }
    if (category === 'benchmark') {
      return { category, status: benchmark ? 'GENERATED' : 'UNAVAILABLE', origin: benchmark ? 'SERVER_FORMATTING' : 'UNAVAILABLE', contentChars: benchmark.length };
    }
    if (category === 'evidence_pack') {
      const contentChars = evidencePack.items.reduce((total, item) => total + item.extractedClaim.length, 0);
      return { category, status: contentChars > 0 ? 'GENERATED' : 'UNAVAILABLE', origin: contentChars > 0 ? 'SERVER_LLM' : 'UNAVAILABLE', contentChars };
    }
    if (category === 'fontes') {
      const contentChars = fontes.reduce((total, source) => total + source.url.length + source.title.length, 0);
      return { category, status: contentChars > 0 ? 'GENERATED' : 'UNAVAILABLE', origin: contentChars > 0 ? 'SERVER_FORMATTING' : 'UNAVAILABLE', contentChars };
    }
    const inputPresence = evidenceByCategory.get(category);
    const contentChars = inputPresence?.present ? inputPresence.itemCount : 0;
    return { category, status: inputPresence?.present ? 'PROVIDED' : 'UNAVAILABLE', origin: inputPresence?.present ? 'INPUT_DETERMINISTIC' : 'UNAVAILABLE', contentChars };
  });
}

export function createDossierServerPipeline(dependencies: DossierServerPipelineDependencies = {}) {
  const llm = dependencies.llm ?? defaultLlm;
  const searchEvidence = dependencies.searchEvidence ?? defaultSearchEvidence;
  const benchmarkResolver = dependencies.benchmark ?? defaultBenchmark;
  const now = dependencies.now ?? Date.now;

  return async function runDossierServerPipeline(input: DossierServerPipelineInput): Promise<DossierServerPipelineOutput> {
    validateInput(input);
    const config = {
      ...DOSSIER_SERVER_PIPELINE_CONFIG,
      ...(input.runtimeBudgetMs === undefined ? {} : { runtimeBudgetMs: input.runtimeBudgetMs }),
    };
    const runtimeBudget = estimateDossierServerPipelineRuntime(config);
    assertRuntimeBudget(runtimeBudget);

    const stages: DossierServerPipelineStage[] = [];
    let aggregateUsage = emptyUsage();
    const startedAt = now();

    const runLlmStage = async (stageName: string, prompt: string, context: string): Promise<DossierServerLlmResult> => {
      const stageStarted = now();
      try {
        const result = await withinStageBudget(stageName, config.stageTimeoutMs, input.signal, stageSignal =>
          llm({
            stage: stageName,
            prompt,
            context,
            runId: input.runId,
            correlationId: input.correlationId,
            signal: stageSignal,
            timeoutMs: config.stageTimeoutMs,
          }),
        );
        const usage = mapLlmUsage(result.usage);
        aggregateUsage = addUsage(aggregateUsage, usage);
        stages.push({ name: stageName, status: 'COMPLETED', durationMs: now() - stageStarted, llmCalls: 1, usage });
        return { ...result, usage };
      } catch (error) {
        const pipelineError = error instanceof DossierServerPipelineError
          ? error
          : new DossierServerPipelineError('SERVER_PIPELINE_STAGE_FAILED', `Etapa ${stageName} falhou`, stageName, true);
        stages.push({ name: stageName, status: pipelineError.code === 'SERVER_PIPELINE_CANCELLED' ? 'CANCELLED' : 'FAILED', durationMs: now() - stageStarted, llmCalls: 1, usage: emptyUsage(), errorCode: pipelineError.code });
        throw pipelineError;
      }
    };

    const modules: Record<string, string> = {};
    let previousModuleText = '';
    for (const module of MODULE_STAGES) {
      const context = [input.context, previousModuleText ? `[MÓDULOS_ANTERIORES]\n${previousModuleText.slice(-60_000)}` : '']
        .filter(Boolean)
        .join('\n\n');
      const result = await runLlmStage(module.name, `Empresa alvo: ${input.companyName}\nGere APENAS o bloco ${module.label}.\n\n${module.prompt}`, context);
      modules[module.label] = result.text.trim();
      previousModuleText = `${previousModuleText}\n\n${result.text.trim()}`.trim();
    }

    const entity = buildEntityResolutionFromContext({
      cnpj: input.cnpj,
      razaoSocial: input.companyName,
      cnaePrincipal: '',
      estadoOperacao: [],
    });
    let plan: QueryPlan | undefined;
    try {
      plan = await planQueries(entity, async plannerPrompt => {
        const result = await runLlmStage('evidence_planner', plannerPrompt, input.context);
        return result.text;
      });
    } catch (error) {
      stages.push({ name: 'evidence_planner', status: 'DEGRADED', durationMs: 0, llmCalls: 0, usage: emptyUsage(), errorCode: error instanceof DossierServerPipelineError ? error.code : 'EVIDENCE_PLANNER_FAILED' });
    }

    let evidencePack = buildEmptyEvidencePack();
    const evidenceStageStarted = now();
    try {
      if (plan) {
        evidencePack = await withinStageBudget('evidence_collector', config.evidenceCollectionTimeoutMs, input.signal, stageSignal =>
          collectEvidenceServerSide(plan!, searchEvidence, stageSignal, now),
        );
        stages.push({ name: 'evidence_collector', status: 'COMPLETED', durationMs: now() - evidenceStageStarted, llmCalls: 0, usage: emptyUsage() });
      } else {
        stages.push({ name: 'evidence_collector', status: 'DEGRADED', durationMs: now() - evidenceStageStarted, llmCalls: 0, usage: emptyUsage(), errorCode: 'EVIDENCE_PLANNER_UNAVAILABLE' });
      }
    } catch (error) {
      const pipelineError = error instanceof DossierServerPipelineError ? error : new DossierServerPipelineError('SERVER_PIPELINE_STAGE_FAILED', 'Collector de evidências falhou', 'evidence_collector', true);
      stages.push({ name: 'evidence_collector', status: 'DEGRADED', durationMs: now() - evidenceStageStarted, llmCalls: 0, usage: emptyUsage(), errorCode: pipelineError.code });
    }

    const benchmarkStarted = now();
    let benchmark = '';
    try {
      benchmark = await withinStageBudget('benchmark', config.benchmarkTimeoutMs, input.signal, signal =>
        benchmarkResolver({ companyName: input.companyName, cnpj: input.cnpj, context: input.context, signal }),
      );
      stages.push({ name: 'benchmark', status: benchmark ? 'COMPLETED' : 'DEGRADED', durationMs: now() - benchmarkStarted, llmCalls: 0, usage: emptyUsage(), ...(benchmark ? {} : { errorCode: 'BENCHMARK_UNAVAILABLE' }) });
    } catch (error) {
      const pipelineError = error instanceof DossierServerPipelineError ? error : new DossierServerPipelineError('SERVER_PIPELINE_STAGE_FAILED', 'Benchmark falhou', 'benchmark', true);
      stages.push({ name: 'benchmark', status: 'DEGRADED', durationMs: now() - benchmarkStarted, llmCalls: 0, usage: emptyUsage(), errorCode: pipelineError.code });
    }

    const fontes = formatSources(evidencePack);
    const finalContext = buildFinalContext(input, modules, benchmark, evidencePack);
    const finalResult = await runLlmStage(
      'final_consolidation',
      [
        `Empresa alvo: ${input.companyName}`,
        'Consolide o dossiê final em Markdown, preservando limitações explícitas.',
        'Não invente fatos, fontes ou resultados de etapas indisponíveis.',
      ].join('\n\n'),
      finalContext,
    );
    if (!finalResult.text.trim()) {
      throw new DossierServerPipelineError('DOSSIER_CONTENT_UNAVAILABLE', 'Consolidação final vazia', 'final_consolidation', false);
    }
    const observedDurationMs = now() - startedAt;
    if (observedDurationMs >= config.runtimeBudgetMs) {
      throw new DossierServerPipelineError(
        'SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT',
        `SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT OBSERVED_OR_WORST_CASE_DURATION=${observedDurationMs} REQUIRED_ARCHITECTURAL_DECISION=SYNC_ENDPOINT_OR_DURABLE_EXECUTION`,
        'budget',
        false,
      );
    }

    return {
      version: DOSSIER_SERVER_PIPELINE_VERSION,
      runId: input.runId,
      companyName: input.companyName.trim(),
      ...(input.cnpj ? { cnpj: input.cnpj } : {}),
      text: finalResult.text.trim(),
      modulos: modules,
      evidencePack,
      evidencePackStatus: evidencePack.items.length > 0 ? 'COMPLETED' : 'UNAVAILABLE',
      benchmark,
      benchmarkStatus: benchmark ? 'COMPLETED' : 'UNAVAILABLE',
      fontes,
      categoryStatuses: buildCategoryStatuses(input, modules, evidencePack, benchmark, fontes),
      usage: aggregateUsage,
      finishReason: finalResult.finishReason ?? 'unknown',
      stages,
      runtimeBudget: {
        ...runtimeBudget,
        status: 'SUFFICIENT',
      },
      terminalPersistenceAttempted: false,
      clientDependenciesUsed: [],
    };
  };
}

export const runDossierServerPipeline = createDossierServerPipeline();
