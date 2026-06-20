import { useCallback, type Dispatch, type SetStateAction } from 'react';
import * as Sentry from '@sentry/react';
import { v4 as uuidv4 } from 'uuid';
import { registerWaterfallStart, registerWaterfallEnd } from './waterfall-guard';
import { MODULAR_DOSSIER_CONSOLIDATION_STAGE, MODULAR_DOSSIER_STAGES } from '../../constants/loadingStages';
import { APP_VERSION } from '../../constants';
import {
  PROMPT_CAMINHO_DE_VENDA,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_TEIA_IDENTITY_MODULE,
  PROMPT_TEIA_DEEP_MODULE,
  PROMPT_VERSION,
  SHARED_FOUNDATION_BLOCK,
} from '../../prompts/megaPrompts';
import { generateContinuityQuestion, generateDossierModule } from '../../services/geminiService';
import {
  buildDynamicDossierContext,
  buildStaticDossierContext,
  createWaterfallFoundationCache,
  deleteWaterfallFoundationCache,
  isFoundationCacheEnabled,
  joinDossierExtraContext,
} from '../../services/gemini/foundation-cache';
import { formatarParaPrompt, lookupCliente } from '../../services/clientLookupService';
import { getContextoConcorrentesRegionais } from '../../services/competitorService';
import { generatePortaContextForDeepDive } from '../../services/portaStateService';
import { fetchCompanyByCnpj } from '../../services/brasilApiService';
import { storage } from '../../services/storage';
import { useMaybeChatStore } from '../../stores/chatStore';
import { type ChatSession, type ClienteSeniorData, Sender, type WebVerificationStatus } from '../../types';
import { scoutDiag } from '../../utils/diagnosticLog';
import { finalizeWaterfallUI } from '../../utils/finalizeWaterfallUI';
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
import { isAbortLikeError } from '../../utils/abortHelpers';
import { ensureContinuitySuggestions, pickCompanyLabel } from '../../utils/messageHelpers';
import { runDossierBenchmarkStage } from './benchmark-stage';
import type { PortaScoreResolution } from '../../utils/porta';
import {
  ensureWaterfallScorePorta,
  reconcileWaterfallPorta,
  type DossierWaterfallModule,
  type RunWaterfallModule,
} from './porta-reconciliation';
import { createExperimentRun, finalizeExperimentRun } from '../../utils/llm/experiment';
import { resolveLiteLLMExperimentGate } from '../../utils/llm/experimentGate';
import { getExperimentConfig, selectExperimentModel } from '../../utils/llm/modelRouter';
import { checkReportQuality } from '../../utils/llm/reportQuality';
import { calculateCost, estimateTokensFromChars } from '../../utils/llm/cost';
import type { ExperimentSelection } from '../../utils/llm/types';

interface ResetLoadingProgressOptions {
  incremental?: boolean;
  keepHistory?: number;
}

const MODULAR_DOSSIER_TOTAL_STAGES = 7;
const MODULAR_REQUIRED_STEP_TIMEOUT_MS = 150_000;
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

const VALIDATE_INLINE_TOTAL_TIMEOUT_MS = 12_000;
const VALIDATE_INLINE_BODY_READ_TIMEOUT_MS = 4_000;

function createInlineValidationSignal(totalMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(totalMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), totalMs);
  return controller.signal;
}

function withInlineValidationBudget<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => void,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout();
      reject(new Error(message));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export async function validateInlineSourcesForPromotion(
  text: string,
  existingSources: VerifiedSource[],
): Promise<VerifiedSource[]> {
  const HARD_CAP_MS = VALIDATE_INLINE_TOTAL_TIMEOUT_MS + 2_000;
  let hardCapTimeoutId: ReturnType<typeof setTimeout> | undefined;
  const hardCapPromise = new Promise<VerifiedSource[]>(resolve => {
    hardCapTimeoutId = setTimeout(() => {
      scoutDiag.info('FreezeDiag', 'inline-validation:hard-cap', {
        budgetMs: HARD_CAP_MS,
        reason: 'waterfall-non-blocking-fallback',
      });
      resolve([]);
    }, HARD_CAP_MS);
  });

  try {
    return await Promise.race([validateInlineSourcesForPromotionCore(text, existingSources), hardCapPromise]);
  } finally {
    if (hardCapTimeoutId) clearTimeout(hardCapTimeoutId);
  }
}

