import React, { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useOffline } from './hooks/useOffline';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import { useSessionStorage } from './hooks/useSessionStorage';
import { useRadar } from './hooks/useRadar';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useChatLoadingProgress } from './features/chat/loading-progress';
import { useSessionManager, useSessionRemoteSave } from './features/chat/session-controller';
import { useChatFeedbackActions } from './features/chat/feedback-actions';
import {
  useChatMessageOrchestrator,
  type LastAction,
  type RunMegaPromptWaterfallArgs,
} from './features/chat/message-orchestrator';
import {
  ensureContinuitySuggestions,
  isAbortLikeError,
  pickCompanyLabel,
} from './features/chat/message-helpers';
import { useUpdateNotification } from './hooks/useUpdateNotification';
import ToastContainer from './components/ToastContainer';
import ChatInterface from './components/ChatInterface';
import LoadingSmart from './components/LoadingSmart';
import { EmailModal } from './components/EmailModal';
import { FollowUpModal } from './components/FollowUpModal';
import { UpdateNotificationModal } from './components/UpdateNotificationModal';
import InstallPrompt from './components/InstallPrompt';
import { CRMView } from './components/CRMView';
import { AdminDash } from './components/AdminDash';
import { useOperator } from './contexts/OperatorContext';
import { useMode } from './contexts/ModeContext';
import { useCRM } from './contexts/CRMContext';
import { loadWithChunkRetry } from './utils/chunkRetry';
import SuspenseWithError from './components/SuspenseWithError';
const CRMDetail = React.lazy(() =>
  loadWithChunkRetry(() => import('./components/CRMDetail')).then(m => ({ default: m.CRMDetail })),
);
import {
  Message,
  Sender,
  ChatSession,
  ExportFormat,
  ReportType,
  AppError,
  CRMStage,
  ClienteSeniorData,
  PortaDimension,
  ScorePortaData,
} from './types';
import {
  generateContinuityQuestion,
  generateDossierModule,
  getIsolatedBenchmark,
} from './services/geminiService';
import { resolvePortaScore, stripPortaMarkers, type PortaScoreResolution } from './utils/porta';
import { formatarParaPrompt, lookupCliente } from './services/clientLookupService';
import {
  appendSeniorEvidenceNote,
  buildSeniorEvidenceContext,
  extractClienteSeniorData,
} from './utils/seniorEvidence';
import {
  MODULAR_DOSSIER_STAGES,
} from './constants/loadingStages';

import {
  SHARED_FOUNDATION_BLOCK,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_ORCAMENTO_JANELA_GOD_MODE,
} from './prompts/megaPrompts';
import { APP_NAME, DEFAULT_MODE } from './constants';
import { normalizeAppError } from './utils/errorHelpers';
import { downloadFile } from './utils/downloadHelpers';
import { cleanTitle, sanitizeLoadingContextText } from './utils/textCleaners';
import { fixFakeLinksHTML } from './utils/linkFixer';
import { BACKEND_URL } from './services/apiConfig';
import { extractCompanyName } from './utils/companyNameExtractor';
import { convertMarkdownToHTML, simpleMarkdownToHtml } from './utils/markdownToHtml';
import {
  buildMainDossierExecutiveIntro,
  collectFullReport,
  detectInconsistencies,
  generateExecutiveSummary,
  normalizeMermaidBlocks,
} from './utils/reportUtils';
import { getFeatureAccess } from './utils/featureAccess';
import { scoutDiag } from './utils/diagnosticLog';
import FooterCredits from './components/FooterCredits';

// --- INJETADO ANALYTICS AQUI ---
import { Analytics } from "@vercel/analytics/react";
// --- INJETADO SPEED INSIGHTS AQUI ---
import { SpeedInsights } from "@vercel/speed-insights/react";

const PAGE_SIZE = 20;
type FollowUpScheduleResult = { ok: boolean; method?: 'outlook' | 'ics'; error?: string };

function buildDossierSeedContext(rawPrompt: string): string {
  if (!rawPrompt) return '';

  const sections = [
    rawPrompt.match(/Contexto cadastral obrigatório:[^\n]+/i)?.[0]?.trim(),
    rawPrompt.match(/<radar_context>[\s\S]*?<\/radar_context>/i)?.[0]?.trim(),
  ].filter(Boolean);

  return sections.join('\n\n');
}

function isTopicDeepDiveDisplayMessage(displayMessage: string | undefined): boolean {
  const safeDisplay = (displayMessage || '').trim();
  return /^Dossi[êe]\s+completo:\s*/i.test(safeDisplay);
}

const MAX_FAILURES_BEFORE_FEEDBACK = 2;
const MODULAR_DOSSIER_TOTAL_STAGES = 7;
const MODULAR_REQUIRED_STEP_TIMEOUT_MS = 90000;
const MODULAR_OPTIONAL_STEP_TIMEOUT_MS = 60000;
const MODULAR_BENCHMARK_TIMEOUT_MS = 45000;

const HARD_WATERFALL_SCORE_FALLBACK: ScorePortaData = {
  score: 60,
  p: 6,
  o: 6,
  r: 6,
  t: 6,
  a: 6,
  segmento: 'PRD',
  flags: [],
  scoreBruto: 60,
};

