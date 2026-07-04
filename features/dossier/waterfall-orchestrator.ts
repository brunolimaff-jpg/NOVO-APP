import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import * as Sentry from '@sentry/react';
import { v4 as uuidv4 } from 'uuid';
import { registerWaterfallStart, registerWaterfallEnd } from './waterfall-guard';
import { MODULAR_DOSSIER_CONSOLIDATION_STAGE, MODULAR_DOSSIER_STAGES } from '../../constants/loadingStages';
import {
  PROMPT_CAMINHO_DE_VENDA,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_TEIA_IDENTITY_MODULE,
  PROMPT_TEIA_DEEP_MODULE,
  SHARED_FOUNDATION_BLOCK,
} from '../../prompts/megaPrompts';
import { generateContinuityQuestion, generateDossierModule } from '../../services/llmService';
import {
  buildDynamicDossierContext,
  buildStaticDossierContext,
  createWaterfallFoundationCache,
  deleteWaterfallFoundationCache,
  isFoundationCacheEnabled,
  joinDossierExtraContext,
} from '../../services/llm/foundation-cache';
import { formatarParaPrompt, lookupCliente } from '../../services/clientLookupService';
import { getContextoConcorrentesRegionais } from '../../services/competitorService';
import { generatePortaContextForDeepDive } from '../../services/portaStateService';
import { fetchCompanyByCnpj } from '../../services/brasilApiService';
import { storage } from '../../services/storage';
import { useMaybeChatStore } from '../../stores/chatStore';
import { type ChatSession, type ClienteSeniorData, Sender, type WebVerificationStatus } from '../../types';
import { scoutDiag } from '../../utils/diagnosticLog';
import { finalizeWaterfallUI, yieldBeforeHandoff } from '../../utils/finalizeWaterfallUI';
import { stripPortaMarkers } from '../../utils/porta';
import { normalizeCnpj } from '../../utils/cnpj';
import { sanitizeSensitivePersonalData } from '../../utils/privacy';
import {
  appendSeniorEvidenceNote,
  buildSeniorEvidenceContext,
  enforceSeniorEvidenceConstraints,
  extractClienteSeniorData,
} from '../../utils/seniorEvidence';
import { extractPromotableInlineSources, type VerifiedSource } from '../../utils/webVerification';
import {
  formatAvailableSourcesForPrompt,
  mergeDossierSourceRefs,
  verifiedSourcesToPool,
  type DossierSourceRef,
} from '../../utils/dossierSourcePool';
import { finalizeDossierMarkdown } from '../../utils/dossierFinalize';
import type { MutableRefObject } from 'react';
import type { RunMegaPromptWaterfallArgs } from '../../types';
import { combineAbortSignals, isAbortLikeError } from '../../utils/abortHelpers';
import { isEvidencePipelineV2 } from '../../utils/feature-flags';
import {
  selectOutputMode,
  type OutputMode,
  type OutputModeDecision,
} from '../../services/evidence/output-mode-selector';
import { formatEvidencePackForPrompt } from '../../services/evidence/pack-formatter';
import {
  PROMPT_CAMINHO_DE_VENDA_V2,
  PROMPT_RADAR_EXPANSAO_GOD_MODE_V2,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE_V2,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE_V2,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE_V2,
} from '../../prompts/mega/specialist-prompts-v2';
import { PROMPT_TEIA_IDENTITY_MODULE_V2 } from '../../prompts/mega/teia-identity-v2';
import { QUERY_PLANNER_SYSTEM_PROMPT } from '../../prompts/evidence/query-planner';
import type { EvidencePack } from '../../services/llm/query-planner';
import { ensureContinuitySuggestions, pickCompanyLabel } from '../../utils/messageHelpers';
import { runDossierBenchmarkStage } from './benchmark-stage';
import type { PortaScoreResolution } from '../../utils/porta';
import {
  ensureWaterfallScorePorta,
  reconcileWaterfallPorta,
  type DossierWaterfallModule,
  type RunWaterfallModule,
} from './porta-reconciliation';

interface ResetLoadingProgressOptions {
  incremental?: boolean;
  keepHistory?: number;
}

const MODULAR_DOSSIER_TOTAL_STAGES = 7;
const MODULAR_REQUIRED_STEP_TIMEOUT_MS = 90000;
const MODULAR_OPTIONAL_STEP_TIMEOUT_MS = 60000;
const WATERFALL_CONTEXT_WINDOW_CHARS = 12000;
const MAX_INLINE_SOURCES_TO_VALIDATE = 8;
const FIRST_MODULE_INDEX = 0;

type TeiaComplexity = 'BAIXA' | 'MEDIA' | 'ALTA';

interface TeiaResearchContext {
  text: string;
  objectiveComplexity: TeiaComplexity | null;
}

export interface UseDossierWaterfallOrchestratorOptions {
  canUseLookup: boolean;
  resolvedOperatorName: string;
  // Cost tracking
  operatorId?: string;
  operatorEmail?: string;
  operatorSessionId?: string;
  activeGenerationRef?: MutableRefObject<Record<string, string>>;
  setIsLoading?: Dispatch<SetStateAction<boolean>>;
  setLoadingVariant?: (variant: 'hero' | 'inline' | undefined) => void;
  updateSessionById: (id: string, updater: (session: ChatSession) => ChatSession) => ChatSession | null | void;
  resetLoadingProgress: (stage?: string, totalStages?: number, options?: ResetLoadingProgressOptions) => void;
  advanceLoadingProgress: (nextStage: string, totalStages?: number) => void;
  replaceLoadingProgressStage: (stage: string, totalStages?: number) => void;
  completeLoadingProgress: () => void;
  setFailureCount: Dispatch<SetStateAction<number>>;
}