async function validateInlineSourcesForPromotionCore(
  text: string,
  existingSources: VerifiedSource[],
): Promise<VerifiedSource[]> {
  const opStart = performance.now();

  // ── Fase 1: Extração síncrona de fontes inline ──
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
    return [];
  }

  // ── Fase 2: Validação HTTP com timeout explícito ──
  const controller = new AbortController();
  const validationSignal = createInlineValidationSignal(VALIDATE_INLINE_TOTAL_TIMEOUT_MS);
  const relayValidationAbort = () => controller.abort();
  validationSignal.addEventListener('abort', relayValidationAbort, { once: true });

  const totalTimeoutId = setTimeout(() => {
    scoutDiag.info('FreezeDiag', 'inline-validation:timeout', {
      durationMs: Math.round(performance.now() - opStart),
      candidateCount: candidates.length,
    });
    controller.abort();
  }, VALIDATE_INLINE_TOTAL_TIMEOUT_MS);

  try {
    // ── Fase 2a: Fetch ──
    const fetchStart = performance.now();
    scoutDiag.info('FreezeDiag', 'inline-validation:fetch:start', {
      urlCount: candidates.length,
      timestamp: Date.now(),
      budgetMs: VALIDATE_INLINE_TOTAL_TIMEOUT_MS,
    });

    const fetchPromise = fetch('/api/link-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: candidates.map(source => source.url) }),
      signal: controller.signal,
    });

    fetchPromise.catch((err: unknown) => {
      scoutDiag.warn('FreezeDiag', 'inline-validation:fetch:race-discarded', {
        reason: err instanceof Error ? err.message : String(err),
      });
    });

    const response = await withInlineValidationBudget(
      fetchPromise,
      VALIDATE_INLINE_TOTAL_TIMEOUT_MS,
      () => controller.abort(),
      `Inline source validation timeout after ${VALIDATE_INLINE_TOTAL_TIMEOUT_MS}ms`,
    );

    const fetchDuration = performance.now() - fetchStart;
    scoutDiag.info('FreezeDiag', 'inline-validation:fetch:headers', {
      durationMs: Math.round(fetchDuration),
      httpStatus: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type') ?? undefined,
      contentLength: response.headers.get('content-length') ?? undefined,
      bodyUsed: response.bodyUsed,
    });

    if (!response.ok) {
      clearTimeout(totalTimeoutId);
      scoutDiag.info('FreezeDiag', 'inline-validation:return', {
        reason: 'http-not-ok',
        httpStatus: response.status,
        durationMs: Math.round(performance.now() - opStart),
      });
      return [];
    }

    // ── Fase 2b: Leitura do body com timeout próprio ──
    const bodyStart = performance.now();
    scoutDiag.info('FreezeDiag', 'inline-validation:body:start', {
      totalElapsedMs: Math.round(bodyStart - opStart),
    });

    const bodyText = await withInlineValidationBudget(
      response.text(),
      VALIDATE_INLINE_BODY_READ_TIMEOUT_MS,
      () => controller.abort(),
      `Inline source validation body timeout after ${VALIDATE_INLINE_BODY_READ_TIMEOUT_MS}ms`,
    );

    const bodyDuration = performance.now() - bodyStart;
    scoutDiag.info('FreezeDiag', 'inline-validation:body:text-read', {
      durationMs: Math.round(bodyDuration),
      bodySizeChars: bodyText.length,
    });

    // ── Fase 2c: Parse JSON ──
    let data: { results?: Record<string, { status?: string }> };
    try {
      data = JSON.parse(bodyText) as { results?: Record<string, { status?: string }> };
      scoutDiag.info('FreezeDiag', 'inline-validation:json:parsed', {
        resultKeys: Object.keys(data?.results || {}).length,
      });
    } catch (parseErr) {
      scoutDiag.info('FreezeDiag', 'inline-validation:json:error', {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        bodySizeChars: bodyText.length,
      });
      clearTimeout(totalTimeoutId);
      return [];
    }

    clearTimeout(totalTimeoutId);
    validationSignal.removeEventListener('abort', relayValidationAbort);
    const results = data?.results || {};
    const valid = candidates.filter(source => results[source.url]?.status === 'valid');

    const totalDuration = performance.now() - opStart;
    scoutDiag.info('FreezeDiag', 'inline-validation:return', {
      reason: 'success',
      validCount: valid.length,
      totalCandidateCount: candidates.length,
      totalDurationMs: Math.round(totalDuration),
    });

    return valid;
  } catch (err) {
    clearTimeout(totalTimeoutId);
    validationSignal.removeEventListener('abort', relayValidationAbort);
    const errorDuration = performance.now() - opStart;
    const timedOut = err instanceof Error && /timeout|aborted|abort/i.test(`${err.name || ''} ${err.message || ''}`);
    scoutDiag.info('FreezeDiag', 'inline-validation:error', {
      error: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : 'unknown',
      durationMs: Math.round(errorDuration),
      candidateCount: candidates.length,
    });
    if (timedOut) {
      scoutDiag.info('FreezeDiag', 'inline-validation:skipped-or-timeout', {
        reason: 'timeout-or-abort',
        durationMs: Math.round(errorDuration),
        candidateCount: candidates.length,
      });
    }
    scoutDiag.warn('Waterfall', 'Falha ao processar fontes do dossiê', {
      error: err instanceof Error ? err.message : String(err),
      candidates: candidates.length,
    });
    return [];
  }
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
        return;
      }
      const waterfallRunId = guardCheck.runId;
      let waterfallEndStatus: 'completed' | 'failed' = 'failed';
      let foundationCacheName: string | undefined;
      let sessionToPersist: ChatSession | null = null;
      let experimentSelection: ExperimentSelection | null = null;
      let experimentRunId: string | null = null;
      let experimentRunToken: string | null = null;
      let experimentReportText = '';
      let experimentSourcesCount = 0;
      let experimentValidSourcesCount = 0;
      let experimentPortaScore: number | null = null;
      let experimentFallbackUsed = false;
      let experimentInputTokens = 0;
      let experimentOutputTokens = 0;
      let experimentModulesGenerated = 0;
      const waterfallStartedAt = Date.now();

      const experimentGate = await resolveLiteLLMExperimentGate(waterfallOperatorEmail);
      const llmEnabled = experimentGate.llmEnabled;
      const experimentOperatorEmail = experimentGate.operatorEmail;
      if (!llmEnabled && experimentGate.reason) {
        scoutDiag.info('ModularDossier', 'LiteLLM experiment gate fechado', {
          reason: experimentGate.reason,
          hasSupabaseSession: experimentGate.hasSupabaseSession,
          operatorEmail: experimentOperatorEmail,
        });
      }
      const effectiveFoundationCacheEnabled = llmEnabled ? false : isFoundationCacheEnabled();
      const experimentConfig = getExperimentConfig();

      if (llmEnabled) {
        experimentSelection = selectExperimentModel({ config: experimentConfig, seed: Date.now() });
        if (experimentSelection) {
          try {
            const experimentRun = await createExperimentRun({
              experimentId: experimentSelection.experimentId,
              variant: experimentSelection.variant,
              selectedModel: experimentSelection.model,
              provider: experimentSelection.provider,
              litellmBaseUrl: experimentConfig.litellmBaseUrl || undefined,
              environment: import.meta.env.PROD ? 'production' : 'preview',
              runId: waterfallRunId,
              sessionId,
              operatorId: waterfallOperatorId,
              operatorEmail: experimentOperatorEmail ?? undefined,
              companyName: normalizedCompany || hintedCompany || undefined,
              promptVersion: PROMPT_VERSION,
              codeVersion: APP_VERSION,
            });
            experimentRunId = experimentRun.id;
            experimentRunToken = experimentRun.runToken;
          } catch (error) {
            scoutDiag.warn('ModularDossier', 'falha ao criar llm_experiment_run; continuando waterfall', {
              sessionId,
              waterfallRunId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

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

        if (effectiveFoundationCacheEnabled) {
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
          useGrounding: true as const,
          onGroundingSources: appendGroundingSources,
          onVerificationStatus: rememberVerificationStatus,
          onLlmMetadata: (metadata: {
            provider?: 'gemini' | 'litellm';
            fallbackUsed: boolean;
            usage?: { promptTokenCount?: number; candidatesTokenCount?: number };
          }) => {
            experimentFallbackUsed ||= metadata.fallbackUsed;
            experimentModulesGenerated += 1;
            if (metadata.provider === 'litellm' && !metadata.fallbackUsed) {
              experimentInputTokens += metadata.usage?.promptTokenCount ?? 0;
              experimentOutputTokens += metadata.usage?.candidatesTokenCount ?? 0;
            }
          },
          ...(foundationCacheName ? { foundationCacheName } : {}),
          ...(experimentSelection ? { selectedModel: experimentSelection.model } : {}),
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

        const modules: DossierWaterfallModule[] = [
          {
            name: 'Porte / Teia Societária',
            prompt: PROMPT_RADAR_EXPANSAO_GOD_MODE,
            stage: MODULAR_DOSSIER_STAGES[0],
            optional: false,
            timeoutMs: MODULAR_REQUIRED_STEP_TIMEOUT_MS,
          },
          {
            name: 'Operação / Cadeia de Valor',
            prompt: PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
            stage: MODULAR_DOSSIER_STAGES[1],
            optional: false,
            timeoutMs: MODULAR_REQUIRED_STEP_TIMEOUT_MS,
          },
          {
            name: 'Bordas de Controle',
            prompt: PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
            stage: MODULAR_DOSSIER_STAGES[2],
            optional: true,
            timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
          },
          {
            name: 'Riscos & Compliance',
            prompt: PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
            stage: MODULAR_DOSSIER_STAGES[3],
            optional: true,
            timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
          },
          {
            name: 'Caminho de Venda',
            prompt: PROMPT_CAMINHO_DE_VENDA,
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
        ) =>
          generateDossierModule(
            module.name,
            resolvedMegaCompany || 'Empresa',
            SHARED_FOUNDATION_BLOCK,
            module.prompt,
            buildModuleExtraContext(accumulatedTextSnapshot, contextHint),
            {
              signal,
              timeoutMs,
              ...sharedDossierModuleOptions,
            },
          );

        const runTeiaSocietariaOrchestration = async (): Promise<string> => {
          let identityResult: string;

          try {
            const identityStart = performance.now();
            identityResult = await generateDossierModule(
              'Teia Societaria — Identidade',
              resolvedMegaCompany || 'Empresa',
              SHARED_FOUNDATION_BLOCK,
              PROMPT_TEIA_IDENTITY_MODULE,
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
                buildModuleExtraContext(combinedTeiaText),
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
        experimentPortaScore = waterfallScorePorta?.score ?? null;
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
        });
        const promotedInlineSources = await validateInlineSourcesForPromotion(
          waterfallPrepared,
          waterfallGroundingSources,
        );
        scoutDiag.info('FreezeDiag', 'post-validate-inline', {
          sessionId,
          waterfallRunId,
          promotedCount: promotedInlineSources.length,
        });
        assertNotAborted();
        appendGroundingSources(promotedInlineSources, 'Promoção inline');

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
        const finalized = finalizeDossierMarkdown(waterfallPrepared, waterfallGroundingSources, sessionSourcePool);
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
        experimentReportText = waterfallFinalText;
        experimentSourcesCount = waterfallGroundingSources.length;
        experimentValidSourcesCount = waterfallGroundingSources.filter(
          source => source.verification === 'fallback' || source.verification === 'grounding',
        ).length;
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
        const updatedSession = updateSessionById(sessionId, session => {
          originalMsgCount = session.messages?.length ?? 0;
          const finalCompany = normalizedCompany || session.empresaAlvo || pickCompanyLabel(session.title);
          const nextSession: ChatSession = {
            ...session,
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
          sessionToPersist = nextSession;
          return nextSession;
        });
        if (updatedSession) {
          sessionToPersist = updatedSession;
        }

        const persistMsgCount = (sessionToPersist as ChatSession | null)?.messages?.length ?? 0;
        const persistBotUpdated =
          (sessionToPersist as ChatSession | null)?.messages?.some(
            (m: { id: string; sender: string; isThinking?: boolean; text?: string }) =>
              m.id === botMessageId && m.sender === 'bot' && !m.isThinking && Boolean(m.text),
          ) ?? false;

        scoutDiag.info('WaterfallLifecycle', 'messages-state-after-update', {
          sessionId,
          waterfallRunId,
          messageCount: persistMsgCount,
          botMessageUpdated: persistBotUpdated,
          waterfallFinalTextLen: waterfallFinalText?.length ?? 0,
        });

        const finalBotMsg = (sessionToPersist as ChatSession | null)?.messages?.find(
          (m: { id: string }) => m.id === botMessageId,
        );
        scoutDiag.info('WaterfallLifecycle', 'final-bot-message-state', {
          sessionId,
          waterfallRunId,
          messageId: botMessageId,
          textLen: (finalBotMsg as any)?.text?.length ?? 0,
          isThinking: (finalBotMsg as any)?.isThinking,
          loadingVariant: (finalBotMsg as any)?.loadingVariant,
          isError: (finalBotMsg as any)?.isError,
          renderShouldBe: 'normal-content',
        });

        // ⚠ Fallback: updateSessionById pode perder a sessão quando React faz batch
        // de setState e o cache está limpo (primeira carga / race condition).
        // Cenário A: prev[] vazio → callback nunca roda → sessionToPersist = null
        // Cenário B: prev[] tem a sessão mas botMessageId não casa → texto nunca escrito
        // sessionsRef.current é sincronizado via render-phase (useSessionStorage.ts).
        if (!sessionToPersist || !persistBotUpdated) {
          Sentry.captureMessage('Scout360 waterfall session persist failed', {
            level: 'warning',
            tags: { area: 'waterfall-session-persist', session_id: sessionId },
            extra: {
              sessionToPersistIsNull: sessionToPersist === null,
              persistBotUpdated,
              originalMsgCount,
              botMessageId,
              waterfallFinalTextLen: waterfallFinalText?.length ?? 0,
            },
          });
          if (!persistBotUpdated && persistMsgCount > 0) {
            console.error(
              '[Scout360][WaterfallLifecycle] ⚠ botMessageId nao encontrado na sessao',
              JSON.stringify({
                sessionId,
                botMessageId,
                messageIds: sessionToPersist
                  ? ((sessionToPersist as ChatSession)?.messages?.map((m: { id: string }) => m.id) ?? [])
                  : [],
                waterfallFinalTextLen: waterfallFinalText?.length ?? 0,
              }),
            );
          }

          console.error(
            '[Scout360][WaterfallLifecycle] ⚠ sessionToPersist VAZIO após updateSessionById',
            JSON.stringify({
              sessionId,
              waterfallRunId,
              sessionToPersistIsNull: sessionToPersist === null,
              originalMsgCount,
              persistMsgCount,
              persistBotUpdated,
              waterfallFinalTextLen: waterfallFinalText?.length ?? 0,
              botMessageId,
            }),
          );

          const sessionsSnapshot = chatStore?.sessionsRef?.current ?? [];
          const fallbackSession = sessionsSnapshot.find((s: ChatSession) => s.id === sessionId);
          if (fallbackSession) {
            const finalCompany =
              normalizedCompany || fallbackSession.empresaAlvo || pickCompanyLabel(fallbackSession.title);
            const recoveredSession: ChatSession = {
              ...fallbackSession,
              updatedAt: new Date().toISOString(),
              empresaAlvo: finalCompany || fallbackSession.empresaAlvo,
              scoreOportunidade: waterfallScorePorta?.score ?? fallbackSession.scoreOportunidade,
              messages: fallbackSession.messages.map(message =>
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
            sessionToPersist = recoveredSession;
            // findIndex + prepend garante que a sessão NUNCA seja perdida,
            // mesmo se prev[] estiver vazio (race condition do React 18 batching).
            chatStore?.setSessions?.((prev: ChatSession[]) => {
              const idx = prev.findIndex((s: ChatSession) => s.id === sessionId);
              if (idx === -1) {
                return [recoveredSession, ...prev];
              }
              const next = [...prev];
              next[idx] = recoveredSession;
              return next;
            });
            scoutDiag.info('WaterfallLifecycle', 'session-recovered-via-ref', {
              sessionId,
              waterfallRunId,
              recoveredMsgCount: recoveredSession.messages.length,
              sessionsSnapshotLen: sessionsSnapshot.length,
            });
          } else {
            console.error(
              '[Scout360][WaterfallLifecycle] FALLBACK TAMBEM VAZIO — sessao irrecuperavel',
              JSON.stringify({
                sessionId,
                waterfallRunId,
                refCount: sessionsSnapshot.length,
                allSessionIds: sessionsSnapshot.map((s: ChatSession) => s.id),
              }),
            );
          }
        }

        // Fire-and-forget: persistência no Supabase não deve bloquear o retorno
        // do waterfall nem atrasar setIsLoading(false) no message-orchestrator.
        // O dossiê já está no React state — a UI não depende do Supabase.
        if (sessionToPersist) {
          const dossier = sessionToPersist as ChatSession;
          scoutDiag.info('WaterfallLifecycle', 'pre-save-dossier', { sessionId, waterfallRunId });

          let saveResolved = false;
          const saveTimeoutId = setTimeout(() => {
            if (!saveResolved) {
              scoutDiag.warn('ModularDossier', 'saveDossier demorando mais de 15s — ainda pendente', {
                sessionId,
              });
            }
          }, 15_000);

          storage
            .saveDossier(dossier)
            .then(() => {
              saveResolved = true;
              clearTimeout(saveTimeoutId);
              window.dispatchEvent(
                new CustomEvent('dossier:completed', {
                  detail: {
                    dossierId: dossier.id,
                    companyName: resolvedMegaCompany || normalizedCompany || '',
                    cnpj: dossier.cnpj,
                  },
                }),
              );
            })
            .catch(error => {
              saveResolved = true;
              clearTimeout(saveTimeoutId);
              scoutDiag.warn('ModularDossier', 'falha ao persistir dossiê final; mantendo sessão em memória', {
                sessionId,
                company: resolvedMegaCompany || normalizedCompany || null,
                error: error instanceof Error ? error.message : String(error),
              });
              scoutDiag.warn('WaterfallLifecycle', 'dossier-completed-event-not-dispatched', {
                sessionId,
                reason: error instanceof Error ? error.message : String(error),
              });
            });
        }

        waterfallEndStatus = 'completed';
      } finally {
        if (experimentRunId && experimentRunToken) {
          try {
            const quality = checkReportQuality({
              text: experimentReportText,
              sourcesCount: experimentSourcesCount,
              validSourcesCount: experimentValidSourcesCount,
              portaScore: experimentPortaScore,
              parserSuccess: waterfallEndStatus === 'completed',
            });
            const status = quality.isQualityFailure
              ? 'quality_failure'
              : waterfallEndStatus !== 'completed'
                ? 'failed'
                : experimentFallbackUsed
                  ? 'fallback'
                  : 'success';
            const estimatedTokens = estimateTokensFromChars(experimentReportText.length);
            const hasMeasuredUsage = experimentInputTokens > 0 || experimentOutputTokens > 0;
            const measuredCost = experimentSelection
              ? calculateCost(
                  experimentSelection.model,
                  hasMeasuredUsage
                    ? { inputTokens: experimentInputTokens, outputTokens: experimentOutputTokens }
                    : undefined,
                  experimentReportText.length,
                )
              : null;

            void finalizeExperimentRun({
              id: experimentRunId,
              runToken: experimentRunToken,
              status,
              structuralScore: quality.structuralScore,
              fallbackUsed: experimentFallbackUsed,
              fallbackModel: experimentFallbackUsed ? 'gemini-3-flash-preview' : undefined,
              modulesGenerated: experimentModulesGenerated,
              reportChars: experimentReportText.length,
              reportTokensEstimated: estimatedTokens,
              inputTokens: hasMeasuredUsage ? experimentInputTokens : undefined,
              outputTokens: hasMeasuredUsage ? experimentOutputTokens : estimatedTokens,
              totalTokens: hasMeasuredUsage ? experimentInputTokens + experimentOutputTokens : estimatedTokens,
              inputCostUsd: measuredCost?.inputCostUsd,
              outputCostUsd: measuredCost?.outputCostUsd,
              totalCostUsd: measuredCost?.totalCostUsd,
              estimatedCost: measuredCost?.estimated ?? true,
              costEstimationMethod: measuredCost?.method ?? 'chars',
              inputPriceUsed: measuredCost?.inputPriceUsed,
              outputPriceUsed: measuredCost?.outputPriceUsed,
              sourcesCount: experimentSourcesCount,
              validSourcesCount: experimentValidSourcesCount,
              portaMarkersValid: quality.portaMarkersValid,
              teiaComplexidadePresent: quality.teiaComplexidadePresent,
              portaScorePresent: experimentPortaScore !== null,
              portaScore: experimentPortaScore ?? undefined,
              waterfallDurationMs: Date.now() - waterfallStartedAt,
              totalLatencyMs: Date.now() - waterfallStartedAt,
              renderSuccess: waterfallEndStatus === 'completed',
              markdownBroken: quality.markdownBroken,
              responseEmpty: !experimentReportText.trim(),
            }).catch(error => {
              scoutDiag.warn('ModularDossier', 'falha ao finalizar llm_experiment_run', {
                sessionId,
                waterfallRunId,
                experimentRunId,
                error: error instanceof Error ? error.message : String(error),
              });
            });
          } catch (error) {
            scoutDiag.warn('ModularDossier', 'falha ao calcular qualidade llm_experiment_run', {
              sessionId,
              waterfallRunId,
              experimentRunId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

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
        const healthSession = chatStore?.sessionsRef?.current?.find((s: ChatSession) => s.id === sessionId);
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

  return { runMegaPromptWaterfall };
}