const PORTA_DIMENSION_MODULE_MAP: Record<PortaDimension, string[]> = {
  P: ['Estratégia & Expansão'],
  O: ['Raio-X Operacional'],
  R: ['Riscos & Compliance'],
  T: ['Tech Stack'],
  A: ['RH & Decisores'],
};
const PORTA_FALLBACK_MARKERS: Record<PortaDimension, string> = {
  P: '[[PORTA_FEED_P:6:HA:0:CNPJS:0:FAT:NA]]',
  O: '[[PORTA_FEED_O:6:ELOS:Plantio]]',
  R: '[[PORTA_FEED_R:6:PRESSOES:Sem_pressao_identificada]]',
  T: '[[PORTA_FEED_T:6:T1:6:T2:6:T3:6:STACK:NA]]',
  A: '[[PORTA_FEED_A:6:A1:6:A2:6:GERACAO:NA]]',
};

export function resolveModuleNamesForMissingDimensions(missingDimensions: PortaDimension[]): string[] {
  return Array.from(
    new Set(missingDimensions.flatMap(dimension => PORTA_DIMENSION_MODULE_MAP[dimension] || [])),
  );
}

export function buildPortaReconciliationPrompt(missingDimensions: PortaDimension[]): string {
  const uniqueMissingDimensions = Array.from(new Set(missingDimensions));
  const requiredTemplates = uniqueMissingDimensions
    .map(dimension => `- ${dimension}: ${PORTA_FALLBACK_MARKERS[dimension]}`)
    .join('\n');

  return `
MISSÃO: Reconciliação final do Score PORTA.

Você receberá o contexto consolidado da investigação já executada.
Seu trabalho é emitir SOMENTE os markers PORTA faltantes para as dimensões abaixo.

DIMENSÕES FALTANTES: ${uniqueMissingDimensions.join(', ')}

REGRAS OBRIGATÓRIAS:
1. Saída sem explicações e sem markdown: apenas linhas de markers.
2. Use APENAS os formatos abaixo para cada dimensão solicitada.
3. Todas as notas devem ser inteiras de 0 a 10.
4. Não repita dimensões que não foram solicitadas.

FORMATOS POR DIMENSÃO:
${requiredTemplates}
`.trim();
}

export interface PortaTechnicalFallbackResult {
  content: string;
  resolution: PortaScoreResolution;
  fallbackApplied: boolean;
  fallbackDimensions: PortaDimension[];
}

export function buildPortaFallbackChunk(missingDimensions: PortaDimension[]): string {
  const uniqueMissingDimensions = Array.from(new Set(missingDimensions));
  if (uniqueMissingDimensions.length === 0) return '';
  return uniqueMissingDimensions
    .map(dimension => PORTA_FALLBACK_MARKERS[dimension])
    .filter(Boolean)
    .join('\n');
}

export function applyPortaTechnicalFallback(
  content: string,
  currentResolution?: PortaScoreResolution,
): PortaTechnicalFallbackResult {
  const resolution = currentResolution ?? resolvePortaScore(content);
  const fallbackDimensions = Array.from(new Set(resolution.missingDimensions));
  if (resolution.score || fallbackDimensions.length === 0) {
    return {
      content,
      resolution,
      fallbackApplied: false,
      fallbackDimensions: [],
    };
  }

  const fallbackChunk = buildPortaFallbackChunk(fallbackDimensions);
  if (!fallbackChunk) {
    return {
      content,
      resolution,
      fallbackApplied: false,
      fallbackDimensions,
    };
  }

  const nextContent = `${content.trim()}\n\n${fallbackChunk}`.trim();
  const nextResolution = resolvePortaScore(nextContent);
  return {
    content: nextContent,
    resolution: nextResolution,
    fallbackApplied: true,
    fallbackDimensions,
  };
}

export function ensureWaterfallScorePorta(
  content: string,
  currentResolution: PortaScoreResolution,
): ScorePortaData {
  if (currentResolution.score) return currentResolution.score;

  const resolvedAgain = resolvePortaScore(content);
  if (resolvedAgain.score) return resolvedAgain.score;

  const technicalFallback = applyPortaTechnicalFallback(content, resolvedAgain);
  if (technicalFallback.resolution.score) return technicalFallback.resolution.score;

  return { ...HARD_WATERFALL_SCORE_FALLBACK };
}

export function shouldHoldWaterfallScoreForIntegrity(currentResolution: PortaScoreResolution): boolean {
  return !currentResolution.score && currentResolution.missingDimensions.length === 5;
}

