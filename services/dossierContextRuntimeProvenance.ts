import {
  DOSSIER_EVIDENCE_CATEGORIES,
  type DossierEvidenceCategory,
} from '../shared/dossierGatewayContracts';
import {
  buildDeterministicDossierContext,
  type BuiltDossierContext,
  type DeterministicDossierContextInput,
} from './dossierContextContract';

export type DossierContextRuntimeClassification =
  | 'PRE_LLM_DETERMINISTIC'
  | 'LLM_DERIVED'
  | 'POST_LLM_FORMATTING'
  | 'UNAVAILABLE';

export interface DossierContextRuntimeProvenanceEntry {
  category: DossierEvidenceCategory;
  realSource: string;
  fileFunction: string;
  inputData: string;
  availabilityPoint: string;
  classification: DossierContextRuntimeClassification;
  required: boolean;
  traceEvidence: string;
}

export interface DossierContextFirstLlmCall {
  primaryPath: string;
  conditionalPaths: readonly string[];
}

export interface DossierContextRuntimeProvenanceReport {
  version: 'dossier-context-runtime-provenance.v1';
  firstLlmCall: DossierContextFirstLlmCall;
  entries: readonly DossierContextRuntimeProvenanceEntry[];
  status: 'PASS' | 'INSUFFICIENT';
  nonPreLlmCategories: readonly DossierEvidenceCategory[];
  llmDerivedCategories: readonly DossierEvidenceCategory[];
  gateMessage?: string;
}

export class DossierContextRuntimeParityError extends Error {
  readonly code = 'CONTEXT_CONTRACT_INSUFFICIENT' as const;
  readonly categories: readonly DossierEvidenceCategory[];
  readonly llmDerivedCategories: readonly DossierEvidenceCategory[];

  constructor(
    categories: readonly DossierEvidenceCategory[],
    llmDerivedCategories: readonly DossierEvidenceCategory[],
  ) {
    const llmList = llmDerivedCategories.length > 0 ? llmDerivedCategories.join(',') : 'none';
    super(
      `CONTEXT_CONTRACT_INSUFFICIENT LLM_DERIVED_CATEGORIES=${llmList} ` +
        'OPTION_A_INVALID_FOR_CURRENT_FLOW SERVER_STAGE_EXTRACTION_REQUIRED',
    );
    this.name = 'DossierContextRuntimeParityError';
    this.categories = categories;
    this.llmDerivedCategories = llmDerivedCategories;
  }
}

export const DOSSIER_CONTEXT_FIRST_LLM_CALL: DossierContextFirstLlmCall = Object.freeze({
  primaryPath: 'features/dossier/waterfall-orchestrator.ts:836 — generateDossierModule (Teia Societaria — Identidade)',
  conditionalPaths: Object.freeze([
    'features/dossier/waterfall-orchestrator.ts:993 — sendMessageToGemini via Pipeline V2 (quando VITE_EVIDENCE_PIPELINE_V2 está ativo)',
    'features/dossier/waterfall-orchestrator.ts:817 — generateDossierModule no fallback do módulo inicial',
  ]),
});

/**
 * Matriz baseada no call-site real do waterfall atual. A classificação mede
 * quando o conteúdo fica disponível no fluxo, não apenas se a transformação
 * local é determinística. Categorias pós-LLM não podem ser preenchidas por
 * placeholders para liberar o cutover.
 */
