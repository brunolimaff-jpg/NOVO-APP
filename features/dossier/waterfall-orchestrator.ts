import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MODULAR_DOSSIER_STAGES } from '../../constants/loadingStages';
import {
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  SHARED_FOUNDATION_BLOCK,
} from '../../prompts/megaPrompts';
import { generateContinuityQuestion, generateDossierModule } from '../../services/geminiService';
import { formatarParaPrompt, lookupCliente } from '../../services/clientLookupService';
import { useMaybeChatStore } from '../../stores/chatStore';
import { type ChatSession, type ClienteSeniorData, Sender, type WebVerificationStatus } from '../../types';
import { scoutDiag } from '../../utils/diagnosticLog';
import { stripPortaMarkers } from '../../utils/porta';
import { sanitizeSensitivePersonalData } from '../../utils/privacy';
import { buildMainDossierExecutiveIntro } from '../../utils/reportUtils';
import {
  appendSeniorEvidenceNote,
  buildSeniorEvidenceContext,
  enforceSeniorEvidenceConstraints,
  extractClienteSeniorData,
} from '../../utils/seniorEvidence';
import { extractPromotableInlineSources, type VerifiedSource } from '../../utils/webVerification';
import type { RunMegaPromptWaterfallArgs } from '../../types';
import { isAbortLikeError } from '../../utils/abortHelpers';
import { ensureContinuitySuggestions, pickCompanyLabel } from '../../utils/messageHelpers';
import { runDossierBenchmarkStage } from './benchmark-stage';
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
const MAX_INLINE_SOURCES_TO_VALIDATE = 10;