const App: React.FC = () => {
  const { name: operatorName, operatorId, clearName } = useOperator();
  const { mode, systemInstruction } = useMode();
  const { cards, createCardFromSession, moveCardToStage } = useCRM();
  const { isOnline, wasOffline, clearWasOffline } = useOffline();
  const { isDarkMode, toggleTheme } = useTheme();
  const { sessions, setSessions, sessionsRef, isInitialized, setIsInitialized, loadSessions } = useSessionStorage();

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const {
    isLoading,
    setIsLoading,
    loadingStatus,
    failureCount,
    setFailureCount,
    completedLoadingStatuses,
    loadingTotalStages,
    loadingIsIncremental,
    requestKind,
    setRequestKind,
    loadingVariant,
    setLoadingVariant,
    loadingPinnedLabel,
    setLoadingPinnedLabel,
    resetLoadingProgress,
    advanceLoadingProgress,
    replaceLoadingProgressStage,
    completeLoadingProgress,
  } = useChatLoadingProgress();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [lastQuery, setLastQuery] = useState<string>('');
  const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  const [pdfReportContent, setPdfReportContent] = useState<string | null>(null);
  const [investigationLogged, setInvestigationLogged] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'crm' | 'admin'>('chat');
  const [selectedCRMCardId, setSelectedCRMCardId] = useState<string | null>(null);
  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailStatus, setEmailStatus] = useState<'sending' | 'sent' | 'error' | null>(null);

  // Follow-up modal state
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpDias, setFollowUpDias] = useState(7);
  const [followUpNotas, setFollowUpNotas] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Update notification state
  const { updateAvailable, currentVersion, newVersion, dismissUpdate, updateNow } = useUpdateNotification();

  const { toasts, toast, dismiss: dismissToast } = useToast();
  const radar = useRadar(toast);
  const lastActionRef = useRef<LastAction | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeGenerationRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showEmailModal) setShowEmailModal(false);
        if (showFollowUpModal) setShowFollowUpModal(false);
      }
    };
    if (showEmailModal || showFollowUpModal) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showEmailModal, showFollowUpModal]);

  const currentSession = sessions.find(s => s.id === currentSessionId) || null;
  const allMessages = Array.isArray(currentSession?.messages) ? currentSession.messages : [];
  const selectedCRMCard = selectedCRMCardId ? cards.find(c => c.id === selectedCRMCardId) || null : null;
  const featureAccess = getFeatureAccess();
  const canAccessMiniCRM = featureAccess.miniCRM;
  const canAccessDashboard = featureAccess.dashboard;
  const canAccessIntegrityCheck = featureAccess.integrityCheck;
  const canUseLookup = featureAccess.clientLookup;
  const canDeepDive = featureAccess.deepDive;
  const canWarRoom = featureAccess.warRoom;
  const resolvedOperatorName = operatorName.trim() || 'Vendedor';

  useEffect(() => {
    if (!canAccessMiniCRM && activeView === 'crm') {
      setActiveView('chat');
      setSelectedCRMCardId(null);
    }
  }, [activeView, canAccessMiniCRM]);

  const updateSessionById = useCallback(
    (sessionId: string, updater: (session: ChatSession) => ChatSession) => {
      setSessions(prev =>
        prev.map(s => (s.id === sessionId ? { ...updater(s), updatedAt: new Date().toISOString() } : s)),
      );
    },
    [setSessions],
  );

  const updateCurrentSession = useCallback(
    (updater: (session: ChatSession) => ChatSession) => {
      setSessions(prev => {
        const target = prev.find(s => s.id === currentSessionId);
        if (!target) return prev;
        return prev.map(s => (s.id === currentSessionId ? { ...updater(s), updatedAt: new Date().toISOString() } : s));
      });
    },
    [currentSessionId, setSessions],
  );

  const { isSavingRemote, remoteSaveStatus, setRemoteSaveStatus, handleSaveRemote } = useSessionRemoteSave({
    currentSession,
    operatorId,
    operatorName: resolvedOperatorName,
    updateSessionById,
  });
  const {
    handleReportError,
    handleFeedback,
    handleSendFeedback,
    handleSectionFeedback,
    handleToggleMessageSources,
  } = useChatFeedbackActions({
    currentSession,
    operatorId,
    operatorName,
    updateCurrentSession,
    updateSessionById,
  });

  useEffect(() => {
    document.title = APP_NAME;
  }, [mode]);

  const { handleNewSession, handleSelectSession, handleDeleteSession } = useSessionManager({
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    isLoading,
    abortControllerRef,
    activeGenerationRef,
    updateSessionById,
    setVisibleCount,
    setRemoteSaveStatus,
    setExportStatus,
    setPdfReportContent,
    setInvestigationLogged,
    lastActionRef,
    setLastQuery,
    resetLoadingProgress,
    setIsLoading,
  });

  useAppInitialization({
    loadSessions,
    setSessions,
    setCurrentSessionId,
    setIsSidebarOpen,
    setIsInitialized,
  });

  const handleClearChat = () => {
    updateCurrentSession(session => ({
      ...session,
      messages: [],
      title: 'Nova Investigação',
      empresaAlvo: null,
      updatedAt: new Date().toISOString(),
    }));
    setInvestigationLogged(false);
    resetLoadingProgress();
    setRequestKind('default');
    setLoadingVariant('hero');
    setLoadingPinnedLabel(null);
    lastActionRef.current = null;
    setLastQuery('');
    setVisibleCount(PAGE_SIZE);
  };

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

      const modules = [
        {
          name: 'Raio-X Operacional',
          prompt: PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
          stage: MODULAR_DOSSIER_STAGES[0],
          optional: false,
          timeoutMs: MODULAR_REQUIRED_STEP_TIMEOUT_MS,
        },
        {
          name: 'Tech Stack',
          prompt: PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
          stage: MODULAR_DOSSIER_STAGES[1],
          optional: true,
          timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
        },
        {
          name: 'Riscos & Compliance',
          prompt: PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
          stage: MODULAR_DOSSIER_STAGES[2],
          optional: true,
          timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
        },
        {
          name: 'Estratégia & Expansão',
          prompt: PROMPT_RADAR_EXPANSAO_GOD_MODE,
          stage: MODULAR_DOSSIER_STAGES[3],
          optional: true,
          timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
        },
        {
          name: 'RH & Decisores',
          prompt: PROMPT_RH_SINDICATOS_GOD_MODE,
          stage: MODULAR_DOSSIER_STAGES[4],
          optional: true,
          timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
        },
      ];

      const modulesByName = new Map(modules.map(module => [module.name, module]));

      const runWaterfallModule = async (
        module: (typeof modules)[number],
        contextHint: string = '',
        timeoutMs: number = module.timeoutMs,
      ): Promise<string> => {
        return generateDossierModule(
          module.name,
          resolvedMegaCompany || 'Empresa',
          SHARED_FOUNDATION_BLOCK,
          module.prompt,
          [
            dossierSeedContext,
            waterfallLookupContext,
            seniorEvidenceContext,
            contextHint ? `Objetivo desta passada:\n${contextHint}` : '',
            accumulatedText
              ? `Contexto anterior consolidado:\n${accumulatedText.slice(-2500)}`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
          { signal, timeoutMs },
        );
      };

      if (isFirstInteraction) {
        resetLoadingProgress(modules[0].stage, MODULAR_DOSSIER_TOTAL_STAGES);
      } else {
        resetLoadingProgress(modules[0].stage, MODULAR_DOSSIER_TOTAL_STAGES, {
          incremental: true,
          keepHistory: 4,
        });
      }

      for (let i = 0; i < modules.length; i++) {
        if (signal.aborted) break;

        const module = modules[i];
        if (i > 0) {
          if (previousStageCompleted) {
            advanceLoadingProgress(module.stage, MODULAR_DOSSIER_TOTAL_STAGES);
          } else {
            replaceLoadingProgressStage(module.stage, MODULAR_DOSSIER_TOTAL_STAGES);
          }
        }

        try {
          const moduleResult = await runWaterfallModule(module);

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

      let benchmarkCompleted = false;
      try {
        const benchmark = await getIsolatedBenchmark(resolvedMegaCompany, {
          signal,
          timeoutMs: MODULAR_BENCHMARK_TIMEOUT_MS,
        });
        if (benchmark) appendWaterfallChunk(benchmark);
        benchmarkCompleted = true;
        setFailureCount(0);
      } catch (error) {
        if (isAbortLikeError(error)) throw error;

        benchmarkCompleted = false;
        optionalStepFailures.add('Benchmark de mercado');
        setFailureCount(count => count + 1);
        scoutDiag.warn('ModularDossier', 'benchmark isolado falhou e será ignorado', {
          sessionId,
          company: resolvedMegaCompany || null,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (benchmarkCompleted) {
        advanceLoadingProgress(MODULAR_DOSSIER_STAGES[6], MODULAR_DOSSIER_TOTAL_STAGES);
      } else {
        replaceLoadingProgressStage(MODULAR_DOSSIER_STAGES[6], MODULAR_DOSSIER_TOTAL_STAGES);
      }

      let portaFallbackApplied = false;
      let portaFallbackDimensions: PortaDimension[] = [];
      let portaIntegrityHold = false;
      let waterfallPortaResolution = resolvePortaScore(accumulatedText);
      if (!waterfallPortaResolution.score && waterfallPortaResolution.missingDimensions.length > 0) {
        scoutDiag.warn('ModularDossier', 'dimensões PORTA ausentes após 1ª passada', {
          sessionId,
          company: resolvedMegaCompany || null,
          source: waterfallPortaResolution.source,
          missingDimensions: waterfallPortaResolution.missingDimensions,
        });

        const retryModuleNames = resolveModuleNamesForMissingDimensions(
          waterfallPortaResolution.missingDimensions,
        );
        for (const moduleName of retryModuleNames) {
          if (signal.aborted) break;
          const module = modulesByName.get(moduleName);
          if (!module) continue;

          scoutDiag.info?.('ModularDossier', 'retry de módulo para consolidar PORTA', {
            sessionId,
            company: resolvedMegaCompany || null,
            moduleName,
            missingDimensions: waterfallPortaResolution.missingDimensions,
          });
          try {
            const retryContextHintBase = `Reexecução obrigatória para consolidar dimensões PORTA faltantes: ${waterfallPortaResolution.missingDimensions.join(', ')}.`;
            const retryContextCnpjHint =
              sessionCnpjDigits.length === 14
                ? ` Use obrigatoriamente o CNPJ ${sessionCnpjDigits} como chave de entidade desta conta.`
                : '';
            const retryResult = await runWaterfallModule(
              module,
              `${retryContextHintBase}${retryContextCnpjHint}`,
              MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
            );
            appendWaterfallChunk(retryResult);
            optionalStepFailures.delete(moduleName);
            setFailureCount(0);
            scoutDiag.info?.('ModularDossier', 'retry de módulo concluído', {
              sessionId,
              company: resolvedMegaCompany || null,
              moduleName,
            });
          } catch (error) {
            if (isAbortLikeError(error)) throw error;
            optionalStepFailures.add(moduleName);
            setFailureCount(count => count + 1);
            scoutDiag.warn('ModularDossier', 'retry de módulo falhou', {
              sessionId,
              company: resolvedMegaCompany || null,
              moduleName,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        waterfallPortaResolution = resolvePortaScore(accumulatedText);
      }

      if (!waterfallPortaResolution.score && waterfallPortaResolution.missingDimensions.length > 0) {
        scoutDiag.warn('ModularDossier', 'acionando reconciliador de markers PORTA', {
          sessionId,
          company: resolvedMegaCompany || null,
          missingDimensions: waterfallPortaResolution.missingDimensions,
        });

        try {
          const reconciliationChunk = await generateDossierModule(
            'Reconciliação PORTA',
            resolvedMegaCompany || 'Empresa',
            SHARED_FOUNDATION_BLOCK,
            buildPortaReconciliationPrompt(waterfallPortaResolution.missingDimensions),
            [
              dossierSeedContext,
              waterfallLookupContext,
              seniorEvidenceContext,
              `Contexto consolidado da rodada:\n${accumulatedText.slice(-12000)}`,
              `Dimensões pendentes para emissão de markers: ${waterfallPortaResolution.missingDimensions.join(', ')}`,
            ]
              .filter(Boolean)
              .join('\n\n'),
            { signal, timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS },
          );
          appendWaterfallChunk(reconciliationChunk);
          scoutDiag.info?.('ModularDossier', 'reconciliador PORTA concluído', {
            sessionId,
            company: resolvedMegaCompany || null,
            emittedChars: reconciliationChunk.length,
          });
        } catch (error) {
          if (isAbortLikeError(error)) throw error;
          scoutDiag.error('ModularDossier', 'reconciliador PORTA falhou', {
            sessionId,
            company: resolvedMegaCompany || null,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        waterfallPortaResolution = resolvePortaScore(accumulatedText);
      }

      if (shouldHoldWaterfallScoreForIntegrity(waterfallPortaResolution)) {
        portaIntegrityHold = true;
        portaFallbackApplied = true;
        portaFallbackDimensions = Array.from(new Set(waterfallPortaResolution.missingDimensions));
        scoutDiag.error('ModularDossier', 'integridade PORTA comprometida após retries e reconciliação', {
          sessionId,
          company: resolvedMegaCompany || null,
          missingDimensions: waterfallPortaResolution.missingDimensions,
        });
      } else if (!waterfallPortaResolution.score && waterfallPortaResolution.missingDimensions.length > 0) {
        const portaFallbackResult = applyPortaTechnicalFallback(accumulatedText, waterfallPortaResolution);
        if (portaFallbackResult.fallbackApplied) {
          accumulatedText = portaFallbackResult.content;
          waterfallPortaResolution = portaFallbackResult.resolution;
          portaFallbackApplied = true;
          portaFallbackDimensions = portaFallbackResult.fallbackDimensions;
          scoutDiag.warn('ModularDossier', 'fallback técnico aplicado para dimensões PORTA ausentes', {
            sessionId,
            company: resolvedMegaCompany || null,
            sourceBeforeFallback: 'feeds',
            fallbackDimensions: portaFallbackDimensions,
            resolvedAfterFallback: Boolean(waterfallPortaResolution.score),
          });
        }
      }

      if (!portaIntegrityHold && !waterfallPortaResolution.score && waterfallPortaResolution.missingDimensions.length > 0) {
        scoutDiag.error('ModularDossier', 'falha técnica na consolidação do score PORTA', {
          sessionId,
          company: resolvedMegaCompany || null,
          source: waterfallPortaResolution.source,
          missingDimensions: waterfallPortaResolution.missingDimensions,
        });
        throw new Error(
          `Falha técnica ao consolidar Score PORTA (dimensões ausentes: ${waterfallPortaResolution.missingDimensions.join(', ')})`,
        );
      }

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
      const waterfallNarrativeBase = appendSeniorEvidenceNote(
        waterfallCleanText,
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
                  portaFallbackApplied: portaFallbackApplied ? true : undefined,
                  portaFallbackDimensions: portaFallbackApplied ? portaFallbackDimensions : undefined,
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

  const { handleSendMessage, retryLastSendMessage } = useChatMessageOrchestrator({
    currentSessionId,
    setSessions,
    setCurrentSessionId,
    sessionsRef,
    lastActionRef,
    abortControllerRef,
    activeGenerationRef,
    updateSessionById,
    systemInstruction,
    mode,
    resolvedOperatorName,
    canUseLookup,
    requestKind,
    setRequestKind,
    setIsLoading,
    resetLoadingProgress,
    advanceLoadingProgress,
    completeLoadingProgress,
    setFailureCount,
    setLoadingVariant,
    setLoadingPinnedLabel,
    setVisibleCount,
    setLastQuery,
    toast,
    investigationLogged,
    setInvestigationLogged,
    runMegaPromptWaterfall,
  });

  const handleDeepDive = async (displayMessage: string, hiddenPrompt: string, forcedCompanyName?: string) => {
    const empresaContext =
      forcedCompanyName?.trim() || currentSession?.empresaAlvo || currentSession?.title || 'a empresa desta conversa';
    const isTopicDeepDive = isTopicDeepDiveDisplayMessage(displayMessage);
    if (isTopicDeepDive && !canDeepDive) {
      scoutDiag.info?.('App', 'tentativa de Deep Dive bloqueada por feature flag', {
        sessionId: currentSessionId,
        displayMessage,
      });
      return;
    }
    const topicLabel = displayMessage.replace(/^Dossi[êe]\s+completo:\s*/i, '').trim();
    await handleSendMessage(
      `Dossiê completo de [${empresaContext}]. Protocolo de investigação forense especializada:\n\n${hiddenPrompt}`,
      displayMessage,
      empresaContext,
      {
        requestKind: isTopicDeepDive ? 'deep_dive' : 'default',
        fixedLoadingLine:
          isTopicDeepDive && topicLabel
            ? `Deep Dive em andamento: ${topicLabel}`
            : isTopicDeepDive
              ? 'Deep Dive em andamento'
              : undefined,
      },
    );
  };

  const handleDeleteMessage = (id: string) => {
    if (!currentSessionId) return;
    updateSessionById(currentSessionId, session => {
      const msgIndex = session.messages.findIndex(m => m.id === id);
      if (msgIndex === -1) return session;
      return { ...session, messages: (session.messages || []).slice(0, msgIndex) };
    });
  };

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setLoadingPinnedLabel(null);
    }
  }, []);

  const handleRetry = () => {
    if (!lastActionRef.current) return;
    if (lastActionRef.current.type === 'sendMessage') {
      retryLastSendMessage();
    } else if (lastActionRef.current.type === 'regenerateSuggestions') {
      handleRegenerateSuggestions(lastActionRef.current.payload.messageId || '');
    }
  };

  const handleRegenerateSuggestions = async (messageId: string) => {
    const sessionId = currentSessionId;
    if (!sessionId) return;
    lastActionRef.current = { type: 'regenerateSuggestions', payload: { messageId } };
    const targetSession = sessions.find(s => s.id === sessionId);
    if (!targetSession) return;
    const targetMessage = targetSession.messages.find(m => m.id === messageId);
    if (!targetMessage) return;
    const companyName =
      targetSession.empresaAlvo || extractCompanyName(targetSession.title || '') || 'Empresa não identificada';
    const nomeVendedor = resolvedOperatorName;
    const oldSuggestions = Array.isArray(targetMessage.suggestions)
      ? targetMessage.suggestions
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
      : [];

    updateSessionById(sessionId, session => ({
      ...session,
      messages: (session.messages || []).map(msg => (msg.id === messageId ? { ...msg, isRegeneratingSuggestions: true } : msg)),
    }));
    try {
      const newSuggestions = await generateContinuityQuestion(
        targetSession.messages,
        companyName,
        nomeVendedor,
        {
          mode: 'regenerate',
          avoidSuggestions: oldSuggestions,
          ensureFresh: true,
        },
      );
      updateSessionById(sessionId, session => ({
        ...session,
        messages: (session.messages || []).map(msg =>
          msg.id === messageId ? { ...msg, suggestions: newSuggestions, isRegeneratingSuggestions: false } : msg,
        ),
      }));
    } catch (e: unknown) {
      console.warn('Suggestion regeneration failed', e);
      toast.error(e instanceof Error ? e.message : 'Falha na conexão com a IA.');
      updateSessionById(sessionId, session => ({
        ...session,
        messages: (session.messages || []).map(msg =>
          msg.id === messageId ? { ...msg, isRegeneratingSuggestions: false } : msg,
        ),
      }));
    }
  };

  async function handleExportPDF() {
    try {
      const { text: fullText, sections, allLinks } = collectFullReport(allMessages);
      if (!fullText || fullText.length < 100) {
        alert('Nenhum dossiê para exportar.');
        return;
      }
      const inconsistenciesSection = detectInconsistencies(sections);
      const normalizedFullText = normalizeMermaidBlocks(fullText);
      const executiveSummary = generateExecutiveSummary(normalizedFullText, sections, inconsistenciesSection);
      const finalText = `${executiveSummary}\n\n---\n\n${normalizedFullText}${inconsistenciesSection}`;
      const empresa = cleanTitle(extractCompanyName(currentSession?.title));
      const now = new Date();
      const dataStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      const horaStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const metaLine = `${dataStr} às ${horaStr} · ${sections.length} seção${sections.length !== 1 ? 'ões' : ''}`;
      const { PDFGenerator } = await import('./utils/PDFGenerator');
      const pdf = new PDFGenerator();
      pdf.addHeader(empresa, metaLine);
      await pdf.renderMarkdown(finalText);
      pdf.addSources(allLinks.map(l => ({ text: l.title || l.url, url: l.url })));
      const safeTitle = empresa.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      pdf.save(`SeniorScout_${safeTitle}_${now.toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error('Erro ao gerar PDF:', e);
      toast.error('Erro ao gerar PDF. Tente novamente.');
    }
  }

  const handleExportConversation = async (format: ExportFormat, reportType: ReportType) => {
    if (!currentSession) return;
    setExportStatus('loading');
    setExportError(null);
    try {
      const { text: fullText, sections } = collectFullReport(currentSession.messages);
      const inconsistenciesSection = detectInconsistencies(sections);
      const normalizedText = normalizeMermaidBlocks(fullText);
      const executiveSummary = generateExecutiveSummary(normalizedText, sections, inconsistenciesSection);
      const contentMarkdown =
        reportType === 'executive'
          ? executiveSummary
          : `${executiveSummary}\n\n---\n\n${normalizedText}${inconsistenciesSection}`;
      const safeTitle = cleanTitle(currentSession.title).replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      const dateStr = new Date().toISOString().slice(0, 10);
      const reportSuffix = reportType === 'executive' ? 'EXEC' : reportType === 'tech' ? 'FICHA' : 'DOSSIE';
      const filename = `SeniorScout_${safeTitle}_${reportSuffix}_${dateStr}`;
      if (format === 'md') {
        downloadFile(`${filename}.md`, contentMarkdown, 'text/markdown;charset=utf-8');
      } else if (format === 'doc') {
        const htmlContent = simpleMarkdownToHtml(contentMarkdown, currentSession.title);
        downloadFile(`${filename}.doc`, htmlContent, 'application/msword');
      }
      setExportStatus('success');
      setTimeout(() => setExportStatus('idle'), 3000);
    } catch (error: unknown) {
      setExportError(error instanceof Error ? error.message : 'Falha ao gerar o arquivo.');
      setExportStatus('error');
    }
  };

  async function handleSendEmail() {
    if (!emailTo.includes('@')) return;
    setEmailStatus('sending');
    try {
      const { text: fullText, sections } = collectFullReport(allMessages);
      if (!fullText || fullText.length < 100) {
        setEmailStatus('error');
        return;
      }
      const inconsistenciesSection = detectInconsistencies(sections);
      const htmlBody = fixFakeLinksHTML(convertMarkdownToHTML(fullText + inconsistenciesSection, true));
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'sendEmail',
          email: emailTo,
          subject: emailSubject,
          body: htmlBody,
          empresa: cleanTitle(extractCompanyName(currentSession?.title)),
          vendedor: resolvedOperatorName,
        }),
      });
      const text = await response.text();
      let result: { success: boolean };
      try {
        result = JSON.parse(text) as { success: boolean };
      } catch {
        result = response.ok ? { success: true } : { success: false };
      }
      if (result.success) {
        setEmailStatus('sent');
        setTimeout(() => {
          setShowEmailModal(false);
          setEmailStatus(null);
          setEmailTo('');
        }, 3000);
      } else {
        setEmailStatus('error');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      scoutDiag.warn('Email', 'handleSendEmail falhou', { error: message });
      setEmailStatus('error');
      toast.error('Falha ao enviar email. Verifique sua conexão.');
    }
  }

  function handleScheduleFollowUp(result: FollowUpScheduleResult) {
    setFollowUpStatus('sending');
    if (result.ok) {
      setFollowUpStatus('sent');
      setTimeout(() => {
        setShowFollowUpModal(false);
        setFollowUpStatus('idle');
        setFollowUpNotas('');
      }, 2200);
      return;
    }
    setFollowUpStatus('error');
    toast.error(result.error || 'Não foi possível preparar o follow-up.');
  }

  const handleSaveToCRM = async (sessionId: string) => {
    if (!canAccessMiniCRM) {
      toast.error('Mini CRM indisponível no modo MVP.');
      return;
    }
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const existingCard = cards.find(c => c.id === `crm_${sessionId}`);
    if (existingCard) {
      setSelectedCRMCardId(existingCard.id);
      setActiveView('crm');
      toast.success('Empresa já existe no CRM.');
      return;
    }
    const card = await createCardFromSession(session);
    toast.success(`${card.companyName} adicionada ao CRM!`);
    setSelectedCRMCardId(card.id);
    setActiveView('crm');
  };

  const handleMoveStageFromDetail = async (stage: string) => {
    if (selectedCRMCardId) await moveCardToStage(selectedCRMCardId, stage as CRMStage);
  };

  const handleSelectSessionFromDetail = async (sessionId: string) => {
    await handleSelectSession(sessionId);
    setActiveView('chat');
    setSelectedCRMCardId(null);
  };

  const handleCreateSessionFromDetail = () => {
    if (!selectedCRMCard) return;
    const companyName = selectedCRMCard.companyName || 'Empresa';
    setSelectedCRMCardId(null);
    setActiveView('chat');
    setTimeout(() => {
      handleNewSession();
      window.dispatchEvent(new CustomEvent('scout:prefill', { detail: { text: companyName } }));
    }, 80);
  };

  const handleOpenKanbanSafe = () => {
    if (!canAccessMiniCRM) {
      toast.error('Mini CRM indisponível no modo MVP.');
      return;
    }
    setActiveView('crm');
    setSelectedCRMCardId(null);
  };

  if (!isInitialized) {
    return (
      <div
        className={`flex h-screen w-full items-center justify-center ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} animate-pulse`}>
            Preparando ambiente...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!isOnline && (
        <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 text-amber-950 text-xs font-semibold py-1.5 px-4 shadow-lg">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M8.464 8.464a5 5 0 000 7.072M5.636 5.636a9 9 0 000 12.728M12 12v.01"
            />
          </svg>
          Sem conexão — algumas funções ficam indisponíveis offline
        </div>
      )}

      {isOnline && wasOffline && (
        <div
          className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-emerald-600 text-white text-xs font-semibold py-1.5 px-4 shadow-lg cursor-pointer"
          onClick={clearWasOffline}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Conexão restabelecida ✕
        </div>
      )}

      <div
        className={`flex h-[100dvh] min-h-screen w-full flex-col overflow-hidden overscroll-none ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}
      >
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeView === 'admin' ? (
            <AdminDash
              sessions={sessions}
              isDarkMode={isDarkMode}
              onClose={() => setActiveView('chat')}
            />
          ) : activeView === 'chat' || !canAccessMiniCRM ? (
            <ChatInterface
              currentSession={currentSession}
              sessions={sessions}
              onNewSession={handleNewSession}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              onSaveToCRM={handleSaveToCRM}
              onOpenKanban={handleOpenKanbanSafe}
              onOpenAdminDash={canAccessDashboard ? () => setActiveView('admin') : undefined}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              messages={allMessages.slice(-visibleCount)}
              isLoading={isLoading}
              hasMore={allMessages.length > visibleCount}
              onSendMessage={handleSendMessage}
              onDeepDive={handleDeepDive}
              onFeedback={handleFeedback}
              onSendFeedback={handleSendFeedback}
              onSectionFeedback={handleSectionFeedback}
              onLoadMore={() => setVisibleCount(prev => prev + PAGE_SIZE)}
              onExportConversation={handleExportConversation}
              onExportPDF={handleExportPDF}
              onExportMessage={() => {}}
              onRetry={handleRetry}
              onStop={handleStopGeneration}
              onReportError={handleReportError}
              onClearChat={handleClearChat}
              onRegenerateSuggestions={handleRegenerateSuggestions}
              isDarkMode={isDarkMode}
              onToggleTheme={toggleTheme}
              onToggleMessageSources={handleToggleMessageSources}
              exportStatus={exportStatus}
              exportError={exportError}
              pdfReportContent={pdfReportContent}
              loadingVariant={loadingVariant}
              loadingPinnedLabel={loadingPinnedLabel}
              onOpenEmailModal={() => {
                setEmailSubject(
                  'Dossiê de Inteligência — ' +
                    cleanTitle(extractCompanyName(currentSession?.title)) +
                    ' — 🦅 Senior Scout 360',
                );
                setShowEmailModal(true);
                setEmailStatus(null);
              }}
              onOpenFollowUpModal={() => {
                setShowFollowUpModal(true);
                setFollowUpStatus('idle');
              }}
              onSaveRemote={handleSaveRemote}
              isSavingRemote={isSavingRemote}
              remoteSaveStatus={remoteSaveStatus}
              canAccessMiniCRM={canAccessMiniCRM}
              canAccessDashboard={canAccessDashboard}
              canAccessIntegrityCheck={canAccessIntegrityCheck}
              canDeepDive={canDeepDive}
              canWarRoom={canWarRoom}
              onClearOperator={() => {
                clearName();
                setActiveView('chat');
                setSelectedCRMCardId(null);
              }}
              lastUserQuery={lastQuery}
              onDeleteMessage={handleDeleteMessage}
              radar={{
                alerts: radar.alerts,
                config: radar.config,
                unreadCount: radar.unreadCount,
                isScanning: radar.isScanning,
                lastScanAt: radar.lastScanAt,
                lastError: radar.lastError,
                lastWarning: radar.lastWarning,
                onUpdateConfig: radar.updateConfig,
                onMarkAsRead: radar.markAsRead,
                onMarkAllAsRead: radar.markAllAsRead,
                onDismiss: radar.dismissAlert,
                onForceScan: radar.forceScan,
                metaInsight: null,
              }}
            />
          ) : (
            <CRMView
              isDarkMode={isDarkMode}
              onSelectCard={setSelectedCRMCardId}
              onBackToChat={() => setActiveView('chat')}
              canAccessMiniCRM={canAccessMiniCRM}
            />
          )}
        </main>
        <div className="flex-none">
          <FooterCredits />
        </div>
      </div>

      {selectedCRMCard && canAccessMiniCRM && (
        <SuspenseWithError>
          <CRMDetail
            card={selectedCRMCard}
            sessions={sessions}
            onClose={() => setSelectedCRMCardId(null)}
            onSelectSession={handleSelectSessionFromDetail}
            onMoveStage={handleMoveStageFromDetail}
            onCreateSessionFromCard={handleCreateSessionFromDetail}
            isDarkMode={isDarkMode}
          />
        </SuspenseWithError>
      )}

      {showEmailModal && (
        <EmailModal
          emailTo={emailTo}
          onEmailToChange={setEmailTo}
          emailSubject={emailSubject}
          onEmailSubjectChange={setEmailSubject}
          emailStatus={emailStatus}
          onSend={handleSendEmail}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {showFollowUpModal && (
        <FollowUpModal
          emailTo={emailTo}
          onEmailToChange={setEmailTo}
          followUpDias={followUpDias}
          onDiasChange={setFollowUpDias}
          followUpNotas={followUpNotas}
          onNotasChange={setFollowUpNotas}
          followUpStatus={followUpStatus}
          companyName={
            cleanTitle(extractCompanyName(currentSession?.title)) ||
            currentSession?.empresaAlvo ||
            'Conta em prospecção'
          }
          onSchedule={handleScheduleFollowUp}
          onClose={() => setShowFollowUpModal(false)}
        />
      )}

      {updateAvailable && (
        <UpdateNotificationModal
          currentVersion={currentVersion}
          newVersion={newVersion}
          isDarkMode={isDarkMode}
          onDismiss={dismissUpdate}
          onUpdate={updateNow}
          isOpen={updateAvailable}
        />
      )}

      {isLoading && loadingVariant === 'hero' && (
        <LoadingSmart
          isLoading={isLoading}
          mode={mode}
          isDarkMode={isDarkMode}
          loadingVariant={loadingVariant}
          fixedStatusLine={loadingPinnedLabel || undefined}
          onStop={handleStopGeneration}
          processing={{
            stage: loadingStatus,
            completedStages: completedLoadingStatuses,
            failureCount: failureCount,
            totalStages: loadingTotalStages,
            isIncremental: loadingIsIncremental,
          }}
          searchQuery={lastQuery}
          empresaAlvo={currentSession?.empresaAlvo}
        />
      )}

      <InstallPrompt />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
      {/* VERCEL ANALYTICS RENDERIZADO NO FINAL DO APP */}
      <Analytics />
      {/* VERCEL SPEED INSIGHTS RENDERIZADO NO FINAL DO APP */}
      <SpeedInsights />
    </>
  );
};

export default App;
// Forcing deployment to resolve dossier rendering and test conflicts.
// Force build 1775507790