export const DOSSIER_CONTEXT_RUNTIME_PROVENANCE: readonly DossierContextRuntimeProvenanceEntry[] =
  Object.freeze([
    {
      category: 'empresa',
      realSource: 'resolvedMegaCompany',
      fileFunction: 'features/dossier/waterfall-orchestrator.ts:624',
      inputData: 'normalizedCompany || hintedCompany || texto visível',
      availabilityPoint: 'Antes de lookup, Teia e qualquer geração LLM',
      classification: 'PRE_LLM_DETERMINISTIC',
      required: true,
      traceEvidence: 'waterfall-orchestrator.ts:626 resolve o rótulo da empresa por seleção determinística',
    },
    {
      category: 'cnpj',
      realSource: 'sessionCnpjDigits e retorno de fetchCompanyByCnpj',
      fileFunction: 'features/dossier/waterfall-orchestrator.ts:704; services/brasilApiService.ts:fetchCompanyByCnpj',
      inputData: 'sessionCnpjDigits; CNPJ oficial retornado pela API cadastral quando disponível',
      availabilityPoint: 'Antes da primeira geração LLM; pode estar vazio se não houver CNPJ válido',
      classification: 'PRE_LLM_DETERMINISTIC',
      required: true,
      traceEvidence: 'waterfall-orchestrator.ts:704-709 busca cadastral antes de montar staticDossierContext',
    },
    {
      category: 'qsa',
      realSource: 'qsa do retorno cadastral oficial',
      fileFunction: 'buildTeiaResearchContext',
      inputData: 'companyData.qsa normalizado em qsaLines',
      availabilityPoint: 'Durante buildTeiaResearchContext, antes da primeira geração LLM',
      classification: 'PRE_LLM_DETERMINISTIC',
      required: true,
      traceEvidence: 'waterfall-orchestrator.ts:159-180 transforma o QSA recebido sem modelo',
    },
    {
      category: 'dados_cadastrais',
      realSource: 'API CNPJ oficial',
      fileFunction: 'fetchCompanyByCnpj',
      inputData: 'companyName, city, state, cnae, cnaeDescricao e cnpj',
      availabilityPoint: 'Antes da primeira geração LLM, condicionado a CNPJ válido e resposta da API',
      classification: 'PRE_LLM_DETERMINISTIC',
      required: true,
      traceEvidence: 'brasilApiService.ts:fetchCompanyByCnpj retorna objeto cadastral estruturado',
    },
    {
      category: 'crm',
      realSource: 'lookupCliente / CRM Senior',
      fileFunction: 'features/dossier/waterfall-orchestrator.ts:684-688',
      inputData: 'waterfallLookupContext e ClienteSeniorData extraídos da resposta do lookup',
      availabilityPoint: 'Antes de buildSeniorEvidenceContext e da primeira geração LLM',
      classification: 'PRE_LLM_DETERMINISTIC',
      required: true,
      traceEvidence: 'lookupCliente é aguardado antes de buildSeniorEvidenceContext; falha fica explícita como vazio',
    },
    {
      category: 'concorrentes',
      realSource: 'registro regional de concorrentes e revendas',
      fileFunction: 'getContextoConcorrentesRegionais',
      inputData: 'stateHint || company; catálogo local de revendas por UF',
      availabilityPoint: 'Dentro de buildTeiaResearchContext, antes da primeira geração LLM',
      classification: 'PRE_LLM_DETERMINISTIC',
      required: true,
      traceEvidence: 'competitorService.ts:getContextoConcorrentesRegionais só lê catálogo e formata texto',
    },
    {
      category: 'porta',
      realSource: 'estado PORTA atual',
      fileFunction: 'generatePortaContextForDeepDive',
      inputData: 'currentPortaState.consolidatedScore ou marcador explícito de score indisponível',
      availabilityPoint: 'Dentro de buildTeiaResearchContext, antes da primeira geração LLM',
      classification: 'PRE_LLM_DETERMINISTIC',
      required: true,
      traceEvidence: 'portaStateService.ts:202 retorna score consolidado ou mensagem explícita sem chamar modelo',
    },
    {
      category: 'modulos',
      realSource: 'resultados dos módulos do waterfall',
      fileFunction: 'runTeiaSocietariaOrchestration / runWaterfallModule',
      inputData: 'identityResult, deepResult e moduleResult retornados por generateDossierModule',
      availabilityPoint: 'Somente depois da primeira chamada LLM',
      classification: 'LLM_DERIVED',
      required: true,
      traceEvidence: 'waterfall-orchestrator.ts:817, 836, 921 e 1057 chamam generateDossierModule para produzir os blocos',
    },
    {
      category: 'benchmark',
      realSource: 'etapa isolada de benchmark Senior',
      fileFunction: 'runDossierBenchmarkStage / getIsolatedBenchmark',
      inputData: 'resultado de benchmarkClientes formatado para prompt',
      availabilityPoint: 'Após o loop dos módulos LLM, em waterfall-orchestrator.ts:1085-1104',
      classification: 'POST_LLM_FORMATTING',
      required: true,
      traceEvidence: 'benchmark-stage.ts:27 é executado somente depois de todos os módulos',
    },
    {
      category: 'evidence_pack',
      realSource: 'Query Planner + Collector do Pipeline V2',
      fileFunction: 'planQueries / executeQueryPlan',
      inputData: 'plano gerado por sendMessageToGemini e itens coletados via /api/open-web-search',
      availabilityPoint: 'Quando Pipeline V2 está ativo; o planner LLM roda antes dos módulos, o pack só depois',
      classification: 'LLM_DERIVED',
      required: true,
      traceEvidence: 'waterfall-orchestrator.ts:992-1004 chama sendMessageToGemini; query-planner.ts:314 executa o collector',
    },
    {
      category: 'fontes',
      realSource: 'fontes de grounding e promoção inline',
      fileFunction: 'appendGroundingSources / validateInlineSourcesForPromotion / finalizeDossierMarkdown',
      inputData: 'fontes devolvidas pelos módulos e links extraídos do texto narrativo',
      availabilityPoint: 'Somente depois de texto LLM; validação inline começa em waterfall-orchestrator.ts:1202',
      classification: 'POST_LLM_FORMATTING',
      required: true,
      traceEvidence: 'waterfallGroundingSources começa vazio e só recebe callbacks dos módulos ou promoção pós-narrativa',
    },
    {
      category: 'historico',
      realSource: 'historyToPass da sessão atual',
      fileFunction: 'runMegaPromptWaterfall input',
      inputData: 'mensagens históricas sanitizadas passadas ao waterfall',
      availabilityPoint: 'Entrada do waterfall, antes de qualquer chamada externa',
      classification: 'PRE_LLM_DETERMINISTIC',
      required: true,
      traceEvidence: 'historyToPass é recebido em RunMegaPromptWaterfallArgs e só é usado novamente na continuidade',
    },
    {
      category: 'contexto_visivel',
      realSource: 'safeVisibleText e dossierSeedContext',
      fileFunction: 'buildDossierSeedContext / runMegaPromptWaterfall input',
      inputData: 'texto visível da solicitação e blocos cadastrais/radar extraídos por regex',
      availabilityPoint: 'Entrada do waterfall, antes de lookup e da primeira geração LLM',
      classification: 'PRE_LLM_DETERMINISTIC',
      required: true,
      traceEvidence: 'waterfall-orchestrator.ts:624-626 deriva dossierSeedContext sem chamar o modelo',
    },
  ] as const);

