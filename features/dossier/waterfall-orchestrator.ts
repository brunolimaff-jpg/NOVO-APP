import { useCallback, type Dispatch, type SetStateAction } from 'react';
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
  joinDossierExtraContext,
} from '../../services/llm/foundation-cache';
import { formatarParaPrompt, lookupCliente } from '../../services/clientLookupService';
import { getContextoConcorrentesRegionais } from '../../services/competitorService';
import { generatePortaContextForDeepDive } from '../../services/portaStateService';
import { fetchCompanyByCnpj } from '../../services/brasilApiService';
import { storage } from '../../services/storage';
import { useMaybeChatStore } from '../../stores/chatStore';
import { type ChatSession, type ClienteSeniorData, Sender, type WebVerificationStatus, type DossierWaterfallResult } from '../../types';
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
import { applyDossierEnxuto } from '../../utils/dossierEnxuto';
import type { MutableRefObject } from 'react';
import type { RunMegaPromptWaterfallArgs } from '../../types';
import { isAbortLikeError } from '../../utils/abortHelpers';
import { DossierRunCancelledError, assertDossierRunCanContinue, assertDossierRunCanContinueWithRenewal as assertDossierRunCanContinueWithRenewalFn, isDossierRunControlError } from './dossier-run-control';
import { markDossierRunCancelled, markDossierRunCompleted, markDossierRunFailed, releaseDossierRunLease } from '../../lib/supabase/dossierRuns';
// BRU-33 — seam Gold pós-processamento fail-closed (V7 Preview Wiring).
import { tryEnhanceDossierWithGold, type GoldSeamDeps } from '../../services/llm/gold/seam/gold-dossier-seam';
import { createGoldSeamDeps } from '../../services/llm/gold/seam/gold-browser-adapter';
import { isEvidencePipelineV2 } from '../../utils/feature-flags';
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
  /** BRU-33 — deps do seam Gold (injetável para testes; default OFF). */
  goldSeamDeps?: GoldSeamDeps;
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

