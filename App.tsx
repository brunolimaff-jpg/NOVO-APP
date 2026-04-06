import React, { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useOffline } from './hooks/useOffline';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import { useSessionStorage } from './hooks/useSessionStorage';
import { useRadar } from './hooks/useRadar';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useSessionManager } from './hooks/useSessionManager';
import ToastContainer from './components/ToastContainer';
import ChatInterface from './components/ChatInterface';
import LoadingSmart from './components/LoadingSmart';
import { AuthModal } from './components/AuthModal';
import { EmailModal } from './components/EmailModal';
import { FollowUpModal } from './components/FollowUpModal';
import InstallPrompt from './components/InstallPrompt';
import { CRMView } from './components/CRMView';
import { AdminDash } from './components/AdminDash';
import { useAuth } from './contexts/AuthContext';
import { useMode } from './contexts/ModeContext';
import { useCRM } from './contexts/CRMContext';
import { loadWithChunkRetry } from './utils/chunkRetry';
import SuspenseWithError from './components/SuspenseWithError';
const CRMDetail = React.lazy(() =>
  loadWithChunkRetry(() => import('./components/CRMDetail')).then(m => ({ default: m.CRMDetail })),
);
import { Message, Sender, Feedback, ChatSession, ExportFormat, ReportType, AppError, CRMStage, ClienteSeniorData } from './types';
import {
  sendMessageToGemini,
  generateContinuityQuestion,
  generateDossierModule,
  getIsolatedBenchmark,
} from './services/geminiService';
import { parsePortaMarkerV2, stripPortaMarkers } from './utils/porta';
import { formatarParaPrompt, lookupCliente } from './services/clientLookupService';
import {
  appendSeniorEvidenceNote,
  buildSeniorEvidenceContext,
  extractClienteSeniorData,
} from './utils/seniorEvidence';
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
import { getRemoteSession, saveRemoteSession } from './services/sessionRemoteStore';
import { sendFeedbackRemote } from './services/feedbackRemoteStore';
import { APP_NAME, DEFAULT_MODE } from './constants';
import { normalizeAppError } from './utils/errorHelpers';
import { downloadFile } from './utils/downloadHelpers';
import { cleanTitle, sanitizeLoadingContextText } from './utils/textCleaners';
import { fixFakeLinksHTML } from './utils/linkFixer';
import { finalizeLoadingProgress, transitionLoadingProgress } from './utils/loadingStatus';
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
import { getFeatureAccessForUser } from './utils/featureAccess';
import { scoutDiag } from './utils/diagnosticLog';

const PAGE_SIZE = 20;
type FollowUpScheduleResult = { ok: boolean; method?: 'outlook' | 'ics'; error?: string };

interface LastAction {
  type: 'sendMessage' | 'regenerateSuggestions';
  payload: { text?: string; displayText?: string; messageId?: string };
}

function isGenericCompanyLabel(value: string | null | undefined): boolean {
  const normalized = cleanTitle(value).trim();
  if (!normalized) return true;
  return /^(empresa|nova investiga[cç][aã]o|a empresa desta conversa|empresa n[aã]o identificada|prospect|companhia|grupo)$/i.test(
    normalized,
  );
}

function pickCompanyLabel(...candidates: Array<string | null | undefined>): string {
  for (const value of candidates) {
    const raw = (value || '').trim();
    if (!raw) continue;

    const fromEmpresaField = raw.match(/(?:^|\n)\s*-\s*Empresa:\s*([^\n\r]+)/i)?.[1]?.trim();
    if (fromEmpresaField && !isGenericCompanyLabel(fromEmpresaField)) {
      return cleanTitle(fromEmpresaField);
    }

    const fromDossieBracket = raw.match(/dossi[êe]\s+completo\s+de\s*\[([^\]]+)\]/i)?.[1]?.trim();
    if (fromDossieBracket && !isGenericCompanyLabel(fromDossieBracket)) {
      return cleanTitle(fromDossieBracket);
    }

    const extracted = cleanTitle(extractCompanyName(raw));
    if (
      extracted &&
      !isGenericCompanyLabel(extracted) &&
      extracted.length <= 80 &&
      !/investigacao_completa_integrada|protocolo de investiga|contexto cadastral obrigat/i.test(extracted)
    ) {
      return extracted;
    }
  }
  return '';
}

