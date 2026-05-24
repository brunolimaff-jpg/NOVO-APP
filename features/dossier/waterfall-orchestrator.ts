import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MODULAR_DOSSIER_STAGES } from '../../constants/loadingStages';
import {
  PROMPT_CAMINHO_DE_VENDA,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_TEIA_IDENTITY_MODULE,
  PROMPT_TEIA_DEEP_MODULE,
  SHARED_FOUNDATION_BLOCK,
} from '../../prompts/megaPrompts';
import { generateContinuityQuestion, generateDossierModule } from '../../services/geminiService';
import { formatarParaPrompt, lookupCliente } from '../../services/clientLookupService';
import { buscarContextoDocsPinecone, buscarContextoPinecone } from '../../services/ragService';
import { getContextoConcorrentesRegionais } from '../../services/competitorService';
import { generatePortaContextForDeepDive } from '../../services/portaStateService';
import { fetchCompanyByCnpj } from '../../services/brasilApiService';
import { useMaybeChatStore } from '../../stores/chatStore';
import { type ChatSession, type ClienteSeniorData, Sender, type WebVerificationStatus } from '../../types';
import { scoutDiag } from '../../utils/diagnosticLog';
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
const FIRST_MODULE_INDEX = 0;

type TeiaComplexity = 'BAIXA' | 'MEDIA' | 'ALTA';

interface TeiaResearchContext {
  text: string;
  objectiveComplexity: TeiaComplexity | null;
}

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

function hasHoldingSignal(value: string): boolean {
  return /holding|participa[cç][oõ]es|investimentos|s\/a|s\.a\./i.test(value || '');
}