export interface UseDossierWaterfallOrchestratorOptions {
  canUseLookup: boolean;
  resolvedOperatorName: string;
  updateSessionById: (id: string, updater: (session: ChatSession) => ChatSession) => void;
  resetLoadingProgress: (
    stage?: string,
    totalStages?: number,
    options?: ResetLoadingProgressOptions,
  ) => void;
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

async function validateInlineSourcesForPromotion(
  text: string,
  existingSources: VerifiedSource[],
): Promise<VerifiedSource[]> {
  const candidates = extractPromotableInlineSources(text, existingSources, MAX_INLINE_SOURCES_TO_VALIDATE);
  if (candidates.length === 0 || typeof fetch !== 'function') return [];

  try {
    const response = await fetch('/api/link-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: candidates.map(source => source.url) }),
    });
    if (!response.ok) return [];

    const data = await response.json() as {
      results?: Record<string, { status?: string }>;
    };
    const results = data?.results || {};
    return candidates.filter(source => results[source.url]?.status === 'valid');
  } catch {
    return [];
  }
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
  const setFailureCount = requireDependency(
    options.setFailureCount ?? chatStore?.setFailureCount,
    'setFailureCount',
  );

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
    }: RunMegaPromptWaterfallArgs) => {
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

      const appendGroundingSources = (sources: VerifiedSource[]) => {
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
      };

      const rememberVerificationStatus = (status: WebVerificationStatus, moduleName: string) => {
        waterfallVerificationStatuses.set(moduleName, status);
      };

      if (lookupTarget) {
        try {
          const clienteData = await lookupCliente(lookupTarget);
          waterfallLookupContext = formatarParaPrompt(clienteData);
          waterfallClienteSeniorData = extractClienteSeniorData(clienteData);
        } catch (error) {
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
          prompt: PROMPT_RH_SINDICATOS_GOD_MODE,
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
          [
            dossierSeedContext,
            waterfallLookupContext,
            seniorEvidenceContext,
            contextHint ? `Objetivo desta passada:\n${contextHint}` : '',
            accumulatedTextSnapshot
              ? `Contexto anterior consolidado:\n${accumulatedTextSnapshot.slice(-WATERFALL_CONTEXT_WINDOW_CHARS)}`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
          {
            signal,
            timeoutMs,
            useGrounding: true,
            onGroundingSources: appendGroundingSources,
            onVerificationStatus: rememberVerificationStatus,
          },
        );

      if (isFirstInteraction) {
        resetLoadingProgress(modules[0].stage, MODULAR_DOSSIER_TOTAL_STAGES);
      } else {
        resetLoadingProgress(modules[0].stage, MODULAR_DOSSIER_TOTAL_STAGES, {
          incremental: true,
          keepHistory: 4,
        });
      }

      for (let index = 0; index < modules.length; index += 1) {
        if (signal.aborted) break;

        const module = modules[index];
        if (index > 0) {
          if (previousStageCompleted) {
            advanceLoadingProgress(module.stage, MODULAR_DOSSIER_TOTAL_STAGES);
          } else {
            replaceLoadingProgressStage(module.stage, MODULAR_DOSSIER_TOTAL_STAGES);
          }
        }

        try {
          const moduleResult = await runWaterfallModule(module, accumulatedText);
          appendWaterfallChunk(moduleResult);
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

      if (previousStageCompleted) {
        advanceLoadingProgress(MODULAR_DOSSIER_STAGES[5], MODULAR_DOSSIER_TOTAL_STAGES);
      } else {
        replaceLoadingProgressStage(MODULAR_DOSSIER_STAGES[5], MODULAR_DOSSIER_TOTAL_STAGES);
      }

      const benchmarkCompleted = await runDossierBenchmarkStage({
        sessionId,
        company: resolvedMegaCompany,
        signal,
        appendWaterfallChunk,
        optionalStepFailures,
        setFailureCount,
      });

      if (benchmarkCompleted) {
        advanceLoadingProgress(MODULAR_DOSSIER_STAGES[6], MODULAR_DOSSIER_TOTAL_STAGES);
      } else {
        replaceLoadingProgressStage(MODULAR_DOSSIER_STAGES[6], MODULAR_DOSSIER_TOTAL_STAGES);
      }

      const {
        accumulatedText: reconciledText,
        resolution: waterfallPortaResolution,
        portaIntegrityHold,
      } = await reconcileWaterfallPorta({
        sessionId,
        signal,
        resolvedMegaCompany,
        sessionCnpjDigits,
        dossierSeedContext,
        waterfallLookupContext,
        seniorEvidenceContext,
        accumulatedText,
        modulesByName,
        runWaterfallModule,
        optionalStepFailures,
        setFailureCount,
      });
      accumulatedText = reconciledText;

      if (optionalStepFailures.size > 0) {
        appendWaterfallChunk(
          `⚠️ Nota operacional: algumas frentes não puderam ser concluídas nesta rodada (${Array.from(optionalStepFailures).join(', ')}). O dossiê abaixo foi consolidado com o material validado disponível.`,
        );
      } else {
        setFailureCount(0);
      }

      const waterfallScorePorta = portaIntegrityHold
        ? null
        : ensureWaterfallScorePorta(accumulatedText, waterfallPortaResolution);
      const waterfallCleanText = stripPortaMarkers(accumulatedText).trim();
      const waterfallConstrainedText = sanitizeSensitivePersonalData(enforceSeniorEvidenceConstraints(
        waterfallCleanText,
        resolvedMegaCompany || waterfallClienteSeniorData?.grupo || 'empresa analisada',
        waterfallClienteSeniorData,
      ));
      const waterfallNarrativeBase = appendSeniorEvidenceNote(
        waterfallConstrainedText,
        resolvedMegaCompany || waterfallClienteSeniorData?.grupo || 'empresa analisada',
        waterfallClienteSeniorData,
      );
      const waterfallExecutiveIntro = buildMainDossierExecutiveIntro(
        waterfallNarrativeBase,
        normalizedCompany || resolvedMegaCompany || waterfallClienteSeniorData?.grupo || null,
        waterfallClienteSeniorData,
      );
      const waterfallFinalText = waterfallExecutiveIntro
        ? `${waterfallExecutiveIntro}\n\n---\n\n${waterfallNarrativeBase}`
        : waterfallNarrativeBase;
      const promotedInlineSources = await validateInlineSourcesForPromotion(
        waterfallFinalText,
        waterfallGroundingSources,
      );
      appendGroundingSources(promotedInlineSources);
      const hasFallbackVerified = Array.from(waterfallVerificationStatuses.values()).some(
        status => status === 'fallback_verified',
      ) || waterfallGroundingSources.some(source => source.verification === 'fallback');
      const hasUnverified = Array.from(waterfallVerificationStatuses.values()).some(status => status === 'unverified');
      const webVerificationStatus: WebVerificationStatus = waterfallGroundingSources.length > 0
        ? hasFallbackVerified
          ? 'fallback_verified'
          : 'verified'
        : hasUnverified
          ? 'unverified'
          : 'not_applicable';

      let waterfallSuggestions: string[] = [];
      try {
        waterfallSuggestions = await generateContinuityQuestion(
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
        );
      } catch (error) {
        scoutDiag.warn('ModularDossier', 'falha ao gerar sugestões finais do waterfall', {
          sessionId,
          company: resolvedMegaCompany || null,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      waterfallSuggestions = ensureContinuitySuggestions(
        waterfallSuggestions,
        resolvedMegaCompany || normalizedCompany || waterfallClienteSeniorData?.grupo || null,
        { contextText: waterfallFinalText },
      );

      updateSessionById(sessionId, session => {
        const finalCompany = normalizedCompany || session.empresaAlvo || pickCompanyLabel(session.title);
        return {
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
                  groundingUsed: webVerificationStatus === 'not_applicable'
                    ? undefined
                    : webVerificationStatus === 'verified' || webVerificationStatus === 'fallback_verified',
                  suggestions: waterfallSuggestions,
                  isThinking: false,
                }
              : message,
          ),
        };
      });

      completeLoadingProgress();
    },
    [
      advanceLoadingProgress,
      canUseLookup,
      completeLoadingProgress,
      replaceLoadingProgressStage,
      resetLoadingProgress,
      resolvedOperatorName,
      setFailureCount,
      updateSessionById,
    ],
  );

  return { runMegaPromptWaterfall };
}