function resolveHintedCompany(
  sessionEmpresaAlvo: string | null | undefined,
  safeVisibleText: string,
): string | null {
  if (sessionEmpresaAlvo && !isGenericCompanyLabel(sessionEmpresaAlvo)) return sessionEmpresaAlvo;

  const extracted = cleanTitle(extractCompanyName(safeVisibleText));
  if (extracted && !isGenericCompanyLabel(extracted)) return extracted;

  const fromEmpresaField = safeVisibleText.match(/(?:^|\n)\s*-\s*Empresa:\s*([^\n\r]+)/i)?.[1]?.trim();
  if (fromEmpresaField && !isGenericCompanyLabel(fromEmpresaField)) return cleanTitle(fromEmpresaField);

  const trimmed = safeVisibleText.trim();
  if (
    trimmed.length > 0 &&
    trimmed.length <= 60 &&
    !trimmed.includes('\n') &&
    !isGenericCompanyLabel(trimmed)
  ) {
    return trimmed;
  }

  return null;
}

function buildDossierSeedContext(rawPrompt: string): string {
  if (!rawPrompt) return '';

  const sections = [
    rawPrompt.match(/Contexto cadastral obrigatório:[^\n]+/i)?.[0]?.trim(),
    rawPrompt.match(/<radar_context>[\s\S]*?<\/radar_context>/i)?.[0]?.trim(),
  ].filter(Boolean);

  return sections.join('\n\n');
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.message?.includes('aborted');
}

const MAX_FAILURES_BEFORE_FEEDBACK = 2;
const MODULAR_DOSSIER_TOTAL_STAGES = 7;
const MODULAR_REQUIRED_STEP_TIMEOUT_MS = 90000;
const MODULAR_OPTIONAL_STEP_TIMEOUT_MS = 60000;
const MODULAR_BENCHMARK_TIMEOUT_MS = 45000;