function requireDependency<T>(value: T | null | undefined, dependencyName: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${dependencyName} is required for dossier-waterfall`);
  }

  return value;
}

function buildDossierSeedContext(rawPrompt: string): string {
  if (!rawPrompt) return '';

  const sections = [
    rawPrompt.match(/Contexto cadastral obrigatório:[^\n]+/i)?.[0]?.trim(),
    rawPrompt.match(/<radar_context>[\s\S]*?<\/radar_context>/i)?.[0]?.trim(),
  ].filter(Boolean);

  return sections.join('\n\n');
}

function hasHoldingSignal(value: string): boolean {
  return /holding|participa[cç][oõ]es|investimentos|s\/a|s\.a\./i.test(value || '');
}

function hasInternationalSignal(value: string): boolean {
  return /colombia|colômbia|s\.?a\.?s\.?|nit|filial no exterior|subsidi[aá]ria no exterior|registro estrangeiro/i.test(
    value || '',
  );
}

function deriveObjectiveComplexity(params: {
  qsaCount: number;
  knownCnpjCount: number;
  hasHolding: boolean;
  hasInternational: boolean;
}): TeiaComplexity | null {
  if (params.knownCnpjCount >= 9 || params.hasInternational) return 'ALTA';
  if (params.knownCnpjCount >= 4 || params.qsaCount >= 3 || params.hasHolding) return 'MEDIA';
  return null;
}

async function buildTeiaResearchContext(params: {
  company: string;
  sessionCnpjDigits?: string | null;
  signal: AbortSignal;
}): Promise<TeiaResearchContext> {
  const { company, sessionCnpjDigits, signal } = params;
  const blocks: string[] = [];
  let qsaCount = 0;
  let hasHolding = false;
  let stateHint = '';
  const knownCnpjs = new Set<string>();

  const normalizedCnpj = normalizeCnpj(sessionCnpjDigits || '');
  if (normalizedCnpj.length === 14) {
    try {
      const companyData = await fetchCompanyByCnpj(normalizedCnpj, signal);
      knownCnpjs.add(normalizeCnpj(companyData.cnpj));
      qsaCount = companyData.qsa?.length || 0;
      stateHint = companyData.state || '';
      const qsaLines = (companyData.qsa || []).map(partner => {
        const partnerDoc = partner.document ? normalizeCnpj(partner.document) : '';
        const isCnpj = partnerDoc.length === 14;
        if (isCnpj) knownCnpjs.add(partnerDoc);
        const docSuffix = isCnpj
          ? ` (CNPJ: ${partnerDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')})`
          : '';
        const partnerText = `${partner.name || 'Socio sem nome'}${docSuffix} — ${partner.role || 'qualificacao nao informada'} (${partner.source})`;
        if (hasHoldingSignal(partnerText)) hasHolding = true;
        return `- ${partnerText}`;
      });

      blocks.push(
        [
          '[QSA OFICIAL]',
          `Empresa: ${companyData.companyName}`,
          `CNPJ raiz: ${companyData.cnpj}`,
          companyData.cnaeDescricao ? `CNAE principal: ${companyData.cnaeDescricao}` : '',
          `Sócios confirmados: ${qsaCount}`,
          qsaLines.join('\n'),
        ]
          .filter(Boolean)
          .join('\n'),
      );
    } catch (error) {
      scoutDiag.warn('TeiaSocietaria', 'falha ao buscar QSA oficial para contexto do waterfall', {
        company,
        cnpj: normalizedCnpj,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const concorrentesContext = getContextoConcorrentesRegionais(stateHint || company);
    if (concorrentesContext) blocks.push(`[CONCORRENTES]\n${concorrentesContext}`);
  } catch (error) {
    scoutDiag.warn('TeiaSocietaria', 'falha ao montar concorrentes no waterfall', {
      company,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const portaContext = generatePortaContextForDeepDive('MEGA');
    if (portaContext) blocks.push(`[PORTA STATE]\n${portaContext}`);
  } catch (error) {
    scoutDiag.warn('TeiaSocietaria', 'falha ao montar contexto PORTA no waterfall', {
      company,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const combined = blocks.join('\n\n');
  for (const cnpj of combined.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || []) {
    const normalized = normalizeCnpj(cnpj);
    if (normalized.length === 14) knownCnpjs.add(normalized);
  }

  const objectiveComplexity = deriveObjectiveComplexity({
    qsaCount,
    knownCnpjCount: knownCnpjs.size,
    hasHolding: hasHolding || hasHoldingSignal(combined),
    hasInternational: hasInternationalSignal(combined),
  });

  return {
    text: combined,
    objectiveComplexity,
  };
}

const VALIDATE_INLINE_PER_URL_TIMEOUT_MS = 15_000;
const VALIDATE_INLINE_AGGREGATE_TIMEOUT_MS = 30_000;

export interface InlineValidationTelemetryContext {
  sessionId?: string;
  runId?: string;
  waterfallEndStatus?: string | null;
}

type UrlValidationOutcome = 'valid' | 'failed' | 'timeout';

async function validateSingleInlineUrl(
  url: string,
  aggregateSignal: AbortSignal,
): Promise<UrlValidationOutcome> {
  const perUrlSignal = combineAbortSignals(
    AbortSignal.timeout(VALIDATE_INLINE_PER_URL_TIMEOUT_MS),
    aggregateSignal,
  );

  const abortRace = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        const onAbort = () => reject(new DOMException('The operation was aborted', 'AbortError'));
        if (perUrlSignal.aborted) {
          onAbort();
          return;
        }
        perUrlSignal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);

  try {
    const response = await abortRace(
      fetch('/api/link-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [url] }),
        signal: perUrlSignal,
      }),
    );

    if (!response.ok) return 'failed';

    const bodyText = await abortRace(response.text());
    let data: { results?: Record<string, { status?: string }> };
    try {
      data = JSON.parse(bodyText) as { results?: Record<string, { status?: string }> };
    } catch {
      return 'failed';
    }

    return data?.results?.[url]?.status === 'valid' ? 'valid' : 'failed';
  } catch (err) {
    if (isAbortLikeError(err) || aggregateSignal.aborted || perUrlSignal.aborted) {
      return 'timeout';
    }
    return 'failed';
  }
}

export async function validateInlineSourcesForPromotion(
  text: string,
  existingSources: VerifiedSource[],
  telemetry: InlineValidationTelemetryContext = {},
): Promise<VerifiedSource[]> {
  const opStart = performance.now();
  const { sessionId, runId, waterfallEndStatus = null } = telemetry;

  scoutDiag.info('FreezeDiag', 'inline-validation:extract:start', {
    textLength: text?.length ?? 0,
    existingSourcesCount: existingSources?.length ?? 0,
  });

  const candidates = extractPromotableInlineSources(text, existingSources, MAX_INLINE_SOURCES_TO_VALIDATE);

  const extractDuration = performance.now() - opStart;
  scoutDiag.info('FreezeDiag', 'inline-validation:extract:end', {
    durationMs: Math.round(extractDuration),
    textLength: text?.length ?? 0,
    candidateCount: candidates.length,
  });

  if (candidates.length === 0 || typeof fetch !== 'function') {
    scoutDiag.info('FreezeDiag', 'inline-validation:return', {
      reason: candidates.length === 0 ? 'no-candidates' : 'no-fetch',
      durationMs: Math.round(extractDuration),
    });
    scoutDiag.info('InlineValidation', 'result', {
      sessionId,
      runId,
      promotedCount: 0,
      failedCount: 0,
      timeoutCount: 0,
      durationMs: Math.round(extractDuration),
      waterfallEndStatus,
    });
    return [];
  }

  scoutDiag.info('InlineValidation', 'start', {
    sessionId,
    runId,
    candidateCount: candidates.length,
    waterfallEndStatus,
  });

  scoutDiag.info('FreezeDiag', 'inline-validation:fetch:start', {
    urlCount: candidates.length,
    timestamp: Date.now(),
    perUrlTimeoutMs: VALIDATE_INLINE_PER_URL_TIMEOUT_MS,
    aggregateTimeoutMs: VALIDATE_INLINE_AGGREGATE_TIMEOUT_MS,
  });

  const aggregateSignal = AbortSignal.timeout(VALIDATE_INLINE_AGGREGATE_TIMEOUT_MS);
  let settled: PromiseSettledResult<UrlValidationOutcome>[];

  try {
    settled = await Promise.allSettled(
      candidates.map(source => validateSingleInlineUrl(source.url, aggregateSignal)),
    );
  } catch (err) {
    scoutDiag.warn('InlineValidation', 'Promise.allSettled falhou', {
      sessionId,
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
    settled = [];
  }

  let promotedCount = 0;
  let failedCount = 0;
  let timeoutCount = 0;
  const valid: VerifiedSource[] = [];

  settled.forEach((result, index) => {
    const source = candidates[index];
    if (!source) return;
    if (result.status === 'rejected') {
      failedCount++;
      return;
    }
    if (result.value === 'valid') {
      promotedCount++;
      valid.push(source);
    } else if (result.value === 'timeout') {
      timeoutCount++;
    } else {
      failedCount++;
    }
  });

  const durationMs = Math.round(performance.now() - opStart);

  scoutDiag.info('InlineValidation', 'result', {
    sessionId,
    runId,
    promotedCount,
    failedCount,
    timeoutCount,
    durationMs,
    waterfallEndStatus,
  });

  scoutDiag.info('FreezeDiag', 'inline-validation:return', {
    reason: timeoutCount > 0 && promotedCount === 0 ? 'timeout-or-partial' : 'success',
    validCount: valid.length,
    totalCandidateCount: candidates.length,
    totalDurationMs: durationMs,
    timeoutCount,
    failedCount,
  });

  if (timeoutCount > 0 && promotedCount === 0) {
    scoutDiag.info('FreezeDiag', 'inline-validation:skipped-or-timeout', {
      reason: 'timeout-or-abort',
      durationMs,
      candidateCount: candidates.length,
      timeoutCount,
    });
  }

  return valid;
}
/**
 * Validador de CNPJ pos-geracao (camada 2 de protecao contra alucinacao).
 * Extrai CNPJs do texto gerado, cruza com CNPJs conhecidos do contexto QSA/lookup,
 * e retorna warnings se >30% dos CNPJs citados nao forem confirmados.
 */
interface CnpjValidationResult {
  text: string;
  warnings: string[];
}

function validateTeiaCnpjsOutput(generatedText: string, knownContext: string): CnpjValidationResult {
  const warnings: string[] = [];

  try {
    const cnpjPattern = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
    const foundCnpjs = [...new Set((generatedText.match(cnpjPattern) || []).map((c: string) => c.replace(/\D/g, '')))];

    if (foundCnpjs.length > 0) {
      const knownCnpjs = [...new Set((knownContext.match(cnpjPattern) || []).map((c: string) => c.replace(/\D/g, '')))];
      const knownSet = new Set(knownCnpjs);
      const knownRoots = new Set(knownCnpjs.map((c: string) => c.slice(0, 8)));

      const unconfirmed = foundCnpjs.filter((c: string) => !knownSet.has(c));
      const unconfirmedRoots = foundCnpjs.filter((c: string) => !knownRoots.has(c.slice(0, 8)));

      if (unconfirmed.length > 0 && unconfirmed.length / foundCnpjs.length > 0.3) {
        warnings.push(
          `⚠️ Validação CNPJ: ${unconfirmed.length} de ${foundCnpjs.length} CNPJs citados nao foram confirmados em fontes oficiais disponiveis.`,
        );
      }

      if (unconfirmedRoots.length > 0 && unconfirmedRoots.length <= 3) {
        warnings.push(`🔍 CNPJs com raiz nao confirmada: ${unconfirmedRoots.join(', ')}.`);
      }
    }

    const internationalPatterns = [
      {
        regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ (S\.?A\.?S\.?)(?!\s*(Brasil|BR|CNPJ))/gi,
        label: 'S.A.S. (Colômbia/França)',
      },
      { regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ B\.?V\.?(?!\s*(Brasil|BR|CNPJ))/gi, label: 'B.V. (Holanda)' },
      {
        regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ (GmbH|G\.m\.b\.H\.)(?!\s*(Brasil|BR|CNPJ))/gi,
        label: 'GmbH (Alemanha)',
      },
      {
        regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ (Inc\.?|LLC|Corp\.?)(?!\s*(Brasil|BR|CNPJ))/gi,
        label: 'Inc./LLC (EUA)',
      },
      {
        regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ (Ltd\.?|Limited)(?!\s*(Brasil|BR|CNPJ|LTDA|Ltda))/gi,
        label: 'Ltd. (UK/Hong Kong)',
      },
      { regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ S\.?L\.?(?!\s*(Brasil|BR|CNPJ))/gi, label: 'S.L. (Espanha)' },
    ];

    const foundInternational = new Set<string>();

    for (const { regex } of internationalPatterns) {
      regex.lastIndex = 0;
      const matches = generatedText.match(regex);
      if (matches) {
        for (const match of matches) {
          const cleaned = match.trim();
          if (!foundInternational.has(cleaned)) {
            foundInternational.add(cleaned);
          }
        }
      }
    }

    if (foundInternational.size > 0) {
      const names = [...foundInternational].join(', ');
      const labels = [
        ...new Set(
          [...foundInternational].map(name => {
            for (const { regex, label } of internationalPatterns) {
              regex.lastIndex = 0;
              if (regex.test(name)) return label;
            }
            return 'Internacional';
          }),
        ),
      ].join('; ');
      warnings.push(
        `🌐 Entidade(s) internacional(is) detectada(s) sem CNPJ: ${names} (${labels}). Conexoes internacionais exigem comprovacao documental (registro estrangeiro, socio comum com CPF, ou fonte oficial com URL). Se nao houver evidencia concreta, a conexao e INFERIDA e nao deve ser tratada como fato.`,
      );
    }
  } catch (err) {
    warnings.push(
      `⚠️ Validação CNPJ: erro ao processar CNPJs gerados: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { text: generatedText, warnings };
}

export function useDossierWaterfallOrchestrator(options: Partial<UseDossierWaterfallOrchestratorOptions> = {}) {
  const chatStore = useMaybeChatStore();
  const canUseLookup = options.canUseLookup ?? false;
  const resolvedOperatorName = requireDependency(options.resolvedOperatorName, 'resolvedOperatorName');
  const updateSessionById = requireDependency(
    options.updateSessionById ?? chatStore?.updateSessionById,
    'updateSessionById',
  );
  const resetLoadingProgress = requireDependency(
    options.resetLoadingProgress ?? chatStore?.resetLoadingProgress,
    'resetLoadingProgress',
  );
  const advanceLoadingProgress = requireDependency(
    options.advanceLoadingProgress ?? chatStore?.advanceLoadingProgress,
    'advanceLoadingProgress',
  );
  const replaceLoadingProgressStage = requireDependency(
    options.replaceLoadingProgressStage ?? chatStore?.replaceLoadingProgressStage,
    'replaceLoadingProgressStage',
  );
  const completeLoadingProgress = requireDependency(
    options.completeLoadingProgress ?? chatStore?.completeLoadingProgress,
    'completeLoadingProgress',
  );
  const setFailureCount = requireDependency(options.setFailureCount ?? chatStore?.setFailureCount, 'setFailureCount');
  const setIsLoading = options.setIsLoading ?? chatStore?.setIsLoading;
  const setLoadingVariant = options.setLoadingVariant ?? chatStore?.setLoadingVariant;
  const activeGenerationRef = options.activeGenerationRef ?? chatStore?.activeGenerationRef;
  const outputModeRef = useRef<OutputMode | null>(null);

  const runMegaPromptWaterfall = useCallback(
    async ({
      sessionId,
      text,
      safeVisibleText,
      hintedCompany,
      normalizedCompany,
      historyToPass,
      botMessageId,
      signal,
      isFirstInteraction,
      sessionCnpjDigits,
      operatorId: waterfallOperatorId,
      operatorEmail: waterfallOperatorEmail,
      operatorSessionId: waterfallOperatorSessionId,
    }: RunMegaPromptWaterfallArgs) => {
      outputModeRef.current = null; // reset stale state before each attempt
      const guardCheck = registerWaterfallStart(sessionId);
      if (!guardCheck.allowed) {
        scoutDiag.warn('WaterfallGuard', 'waterfall bloqueado por floodgate; abortando execução', {
          sessionId,
          reason: guardCheck.reason,
          guard: guardCheck.guard,
        });
        updateSessionById(sessionId, session => ({
          ...session,
          messages: session.messages.filter(message => message.id !== botMessageId),
        }));
        resetLoadingProgress(); // limpa spinner preso (BUG-1: floodgate bloqueou sem cleanup)
        return;
      }
      const waterfallRunId = guardCheck.runId;
      let waterfallEndStatus: 'completed' | 'failed' = 'failed';
      let foundationCacheName: string | undefined;
      let sessionToPersist: ChatSession | null = null;

      try {
        let accumulatedText = '';
        let previousStageCompleted = false;
        const optionalStepFailures = new Set<string>();
        const dossierSeedContext = buildDossierSeedContext(text);
        const resolvedMegaCompany = normalizedCompany || hintedCompany || '';
        const lookupTarget = canUseLookup ? resolvedMegaCompany : '';
        let waterfallLookupContext = '';
        let waterfallClienteSeniorData: ClienteSeniorData | undefined;
        const waterfallGroundingSources: VerifiedSource[] = [];
        const waterfallVerificationStatuses = new Map<string, WebVerificationStatus>();

        let sessionSourcePool: DossierSourceRef[] = [];

        const appendGroundingSources = (sources: VerifiedSource[], moduleName = '') => {
          for (const source of sources) {
            const normalizedUrl = source.url?.trim().replace(/\/+$/, '');
            if (!normalizedUrl) continue;
            if (!waterfallGroundingSources.some(item => item.url.trim().replace(/\/+$/, '') === normalizedUrl)) {
              waterfallGroundingSources.push({
                title: source.title || source.url,
                url: normalizedUrl,
                verification: source.verification || 'grounding',
              });
            }
          }
          sessionSourcePool = mergeDossierSourceRefs(
            sessionSourcePool,
            verifiedSourcesToPool(sources, moduleName || undefined),
          );
        };

        const rememberVerificationStatus = (status: WebVerificationStatus, moduleName: string) => {
          waterfallVerificationStatuses.set(moduleName, status);
        };

        // Helper para racear uma promise contra AbortSignal
        const withAbortSignal = <T>(promise: Promise<T>, sig?: AbortSignal): Promise<T> => {
          if (!sig) return promise;
          if (sig.aborted) return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
          return new Promise<T>((resolve, reject) => {
            const onAbort = () => reject(new DOMException('The operation was aborted', 'AbortError'));
            sig.addEventListener('abort', onAbort, { once: true });
            promise.then(
              v => {
                sig.removeEventListener('abort', onAbort);
                resolve(v);
              },
              e => {
                sig.removeEventListener('abort', onAbort);
                reject(e);
              },
            );
          });
        };

        const assertNotAborted = () => {
          if (signal.aborted) {
            throw new DOMException('The operation was aborted', 'AbortError');
          }
        };

        if (lookupTarget) {
          try {
            const clienteData = await withAbortSignal(lookupCliente(lookupTarget), signal);
            waterfallLookupContext = formatarParaPrompt(clienteData);
            waterfallClienteSeniorData = extractClienteSeniorData(clienteData);
          } catch (error) {
            if (isAbortLikeError(error)) throw error;
            scoutDiag.warn('ModularDossier', 'lookup cliente senior falhou antes da orquestração', {
              sessionId,
              company: lookupTarget,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const seniorEvidenceContext = buildSeniorEvidenceContext(
          resolvedMegaCompany || waterfallClienteSeniorData?.grupo || 'empresa analisada',
          waterfallClienteSeniorData,
        );
        const teiaResearchContext = await buildTeiaResearchContext({
          company: resolvedMegaCompany || waterfallClienteSeniorData?.grupo || 'empresa analisada',
          sessionCnpjDigits,
          signal,
        });
        assertNotAborted();

        const staticDossierContext = buildStaticDossierContext({
          dossierSeedContext,
          waterfallLookupContext,
          seniorEvidenceContext,
          teiaResearchText: teiaResearchContext.text,
        });

        if (isFoundationCacheEnabled()) {
          try {
            foundationCacheName = await createWaterfallFoundationCache({
              foundationBlock: SHARED_FOUNDATION_BLOCK,
              staticContext: staticDossierContext,
              signal,
            });
            assertNotAborted();
          } catch (error) {
            if (isAbortLikeError(error)) throw error;
            scoutDiag.warn('ModularDossier', 'falha ao criar foundation cache; continuando sem cache', {
              sessionId,
              company: resolvedMegaCompany || null,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // === EVIDENCE PIPELINE V2: Query Planner + Collector (PR #407) ===
        let evidencePack: EvidencePack | null = null;
        let modeDecision: OutputModeDecision | null = null;
        let evidencePackText = '';
        if (isEvidencePipelineV2()) {
          try {
            const { buildEntityResolutionFromContext, planQueries, executeQueryPlan } =
              await import('../../services/llm/query-planner');

            const entity = buildEntityResolutionFromContext({
              cnpj: sessionCnpjDigits,
              razaoSocial: resolvedMegaCompany || void 0,
              cnaePrincipal: '',
              clienteSeniorData: waterfallClienteSeniorData
                ? { encontrado: true, totalModulos: waterfallClienteSeniorData.totalModulos }
                : void 0,
              estadoOperacao: [],
            });

            const callLLM = async (prompt: string): Promise<string> => {
              // Checa se usuário cancelou antes de invocar Gemini
              if (signal?.aborted) throw new Error('Aborted');
              const { sendMessageToGemini } = await import('../../services/llmService');
              // Timeout de 60s como fallback (Gemini pode travar sem AbortError)
              const ctrl = new AbortController();
              const timeoutId = setTimeout(() => ctrl.abort(), 60_000);
              const onExternalAbort = () => ctrl.abort();
              signal?.addEventListener('abort', onExternalAbort, { once: true });
              try {
                const result = await sendMessageToGemini(
                  prompt,
                  [],
                  QUERY_PLANNER_SYSTEM_PROMPT,
                  { useGrounding: false, useOpenWebSearch: false, maxOutputTokens: 16384, signal: ctrl.signal },
                  false,
                );
                return result.text || '';
              } finally {
                clearTimeout(timeoutId);
                signal?.removeEventListener('abort', onExternalAbort);
              }
            };

            assertNotAborted();
            const plan = await withAbortSignal(planQueries(entity, callLLM), signal);
            assertNotAborted();
            evidencePack = await withAbortSignal(executeQueryPlan(plan, signal), signal);

            // Compute OutputMode from confidence profile (defensive: null-safe)
            if (evidencePack?.confidenceProfile) {
              modeDecision = selectOutputMode(evidencePack.confidenceProfile);
              outputModeRef.current = modeDecision.mode;
              scoutDiag.info('PipelineV2', 'OutputMode selecionado', {
                sessionId,
                runId: waterfallRunId,
                mode: modeDecision.mode,
                rationale: modeDecision.rationale,
                tierACount: evidencePack.confidenceProfile.tierACount,
                tierBCount: evidencePack.confidenceProfile.tierBCount,
                moduleCount: evidencePack.confidenceProfile.modulesCovered.length,
              });
            } else {
              scoutDiag.warn('PipelineV2', 'OutputMode NULO — fallback implícito', {
                sessionId,
                runId: waterfallRunId,
                reason: 'confidenceProfile ausente — selectOutputMode não executado',
              });
            }

            // Memoize evidence pack text once per waterfall run
            evidencePackText = evidencePack ? formatEvidencePackForPrompt(evidencePack) : '';

            scoutDiag.info('PipelineV2', 'planner+collector concluído', {
              sessionId,
              company: entity.razaoSocial,
              cnpj: entity.cnpjRaiz || null,
              segmento: entity.segmentoInferido,
              queries: plan.queries.length,
              items: evidencePack.items.length,
              tierAB: evidencePack.confidenceProfile.tierACount + evidencePack.confidenceProfile.tierBCount,
              modules: evidencePack.confidenceProfile.modulesCovered.length,
              outputMode: modeDecision?.mode,
              outputRationale: modeDecision?.rationale,
            });
          } catch (err) {
            if (isAbortLikeError(err)) throw err;
            outputModeRef.current = null; // reset on V2 fallback
            console.error('[PipelineV2:FATAL]', err);
            scoutDiag.warn('PipelineV2', 'Fallback v1 (planner/collector falhou)', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            });
          }
        }

        const buildModuleExtraContext = (accumulatedTextSnapshot: string, contextHint = '') => {
          const dynamicContext = buildDynamicDossierContext(
            contextHint,
            accumulatedTextSnapshot,
            WATERFALL_CONTEXT_WINDOW_CHARS,
          );
          const sourcesBlock = formatAvailableSourcesForPrompt(sessionSourcePool);
          if (foundationCacheName) return `${dynamicContext}${sourcesBlock}`;
          return `${joinDossierExtraContext(staticDossierContext, dynamicContext)}${sourcesBlock}`;
        };

        const sharedDossierModuleOptions = {
          useGrounding: false,
          onGroundingSources: appendGroundingSources,
          onVerificationStatus: rememberVerificationStatus,
          ...(foundationCacheName ? { foundationCacheName } : {}),
          // Cost tracking (via message-orchestrator args + sessionStorage fallback)
          operatorId: waterfallOperatorId,
          operatorEmail: waterfallOperatorEmail,
          operatorSessionId:
            waterfallOperatorSessionId ||
            (typeof window !== 'undefined'
              ? (window.sessionStorage?.getItem('scout:current_session_id') ?? undefined)
              : undefined),
          sessionId,
          companyCnpj: sessionCnpjDigits || undefined,
          companyName: resolvedMegaCompany || undefined,
        };

        const appendWaterfallChunk = (chunk: string) => {
          const normalizedChunk = chunk.trim();
          if (!normalizedChunk) return;
          accumulatedText += (accumulatedText ? '\n\n---\n\n' : '') + normalizedChunk;
        };

        const useV2 = isEvidencePipelineV2() && evidencePack !== null;
        const modules: DossierWaterfallModule[] = [
          {
            name: 'Porte / Teia Societária',
            prompt: useV2 ? PROMPT_RADAR_EXPANSAO_GOD_MODE_V2 : PROMPT_RADAR_EXPANSAO_GOD_MODE,
            stage: MODULAR_DOSSIER_STAGES[0],
            optional: false,
            timeoutMs: MODULAR_REQUIRED_STEP_TIMEOUT_MS,
          },
          {
            name: 'Operação / Cadeia de Valor',
            prompt: useV2 ? PROMPT_RAIO_X_OPERACIONAL_ATAQUE_V2 : PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
            stage: MODULAR_DOSSIER_STAGES[1],
            optional: false,
            timeoutMs: MODULAR_REQUIRED_STEP_TIMEOUT_MS,
          },
          {
            name: 'Bordas de Controle',
            prompt: useV2 ? PROMPT_TECH_STACK_GOD_MODE_ATAQUE_V2 : PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
            stage: MODULAR_DOSSIER_STAGES[2],
            optional: true,
            timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
          },
          {
            name: 'Riscos & Compliance',
            prompt: useV2 ? PROMPT_RISCOS_COMPLIANCE_GOD_MODE_V2 : PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
            stage: MODULAR_DOSSIER_STAGES[3],
            optional: true,
            timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
          },
          {
            name: 'Caminho de Venda',
            prompt: useV2 ? PROMPT_CAMINHO_DE_VENDA_V2 : PROMPT_CAMINHO_DE_VENDA,
            stage: MODULAR_DOSSIER_STAGES[4],
            optional: true,
            timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
          },
        ];

        const modulesByName = new Map(modules.map(module => [module.name, module]));
        const runWaterfallModule: RunWaterfallModule = async (
          module,
          accumulatedTextSnapshot,
          contextHint = '',
          timeoutMs = module.timeoutMs,
        ) => {
          const effectivePrompt =
            useV2 && evidencePack
              ? module.prompt.replace('{EVIDENCE_PACK_INJECTED_HERE}', evidencePackText)
              : module.prompt;
          return generateDossierModule(
            module.name,
            resolvedMegaCompany || 'Empresa',
            SHARED_FOUNDATION_BLOCK,
            effectivePrompt,
            buildModuleExtraContext(accumulatedTextSnapshot, contextHint),
            {
              signal,
              timeoutMs,
              ...(useV2 ? { temperature: 0.1 } : {}),
              ...sharedDossierModuleOptions,
            },
          );
        };

        const runTeiaSocietariaOrchestration = async (): Promise<string> => {
          let identityResult: string;

          try {
            const identityStart = performance.now();
            const teiaIdentityPrompt = useV2 ? PROMPT_TEIA_IDENTITY_MODULE_V2 : PROMPT_TEIA_IDENTITY_MODULE;
            const effectiveTeiaPrompt =
              useV2 && evidencePack
                ? teiaIdentityPrompt.replace('{EVIDENCE_PACK_INJECTED_HERE}', evidencePackText)
                : teiaIdentityPrompt;
            identityResult = await generateDossierModule(
              'Teia Societaria — Identidade',
              resolvedMegaCompany || 'Empresa',
              SHARED_FOUNDATION_BLOCK,
              effectiveTeiaPrompt,
              buildModuleExtraContext(accumulatedText),
              {
                signal,
                timeoutMs: MODULAR_REQUIRED_STEP_TIMEOUT_MS,
                temperature: 0.1,
                ...sharedDossierModuleOptions,
              },
            );
            const identityElapsed = performance.now() - identityStart;
            scoutDiag.info('Waterfall', 'module:complete', {
              module: 'Teia Societaria — Identidade',
              elapsedMs: identityElapsed,
            });
            if (identityElapsed > 60_000) {
              scoutDiag.warn('Waterfall', 'module:deadline', {
                module: 'Teia Societaria — Identidade',
                elapsedMs: identityElapsed,
              });
            }
          } catch (identityError) {
            if (isAbortLikeError(identityError)) throw identityError;

            scoutDiag.warn('ModularDossier', 'modulo 1a (teia identity) falhou, usando fallback', {
              sessionId,
              company: resolvedMegaCompany || null,
              error: identityError instanceof Error ? identityError.message : String(identityError),
            });

            const fallbackResult = await runWaterfallModule(modules[FIRST_MODULE_INDEX], accumulatedText);
            return fallbackResult;
          }

          const allMatches = [...identityResult.matchAll(/\[\[TEIA_COMPLEXIDADE:(BAIXA|MEDIA|ALTA)\]\]/gi)];
          const detectedLevels = allMatches.map(m => m[1]?.toUpperCase()).filter(Boolean) as Array<
            'BAIXA' | 'MEDIA' | 'ALTA'
          >;

          let complexity: TeiaComplexity = detectedLevels.includes('ALTA')
            ? 'ALTA'
            : detectedLevels.includes('MEDIA')
              ? 'MEDIA'
              : detectedLevels.includes('BAIXA')
                ? 'BAIXA'
                : 'BAIXA';

          if (detectedLevels.length === 0) {
            scoutDiag.warn('TeiaSocietaria', 'marcador de complexidade ausente na saida do modulo 1a — usando BAIXA', {
              sessionId,
              company: resolvedMegaCompany || null,
              objectiveComplexity: teiaResearchContext.objectiveComplexity,
            });
          } else if (detectedLevels.length > 1) {
            scoutDiag.warn('TeiaSocietaria', 'multiplos marcadores de complexidade detectados', {
              sessionId,
              company: resolvedMegaCompany || null,
              detectedLevels,
              chosen: complexity,
            });
          }

          if (teiaResearchContext.objectiveComplexity && (detectedLevels.length === 0 || complexity === 'BAIXA')) {
            complexity = teiaResearchContext.objectiveComplexity;
            scoutDiag.warn('TeiaSocietaria', 'complexidade ajustada por evidencia objetiva da teia', {
              sessionId,
              company: resolvedMegaCompany || null,
              detectedLevels,
              chosen: complexity,
            });
          }

          const strippedIdentity = identityResult.replace(/\[\[TEIA_COMPLEXIDADE:(BAIXA|MEDIA|ALTA)\]\]/gi, '').trim();

          advanceLoadingProgress(MODULAR_DOSSIER_STAGES[1], MODULAR_DOSSIER_TOTAL_STAGES);

          let combinedTeiaText = strippedIdentity;

          if (complexity === 'MEDIA' || complexity === 'ALTA') {
            try {
              const deepStart = performance.now();
              const deepResult = await generateDossierModule(
                'Teia Societaria — Profundidade',
                resolvedMegaCompany || 'Empresa',
                SHARED_FOUNDATION_BLOCK,
                PROMPT_TEIA_DEEP_MODULE,
                useV2 && evidencePackText
                  ? buildModuleExtraContext(combinedTeiaText) + '\n\n' + evidencePackText
                  : buildModuleExtraContext(combinedTeiaText),
                {
                  signal,
                  timeoutMs: MODULAR_REQUIRED_STEP_TIMEOUT_MS,
                  temperature: 0.1,
                  ...sharedDossierModuleOptions,
                },
              );
              const deepElapsed = performance.now() - deepStart;
              scoutDiag.info('Waterfall', 'module:complete', {
                module: 'Teia Societaria — Profundidade',
                elapsedMs: deepElapsed,
              });
              if (deepElapsed > 60_000) {
                scoutDiag.warn('Waterfall', 'module:deadline', {
                  module: 'Teia Societaria — Profundidade',
                  elapsedMs: deepElapsed,
                });
              }
              combinedTeiaText += '\n\n---\n\n' + deepResult;
              advanceLoadingProgress(MODULAR_DOSSIER_STAGES[2], MODULAR_DOSSIER_TOTAL_STAGES);
            } catch (deepError) {
              if (isAbortLikeError(deepError)) throw deepError;
              optionalStepFailures.add('Teia Societaria — Profundidade');
              setFailureCount(count => count + 1);
              scoutDiag.warn('ModularDossier', 'modulo 1b (teia deep) falhou', {
                sessionId,
                company: resolvedMegaCompany || null,
                error: deepError instanceof Error ? deepError.message : String(deepError),
              });
            }
          }

          const { text: validatedText, warnings } = validateTeiaCnpjsOutput(
            combinedTeiaText,
            [waterfallLookupContext, dossierSeedContext, teiaResearchContext.text].join('\n'),
          );

          for (const warning of warnings) {
            scoutDiag.warn('TeiaSocietaria', 'CNPJ validation warning', {
              sessionId,
              company: resolvedMegaCompany || null,
              warning,
            });
          }

          return validatedText;
        };

        if (isFirstInteraction) {
          resetLoadingProgress(modules[FIRST_MODULE_INDEX].stage, MODULAR_DOSSIER_TOTAL_STAGES);
        } else {
          resetLoadingProgress(modules[FIRST_MODULE_INDEX].stage, MODULAR_DOSSIER_TOTAL_STAGES, {
            incremental: true,
            keepHistory: 4,
          });
        }

        for (let index = 0; index < modules.length; index += 1) {
          assertNotAborted();

          const module = modules[index];
          if (index > 0) {
            if (previousStageCompleted) {
              advanceLoadingProgress(module.stage, MODULAR_DOSSIER_TOTAL_STAGES);
            } else {
              replaceLoadingProgressStage(module.stage, MODULAR_DOSSIER_TOTAL_STAGES);
            }
          }

          try {
            let moduleResult: string;
            if (index === FIRST_MODULE_INDEX) {
              moduleResult = await runTeiaSocietariaOrchestration();
            } else {
              const modStart = performance.now();
              moduleResult = await runWaterfallModule(module, accumulatedText);
              const modElapsed = performance.now() - modStart;
              scoutDiag.info('Waterfall', 'module:complete', { module: module.name, elapsedMs: modElapsed });
              if (modElapsed > 60_000) {
                scoutDiag.warn('Waterfall', 'module:deadline', { module: module.name, elapsedMs: modElapsed });
              }
            }
            appendWaterfallChunk(moduleResult);
            assertNotAborted();
            optionalStepFailures.delete(module.name);
            previousStageCompleted = true;
            setFailureCount(0);
          } catch (error) {
            if (isAbortLikeError(error)) throw error;
            if (!module.optional) throw error;

            previousStageCompleted = false;
            optionalStepFailures.add(module.name);
            setFailureCount(count => count + 1);
            scoutDiag.warn('ModularDossier', 'módulo opcional falhou e será ignorado', {
              sessionId,
              company: resolvedMegaCompany || null,
              moduleName: module.name,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        assertNotAborted();
        if (previousStageCompleted) {
          advanceLoadingProgress(MODULAR_DOSSIER_STAGES[5], MODULAR_DOSSIER_TOTAL_STAGES);
        } else {
          replaceLoadingProgressStage(MODULAR_DOSSIER_STAGES[5], MODULAR_DOSSIER_TOTAL_STAGES);
        }

        scoutDiag.info('WaterfallLifecycle', 'pre-benchmark', { sessionId, waterfallRunId });
        const benchmarkCompleted = await runDossierBenchmarkStage({
          sessionId,
          company: resolvedMegaCompany,
          signal,
          appendWaterfallChunk,
          optionalStepFailures,
          setFailureCount,
        });
        assertNotAborted();
        scoutDiag.info('WaterfallLifecycle', 'pos-benchmark', { sessionId, waterfallRunId, benchmarkCompleted });

        if (benchmarkCompleted) {
          advanceLoadingProgress(MODULAR_DOSSIER_STAGES[6], MODULAR_DOSSIER_TOTAL_STAGES);
        } else {
          replaceLoadingProgressStage(MODULAR_DOSSIER_STAGES[6], MODULAR_DOSSIER_TOTAL_STAGES);
        }

        const PORTA_RECONCILIATION_TIMEOUT_MS = 120_000;

        let reconciledText: string = accumulatedText;
        let waterfallPortaResolution: PortaScoreResolution | null = null;
        let portaIntegrityHold = false;
        let portaTimeoutId: ReturnType<typeof setTimeout> | undefined;

        replaceLoadingProgressStage(MODULAR_DOSSIER_CONSOLIDATION_STAGE, MODULAR_DOSSIER_TOTAL_STAGES);

        scoutDiag.info('WaterfallLifecycle', 'pre-porta-reconciliation', { sessionId, waterfallRunId });
        try {
          const result = await Promise.race([
            reconcileWaterfallPorta({
              sessionId,
              signal,
              resolvedMegaCompany,
              sessionCnpjDigits,
              dossierSeedContext,
              waterfallLookupContext,
              seniorEvidenceContext,
              staticDossierContext,
              foundationCacheName,
              accumulatedText,
              modulesByName,
              runWaterfallModule,
              optionalStepFailures,
              setFailureCount,
            }),
            new Promise<never>((_, reject) => {
              portaTimeoutId = setTimeout(
                () => reject(new Error('PORTA reconciliation timeout')),
                PORTA_RECONCILIATION_TIMEOUT_MS,
              );
            }),
          ]);
          assertNotAborted();
          reconciledText = result.accumulatedText;
          waterfallPortaResolution = result.resolution;
          portaIntegrityHold = result.portaIntegrityHold;
        } catch (error) {
          if (signal?.aborted) throw error;
          scoutDiag.warn(
            'ModularDossier',
            'reconcileWaterfallPorta falhou ou timeout; continuando com texto acumulado',
            {
              sessionId,
              error: error instanceof Error ? error.message : String(error),
            },
          );
          optionalStepFailures.add('porta-reconciliation');
          setFailureCount((prev: number) => prev + 1);
          portaIntegrityHold = true;
        } finally {
          if (portaTimeoutId) clearTimeout(portaTimeoutId);
        }
        scoutDiag.info('WaterfallLifecycle', 'pos-porta-reconciliation', { sessionId, waterfallRunId });
        accumulatedText = reconciledText;
        assertNotAborted();

        if (optionalStepFailures.size > 0) {
          appendWaterfallChunk(
            `⚠️ Nota operacional: algumas frentes não puderam ser concluídas nesta rodada (${Array.from(optionalStepFailures).join(', ')}). O dossiê abaixo foi consolidado com o material validado disponível.`,
          );
        } else {
          setFailureCount(0);
        }

        const waterfallScorePorta =
          portaIntegrityHold || !waterfallPortaResolution
            ? null
            : ensureWaterfallScorePorta(accumulatedText, waterfallPortaResolution);
        const waterfallCleanText = stripPortaMarkers(accumulatedText).trim();
        const waterfallConstrainedText = sanitizeSensitivePersonalData(
          enforceSeniorEvidenceConstraints(
            waterfallCleanText,
            resolvedMegaCompany || waterfallClienteSeniorData?.grupo || 'empresa analisada',
            waterfallClienteSeniorData,
          ),
        );
        const waterfallNarrativeBase = appendSeniorEvidenceNote(
          waterfallConstrainedText,
          resolvedMegaCompany || waterfallClienteSeniorData?.grupo || 'empresa analisada',
          waterfallClienteSeniorData,
        );
        let waterfallPrepared = waterfallNarrativeBase;
        scoutDiag.info('FreezeDiag', 'pre-validate-inline', {
          sessionId,
          waterfallRunId,
          textLength: waterfallPrepared.length,
          groundingSourcesCount: waterfallGroundingSources.length,
          nonBlocking: true,
        });

        // Camada 3: módulo opcional — não bloqueia finalize do dossiê (fire-and-forget).
        void validateInlineSourcesForPromotion(waterfallPrepared, waterfallGroundingSources, {
          sessionId,
          runId: waterfallRunId,
          waterfallEndStatus: null,
        })
          .then(promotedInlineSources => {
            if (promotedInlineSources.length === 0) return;
            appendGroundingSources(promotedInlineSources, 'Promoção inline');
            updateSessionById(sessionId, session => ({
              ...session,
              messages: session.messages.map(message =>
                message.id === botMessageId
                  ? {
                      ...message,
                      groundingSources: (() => {
                        const existing = message.groundingSources ?? [];
                        const merged = [...existing];
                        for (const source of promotedInlineSources) {
                          const normalizedUrl = source.url?.trim().replace(/\/+$/, '');
                          if (!normalizedUrl) continue;
                          if (!merged.some(item => item.url.trim().replace(/\/+$/, '') === normalizedUrl)) {
                            merged.push({
                              title: source.title || source.url,
                              url: normalizedUrl,
                              verification: source.verification || 'grounding',
                            });
                          }
                        }
                        return merged;
                      })(),
                    }
                  : message,
              ),
            }));
            scoutDiag.info('InlineValidation', 'retroactive-promotion', {
              sessionId,
              runId: waterfallRunId,
              promotedCount: promotedInlineSources.length,
            });
          })
          .catch(err => {
            scoutDiag.warn('InlineValidation', 'fire-and-forget falhou', {
              sessionId,
              runId: waterfallRunId,
              error: err instanceof Error ? err.message : String(err),
            });
          });

        scoutDiag.info('FreezeDiag', 'post-validate-inline', {
          sessionId,
          waterfallRunId,
          promotedCount: 0,
          nonBlocking: true,
          deferred: true,
        });
        assertNotAborted();

        if (sessionSourcePool.length === 0 && waterfallGroundingSources.length === 0) {
          waterfallPrepared = `${waterfallPrepared}\n\n> ⚠️ **Busca web/grounding indisponível nesta rodada.** Citações limitadas — links inventados foram removidos na consolidação.`;
        }

        scoutDiag.info('FreezeDiag', 'pre-finalize-markdown', {
          sessionId,
          waterfallRunId,
          textLength: waterfallPrepared.length,
          groundingSourcesCount: waterfallGroundingSources.length,
          poolSize: sessionSourcePool.length,
        });
        const finalized = finalizeDossierMarkdown(
          waterfallPrepared,
          waterfallGroundingSources,
          sessionSourcePool,
          modeDecision?.mode ?? undefined,
        );
        scoutDiag.info('FreezeDiag', 'post-finalize-markdown', {
          sessionId,
          waterfallRunId,
          resultLength: finalized.text?.length ?? 0,
          auditableSourcesCount: finalized.auditableSources?.length ?? 0,
        });
        const waterfallFinalText =
          finalized.text ||
          accumulatedText ||
          `Dossiê de ${resolvedMegaCompany || 'empresa'} não pôde ser gerado. Tente novamente.`;
        const hasFallbackVerified =
          Array.from(waterfallVerificationStatuses.values()).some(status => status === 'fallback_verified') ||
          waterfallGroundingSources.some(source => source.verification === 'fallback');
        const hasUnverified = Array.from(waterfallVerificationStatuses.values()).some(
          status => status === 'unverified',
        );
        const webVerificationStatus: WebVerificationStatus =
          waterfallGroundingSources.length > 0
            ? hasFallbackVerified
              ? 'fallback_verified'
              : 'verified'
            : hasUnverified
              ? 'unverified'
              : 'not_applicable';

        let waterfallSuggestions: string[] = [];
        const CONTINUITY_QUESTION_TIMEOUT_MS = 20_000;
        scoutDiag.info('FreezeDiag', 'pre-continuity-question-ready', {
          sessionId,
          waterfallRunId,
          finalTextLength: waterfallFinalText.length,
          hasGroundingSources: waterfallGroundingSources.length > 0,
          webVerificationStatus,
        });
        scoutDiag.info('WaterfallLifecycle', 'pre-continuity-question', { sessionId, waterfallRunId });
        let continuityTimedOut = false;
        try {
          const continuityController = new AbortController();
          const forwardContinuityAbort = () => continuityController.abort();
          let continuityTimeoutId: ReturnType<typeof setTimeout> | undefined;
          if (signal.aborted) {
            continuityController.abort();
          } else {
            signal.addEventListener('abort', forwardContinuityAbort, { once: true });
          }

          try {
            const continuityPromise = generateContinuityQuestion(
              [
                ...historyToPass,
                {
                  id: uuidv4(),
                  sender: Sender.User,
                  text: safeVisibleText,
                  timestamp: new Date(),
                },
                {
                  id: uuidv4(),
                  sender: Sender.Bot,
                  text: waterfallFinalText,
                  timestamp: new Date(),
                  clienteSeniorData: waterfallClienteSeniorData,
                },
              ],
              resolvedMegaCompany || null,
              resolvedOperatorName,
              { signal: continuityController.signal },
            );

            void continuityPromise.catch(error => {
              if (!continuityTimedOut) return;
              scoutDiag.warn('ModularDossier', 'continuidade encerrou apos timeout local', {
                sessionId,
                company: resolvedMegaCompany || null,
                isAbortLike: isAbortLikeError(error),
                error: error instanceof Error ? error.message : String(error),
              });
            });

            const timeoutFallbackPromise = new Promise<string[]>(resolve => {
              continuityTimeoutId = setTimeout(() => {
                continuityTimedOut = true;
                continuityController.abort();
                scoutDiag.warn('ModularDossier', 'timeout nas sugestões finais do waterfall', {
                  sessionId,
                  company: resolvedMegaCompany || null,
                  timeoutMs: CONTINUITY_QUESTION_TIMEOUT_MS,
                });
                resolve([]);
              }, CONTINUITY_QUESTION_TIMEOUT_MS);
            });

            waterfallSuggestions = await Promise.race([continuityPromise, timeoutFallbackPromise]);
          } finally {
            if (continuityTimeoutId) clearTimeout(continuityTimeoutId);
            signal.removeEventListener('abort', forwardContinuityAbort);
          }
        } catch (error) {
          if (signal.aborted) throw error;
          scoutDiag.warn('ModularDossier', 'falha ao gerar sugestões finais do waterfall', {
            sessionId,
            company: resolvedMegaCompany || null,
            timedOut: continuityTimedOut,
            isAbortLike: isAbortLikeError(error),
            error: error instanceof Error ? error.message : String(error),
          });
        }
        scoutDiag.info('WaterfallLifecycle', 'pos-continuity-question', { sessionId, waterfallRunId });
        assertNotAborted();

        waterfallSuggestions = ensureContinuitySuggestions(
          waterfallSuggestions,
          resolvedMegaCompany || normalizedCompany || waterfallClienteSeniorData?.grupo || null,
          { contextText: waterfallFinalText },
        );

        replaceLoadingProgressStage(MODULAR_DOSSIER_CONSOLIDATION_STAGE, MODULAR_DOSSIER_TOTAL_STAGES);
        assertNotAborted();

        const generationStillActive = !activeGenerationRef || activeGenerationRef.current[sessionId] === botMessageId;
        if (!generationStillActive) {
          scoutDiag.warn('WaterfallLifecycle', 'generation-stopped-before-persist', {
            sessionId,
            botMessageId,
            activeBotId: activeGenerationRef?.current?.[sessionId] ?? 'undefined',
          });
          Sentry.captureMessage('Scout360 generation ref cleared before waterfall persist', {
            level: 'warning',
            tags: { area: 'generation-ref-cleared', session_id: sessionId },
            extra: {
              botMessageId,
              activeBotId: activeGenerationRef?.current?.[sessionId] ?? 'undefined',
            },
          });
          return;
        }

        sessionToPersist = null;
        let originalMsgCount = -1;

        const applyFinalBotMessage = (session: ChatSession): ChatSession => {
          originalMsgCount = session.messages?.length ?? 0;
          const finalCompany = normalizedCompany || session.empresaAlvo || pickCompanyLabel(session.title);
          return {
            ...session,
            updatedAt: new Date().toISOString(),
            empresaAlvo: finalCompany || session.empresaAlvo,
            scoreOportunidade: waterfallScorePorta?.score ?? session.scoreOportunidade,
            messages: session.messages.map(message =>
              message.id === botMessageId
                ? {
                    ...message,
                    text: waterfallFinalText,
                    scorePorta: waterfallScorePorta ?? undefined,
                    clienteSeniorData: waterfallClienteSeniorData || undefined,
                    groundingSources: waterfallGroundingSources.length ? waterfallGroundingSources : undefined,
                    webVerificationStatus,
                    groundingUsed:
                      webVerificationStatus === 'not_applicable'
                        ? undefined
                        : webVerificationStatus === 'verified' || webVerificationStatus === 'fallback_verified',
                    suggestions: waterfallSuggestions,
                    isThinking: false,
                    loadingVariant: undefined,
                    isError: false,
                    errorDetails: undefined,
                  }
                : message,
            ),
          };
        };

        const sessionsSnapshotBeforePersist = chatStore?.sessionsRef?.current ?? [];
        const baseSessionForPersist = sessionsSnapshotBeforePersist.find((s: ChatSession) => s.id === sessionId);
        if (baseSessionForPersist) {
          sessionToPersist = applyFinalBotMessage(baseSessionForPersist);
        }

        // BUG-7 v2: persistir ANTES de expor ~40k chars ao React state.
        if (sessionToPersist) {
          const dossier = sessionToPersist as ChatSession;
          scoutDiag.info('WaterfallLifecycle', 'pre-save-dossier', { sessionId, waterfallRunId });
          try {
            await storage.saveDossier(dossier);
            window.dispatchEvent(
              new CustomEvent('dossier:completed', {
                detail: {
                  dossierId: dossier.id,
                  companyName: resolvedMegaCompany || normalizedCompany || '',
                  cnpj: dossier.cnpj,
                },
              }),
            );
          } catch (error) {
            scoutDiag.warn('ModularDossier', 'falha ao persistir dossiê final; mantendo sessão em memória', {
              sessionId,
              company: resolvedMegaCompany || normalizedCompany || null,
              error: error instanceof Error ? error.message : String(error),
            });
            scoutDiag.warn('WaterfallLifecycle', 'dossier-completed-event-not-dispatched', {
              sessionId,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // BUG-8 v6: setSessions direto em vez de updateSessionById.
        // updateSessionById lê sessionsRef.current (sync só na render-phase) →
        // ref stale perde a sessão durante handoff do waterfall.
        // setSessions(func) opera no state real do Zustand — NUNCA falha.
        const snapshot =
          chatStore?.sessions?.find((s: ChatSession) => s.id === sessionId) ??
          chatStore?.sessionsRef?.current?.find((s: ChatSession) => s.id === sessionId);
        if (snapshot) {
          const built = applyFinalBotMessage(snapshot);
          chatStore?.setSessions?.((prev: ChatSession[]) => {
            const idx = prev.findIndex((s: ChatSession) => s.id === sessionId);
            if (idx === -1) return [built, ...prev];
            const next = [...prev];
            next[idx] = built;
            return next;
          });
          sessionToPersist = built;
        } else {
          Sentry.captureMessage('Scout360 waterfall session not found for persist', {
            level: 'warning',
            tags: { area: 'waterfall-session-persist', session_id: sessionId },
            extra: { botMessageId, waterfallRunId },
          });
        }
        await yieldBeforeHandoff();
        // finalizeWaterfallUI chamado UMA vez no finally block (~linha 1755).
        // v6 removeu pre-handoff-purge duplicado — uma chamada basta.

        waterfallEndStatus = 'completed';
      } finally {
        // Fire-and-forget: limpeza de cache não deve bloquear o retorno do waterfall.
        // Timeout de 15s com warning se a promise não resolver.
        if (foundationCacheName) {
          let cacheResolved = false;
          const cacheTimeoutId = setTimeout(() => {
            if (!cacheResolved) {
              scoutDiag.warn('ModularDossier', 'deleteWaterfallFoundationCache demorando mais de 15s', {
                cacheName: foundationCacheName,
              });
            }
          }, 15_000);

          deleteWaterfallFoundationCache(foundationCacheName)
            .then(() => {
              cacheResolved = true;
              clearTimeout(cacheTimeoutId);
            })
            .catch(() => {
              cacheResolved = true;
              clearTimeout(cacheTimeoutId);
              scoutDiag.warn('ModularDossier', 'deleteWaterfallFoundationCache falhou (fire-and-forget)', {
                cacheName: foundationCacheName,
              });
            });
        }

        scoutDiag.info('WaterfallLifecycle', 'pre-register-end', {
          sessionId,
          waterfallRunId,
          waterfallEndStatus,
          hasCacheName: Boolean(foundationCacheName),
        });
        registerWaterfallEnd(sessionId, waterfallRunId, waterfallEndStatus);
        scoutDiag.info('WaterfallLifecycle', 'pos-register-end', { sessionId, waterfallRunId });

        // Health-check final: snapshot completo do sistema pós-waterfall.
        // Se algo quebrou, este único log responde "o quê, onde, por quê".
        const healthSession =
          chatStore?.sessions?.find((s: ChatSession) => s.id === sessionId) ??
          chatStore?.sessionsRef?.current?.find((s: ChatSession) => s.id === sessionId);
        const healthBotMsg = healthSession?.messages?.find(
          (m: { id: string; sender: string }) => m.id === botMessageId,
        ) as { id: string; sender: string; isThinking?: boolean; text?: string } | undefined;
        scoutDiag.info('WaterfallLifecycle', 'health-check-final', {
          sessionId,
          waterfallRunId,
          waterfallEndStatus,
          sessionFoundInRef: Boolean(healthSession),
          sessionMsgCount: healthSession?.messages?.length ?? -1,
          botMsgFound: Boolean(healthBotMsg),
          botMsgTextLen: typeof healthBotMsg?.text === 'string' ? healthBotMsg.text.length : -1,
          botMsgIsThinking: Boolean(healthBotMsg?.isThinking),
          isLoading: chatStore?.isLoading ?? 'unknown',
          loadingVariant: chatStore?.loadingVariant ?? 'unknown',
          domBodyLen: typeof document !== 'undefined' ? (document.body?.textContent?.length ?? 0) : -1,
          domHasBotContent:
            typeof document !== 'undefined'
              ? Boolean(document.querySelector('[data-testid="bot-message-content"]'))
              : false,
          domHasLoadingOverlay:
            typeof document !== 'undefined'
              ? Boolean(document.querySelector('[data-testid="loading-smart-overlay"]'))
              : false,
          domComposerDisabled:
            typeof document !== 'undefined'
              ? ((
                  document.querySelector('[data-testid="chat-input"], [data-testid="composer-input"]') as
                    | HTMLInputElement
                    | HTMLTextAreaElement
                    | null
                )?.disabled ?? false)
              : false,
          dossierWasPersisted: sessionToPersist !== null,
          cacheWasCleaned: foundationCacheName !== null,
        });

        // ── Hard invariant: waterfall terminou → zera TODOS os estados de loading ──
        // finalizeWaterfallUI limpa atomicamente: isLoading, loadingVariant,
        // loadingProgress, failureCount, activeGeneration, abortController,
        // e overlay DOM. PR #334/#335 corrigiram só o overlay — persistiam
        // "Preparando investigação...", "Gerando resposta...", Interromper.
        const botMsgTextLen = typeof healthBotMsg?.text === 'string' ? healthBotMsg.text.length : -1;

        finalizeWaterfallUI({
          store: {
            setIsLoading,
            setLoadingVariant,
            completeLoadingProgress,
            setFailureCount,
            activeGenerationRef,
          },
          sessionId,
          reason: `waterfall:${waterfallEndStatus}`,
          waterfallEndStatus,
          botMsgTextLen,
          log: (area, event, payload) => scoutDiag.info(area, event, payload),
        });
        scoutDiag.info('WaterfallLifecycle', 'ui-finalized', {
          sessionId,
          waterfallRunId,
          waterfallEndStatus,
          botMsgTextLen,
        });
      }
    },
    [
      advanceLoadingProgress,
      canUseLookup,
      activeGenerationRef,
      completeLoadingProgress,
      replaceLoadingProgressStage,
      resetLoadingProgress,
      resolvedOperatorName,
      setFailureCount,
      setIsLoading,
      setLoadingVariant,
      updateSessionById,
    ],
  );

  return { runMegaPromptWaterfall, outputModeRef };
}