function hasInternationalSignal(value: string): boolean {
  return /colombia|colômbia|s\.?a\.?s\.?|nit|filial no exterior|subsidi[aá]ria no exterior|registro estrangeiro/i.test(value || '');
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
  const query = `holding socios QSA grupo economico ${company}`.trim();
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
        const partnerText = `${partner.name || 'Socio sem nome'} — ${partner.role || 'qualificacao nao informada'} (${partner.source})`;
        if (hasHoldingSignal(partnerText)) hasHolding = true;
        return `- ${partnerText}`;
      });

      blocks.push([
        '[QSA OFICIAL]',
        `Empresa: ${companyData.companyName}`,
        `CNPJ raiz: ${companyData.cnpj}`,
        companyData.cnaeDescricao ? `CNAE principal: ${companyData.cnaeDescricao}` : '',
        `Sócios confirmados: ${qsaCount}`,
        qsaLines.join('\n'),
      ].filter(Boolean).join('\n'));
    } catch (error) {
      scoutDiag.warn('TeiaSocietaria', 'falha ao buscar QSA oficial para contexto do waterfall', {
        company,
        cnpj: normalizedCnpj,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const [ragContext, docsContext] = await Promise.all([
    buscarContextoPinecone(query, company).catch(error => {
      scoutDiag.warn('TeiaSocietaria', 'RAG da teia falhou', {
        company,
        error: error instanceof Error ? error.message : String(error),
      });
      return { context: '', failed: true };
    }),
    buscarContextoDocsPinecone(query).catch(error => {
      scoutDiag.warn('TeiaSocietaria', 'Docs RAG da teia falhou', {
        company,
        error: error instanceof Error ? error.message : String(error),
      });
      return { context: '', failed: true };
    }),
  ]);

  if (ragContext.context) blocks.push(`[CONTEXTO RAG]\n${ragContext.context}`);
  if (docsContext.context) blocks.push(`[DOCS RAG]\n${docsContext.context}`);

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
  } catch (err) {
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
    const foundCnpjs = [...new Set(
      (generatedText.match(cnpjPattern) || []).map((c: string) => c.replace(/\D/g, '')),
    )];

    if (foundCnpjs.length > 0) {
      const knownCnpjs = [...new Set(
        (knownContext.match(cnpjPattern) || []).map((c: string) => c.replace(/\D/g, '')),
      )];
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
        warnings.push(
          `🔍 CNPJs com raiz nao confirmada: ${unconfirmedRoots.join(', ')}.`,
        );
      }
    }

    const internationalPatterns = [
      { regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ (S\.?A\.?S\.?)(?!\s*(Brasil|BR|CNPJ))/gi, label: 'S.A.S. (Colômbia/França)' },
      { regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ B\.?V\.?(?!\s*(Brasil|BR|CNPJ))/gi, label: 'B.V. (Holanda)' },
      { regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ (GmbH|G\.m\.b\.H\.)(?!\s*(Brasil|BR|CNPJ))/gi, label: 'GmbH (Alemanha)' },
      { regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ (Inc\.?|LLC|Corp\.?)(?!\s*(Brasil|BR|CNPJ))/gi, label: 'Inc./LLC (EUA)' },
      { regex: /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+ (Ltd\.?|Limited)(?!\s*(Brasil|BR|CNPJ|LTDA|Ltda))/gi, label: 'Ltd. (UK/Hong Kong)' },
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
      const labels = [...new Set(
        [...foundInternational].map(name => {
          for (const { regex, label } of internationalPatterns) {
            regex.lastIndex = 0;
            if (regex.test(name)) return label;
          }
          return 'Internacional';
        }),
      )].join('; ');
      warnings.push(
        `🌐 Entidade(s) internacional(is) detectada(s) sem CNPJ: ${names} (${labels}). Conexoes internacionais exigem comprovacao documental (registro estrangeiro, socio comum com CPF, ou fonte oficial com URL). Se nao houver evidencia concreta, a conexao e INFERIDA e nao deve ser tratada como fato.`,
      );
    }
  } catch (err) {
    warnings.push(`⚠️ Validação CNPJ: erro ao processar CNPJs gerados: ${err instanceof Error ? err.message : String(err)}`);
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
      const teiaResearchContext = await buildTeiaResearchContext({
        company: resolvedMegaCompany || waterfallClienteSeniorData?.grupo || 'empresa analisada',
        sessionCnpjDigits,
        signal,
      });

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
          [
            dossierSeedContext,
            waterfallLookupContext,
            seniorEvidenceContext,
            teiaResearchContext.text,
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

      const runTeiaSocietariaOrchestration = async (): Promise<string> => {
        let identityResult: string;

        try {
          identityResult = await generateDossierModule(
            'Teia Societaria — Identidade',
            resolvedMegaCompany || 'Empresa',
            SHARED_FOUNDATION_BLOCK,
            PROMPT_TEIA_IDENTITY_MODULE,
            [
              dossierSeedContext,
              waterfallLookupContext,
              seniorEvidenceContext,
              teiaResearchContext.text,
              accumulatedText
                ? `Contexto anterior consolidado:\n${accumulatedText.slice(-WATERFALL_CONTEXT_WINDOW_CHARS)}`
                : '',
            ]
              .filter(Boolean)
              .join('\n\n'),
            {
              signal,
              timeoutMs: MODULAR_REQUIRED_STEP_TIMEOUT_MS,
              useGrounding: true,
              temperature: 0.1,
              onGroundingSources: appendGroundingSources,
              onVerificationStatus: rememberVerificationStatus,
            },
          );
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
        const detectedLevels = allMatches.map(m => m[1]?.toUpperCase()).filter(Boolean) as Array<'BAIXA' | 'MEDIA' | 'ALTA'>;

        let complexity: TeiaComplexity = detectedLevels.includes('ALTA') ? 'ALTA'
          : detectedLevels.includes('MEDIA') ? 'MEDIA'
          : detectedLevels.includes('BAIXA') ? 'BAIXA'
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

        if (
          teiaResearchContext.objectiveComplexity
          && (detectedLevels.length === 0 || complexity === 'BAIXA')
        ) {
          complexity = teiaResearchContext.objectiveComplexity;
          scoutDiag.warn('TeiaSocietaria', 'complexidade ajustada por evidencia objetiva da teia', {
            sessionId,
            company: resolvedMegaCompany || null,
            detectedLevels,
            chosen: complexity,
          });
        }

        const strippedIdentity = identityResult.replace(/\[\[TEIA_COMPLEXIDADE:(BAIXA|MEDIA|ALTA)\]\]/gi, '').trim();

        let combinedTeiaText = strippedIdentity;

        if (complexity === 'MEDIA' || complexity === 'ALTA') {
          try {
            const deepResult = await generateDossierModule(
              'Teia Societaria — Profundidade',
              resolvedMegaCompany || 'Empresa',
              SHARED_FOUNDATION_BLOCK,
              PROMPT_TEIA_DEEP_MODULE,
              [
                dossierSeedContext,
                waterfallLookupContext,
                seniorEvidenceContext,
                teiaResearchContext.text,
                combinedTeiaText
                  ? `Contexto anterior consolidado:\n${combinedTeiaText.slice(-WATERFALL_CONTEXT_WINDOW_CHARS)}`
                  : '',
              ]
                .filter(Boolean)
                .join('\n\n'),
              {
                signal,
                timeoutMs: MODULAR_REQUIRED_STEP_TIMEOUT_MS,
                useGrounding: true,
                temperature: 0.1,
                onGroundingSources: appendGroundingSources,
                onVerificationStatus: rememberVerificationStatus,
              },
            );
            combinedTeiaText += '\n\n---\n\n' + deepResult;
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

        return warnings.length > 0
          ? [
            validatedText,
            '### Alertas de validação societária',
            ...warnings.map(warning => `- ${warning}`),
          ].join('\n\n')
          : validatedText;
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
          let moduleResult: string;
          if (index === FIRST_MODULE_INDEX) {
            moduleResult = await runTeiaSocietariaOrchestration();
          } else {
            moduleResult = await runWaterfallModule(module, accumulatedText);
          }
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
      const waterfallFinalText = waterfallNarrativeBase;
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