const App: React.FC = () => {
  const { userId, user, logout, isAuthenticated, isAdmin } = useAuth();
  const { mode, systemInstruction } = useMode();
  const { cards, createCardFromSession, moveCardToStage } = useCRM();
  const { isOnline, wasOffline, clearWasOffline } = useOffline();
  const { isDarkMode, toggleTheme } = useTheme();
  const { sessions, setSessions, sessionsRef, isInitialized, setIsInitialized, loadSessions } = useSessionStorage();

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('Iniciando análise');
  const [failureCount, setFailureCount] = useState(0);
  const [completedLoadingStatuses, setCompletedLoadingStatuses] = useState<string[]>([]);
  const [loadingTotalStages, setLoadingTotalStages] = useState<number | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [lastQuery, setLastQuery] = useState<string>('');
  const [isSavingRemote, setIsSavingRemote] = useState(false);
  const [remoteSaveStatus, setRemoteSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
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

  const { toasts, toast, dismiss: dismissToast } = useToast();
  const radar = useRadar(toast);
  const lastActionRef = useRef<LastAction | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeGenerationRef = useRef<Record<string, string>>({});
  const loadingProgressRef = useRef<{ stage: string; completedStages: string[]; totalStages?: number }>({
    stage: 'Iniciando análise',
    completedStages: [],
    totalStages: undefined,
  });

  const commitLoadingProgress = useCallback(
    (nextState: { stage?: string; completedStages?: string[]; totalStages?: number }) => {
      const updated = {
        stage:
          typeof nextState.stage === 'string'
            ? nextState.stage
            : loadingProgressRef.current.stage,
        completedStages: Array.isArray(nextState.completedStages)
          ? nextState.completedStages
          : loadingProgressRef.current.completedStages,
        totalStages:
          Object.prototype.hasOwnProperty.call(nextState, 'totalStages')
            ? nextState.totalStages
            : loadingProgressRef.current.totalStages,
      };

      loadingProgressRef.current = updated;
      setLoadingStatus(updated.stage);
      setCompletedLoadingStatuses(updated.completedStages);
      setLoadingTotalStages(updated.totalStages);
    },
    [],
  );

  const resetLoadingProgress = useCallback(
    (stage: string = 'Realizando pesquisa...', totalStages?: number) => {
      setFailureCount(0);
      commitLoadingProgress({ stage, completedStages: [], totalStages });
    },
    [commitLoadingProgress],
  );

  const advanceLoadingProgress = useCallback(
    (nextStage: string, totalStages?: number) => {
      const next = transitionLoadingProgress(
        loadingProgressRef.current.stage,
        nextStage,
        loadingProgressRef.current.completedStages,
      );
      commitLoadingProgress({
        ...next,
        totalStages:
          typeof totalStages === 'number'
            ? totalStages
            : loadingProgressRef.current.totalStages,
      });
    },
    [commitLoadingProgress],
  );

  const replaceLoadingProgressStage = useCallback(
    (stage: string, totalStages?: number) => {
      commitLoadingProgress({
        stage,
        completedStages: loadingProgressRef.current.completedStages,
        totalStages:
          typeof totalStages === 'number'
            ? totalStages
            : loadingProgressRef.current.totalStages,
      });
    },
    [commitLoadingProgress],
  );

  const completeLoadingProgress = useCallback(() => {
    const next = finalizeLoadingProgress(
      loadingProgressRef.current.stage,
      loadingProgressRef.current.completedStages,
    );
    commitLoadingProgress({
      ...next,
      totalStages: loadingProgressRef.current.totalStages,
    });
  }, [commitLoadingProgress]);

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
  const featureAccess = getFeatureAccessForUser(user);
  const canAccessMiniCRM = featureAccess.miniCRM;
  const canAccessDashboard = featureAccess.dashboard;
  const canAccessIntegrityCheck = featureAccess.integrityCheck;
  const canUseLookup = featureAccess.clientLookup;
  const canDeepDive = featureAccess.deepDive;
  const canWarRoom = featureAccess.warRoom;

  useEffect(() => {
    if (!canAccessMiniCRM && activeView === 'crm') {
      setActiveView('chat');
      setSelectedCRMCardId(null);
    }
    if (!isAdmin && activeView === 'admin') {
      setActiveView('chat');
    }
  }, [activeView, canAccessMiniCRM, isAdmin]);

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

  const handleSaveRemote = async () => {
    if (!currentSession || !isAuthenticated) return;
    setIsSavingRemote(true);
    setRemoteSaveStatus('idle');
    const snapshotSessionId = currentSession.id;
    const finalized: ChatSession = { ...currentSession, updatedAt: new Date().toISOString() };
    updateSessionById(snapshotSessionId, () => finalized);
    try {
      await saveRemoteSession(finalized, userId, user?.displayName);
      setRemoteSaveStatus('success');
      setTimeout(() => setRemoteSaveStatus('idle'), 3000);
    } catch {
      setRemoteSaveStatus('error');
    } finally {
      setIsSavingRemote(false);
    }
  };

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
    lastActionRef.current = null;
    setLastQuery('');
    setVisibleCount(PAGE_SIZE);
  };

  const processMessage = async (
    text: string,
    explicitSessionId?: string,
    explicitHistory?: Message[],
    visibleTextForUi?: string,
    hintedCompanyOverride?: string | null,
  ) => {
    const sessionId = explicitSessionId || currentSessionId;
    if (!sessionId) return;

    setIsLoading(true);
    resetLoadingProgress();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    const safeVisibleText = visibleTextForUi || text;
    lastActionRef.current = { type: 'sendMessage', payload: { text, displayText: safeVisibleText } };

    let historyToPass: Message[] = [];
    const sessionForHint = sessionsRef.current.find(s => s.id === sessionId);
    const hintedCompany = hintedCompanyOverride || resolveHintedCompany(sessionForHint?.empresaAlvo, safeVisibleText);
    const normalizedCompany = pickCompanyLabel(
      hintedCompany,
      safeVisibleText,
      sessionForHint?.empresaAlvo,
      sessionForHint?.title,
      text,
    );
    setLastQuery(sanitizeLoadingContextText(safeVisibleText, hintedCompany || ''));
    if (explicitHistory) {
      historyToPass = explicitHistory;
    } else {
      const session = sessionsRef.current.find(s => s.id === sessionId);
      if (session) {
        const msgs = session.messages;
        historyToPass =
          msgs.length > 0 && msgs[msgs.length - 1].text === text && msgs[msgs.length - 1].sender === Sender.User
            ? msgs.slice(0, -1)
            : msgs;
      }
    }

    const botMessageId = uuidv4();
    activeGenerationRef.current[sessionId] = botMessageId;

    const botMessagePlaceholder: Message = {
      id: botMessageId,
      sender: Sender.Bot,
      text: '',
      timestamp: new Date(),
      isThinking: true,
      loadingVariant: 'inline',
      isSourcesOpen: false,
    };

    setSessions(prev =>
      prev.map(s =>
        s.id === sessionId
          ? {
              ...s,
              messages: [...s.messages.filter(m => !m.isError), botMessagePlaceholder],
              updatedAt: new Date().toISOString(),
            }
          : s,
      ),
    );
    setVisibleCount(prev => prev + 1);

    try {
      const isMegaPrompt = text.toUpperCase().includes('DOSSIÊ COMPLETO') || text.toUpperCase().includes('DOSSIE COMPLETO');

      if (isMegaPrompt) {
        // --- INÍCIO WATERFALL ORCHESTRATION ---
        let accumulatedText = '';
        let previousStageCompleted = false;
        const optionalStepFailures: string[] = [];
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

        const updateBotText = (chunk: string) => {
          accumulatedText += (accumulatedText ? '\n\n---\n\n' : '') + chunk;
          updateSessionById(sessionId, s => ({
            ...s,
            messages: (s.messages || []).map(msg =>
              msg.id === botMessageId ? { ...msg, text: accumulatedText, isThinking: false } : msg
            )
          }));
        };

        const modules = [
          {
            name: 'Raio-X Operacional',
            prompt: PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
            stage: 'Mapeando inteligência operacional...',
            optional: false,
            timeoutMs: MODULAR_REQUIRED_STEP_TIMEOUT_MS,
          },
          {
            name: 'Tech Stack',
            prompt: PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
            stage: 'Investigando tech stack...',
            optional: true,
            timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
          },
          {
            name: 'Riscos & Compliance',
            prompt: PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
            stage: 'Investigando riscos & compliance...',
            optional: true,
            timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
          },
          {
            name: 'Estratégia & Expansão',
            prompt: PROMPT_RADAR_EXPANSAO_GOD_MODE,
            stage: 'Investigando estratégia & expansão...',
            optional: true,
            timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
          },
          {
            name: 'RH & Decisores',
            prompt: PROMPT_RH_SINDICATOS_GOD_MODE,
            stage: 'Investigando RH & decisores...',
            optional: true,
            timeoutMs: MODULAR_OPTIONAL_STEP_TIMEOUT_MS,
          },
        ];

        resetLoadingProgress(modules[0].stage, MODULAR_DOSSIER_TOTAL_STAGES);

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
            const moduleResult = await generateDossierModule(
              module.name,
              resolvedMegaCompany || "Empresa",
              SHARED_FOUNDATION_BLOCK,
              module.prompt,
              [
                dossierSeedContext,
                waterfallLookupContext,
                seniorEvidenceContext,
                accumulatedText
                  ? `Contexto anterior consolidado:\n${accumulatedText.slice(-2500)}`
                  : '',
              ]
                .filter(Boolean)
                .join('\n\n'),
              { signal, timeoutMs: module.timeoutMs }
            );

            updateBotText(moduleResult);
            previousStageCompleted = true;
            setFailureCount(0);
          } catch (error) {
            if (isAbortLikeError(error)) throw error;
            if (!module.optional) throw error;

            previousStageCompleted = false;
            optionalStepFailures.push(module.name);
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
          advanceLoadingProgress('Cruzando referências de mercado...', MODULAR_DOSSIER_TOTAL_STAGES);
        } else {
          replaceLoadingProgressStage('Cruzando referências de mercado...', MODULAR_DOSSIER_TOTAL_STAGES);
        }

        let benchmarkCompleted = false;
        try {
          const benchmark = await getIsolatedBenchmark(resolvedMegaCompany, {
            signal,
            timeoutMs: MODULAR_BENCHMARK_TIMEOUT_MS,
          });
          if (benchmark) updateBotText(benchmark);
          benchmarkCompleted = true;
          setFailureCount(0);
        } catch (error) {
          if (isAbortLikeError(error)) throw error;

          benchmarkCompleted = false;
          optionalStepFailures.push('Benchmark de mercado');
          setFailureCount(count => count + 1);
          scoutDiag.warn('ModularDossier', 'benchmark isolado falhou e será ignorado', {
            sessionId,
            company: resolvedMegaCompany || null,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        if (benchmarkCompleted) {
          advanceLoadingProgress('Finalizando dossiê modular...', MODULAR_DOSSIER_TOTAL_STAGES);
        } else {
          replaceLoadingProgressStage('Finalizando dossiê modular...', MODULAR_DOSSIER_TOTAL_STAGES);
        }

        if (optionalStepFailures.length > 0) {
          updateBotText(
            `⚠️ Nota operacional: algumas frentes não puderam ser concluídas nesta rodada (${optionalStepFailures.join(', ')}). O dossiê abaixo foi consolidado com o material validado disponível.`,
          );
        } else {
          setFailureCount(0);
        }

        // --- PÓS-PROCESSAMENTO DO WATERFALL ---
        // Extrair Score PORTA dos markers no texto acumulado
        const waterfallScorePorta = parsePortaMarkerV2(accumulatedText);
        const waterfallCleanText = stripPortaMarkers(accumulatedText).trim();
        const waterfallNarrativeText = appendSeniorEvidenceNote(
          waterfallCleanText,
          resolvedMegaCompany || waterfallClienteSeniorData?.grupo || 'empresa analisada',
          waterfallClienteSeniorData,
        );
        const waterfallExecutiveIntro = buildMainDossierExecutiveIntro(
          waterfallNarrativeText,
          normalizedCompany || resolvedMegaCompany || waterfallClienteSeniorData?.grupo || null,
          waterfallClienteSeniorData,
        );
        const waterfallFinalText = waterfallExecutiveIntro
          ? `${waterfallExecutiveIntro}\n\n---\n\n${waterfallNarrativeText}`
          : waterfallNarrativeText;

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
            typeof user?.displayName === 'string' ? user.displayName : 'Vendedor',
          );
        } catch (error) {
          scoutDiag.warn('ModularDossier', 'falha ao gerar sugestões finais do waterfall', {
            sessionId,
            company: resolvedMegaCompany || null,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // Update final da mensagem com score, cliente e texto limpo
        updateSessionById(sessionId, s => {
          const finalCompany = normalizedCompany || s.empresaAlvo || pickCompanyLabel(s.title);
          return {
            ...s,
            empresaAlvo: finalCompany || s.empresaAlvo,
            scoreOportunidade: waterfallScorePorta?.score ?? s.scoreOportunidade,
            messages: s.messages.map(msg =>
              msg.id === botMessageId
                ? {
                    ...msg,
                    text: waterfallFinalText,
                    scorePorta: waterfallScorePorta || undefined,
                    clienteSeniorData: waterfallClienteSeniorData || undefined,
                    suggestions: waterfallSuggestions,
                    isThinking: false,
                  }
                : msg,
            ),
          };
        });

        completeLoadingProgress();
        return;
        // --- FIM WATERFALL ORCHESTRATION ---
      }

      const {
        text: responseText,
        sources,
        suggestions,
        scorePorta,
        clienteSeniorData,
        ghostReason,
      } = await sendMessageToGemini(
        text,
        historyToPass,
        systemInstruction,
        {
          signal,
          onText: () => {
            setFailureCount(0); // Qualquer texto de volta limpa o contador de falhas
          },
          onStatus: newStatus => {
            advanceLoadingProgress(newStatus);
          },
          onRagFailed: () => {
            toast.warning('Busca de contexto indisponível — resposta pode ser menos precisa');
          },
          nomeVendedor: typeof user?.displayName === 'string' ? user.displayName : 'Vendedor',
          sessionId,
          hintedCompany,
        },
        canUseLookup,
      );

      if (activeGenerationRef.current[sessionId] !== botMessageId) return;

      updateSessionById(sessionId, s => {
        const shouldRewriteTitle =
          s.messages.length <= 2 ||
          s.title === 'Nova Investigação' ||
          /dossi[êe]\s+completo/i.test(s.title) ||
          s.title.length > 90;

        const finalCompany = normalizedCompany || s.empresaAlvo || pickCompanyLabel(s.title);

        return {
          ...s,
          title: shouldRewriteTitle ? finalCompany || s.title : s.title,
          empresaAlvo: finalCompany || s.empresaAlvo,
          scoreOportunidade: scorePorta?.score ?? s.scoreOportunidade,
          messages: (s.messages || []).map(msg =>
            msg.id === botMessageId
              ? {
                  ...msg,
                  text: responseText,
                  groundingSources: sources as { title: string; url: string }[] | undefined,
                  suggestions: (suggestions || []) as string[],
                  scorePorta: scorePorta || undefined,
                  clienteSeniorData: clienteSeniorData || undefined,
                  isThinking: false,
                  ...(ghostReason && { ghostDetails: ghostReason }),
                }
              : msg,
          ),
        };
      });
      completeLoadingProgress();

      if (!investigationLogged && responseText.length > 500) {
        setInvestigationLogged(true);
        fetch(BACKEND_URL, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'logInvestigation',
            vendedor: user?.displayName || 'Anônimo',
            empresa: normalizedCompany || cleanTitle(extractCompanyName(safeVisibleText)),
            modo: mode || '',
            resumo: responseText.substring(0, 200),
          }),
        }).catch((err: unknown) => {
          scoutDiag.warn('RemoteLog', 'logInvestigation falhou (Apps Script)', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (error: unknown) {
      const err = error as Error;
      if (isAbortLikeError(err)) {
        setSessions(prev =>
          prev.map(s =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: (s.messages || []).filter(msg => msg.id !== botMessageId || msg.text.trim().length > 0),
                }
              : s,
          ),
        );
        setIsLoading(false);
        abortControllerRef.current = null;
        return;
      }
      if (activeGenerationRef.current[sessionId] !== botMessageId) return;
      const appError = normalizeAppError(error as Error);
      updateSessionById(sessionId, s => ({
        ...s,
        messages: [
          ...(s.messages || []).filter(m => m.id !== botMessageId),
          {
            id: uuidv4(),
            sender: Sender.Bot,
            text: 'Erro no processamento',
            timestamp: new Date(),
            isError: true,
            errorDetails: appError,
          },
        ],
      }));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = async (
    text: string,
    displayText?: string,
    hintedCompanyOverride?: string | null,
  ) => {
    let sessionId = currentSessionId;
    let currentHistory: Message[] = [];
    let immediateCompany: string | null = null;
    const hasExistingSession = sessionId ? sessions.some(s => s.id === sessionId) : false;
    if (!sessionId || !hasExistingSession) {
      sessionId = uuidv4();
      const rawTitle = cleanTitle(hintedCompanyOverride || extractCompanyName(displayText || text));
      const immediateTitle = rawTitle && !isGenericCompanyLabel(rawTitle) ? rawTitle : '';
      immediateCompany = immediateTitle || null;
      const newSession: ChatSession = {
        id: sessionId,
        title: immediateTitle || 'Nova Investigação',
        empresaAlvo: immediateTitle || null,
        cnpj: null,
        modoPrincipal: DEFAULT_MODE,
        scoreOportunidade: null,
        resumoDossie: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(sessionId);
      currentHistory = [];
    } else {
      const session = sessions.find(s => s.id === sessionId);
      currentHistory = session?.messages ? [...session.messages] : [];
      immediateCompany = hintedCompanyOverride || session?.empresaAlvo || null;
    }
    const userMessage: Message = {
      id: uuidv4(),
      sender: Sender.User,
      text: displayText || text,
      timestamp: new Date(),
    };
    setSessions(prev =>
      prev.map(s =>
        s.id === sessionId ? { ...s, messages: [...(s.messages || []), userMessage], updatedAt: new Date().toISOString() } : s,
      ),
    );
    setVisibleCount(prev => prev + 1);
    await processMessage(text, sessionId, currentHistory, displayText || text, hintedCompanyOverride || immediateCompany);
  };

  const handleDeepDive = async (displayMessage: string, hiddenPrompt: string, forcedCompanyName?: string) => {
    const empresaContext =
      forcedCompanyName?.trim() || currentSession?.empresaAlvo || currentSession?.title || 'a empresa desta conversa';
    await handleSendMessage(
      `Dossiê completo de [${empresaContext}]. Protocolo de investigação forense especializada:\n\n${hiddenPrompt}`,
      displayMessage,
      empresaContext,
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
    }
  }, []);

  const handleRetry = () => {
    if (!lastActionRef.current) return;
    if (lastActionRef.current.type === 'sendMessage') {
      if (currentSessionId) {
        updateSessionById(currentSessionId, session => {
          const messages = session.messages;
          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.sender === Sender.Bot && (lastMsg.isError || !lastMsg.text || lastMsg.ghostDetails)) {
            return { ...session, messages: (messages || []).slice(0, -1) };
          }
          return session;
        });
      }
      processMessage(
        lastActionRef.current.payload.text || '',
        currentSessionId || undefined,
        undefined,
        lastActionRef.current.payload.displayText || lastActionRef.current.payload.text || '',
      );
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
    const nomeVendedor = typeof user?.displayName === 'string' ? user.displayName : 'Vendedor';

    updateSessionById(sessionId, session => ({
      ...session,
      messages: (session.messages || []).map(msg => (msg.id === messageId ? { ...msg, isRegeneratingSuggestions: true } : msg)),
    }));
    try {
      const newSuggestions = await generateContinuityQuestion(
        targetSession.messages,
        companyName,
        nomeVendedor,
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

  const handleReportError = async (messageId: string, error: AppError) => {
    if (!currentSession) return;
    const errorPayload = JSON.stringify(
      { code: error.code, source: error.source, message: error.message, details: error.details },
      null,
      2,
    );
    try {
      await sendFeedbackRemote({
        feedbackId: uuidv4(),
        sessionId: currentSession.id,
        messageId,
        sectionKey: 'ERROR_REPORT',
        sectionTitle: 'System Error',
        type: 'dislike',
        comment: `Automated Error Report: ${error.code}`,
        aiContent: errorPayload,
        userId,
        userName: user?.displayName,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to report error', e);
    }
  };

  const handleFeedback = (messageId: string, feedback: Feedback) => {
    if (!currentSession) return;
    updateCurrentSession(session => ({
      ...session,
      messages: (session.messages || []).map(m =>
        m.id === messageId ? { ...m, feedback: m.feedback === feedback ? undefined : feedback } : m,
      ),
    }));
  };

  const handleSendFeedback = async (messageId: string, feedback: Feedback, comment: string, content: string) => {
    if (!currentSession) return;
    const snapshotSessionId = currentSession.id;
    updateSessionById(snapshotSessionId, session => ({
      ...session,
      messages: (session.messages || []).map(m => (m.id === messageId ? { ...m, feedback } : m)),
    }));
    try {
      await sendFeedbackRemote({
        feedbackId: uuidv4(),
        sessionId: snapshotSessionId,
        messageId,
        sectionKey: null,
        sectionTitle: null,
        type: feedback === 'up' ? 'like' : 'dislike',
        comment,
        aiContent: content,
        userId,
        userName: user?.displayName,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Feedback error', e);
    }
  };

  const handleSectionFeedback = (messageId: string, sectionTitle: string, feedback: Feedback) => {
    updateCurrentSession(session => ({
      ...session,
      messages: (session.messages || []).map(msg => {
        if (msg.id !== messageId) return msg;
        const currentSections = msg.sectionFeedback || {};
        const newVal = currentSections[sectionTitle] === feedback ? undefined : feedback;
        const newSections = { ...currentSections };
        if (newVal === undefined) delete newSections[sectionTitle];
        else newSections[sectionTitle] = newVal;
        return { ...msg, sectionFeedback: newSections };
      }),
    }));
  };

  const handleToggleMessageSources = (messageId: string) => {
    updateCurrentSession(session => ({
      ...session,
      messages: (session.messages || []).map(msg =>
        msg.id === messageId ? { ...msg, isSourcesOpen: !msg.isSourcesOpen } : msg,
      ),
    }));
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
          vendedor: user?.displayName || 'Vendedor',
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
      <AuthModal />

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
        className={`flex flex-col h-[100dvh] w-full overflow-hidden overscroll-none ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}
      >
        <div className="flex-1 min-h-0">
          {activeView === 'admin' && isAdmin ? (
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
              onOpenAdminDash={isAdmin ? () => setActiveView('admin') : undefined}
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
              onLogout={logout}
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
                metaInsight: null, // Adicionado para satisfazer RadarProps
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

      {isLoading && (
        <LoadingSmart
          isLoading={isLoading}
          mode={mode}
          isDarkMode={isDarkMode}
          onStop={handleStopGeneration}
          processing={{
            stage: loadingStatus,
            completedStages: completedLoadingStatuses,
            failureCount: failureCount,
            totalStages: loadingTotalStages,
          }}
          searchQuery={lastQuery}
          empresaAlvo={currentSession?.empresaAlvo}
        />
      )}

      <InstallPrompt />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};

export default App;