const VALIDATE_INLINE_TOTAL_TIMEOUT_MS = 5_000;
const VALIDATE_INLINE_BODY_READ_TIMEOUT_MS = 3_000;

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
  // AbortController próprio cobre fetch + leitura do body.
  // Timeout separado para leitura do body como safety net contra
  // streams que nunca terminam (ex: Vercel function interrompida).
  const controller = new AbortController();
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
    });

    const fetchPromise = fetch('/api/link-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: candidates.map(source => source.url) }),
      signal: controller.signal,
    });

    // Prevent unhandled rejection when Promise.race discards this promise
    fetchPromise.catch((err: unknown) => {
      if (!isAbortLikeError(err)) {
        scoutDiag.warn('FreezeDiag', 'inline-validation:fetch:race-discarded', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
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
  // BRU-33 — Gold pós-processamento (flag OFF por padrão via adapter).
  const goldSeamDeps = options.goldSeamDeps ?? createGoldSeamDeps();
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
      dossierRunId,
      dossierLeaseOwner,
    }: RunMegaPromptWaterfallArgs): Promise<DossierWaterfallResult> => {
      let terminalLeaseReleased = false;
      const persistFailedTerminal = async (errorCode: string, errorStage: string): Promise<boolean> => {
        if (!dossierRunId || !dossierLeaseOwner) return false;
        try {
          await markDossierRunFailed(dossierRunId, dossierLeaseOwner, errorCode, errorStage);
          terminalLeaseReleased = true;
          return true;
        } catch (error) {
          scoutDiag.warn('WaterfallLifecycle', 'terminal-failure-persist-failed', {
            sessionId,
            dossierRunId,
            errorCode,
            errorStage,
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      };
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
        const terminalPersisted = await persistFailedTerminal('waterfall_blocked', 'guard');
        if (!terminalPersisted && dossierRunId && dossierLeaseOwner) {
          await releaseDossierRunLease(dossierRunId, dossierLeaseOwner).catch(error => {
            scoutDiag.warn('WaterfallLifecycle', 'lease-release-failed', {
              sessionId,
              dossierRunId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
        return { status: 'FAILED', dossierRunId, errorCode: 'waterfall_blocked', errorStage: 'guard', error: new Error('Waterfall bloqueado') } satisfies DossierWaterfallResult;
      }
      const waterfallRunId = guardCheck.runId;
      let waterfallEndStatus: 'completed' | 'failed' | 'aborted' = 'failed';
      let currentLifecycleStage = 'waterfall_start';
      const assertRunCanContinue = async (stage: string) => {
        currentLifecycleStage = stage;
        await assertDossierRunCanContinue({ runId: dossierRunId, leaseOwner: dossierLeaseOwner, signal, stage });
      };
      // Checkpoint de liveness para etapas longas: renovação preventiva quando o
      // lease está perto de expirar (fail-closed preservado; nunca reacquire).
      const assertRunCanContinueWithRenewal = async (stage: string) => {
        currentLifecycleStage = stage;
        await assertDossierRunCanContinueWithRenewalFn({ runId: dossierRunId, leaseOwner: dossierLeaseOwner, signal, stage });
      };
      let sessionToPersist: ChatSession | null = null;
      let completedDossierId: string | undefined;

      try {
        await assertRunCanContinue('waterfall_start');
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
            await assertRunCanContinue('before_lookup_cliente');
            const clienteData = await withAbortSignal(lookupCliente(lookupTarget), signal);
            await assertRunCanContinue('after_lookup_cliente');
          waterfallLookupContext = formatarParaPrompt(clienteData);
          waterfallClienteSeniorData = extractClienteSeniorData(clienteData);
        } catch (error) {
          if (isAbortLikeError(error) || isDossierRunControlError(error)) throw error;
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
        await assertRunCanContinue('before_teia_research_context');
        const teiaResearchContext = await buildTeiaResearchContext({
          company: resolvedMegaCompany || waterfallClienteSeniorData?.grupo || 'empresa analisada',
          sessionCnpjDigits,
          signal,
        });
        await assertRunCanContinue('after_teia_research_context');

        const staticDossierContext = buildStaticDossierContext({
          dossierSeedContext,
          waterfallLookupContext,
          seniorEvidenceContext,
          teiaResearchText: teiaResearchContext.text,
        });

        const buildModuleExtraContext = (accumulatedTextSnapshot: string, contextHint = '') => {
          const dynamicContext = buildDynamicDossierContext(
            contextHint,
            accumulatedTextSnapshot,
            WATERFALL_CONTEXT_WINDOW_CHARS,
          );
          const sourcesBlock = formatAvailableSourcesForPrompt(sessionSourcePool);
          return `${joinDossierExtraContext(staticDossierContext, dynamicContext)}${sourcesBlock}`;
        };

        const sharedDossierModuleOptions = {
          onGroundingSources: appendGroundingSources,
          onVerificationStatus: rememberVerificationStatus,
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
            await assertRunCanContinue('before_teia_identity');
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
            await assertRunCanContinue('after_teia_identity');
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
          if (isAbortLikeError(identityError) || isDossierRunControlError(identityError)) throw identityError;

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
              if (isAbortLikeError(deepError) || isDossierRunControlError(deepError)) throw deepError;
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

        // === EVIDENCE PIPELINE V2: Query Planner + Collector (PR #407) ===
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
              const { sendMessageToLlm } = await import('../../services/llmService');
              const result = await sendMessageToLlm(
                prompt,
                [],
                'Você é um planejador de investigação. Retorne APENAS JSON válido.',
                { maxOutputTokens: 16384 },
                false,
              );
              return result.text || '';
            };

            await assertRunCanContinue('before_query_planner');
            const plan = await withAbortSignal(planQueries(entity, callLLM), signal);
            await assertRunCanContinue('after_query_planner');
            await assertRunCanContinue('before_query_collector');
            const pack = await withAbortSignal(executeQueryPlan(plan), signal);
            await assertRunCanContinue('after_query_collector');

            scoutDiag.info('PipelineV2', 'planner+collector concluído', {
              sessionId,
              company: entity.razaoSocial,
              cnpj: entity.cnpjRaiz || null,
              segmento: entity.segmentoInferido,
              queries: plan.queries.length,
              items: pack.items.length,
              tierAB: pack.confidenceProfile.tierACount + pack.confidenceProfile.tierBCount,
              modules: pack.confidenceProfile.modulesCovered.length,
            });
          } catch (err) {
            if (isAbortLikeError(err) || isDossierRunControlError(err)) throw err;
            console.error('[PipelineV2:FATAL]', err);
            scoutDiag.warn('PipelineV2', 'Fallback v1 (planner/collector falhou)', {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            });
          }
        }

        if (isFirstInteraction) {
          resetLoadingProgress(modules[FIRST_MODULE_INDEX].stage, MODULAR_DOSSIER_TOTAL_STAGES);
        } else {
          resetLoadingProgress(modules[FIRST_MODULE_INDEX].stage, MODULAR_DOSSIER_TOTAL_STAGES, {
            incremental: true,
            keepHistory: 4,
          });
        }

        for (let index = 0; index < modules.length; index += 1) {
          const module = modules[index];
          await assertRunCanContinueWithRenewal(`before_module:${module.name}`);
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
            await assertRunCanContinueWithRenewal(`after_module:${module.name}`);
            optionalStepFailures.delete(module.name);
            previousStageCompleted = true;
            setFailureCount(0);
          } catch (error) {
            if (isAbortLikeError(error) || isDossierRunControlError(error)) throw error;
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

        await assertRunCanContinueWithRenewal('before_benchmark');
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
        await assertRunCanContinueWithRenewal('after_benchmark');
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
          await assertRunCanContinueWithRenewal('before_porta_reconciliation');
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
          if (signal?.aborted || isDossierRunControlError(error)) throw error;
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
        await assertRunCanContinueWithRenewal('after_porta_reconciliation');
        scoutDiag.info('WaterfallLifecycle', 'pos-porta-reconciliation', { sessionId, waterfallRunId });
        accumulatedText = reconciledText;
        assertNotAborted();

        if (optionalStepFailures.size > 0) {
          scoutDiag.warn('WaterfallLifecycle', 'optional-steps-failed', {
            sessionId,
            waterfallRunId,
            failedSteps: Array.from(optionalStepFailures),
          });
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
        });
        await assertRunCanContinue('before_inline_source_validation');
        const promotedInlineSources = await validateInlineSourcesForPromotion(
          waterfallPrepared,
          waterfallGroundingSources,
        );
        await assertRunCanContinue('after_inline_source_validation');
        scoutDiag.info('FreezeDiag', 'post-validate-inline', {
          sessionId,
          waterfallRunId,
          promotedCount: promotedInlineSources.length,
        });
        assertNotAborted();
        appendGroundingSources(promotedInlineSources, 'Promoção inline');

        if (sessionSourcePool.length === 0 && waterfallGroundingSources.length === 0) {
          scoutDiag.warn('WaterfallLifecycle', 'grounding-unavailable', {
            sessionId,
            waterfallRunId,
            poolSize: 0,
            groundingSourcesCount: 0,
          });
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
        // Dossiê executivo enxuto (padrão): limita a 1 mermaid, rebaixa
        // headers "DOSSIÊ SCOUT 360" repetidos e remove linhas duplicadas.
        const enxuto = applyDossierEnxuto(finalized.text || '');
        if (enxuto.removedMermaidBlocks > 0 || enxuto.demotedHeaders > 0 || enxuto.removedDuplicateLines > 0) {
          scoutDiag.info('WaterfallLifecycle', 'dossier-enxuto-applied', {
            sessionId,
            waterfallRunId,
            removedMermaidBlocks: enxuto.removedMermaidBlocks,
            demotedHeaders: enxuto.demotedHeaders,
            removedDuplicateLines: enxuto.removedDuplicateLines,
          });
        }
        let waterfallFinalText =
          enxuto.text ||
          finalized.text ||
          accumulatedText ||
          `Dossiê de ${resolvedMegaCompany || 'empresa'} não pôde ser gerado. Tente novamente.`;
        // BRU-33 — Gold pós-processamento fail-closed: entra DEPOIS do dossiê
        // final e ANTES do generateContinuityQuestion, para Gold/continuidade/
        // UI/persistência usarem o mesmo texto. Apenas falhas internas do Gold
        // caem silenciosamente no dossiê; abort do usuário e erros de
        // run-control/lease preservam a semântica atual (CANCELLED/FAILED).
        if (goldSeamDeps.enabled && sessionCnpjDigits) {
          const goldStartedAt = Date.now();
          scoutDiag.info('GoldSeam', 'gold-start', {
            sessionId,
            waterfallRunId,
            company: normalizedCompany || resolvedMegaCompany,
            cnpj: sessionCnpjDigits,
          });
          try {
            const enhancedText = await tryEnhanceDossierWithGold({
              cnpj: sessionCnpjDigits,
              companyName: normalizedCompany || resolvedMegaCompany,
              dossierText: waterfallFinalText,
              deps: goldSeamDeps,
              signal,
            });
            const goldDurationMs = Date.now() - goldStartedAt;
            if (enhancedText !== waterfallFinalText) {
              scoutDiag.info('GoldSeam', 'gold-elegivel', {
                sessionId,
                waterfallRunId,
                goldChars: enhancedText.length,
                dossierChars: waterfallFinalText.length,
                goldDurationMs,
                company: normalizedCompany || resolvedMegaCompany,
              });
              waterfallFinalText = enhancedText;
            } else {
              scoutDiag.info('GoldSeam', 'gold-rejeitado-fallback', {
                sessionId,
                waterfallRunId,
                goldDurationMs,
                reason: 'verifier_ou_contract_fail',
                company: normalizedCompany || resolvedMegaCompany,
              });
            }
          } catch (error) {
            if (isAbortLikeError(error) || isDossierRunControlError(error)) {
              scoutDiag.info('GoldSeam', 'gold-abortado', {
                sessionId,
                waterfallRunId,
                goldDurationMs: Date.now() - goldStartedAt,
                reason: isAbortLikeError(error) ? 'user_abort' : 'run_control',
              });
              throw error;
            }
            scoutDiag.warn('GoldSeam', 'gold-falha-fallback-dossier', {
              sessionId,
              waterfallRunId,
              goldDurationMs: Date.now() - goldStartedAt,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
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
            await assertRunCanContinue('before_continuity_question');
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
          if (signal.aborted || isDossierRunControlError(error)) throw error;
          scoutDiag.warn('ModularDossier', 'falha ao gerar sugestões finais do waterfall', {
            sessionId,
            company: resolvedMegaCompany || null,
            timedOut: continuityTimedOut,
            isAbortLike: isAbortLikeError(error),
            error: error instanceof Error ? error.message : String(error),
          });
        }
        scoutDiag.info('WaterfallLifecycle', 'pos-continuity-question', { sessionId, waterfallRunId });
        await assertRunCanContinue('after_continuity_question');

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
          await persistFailedTerminal('generation_ref_cleared', 'before_final_session_update');
          return {
            status: 'FAILED',
            dossierRunId,
            errorCode: 'generation_ref_cleared',
            errorStage: 'before_final_session_update',
            error: new Error('Geração substituída antes da persistência final'),
          };
        }

        sessionToPersist = null;
        let originalMsgCount = -1;
        await assertRunCanContinue('before_final_session_update');
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

        if (!sessionToPersist) {
          if (dossierRunId && dossierLeaseOwner) {
            try {
              await markDossierRunFailed(dossierRunId, dossierLeaseOwner, 'final_session_unavailable', 'before_save');
              terminalLeaseReleased = true;
            } catch {
              // O retorno continua fail-closed; finally tenta liberar a lease ainda existente.
            }
          }
          return {
            status: 'FAILED',
            dossierRunId,
            errorCode: 'final_session_unavailable',
            errorStage: 'before_save',
            error: new Error('Sessão final indisponível antes da persistência'),
          } satisfies DossierWaterfallResult;
        }

        {
          const dossier = sessionToPersist;
          await assertRunCanContinueWithRenewal('save_dossier');
          try { await storage.saveDossierStrict(dossier); }
          catch (error) {
            if (dossierRunId && dossierLeaseOwner) {
              try {
                await markDossierRunFailed(dossierRunId, dossierLeaseOwner, 'persist_failed', 'save_dossier');
                terminalLeaseReleased = true;
              } catch (markError) {
                scoutDiag.warn('WaterfallLifecycle', 'mark-failed-after-save-error', { sessionId, dossierRunId, error: markError instanceof Error ? markError.message : String(markError) });
              }
            }
            return { status: 'FAILED', dossierRunId, errorCode: 'persist_failed', errorStage: 'save_dossier', error: error instanceof Error ? error : new Error(String(error)) } satisfies DossierWaterfallResult;
          }
          await assertRunCanContinueWithRenewal('after_save_dossier_before_complete');
          if (dossierRunId && dossierLeaseOwner) {
            try {
              await markDossierRunCompleted(dossierRunId, dossierLeaseOwner, dossier.id);
              terminalLeaseReleased = true;
            }
            catch (error) {
              try {
                await markDossierRunFailed(dossierRunId, dossierLeaseOwner, 'lifecycle_completion_failed', 'mark_completed');
                terminalLeaseReleased = true;
              } catch (markError) {
                scoutDiag.warn('WaterfallLifecycle', 'mark-failed-after-completion-error', { sessionId, dossierRunId, error: markError instanceof Error ? markError.message : String(markError) });
              }
              return { status: 'FAILED', dossierRunId, errorCode: 'lifecycle_completion_failed', errorStage: 'mark_completed', error: error instanceof Error ? error : new Error(String(error)) } satisfies DossierWaterfallResult;
            }
          }
          completedDossierId = dossier.id;
          window.dispatchEvent(new CustomEvent('dossier:completed', { detail: { dossierId: dossier.id, companyName: resolvedMegaCompany || normalizedCompany || '', cnpj: dossier.cnpj } }));
        }

        waterfallEndStatus = 'completed';
        return { status: 'COMPLETED', dossierRunId, dossierId: completedDossierId } satisfies DossierWaterfallResult;
      } catch (error) {
        if (signal.aborted || error instanceof DossierRunCancelledError || isAbortLikeError(error)) {
          waterfallEndStatus = 'aborted';
          if (dossierRunId && dossierLeaseOwner) {
            const terminalPersisted = await markDossierRunCancelled(dossierRunId, dossierLeaseOwner).then(() => true).catch(() => false);
            terminalLeaseReleased = terminalPersisted;
            return { status: 'CANCELLED', dossierRunId, terminalPersisted, reason: error instanceof DossierRunCancelledError ? error.reason : 'local_abort' };
          }
          return { status: 'CANCELLED', dossierRunId, terminalPersisted: false, reason: 'local_abort' };
        }
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (dossierRunId && dossierLeaseOwner) {
          try {
            await markDossierRunFailed(dossierRunId, dossierLeaseOwner, 'waterfall_failed', currentLifecycleStage);
            terminalLeaseReleased = true;
          } catch (markError) {
            scoutDiag.warn('WaterfallLifecycle', 'mark-failed-after-waterfall-error', { sessionId, dossierRunId, error: markError instanceof Error ? markError.message : String(markError) });
          }
        }
        return { status: 'FAILED', dossierRunId, errorCode: 'waterfall_failed', errorStage: currentLifecycleStage, error: normalized };
      } finally {
        if (dossierRunId && dossierLeaseOwner && !terminalLeaseReleased) await releaseDossierRunLease(dossierRunId, dossierLeaseOwner).catch(() => scoutDiag.warn('WaterfallLifecycle', 'lease-release-failed', { sessionId, dossierRunId }));

        scoutDiag.info('WaterfallLifecycle', 'pre-register-end', {
          sessionId,
          waterfallRunId,
          waterfallEndStatus,
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