function assertCompleteProvenanceMatrix(
  entries: readonly DossierContextRuntimeProvenanceEntry[],
): void {
  const categories = entries.map(entry => entry.category);
  if (
    entries.length !== DOSSIER_EVIDENCE_CATEGORIES.length ||
    new Set(categories).size !== DOSSIER_EVIDENCE_CATEGORIES.length ||
    DOSSIER_EVIDENCE_CATEGORIES.some(category => !categories.includes(category))
  ) {
    throw new Error('Runtime provenance matrix must contain exactly the 13 canonical categories');
  }
}

export function buildDossierContextRuntimeProvenanceReport(
  entries: readonly DossierContextRuntimeProvenanceEntry[] = DOSSIER_CONTEXT_RUNTIME_PROVENANCE,
): DossierContextRuntimeProvenanceReport {
  assertCompleteProvenanceMatrix(entries);

  const requiredEntries = entries.filter(entry => entry.required);
  const nonPreLlmCategories = requiredEntries
    .filter(entry => entry.classification !== 'PRE_LLM_DETERMINISTIC')
    .map(entry => entry.category);
  const llmDerivedCategories = requiredEntries
    .filter(entry => entry.classification === 'LLM_DERIVED')
    .map(entry => entry.category);
  const status = nonPreLlmCategories.length === 0 ? 'PASS' : 'INSUFFICIENT';
  const gateMessage =
    status === 'INSUFFICIENT'
      ? new DossierContextRuntimeParityError(nonPreLlmCategories, llmDerivedCategories).message
      : undefined;

  return {
    version: 'dossier-context-runtime-provenance.v1',
    firstLlmCall: DOSSIER_CONTEXT_FIRST_LLM_CALL,
    entries,
    status,
    nonPreLlmCategories,
    llmDerivedCategories,
    ...(gateMessage ? { gateMessage } : {}),
  };
}

export function assertDossierContextRuntimeParity(
  report: DossierContextRuntimeProvenanceReport,
): void {
  if (report.status === 'PASS') return;
  throw new DossierContextRuntimeParityError(report.nonPreLlmCategories, report.llmDerivedCategories);
}

/**
 * Ponto de montagem em shadow. Ele só chama o builder determinístico depois
 * que o relatório de proveniência prova paridade temporal com o primeiro LLM.
 */
export async function buildShadowDossierContext(input: {
  report: DossierContextRuntimeProvenanceReport;
  context: DeterministicDossierContextInput;
}): Promise<BuiltDossierContext> {
  assertDossierContextRuntimeParity(input.report);
  return buildDeterministicDossierContext(input.context);
}
