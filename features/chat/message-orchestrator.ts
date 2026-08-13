import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import * as Sentry from '@sentry/react';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_MODE } from '../../constants';
import { useMaybeMode } from '../../contexts/ModeContext';
import { BACKEND_URL } from '../../services/apiConfig';
import { sendMessageToLlm } from '../../services/llmService';
import { withAutoRetry } from '../../utils/retry';
import { resolveResearchIntent, type ChatIntent } from '../../utils/chatIntent';
import { useMaybeChatStore } from '../../stores/chatStore';
import { findReusableEmptySession } from './session-reuse';
import { Sender, type ChatSession, type LastAction, type Message, type RunMegaPromptWaterfallArgs, type DossierWaterfallResult } from '../../types';
import { scoutDiag, setDiagnosticsSessionId, flushDiagnosticsNow } from '../../utils/diagnosticLog';
import { collectBlankPanelSnapshot } from '../../utils/blankPanelTelemetry';
import { normalizeAppError } from '../../utils/errorHelpers';
import { extractCompanyName } from '../../utils/companyNameExtractor';
import { cleanTitle, sanitizeLoadingContextText } from '../../utils/textCleaners';
import {
  resolveLoadingVariant,
  resolvePlaceholderLoadingVariant,
  resolveEffectiveLoadingVariant,
  type LoadingVariant,
  type RequestKind,
} from '../../utils/loadingVariant';
import {
  ensureContinuitySuggestions,
  isAbortLikeError,
  isGenericCompanyLabel,
  pickCompanyLabel,
  resolveHintedCompany,
} from './message-helpers';
import { useToast } from '../../hooks/useToast';
import { trackOperatorEvent } from '../../services/operatorTracking';
import { getWaterfallGuardState, isAnyWaterfallActive } from '../dossier/waterfall-guard';
import { acquireDossierRunLease, createOrGetDossierRun, DOSSIER_RUN_RPC_TIMEOUT_MS } from '../../lib/supabase/dossierRuns';
import { clearActiveDossierRun, getActiveDossierRun, setActiveDossierRun } from '../dossier/active-run-registry';
import { startDossierRunHeartbeat } from '../dossier/dossier-run-heartbeat';

interface ResetLoadingProgressOptions {
  incremental?: boolean;
  keepHistory?: number;
}

export interface HandleSendMessageOptions {
  requestKind?: RequestKind;
  fixedLoadingLine?: string;
  cnpj?: string | null;
  /** BRU-81: thread alvo explícita — evita stale closure do currentSessionId quando a
   * nova pesquisa do zero volta para a thread existente da conta (uma thread por conta). */
  explicitSessionId?: string | null;
  /** BRU-81: nova execução explícita na MESMA thread (override de duplicata) —
   * força loading INLINE (bubble) e isFirstInteraction mesmo com histórico. */
  isNewRunOverride?: boolean;
}

interface ProcessMessageOptions extends HandleSendMessageOptions {
  isFollowUp?: boolean;
  isDeepDive?: boolean;
  isFirstInteraction?: boolean;
}

interface PendingInitialSend {
  sessionId: string;
}

export interface UseChatMessageOrchestratorOptions {
  currentSessionId: string | null;
  setSessions: Dispatch<SetStateAction<ChatSession[]>>;
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>;
  sessionsRef: MutableRefObject<ChatSession[]>;
  lastActionRef: MutableRefObject<LastAction | null>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  activeGenerationRef: MutableRefObject<Record<string, string>>;
  updateSessionById: (id: string, updater: (session: ChatSession) => ChatSession) => void;
  systemInstruction: string;
  mode: string | null;
  resolvedOperatorName: string;
  canUseLookup: boolean;
  requestKind: RequestKind;
  setRequestKind: Dispatch<SetStateAction<RequestKind>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  resetLoadingProgress: (stage?: string, totalStages?: number, options?: ResetLoadingProgressOptions) => void;
  advanceLoadingProgress: (nextStage: string, totalStages?: number) => void;
  completeLoadingProgress: () => void;
  setFailureCount: Dispatch<SetStateAction<number>>;
  setLoadingVariant: Dispatch<SetStateAction<LoadingVariant>>;
  setLoadingPinnedLabel: Dispatch<SetStateAction<string | null>>;
  setVisibleCount: Dispatch<SetStateAction<number>>;
  setLastQuery: Dispatch<SetStateAction<string>>;
  toast: { warning?: (message: string) => void };
  investigationLogged: boolean;
  setInvestigationLogged: Dispatch<SetStateAction<boolean>>;
  runMegaPromptWaterfall: (args: RunMegaPromptWaterfallArgs) => Promise<DossierWaterfallResult>;
  operatorId?: string;
  email?: string;
}

function requireDependency<T>(value: T | null | undefined, dependencyName: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${dependencyName} is required for message-orchestrator`);
  }

  return value;
}

export function useChatMessageOrchestrator(options: Partial<UseChatMessageOrchestratorOptions> = {}) {
  const chatStore = useMaybeChatStore();
  const modeContext = useMaybeMode();
  const { toast: fallbackToast } = useToast();
  const currentSessionId = options.currentSessionId ?? chatStore?.currentSessionId ?? null;
  const setSessions = requireDependency(options.setSessions ?? chatStore?.setSessions, 'setSessions');
  const setCurrentSessionId = requireDependency(
    options.setCurrentSessionId ?? chatStore?.setCurrentSessionId,
    'setCurrentSessionId',
  );
  const sessionsRef = requireDependency(options.sessionsRef ?? chatStore?.sessionsRef, 'sessionsRef');
  const lastActionRef = requireDependency(options.lastActionRef ?? chatStore?.lastActionRef, 'lastActionRef');
  const abortControllerRef = requireDependency(
    options.abortControllerRef ?? chatStore?.abortControllerRef,
    'abortControllerRef',
  );
  const activeGenerationRef = requireDependency(
    options.activeGenerationRef ?? chatStore?.activeGenerationRef,
    'activeGenerationRef',
  );
  const updateSessionById = requireDependency(
    options.updateSessionById ?? chatStore?.updateSessionById,
    'updateSessionById',
  );
  const systemInstruction = options.systemInstruction ?? modeContext?.systemInstruction ?? '';
  const mode = options.mode ?? modeContext?.mode ?? null;
  const resolvedOperatorName = requireDependency(options.resolvedOperatorName, 'resolvedOperatorName');
  const operatorId = options.operatorId ?? '';
  const operatorEmail = options.email ?? '';
  const canUseLookup = options.canUseLookup ?? false;
  const requestKind = options.requestKind ?? chatStore?.requestKind ?? 'default';
  const setRequestKind = requireDependency(options.setRequestKind ?? chatStore?.setRequestKind, 'setRequestKind');
  const setIsLoading = requireDependency(options.setIsLoading ?? chatStore?.setIsLoading, 'setIsLoading');
  const resetLoadingProgress = requireDependency(
    options.resetLoadingProgress ?? chatStore?.resetLoadingProgress,
    'resetLoadingProgress',
  );
  const advanceLoadingProgress = requireDependency(
    options.advanceLoadingProgress ?? chatStore?.advanceLoadingProgress,
    'advanceLoadingProgress',
  );
  const completeLoadingProgress = requireDependency(
    options.completeLoadingProgress ?? chatStore?.completeLoadingProgress,
    'completeLoadingProgress',
  );
  const setFailureCount = requireDependency(options.setFailureCount ?? chatStore?.setFailureCount, 'setFailureCount');
  const setLoadingVariant = requireDependency(
    options.setLoadingVariant ?? chatStore?.setLoadingVariant,
    'setLoadingVariant',
  );
  const setLoadingPinnedLabel = requireDependency(
    options.setLoadingPinnedLabel ?? chatStore?.setLoadingPinnedLabel,
    'setLoadingPinnedLabel',
  );
  const setVisibleCount = requireDependency(options.setVisibleCount ?? chatStore?.setVisibleCount, 'setVisibleCount');
  const setLastQuery = requireDependency(options.setLastQuery ?? chatStore?.setLastQuery, 'setLastQuery');
  const toast = options.toast ?? fallbackToast;
  const investigationLogged = options.investigationLogged ?? chatStore?.investigationLogged ?? false;
  const setInvestigationLogged = requireDependency(
    options.setInvestigationLogged ?? chatStore?.setInvestigationLogged,
    'setInvestigationLogged',
  );
  const runMegaPromptWaterfall = requireDependency(options.runMegaPromptWaterfall, 'runMegaPromptWaterfall');

  const cleanupPostCompletionRef = useRef<(() => void) | null>(null);
  const pendingInitialSendRef = useRef<PendingInitialSend | null>(null);
  const latestLoadingRef = useRef<{
    isLoading: boolean;
    loadingVariant: LoadingVariant | null | undefined;
  }>({
    isLoading: chatStore?.isLoading ?? false,
    loadingVariant: chatStore?.loadingVariant ?? null,
  });
  latestLoadingRef.current = {
    isLoading: chatStore?.isLoading ?? false,
    loadingVariant: chatStore?.loadingVariant ?? null,
  };

  /**
   * Agenda verificações pós-finalização do dossiê em 0/100/500/1k/3k/10k ms.
   * Cada check captura estado do DOM, overlays, composer e viewport.
   * Retorna função de cancelamento para limpar timers pendentes.
   */
  function schedulePostCompletionChecks(sessionId: string): () => void {
    const delays = [0, 100, 500, 1_000, 3_000, 10_000];
    const timerIds: ReturnType<typeof setTimeout>[] = [];
    const baselineGuard = getWaterfallGuardState(sessionId);
    const baselineGen = baselineGuard?.generationCount ?? 0;

    for (const delay of delays) {
      const id = setTimeout(() => {
        try {
          const bodyText = document.body?.textContent || '';
          const loadingOverlay = document.querySelector('[data-testid="loading-smart-overlay"]');
          const botMessages = document.querySelectorAll('[data-testid="bot-message-content"]');
          const composer = document.querySelector('[data-testid="chat-input"], [data-testid="composer-input"]');
          const scroller = document.querySelector('[data-virtuoso-scroller]');
          const botTextMaxLen = Math.max(
            0,
            ...[...botMessages].map(el => (el as HTMLElement).textContent?.length || 0),
          );
          const postCompletionIsLoading = latestLoadingRef.current.isLoading;
          const postCompletionLoadingVariant = latestLoadingRef.current.loadingVariant ?? null;
          const blankPanelSnapshot = collectBlankPanelSnapshot({
            sessionId,
            source: `PostCompletion:${delay}ms`,
            messageCount: botMessages.length,
            expectedBotCharsMax: botTextMaxLen,
            isLoading: postCompletionIsLoading,
            loadingVariant: postCompletionLoadingVariant,
          });

          const currentGuard = getWaterfallGuardState(sessionId);
          const genDelta = (currentGuard?.generationCount ?? baselineGen) - baselineGen;
          const isRestarting = genDelta > 0;

          const payload = {
            sessionId,
            storeIsLoading: postCompletionIsLoading,
            storeLoadingVariant: postCompletionLoadingVariant,
            bodyLen: bodyText.length,
            containsDossie: /dossi[eê]/i.test(bodyText),
            containsLoading: /Preparando|Mapeando|Verificando|Investigando|Interromper/i.test(bodyText),
            loadingOverlayExists: Boolean(loadingOverlay),
            botMessageCount: botMessages.length,
            botTextMaxLen,
            composerDisabled: (composer as HTMLInputElement)?.disabled || false,
            scrollerHeight: (scroller as HTMLElement)?.clientHeight || 0,
            scrollerScrollHeight: (scroller as HTMLElement)?.scrollHeight || 0,
            blankPanelDetected: blankPanelSnapshot?.blankDetected ?? false,
            blankPanelReason: blankPanelSnapshot?.reason ?? null,
            mainPanelChars: blankPanelSnapshot?.mainPanelChars ?? 0,
            panelVisible: blankPanelSnapshot?.panelVisible ?? false,
            rowCount: blankPanelSnapshot?.rowCount ?? 0,
            visibleRowCount: blankPanelSnapshot?.visibleRowCount ?? 0,
            visibleBotNodeCount: blankPanelSnapshot?.visibleBotNodeCount ?? 0,
            visibleBotWithCharsCount: blankPanelSnapshot?.visibleBotWithCharsCount ?? 0,
            centerElementTestId: blankPanelSnapshot?.centerElementTestId ?? null,
            documentReadyState: document.readyState,
            activeElement: document.activeElement?.tagName || '',
            waterfallGenCount: currentGuard?.generationCount ?? 'n/a',
            waterfallActiveRunId: currentGuard?.activeRunId ?? null,
            waterfallBlockedCount: currentGuard?.blockedCount ?? 0,
          };

          if (isRestarting) {
            scoutDiag.warn('PostCompletion', `RESTART-DETECTED:check:${delay}ms`, {
              ...payload,
              generationDelta: genDelta,
              baselineGeneration: baselineGen,
            });
          } else {
            scoutDiag.info('PostCompletion', `check:${delay}ms`, payload);
          }

          if (blankPanelSnapshot?.blankDetected) {
            scoutDiag.warn(
              'PostCompletion',
              `blank-panel-detected:check:${delay}ms`,
              blankPanelSnapshot as unknown as Record<string, unknown>,
            );
            flushDiagnosticsNow(`blank-panel-detected:${delay}ms`, true);
          }
        } catch (error) {
          scoutDiag.warn('PostCompletion', `check-failed:${delay}ms`, {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, delay);
      timerIds.push(id);
    }

    return () => timerIds.forEach(id => clearTimeout(id));
  }

  // PR #349: probes de estado real pos-finalizacao do waterfall.
  // Detectam se overlay/stop/composer continuam ativos apos setIsLoading(false).
  // Retorna cleanup que cancela RAF + timers; caller deve compor com cleanupPostCompletionRef.
  function scheduleLoadingStuckProbes(sessionId: string, generationValid: boolean): () => void {
    const delays = [0, 100, 500, 1_000, 3_000, 10_000];
    const timerIds: ReturnType<typeof setTimeout>[] = [];
    const capturedSessionId = sessionId;
    let rafSafetyNetFired = false;
    let rafHandle = 0;

    if (!generationValid) return () => {};

    rafHandle = requestAnimationFrame(() => {
      if (latestLoadingRef.current.isLoading) {
        rafSafetyNetFired = true;
        setIsLoading(false);
        (setLoadingVariant as (v: string | undefined) => void)(undefined);
        completeLoadingProgress();
        scoutDiag.warn('MessageOrchestrator', 'raf-safety-net-fired', {
          sessionId: capturedSessionId,
        } as unknown as Record<string, unknown>);
      }
    });

    for (const delay of delays) {
      const id = setTimeout(() => {
        try {
          const bodyText = document.body?.textContent || '';
          const loadingOverlay = document.querySelector('[data-testid="loading-smart-overlay"]');
          const stopButton = document.querySelector('[data-testid="loading-stop-button"]');
          const composer = document.querySelector(
            '[data-testid="chat-input"], [data-testid="composer-input"]',
          ) as HTMLInputElement | null;
          const botMessages = document.querySelectorAll('[data-testid="bot-message-content"]');
          const storeIsLoading = latestLoadingRef.current.isLoading;
          const storeLoadingVariant = latestLoadingRef.current.loadingVariant ?? null;

          const domHasOverlay = Boolean(loadingOverlay);
          const domHasStopButton = Boolean(stopButton);
          const domComposerDisabled = composer?.disabled ?? false;
          const botTextLen = Math.max(0, ...[...botMessages].map(el => (el as HTMLElement).textContent?.length || 0));
          const containsDossie = /dossi[eê]/i.test(bodyText);

          const isStuck =
            domHasOverlay || domHasStopButton || domComposerDisabled || storeIsLoading || storeLoadingVariant !== null;

          const payload = {
            sessionId: capturedSessionId,
            timing: delay,
            rafSafetyNetFired,
            storeIsLoading,
            storeLoadingVariant,
            domHasOverlay,
            domHasStopButton,
            domComposerDisabled,
            composerPlaceholder: composer?.placeholder ?? null,
            botMessageCount: botMessages.length,
            botTextLen,
            bodyTextLen: bodyText.length,
            containsDossie,
            hostname: typeof window !== 'undefined' ? window.location.hostname : 'ssr',
          };

          if (isStuck) {
            scoutDiag.warn(
              'LoadingStuckProbe',
              `stuck-after-completed:${delay}ms`,
              payload as unknown as Record<string, unknown>,
            );
            if (delay === 10_000) {
              Sentry.captureMessage('Scout360 loading stuck — safety probe timed out', {
                level: 'warning',
                tags: { area: 'loading-stuck', session_id: capturedSessionId, probe_delay: '10000' },
                extra: payload as unknown as Record<string, unknown>,
              });
            }
          } else {
            scoutDiag.info('LoadingStuckProbe', `clear:${delay}ms`, payload as unknown as Record<string, unknown>);
          }
        } catch (err: unknown) {
          scoutDiag.warn('LoadingStuckProbe', 'probe-error', {
            sessionId: capturedSessionId,
            delay,
            error: err instanceof Error ? err.message : String(err),
          } as unknown as Record<string, unknown>);
        }
      }, delay);
      timerIds.push(id);
    }

    return () => {
      if (rafHandle) cancelAnimationFrame(rafHandle);
      timerIds.forEach(tid => clearTimeout(tid));
    };
  }

  const processMessage = useCallback(
    async (
      text: string,
      explicitSessionId?: string,
      explicitHistory?: Message[],
      visibleTextForUi?: string,
      hintedCompanyOverride?: string | null,
      options?: ProcessMessageOptions,
    ): Promise<DossierWaterfallResult | null | undefined> => {
      const sessionId = explicitSessionId || currentSessionId;
      if (!sessionId) return;

      if (activeGenerationRef.current[sessionId]) {
        scoutDiag.warn('MessageOrchestrator', 'processMessage bloqueado: geração já ativa para esta sessão', {
          sessionId,
          activeBotMessageId: activeGenerationRef.current[sessionId],
          callerStack: new Error().stack?.split('\n').slice(1, 5).join(' <- '),
        });
        // BRU-81 F2: floodgate fail-closed preservado + feedback visível ao usuário.
        toast.warning?.('Já existe uma pesquisa em andamento nesta conta. Aguarde a conclusão ou interrompa antes de tentar novamente.');
        return;
      }

      if (isAnyWaterfallActive()) {
        const anyGuard = getWaterfallGuardState(sessionId);
        scoutDiag.warn('MessageOrchestrator', 'processMessage bloqueado: waterfall global já ativo', {
          sessionId,
          activeRunId: anyGuard?.activeRunId ?? 'other-session',
          generationCount: anyGuard?.generationCount ?? 0,
        });
        // BRU-81 F2: floodgate fail-closed preservado + feedback visível ao usuário.
        toast.warning?.('Já existe uma pesquisa em andamento. Aguarde a conclusão ou interrompa antes de tentar novamente.');
        return;
      }

      const resolvedRequestKind = options?.requestKind ?? requestKind;
      const fixedLoadingLine = options?.fixedLoadingLine ?? null;
      const resolvedLoadingVariant = resolveEffectiveLoadingVariant({
        requestKind: resolvedRequestKind,
        isFollowUp: options?.isFollowUp,
        forceInline: options?.isNewRunOverride === true,
      });
      setRequestKind(resolvedRequestKind);
      setLoadingVariant(resolvedLoadingVariant);
      setLoadingPinnedLabel(resolvedRequestKind === 'deep_dive' ? fixedLoadingLine : null);
      setIsLoading(true);
      setDiagnosticsSessionId(sessionId);

      scoutDiag.info('MessageOrchestrator', 'processMessage:start', {
        sessionId,
        requestKind: resolvedRequestKind,
        loadingVariant: resolvedLoadingVariant,
        textLen: text.length,
        callerStack: new Error().stack?.split('\n').slice(1, 5).join(' <- '),
      });

      const isFirstInteraction = Boolean(options?.isFirstInteraction);
      const isShortRound = Boolean(options?.isFollowUp || options?.isDeepDive);
      if (isFirstInteraction) {
        resetLoadingProgress('Realizando pesquisa...', isShortRound ? 6 : undefined);
      } else {
        resetLoadingProgress('Aprofundando análise...', isShortRound ? 6 : 7, {
          incremental: true,
          keepHistory: resolvedRequestKind === 'deep_dive' ? 0 : 4,
        });
      }

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      const safeVisibleText = visibleTextForUi || text;
      lastActionRef.current = { type: 'sendMessage', payload: { text, displayText: safeVisibleText } };

      let historyToPass: Message[] = [];
      const sessionForHint = sessionsRef.current.find(session => session.id === sessionId);
      const sessionCnpjDigits = (sessionForHint?.cnpj || '').replace(/\D/g, '');
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
        const session = sessionsRef.current.find(item => item.id === sessionId);
        if (session) {
          const messages = session.messages;
          historyToPass =
            messages.length > 0 &&
            messages[messages.length - 1].text === text &&
            messages[messages.length - 1].sender === Sender.User
              ? messages.slice(0, -1)
              : messages;
        }
      }

      const botMessageId = uuidv4();
      activeGenerationRef.current[sessionId] = botMessageId;
      const placeholderLoadingVariant: LoadingVariant = resolvePlaceholderLoadingVariant({
        requestKind: resolvedRequestKind,
        isFollowUp: options?.isFollowUp,
      });

      const botMessagePlaceholder: Message = {
        id: botMessageId,
        sender: Sender.Bot,
        text: '',
        timestamp: new Date(),
        isThinking: true,
        loadingVariant: placeholderLoadingVariant,
        isSourcesOpen: false,
      };

      setSessions(prev =>
        prev.map(session =>
          session.id === sessionId
            ? {
                ...session,
                messages: [
                  ...session.messages.filter(message => !message.isError && !message.isThinking),
                  botMessagePlaceholder,
                ],
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      );
      setVisibleCount(prev => prev + 1);

      // BRU-73 — roteamento de intenção: pedidos vagos ou ampliação material
      // de escopo NÃO iniciam deep research; respondem com esclarecimento
      // local (sem provider, sem waterfall).
      const chatIntent = resolveResearchIntent({ text, visibleText: safeVisibleText });
      // BRU-73 — telemetria centralizada dos intents de pesquisa (sem texto
      // bruto): qualquer intent de pesquisa (explicit, ambiguous, followup,
      // scope-expansion) fica observável em um único ponto, independente de
      // entrar ou não no esclarecimento local.
      const kIntentsDePesquisa: readonly ChatIntent[] = ['explicit', 'ambiguous', 'followup', 'scope-expansion'];
      if (kIntentsDePesquisa.includes(chatIntent)) {
        scoutDiag.info('MessageOrchestrator', 'processMessage:intent', {
          sessionId,
          intent: chatIntent,
        });
      }
      if (chatIntent === 'ambiguous' || chatIntent === 'scope-expansion') {
        try {
        const clarification =
          chatIntent === 'scope-expansion'
            ? 'Isso é uma ampliação material de escopo. Confirme o plano amplo antes de pesquisar: 1) Estrutura societária; 2) Operação e cadeia de valor; 3) Tecnologia e gestão. Responda "sim" para confirmar ou delimite a frente que você quer aprofundar.'
            : 'Pesquisar mais o quê? Frentes disponíveis no contexto:\n1. Estrutura societária — holding, CNPJs e filiais.\n2. Operação — unidades, área, armazenagem, logística e compras.\n3. Tecnologia e gestão — ERP, HCM, sistemas e integração.\n\nEscolha uma frente para eu aprofundar.';
        setSessions(prev =>
          prev.map(session =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: session.messages.map(message =>
                    message.id === botMessageId
                      ? { ...message, text: clarification, isThinking: false, loadingVariant: undefined }
                      : message,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : session,
          ),
        );
        delete activeGenerationRef.current[sessionId];
        // Finaliza o ciclo de loading como o caminho normal — sem isso o chat
        // fica preso em "Gerando resposta..." com o input travado.
        setIsLoading(false);
        (setLoadingVariant as (v: string | undefined) => void)(undefined);
        completeLoadingProgress();
        setRequestKind('default');
        setLoadingPinnedLabel(null);
        abortControllerRef.current = null;
          scoutDiag.info('MessageOrchestrator', 'processMessage:clarification', {
            sessionId,
            intent: chatIntent,
          });
          return;
        } catch (err) {
          // Fail-closed: se o esclarecimento falhar, finaliza o ciclo de
          // loading para não travar o chat (mesma sequência do caminho normal).
          setIsLoading(false);
          (setLoadingVariant as (v: string | undefined) => void)(undefined);
          completeLoadingProgress();
          setRequestKind('default');
          setLoadingPinnedLabel(null);
          abortControllerRef.current = null;
          delete activeGenerationRef.current[sessionId];
          scoutDiag.error('MessageOrchestrator', 'processMessage:clarification-failed', {
            sessionId,
            intent: chatIntent,
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }
      }

      const normalizedUpperText = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      const isMegaPrompt = normalizedUpperText.includes('DOSSIE COMPLETO') && resolvedRequestKind !== 'deep_dive';
      let lifecycleRunId: string | null = null;
      let lifecycleHeartbeatCleanup: (() => void) | null = null;

      try {
        if (isMegaPrompt) {
          const preGuard = getWaterfallGuardState(sessionId);
          const generationBefore = preGuard?.generationCount ?? 0;

          scoutDiag.info('MessageOrchestrator', 'processMessage:waterfall:start', {
            sessionId,
            company: normalizedCompany,
            generationBefore,
          });
          const createdRun = await createOrGetDossierRun({
            sessionId,
            idempotencyKey: `dossier:${sessionId}:${botMessageId}`,
          }, { signal, timeoutMs: DOSSIER_RUN_RPC_TIMEOUT_MS });
          const leaseOwner = `${botMessageId}:lease`;
          const leasedRun = await acquireDossierRunLease(createdRun.run_id, leaseOwner, { signal, timeoutMs: DOSSIER_RUN_RPC_TIMEOUT_MS });
          if (!leasedRun || leasedRun.status !== 'RUNNING' || leasedRun.lease_expires_at === null) {
            scoutDiag.warn('MessageOrchestrator', 'dossier-run-lease-not-acquired', {
              sessionId,
              runId: createdRun.run_id,
              status: leasedRun?.status ?? null,
            });
            const leaseError = normalizeAppError(new Error('Não foi possível iniciar o dossiê porque já existe uma execução em andamento para esta sessão. Aguarde a conclusão ou interrompa a execução ativa.'));
            updateSessionById(sessionId, session => ({
              ...session,
              messages: session.messages.map(message =>
                message.id === botMessageId
                  ? {
                      ...message,
                      text: 'Não foi possível iniciar o dossiê porque já existe uma execução em andamento para esta sessão. Aguarde a conclusão ou interrompa a execução ativa.',
                      isThinking: false,
                      loadingVariant: undefined,
                      isError: true,
                      errorDetails: leaseError,
                    }
                  : message,
              ),
            }));
            return;
          }
          lifecycleRunId = createdRun.run_id;
          setActiveDossierRun({ sessionId, runId: lifecycleRunId, leaseOwner, clientAttemptId: botMessageId });
          lifecycleHeartbeatCleanup = startDossierRunHeartbeat({ sessionId, runId: lifecycleRunId, leaseOwner });
          trackOperatorEvent('dossier_started', {
            operatorId,
            email: operatorEmail || undefined,
            sessionId,
            entityType: 'session',
            entityId: botMessageId,
            companyCnpj: sessionCnpjDigits || undefined,
            companyName: normalizedCompany || undefined,
          });
          const waterfallResult = await runMegaPromptWaterfall({
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
            dossierRunId: lifecycleRunId,
            dossierLeaseOwner: leaseOwner,
          });
          if (waterfallResult.status === 'CANCELLED') {
            trackOperatorEvent('dossier_cancelled', {
              operatorId,
              email: operatorEmail || undefined,
              sessionId,
              entityType: 'session',
              entityId: botMessageId,
              companyCnpj: sessionCnpjDigits || undefined,
              companyName: normalizedCompany || undefined,
              metadata: { runId: lifecycleRunId },
            });
            setSessions(prev => prev.map(session => session.id === sessionId ? { ...session, messages: session.messages.filter(message => message.id !== botMessageId || message.text.trim().length > 0) } : session));
            return waterfallResult;
          }
          if (waterfallResult.status === 'FAILED') {
            const generatedBotMessage = sessionsRef.current
              .find(session => session.id === sessionId)
              ?.messages.find(message => message.id === botMessageId);
            if (generatedBotMessage?.text.trim()) {
              const appError = normalizeAppError(waterfallResult.error);
              trackOperatorEvent('dossier_failed', {
                operatorId,
                email: operatorEmail || undefined,
                sessionId,
                entityType: 'session',
                entityId: botMessageId,
                companyCnpj: sessionCnpjDigits || undefined,
                companyName: normalizedCompany || undefined,
                metadata: { errorMessage: waterfallResult.error.message },
              });
              updateSessionById(sessionId, session => ({
                ...session,
                messages: session.messages.map(message =>
                  message.id === botMessageId
                    ? { ...message, isError: true, errorDetails: appError }
                    : message,
                ),
              }));
              return waterfallResult;
            }
            throw waterfallResult.error;
          }
          trackOperatorEvent('dossier_completed', { operatorId, email: operatorEmail || undefined, sessionId, entityType: 'session', entityId: botMessageId, companyCnpj: sessionCnpjDigits || undefined, companyName: normalizedCompany || undefined });
          scoutDiag.info('MessageOrchestrator', 'processMessage:waterfall:returned', {
            sessionId,
            runId: lifecycleRunId,
          });
          return waterfallResult;
        }

        const {
          text: responseText,
          sources,
          suggestions,
          scorePorta,
          clienteSeniorData,
          ghostReason,
          webVerificationStatus,
        } = await withAutoRetry(
          'sendMessageToLlm',
          () =>
            sendMessageToLlm(
              text,
              historyToPass,
              systemInstruction,
              {
                signal,
                onText: () => {
                  setFailureCount(0);
                },
                onStatus: newStatus => {
                  advanceLoadingProgress(newStatus);
                },
                onRagFailed: () => {
                  toast.warning?.('Busca de contexto indisponível — resposta pode ser menos precisa');
                },
                nomeVendedor: resolvedOperatorName,
                sessionId,
                hintedCompany,
                isFollowUp: Boolean(options?.isFollowUp),
              },
              canUseLookup,
            ),
          { abortSignal: signal },
        );

        const safeSuggestions = ensureContinuitySuggestions(suggestions, normalizedCompany || hintedCompany || null, {
          contextText: responseText,
        });

        // Guard: resposta vazia do LLM não deve gerar card invisível
        const fallbackText = '*Sem resposta do assistente.*';
        const finalResponseText = responseText && responseText.trim().length > 0 ? responseText : fallbackText;

        if (finalResponseText === fallbackText) {
          scoutDiag.warn('MessageOrchestrator', 'LLM retornou texto vazio — usando fallback', {
            sessionId,
            company: normalizedCompany || hintedCompany || null,
          });
        }

        if (activeGenerationRef.current[sessionId] !== botMessageId) return;

        updateSessionById(sessionId, session => {
          const shouldRewriteTitle =
            session.messages.length <= 2 ||
            session.title === 'Nova Investigação' ||
            /dossi[êe]\s+completo/i.test(session.title) ||
            session.title.length > 90;
          const finalCompany = normalizedCompany || session.empresaAlvo || pickCompanyLabel(session.title);

          return {
            ...session,
            title: shouldRewriteTitle ? finalCompany || session.title : session.title,
            empresaAlvo: finalCompany || session.empresaAlvo,
            scoreOportunidade: scorePorta?.score ?? session.scoreOportunidade,
            messages: (session.messages || []).map(message =>
              message.id === botMessageId
                ? {
                    ...message,
                    text: finalResponseText,
                    groundingSources: sources as { title: string; url: string }[] | undefined,
                    webVerificationStatus,
                    groundingUsed:
                      webVerificationStatus && webVerificationStatus !== 'not_applicable'
                        ? webVerificationStatus === 'verified' || webVerificationStatus === 'fallback_verified'
                        : undefined,
                    suggestions: safeSuggestions,
                    scorePorta: scorePorta || undefined,
                    clienteSeniorData: clienteSeniorData || undefined,
                    isThinking: false,
                    isDeepDiveResult: resolvedRequestKind === 'deep_dive',
                    ...(ghostReason && { ghostDetails: ghostReason }),
                  }
                : message,
            ),
          };
        });

        if (!investigationLogged && finalResponseText.length > 500) {
          setInvestigationLogged(true);
          fetch(BACKEND_URL, {
            method: 'POST',
            redirect: 'follow',
            signal: AbortSignal.timeout(15_000),
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              action: 'logInvestigation',
              vendedor: resolvedOperatorName,
              empresa: normalizedCompany || cleanTitle(extractCompanyName(safeVisibleText)),
              modo: mode || '',
              resumo: finalResponseText.substring(0, 200),
            }),
          }).catch((err: unknown) => {
            scoutDiag.warn('RemoteLog', 'logInvestigation falhou (Apps Script)', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      } catch (error: unknown) {
        scoutDiag.warn('MessageOrchestrator', 'processMessage:catch', {
          sessionId,
          errorMessage: error instanceof Error ? error.message : String(error),
          isAbort: isAbortLikeError(error),
        });

        if (isAbortLikeError(error)) {
          setSessions(prev =>
            prev.map(session =>
              session.id === sessionId
                ? {
                    ...session,
                    messages: (session.messages || []).filter(
                      message => message.id !== botMessageId || message.text.trim().length > 0,
                    ),
                  }
                : session,
            ),
          );
          setIsLoading(false);
          abortControllerRef.current = null;
          return;
        }

        const activeBotMessageId = activeGenerationRef.current[sessionId];
        if (activeBotMessageId && activeBotMessageId !== botMessageId) {
          scoutDiag.warn('MessageOrchestrator', 'error-treatment-skipped-generation-mismatch', {
            sessionId,
            expectedBotId: botMessageId,
            actualBotId: activeBotMessageId,
          });
          return;
        }

        if (isMegaPrompt) {
          trackOperatorEvent('dossier_failed', {
            operatorId,
            email: operatorEmail || undefined,
            sessionId,
            entityType: 'session',
            entityId: botMessageId,
            companyCnpj: sessionCnpjDigits || undefined,
            companyName: normalizedCompany || undefined,
            metadata: { errorMessage: error instanceof Error ? error.message : String(error) },
          });
        }

        const appError = normalizeAppError(error as Error);
        updateSessionById(sessionId, session => ({
          ...session,
          messages: [
            ...(session.messages || []).filter(message => message.id !== botMessageId),
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
        lifecycleHeartbeatCleanup?.();
        const isAbort = !abortControllerRef.current;

        scoutDiag.info('MessageOrchestrator', 'processMessage:finally:entered', {
          sessionId,
          requestKind: resolvedRequestKind,
          isAbort,
          runId: lifecycleRunId,
          visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
          performanceNow: typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
          navigationType:
            typeof performance !== 'undefined'
              ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? 'unknown'
              : 'unknown',
        });
        // clearActiveDossierRun acontece imediatamente depois do marker de entrada;
        // o par start/end permite distinguir finally ausente de clear sem efeito.
        if (lifecycleRunId) {
          scoutDiag.info('DossierRunLifecycle', 'active-run:clear:start', {
            sessionId,
            runId: lifecycleRunId,
            visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
            performanceNow: typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
          });
          clearActiveDossierRun(sessionId, lifecycleRunId);
          const postClearRun = getActiveDossierRun(sessionId);
          scoutDiag.info('DossierRunLifecycle', 'active-run:clear:end', {
            sessionId,
            runId: lifecycleRunId,
            clearSucceeded: !postClearRun,
            remainingRunId: postClearRun?.runId ?? null,
            visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
            performanceNow: typeof performance !== 'undefined' ? Math.round(performance.now()) : null,
          });
        }

        const t0 = performance.now();

        // Agenda flush ANTES de disparar React render.
        // setIsLoading(false) dispara render síncrono que bloqueia a thread.
        // Se o setTimeout for agendado DEPOIS, o callback nunca roda até
        // o render terminar. Agendando ANTES, o timer já está na macrotask
        // queue quando o React começa, e dispara assim que o render termina.
        if (!isAbort) {
          setTimeout(() => {
            scoutDiag.info('MessageOrchestrator', 'post-render-fired', {
              sessionId,
              delayMs: Math.round(performance.now() - t0),
            });
            scoutDiag.info('MessageOrchestrator', 'processMessage:finally:before-flush', {
              sessionId,
            });
            flushDiagnosticsNow('processMessage:finally', true);
            scoutDiag.info('MessageOrchestrator', 'processMessage:finally:after-flush', {
              sessionId,
              flushDurationMs: Math.round(performance.now() - t0),
            });
          }, 0);
        }

        // Dispara React render DEPOIS de agendar o setTimeout.
        // O timer já está na macrotask queue — dispara assim que
        // o render síncrono terminar e devolver controle ao event loop.
        setIsLoading(false);
        (setLoadingVariant as (v: string | undefined) => void)(undefined);
        completeLoadingProgress();
        setRequestKind('default');
        setLoadingPinnedLabel(null);
        abortControllerRef.current = null;

        scoutDiag.info('MessageOrchestrator', 'post-render-scheduled', { sessionId });

        // Cancela checks anteriores (evita acúmulo de timers entre mensagens)
        if (cleanupPostCompletionRef.current) cleanupPostCompletionRef.current();

        // Agenda checks pós-finalização para monitorar DOM/composer/overlays
        const cleanupChecks = schedulePostCompletionChecks(sessionId);

        // PR #349: probes de estado real + RAF safety net contra loading preso.
        // generationValid é snapshot booleano capturado antes do delete;
        // scheduleLoadingStuckProbes opera com esse snapshot, não com a ref.
        const generationValid = activeGenerationRef.current[sessionId] === botMessageId;
        const cleanupProbes = scheduleLoadingStuckProbes(sessionId, generationValid);

        if (activeGenerationRef.current[sessionId] === botMessageId) {
          delete activeGenerationRef.current[sessionId];
        }

        cleanupPostCompletionRef.current = () => {
          cleanupChecks();
          cleanupProbes();
        };
      }
    },
    [
      abortControllerRef,
      activeGenerationRef,
      advanceLoadingProgress,
      canUseLookup,
      completeLoadingProgress,
      currentSessionId,
      investigationLogged,
      lastActionRef,
      mode,
      requestKind,
      resetLoadingProgress,
      resolvedOperatorName,
      runMegaPromptWaterfall,
      sessionsRef,
      setFailureCount,
      setInvestigationLogged,
      setIsLoading,
      setLastQuery,
      setLoadingPinnedLabel,
      setLoadingVariant,
      setRequestKind,
      operatorId,
      operatorEmail,
      setSessions,
      setVisibleCount,
      systemInstruction,
      toast,
      updateSessionById,
    ],
  );

  const handleSendMessage = useCallback(
    async (
      text: string,
      displayText?: string,
      hintedCompanyOverride?: string | null,
      options?: HandleSendMessageOptions,
    ): Promise<DossierWaterfallResult | null | undefined> => {
      const resolvedDisplayText = displayText || text;
      let sessionId = options?.explicitSessionId ?? currentSessionId;
      let currentHistory: Message[];
      let immediateCompany: string | null;
      let createdInitialSessionId: string | null = null;
      const resolvedRequestKind = options?.requestKind ?? 'default';
      const fixedLoadingLine = resolvedRequestKind === 'deep_dive' ? (options?.fixedLoadingLine ?? null) : null;

      setRequestKind(resolvedRequestKind);
      setLoadingPinnedLabel(fixedLoadingLine);

      if (!sessionId && pendingInitialSendRef.current) {
        const pendingSessionId = pendingInitialSendRef.current.sessionId;
        const pendingSession = sessionsRef.current.find(session => session.id === pendingSessionId);

        if (pendingSession) {
          setCurrentSessionId(pendingSessionId);
          scoutDiag.warn('MessageOrchestrator', 'envio inicial duplicado bloqueado; mantendo sessão em andamento', {
            pendingSessionId,
            textLen: text.length,
            displayTextLen: resolvedDisplayText.length,
          });
          return;
        }

        pendingInitialSendRef.current = null;
      }

      if (!sessionId && isAnyWaterfallActive()) {
        scoutDiag.warn('MessageOrchestrator', 'envio inicial bloqueado: waterfall global já ativo', {
          textLen: text.length,
          displayTextLen: resolvedDisplayText.length,
        });
        return;
      }

      const existingSession = sessionId ? sessionsRef.current.find(session => session.id === sessionId) : null;
      if (!sessionId || !existingSession) {
        const rawTitle = cleanTitle(hintedCompanyOverride || extractCompanyName(resolvedDisplayText));
        const immediateTitle = rawTitle && !isGenericCompanyLabel(rawTitle) ? rawTitle : '';
        immediateCompany = immediateTitle || null;

        // Tenta promover sessao vazia existente em vez de criar nova.
        // Evita duplicatas quando usuario clicou "Nova investigacao" antes
        // de submeter o formulario de pesquisa.
        const reusable = findReusableEmptySession(sessionsRef.current);
        if (reusable) {
          sessionId = reusable.id;
          createdInitialSessionId = sessionId;
          setSessions(prev =>
            prev.map(s =>
              s.id === sessionId
                ? {
                    ...s,
                    title: immediateTitle || s.title,
                    empresaAlvo: immediateTitle || null,
                    cnpj: options?.cnpj ?? s.cnpj ?? null,
                  }
                : s,
            ),
          );
          setCurrentSessionId(sessionId);
        } else {
          sessionId = uuidv4();
          createdInitialSessionId = sessionId;
          const newSession: ChatSession = {
            id: sessionId,
            title: immediateTitle || 'Nova Investigação',
            empresaAlvo: immediateTitle || null,
            cnpj: options?.cnpj ?? null,
            modoPrincipal: DEFAULT_MODE,
            scoreOportunidade: null,
            resumoDossie: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
          };
          setSessions(prev => [newSession, ...prev]);
          setCurrentSessionId(sessionId);
        }
        pendingInitialSendRef.current = { sessionId };
        currentHistory = [];
      } else {
        currentHistory = existingSession.messages ? [...existingSession.messages] : [];
        immediateCompany = hintedCompanyOverride || existingSession.empresaAlvo || null;
        if (options?.cnpj && !existingSession.cnpj) {
          setSessions(prev =>
            prev.map(session => (session.id === sessionId ? { ...session, cnpj: options.cnpj ?? null } : session)),
          );
        }
      }

      const userMessage: Message = {
        id: uuidv4(),
        sender: Sender.User,
        text: resolvedDisplayText,
        timestamp: new Date(),
      };

      setSessions(prev =>
        prev.map(session =>
          session.id === sessionId
            ? {
                ...session,
                messages: [...(session.messages || []), userMessage],
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      );
      setVisibleCount(prev => prev + 1);

      const previousUserMessages = currentHistory.filter(message => message.sender === Sender.User).length;
      const isDeepDive = resolvedRequestKind === 'deep_dive';
      const isNewRunOverride = options?.isNewRunOverride === true;
      try {
        const result = await processMessage(
          text,
          sessionId,
          currentHistory,
          resolvedDisplayText,
          hintedCompanyOverride || immediateCompany,
          {
            isFollowUp: isNewRunOverride ? false : previousUserMessages > 0,
            isDeepDive,
            isFirstInteraction: isNewRunOverride ? true : previousUserMessages === 0,
            requestKind: resolvedRequestKind,
            fixedLoadingLine: fixedLoadingLine ?? undefined,
            explicitSessionId: options?.explicitSessionId ?? undefined,
            isNewRunOverride: options?.isNewRunOverride ?? undefined,
          },
        );
        return result;
      } finally {
        if (createdInitialSessionId) {
          const createdSession = sessionsRef.current.find(session => session.id === createdInitialSessionId);
          const messages = createdSession?.messages || [];
          const shouldDiscardAbortedInitialSession =
            messages.length === 1 && messages[0].sender === Sender.User && messages[0].text === resolvedDisplayText;

          if (shouldDiscardAbortedInitialSession) {
            setSessions(prev => prev.filter(session => session.id !== createdInitialSessionId));
            setCurrentSessionId(null);
          }
        }

        if (createdInitialSessionId && pendingInitialSendRef.current?.sessionId === createdInitialSessionId) {
          pendingInitialSendRef.current = null;
        }
      }
    },
    [
      currentSessionId,
      processMessage,
      sessionsRef,
      setCurrentSessionId,
      setLoadingPinnedLabel,
      setRequestKind,
      setSessions,
      setVisibleCount,
    ],
  );

  const retryLastSendMessage = useCallback(() => {
    const lastAction = lastActionRef.current;
    if (!lastAction || lastAction.type !== 'sendMessage') return;

    if (currentSessionId) {
      updateSessionById(currentSessionId, session => {
        const messages = session.messages;
        const lastMessage = messages[messages.length - 1];
        if (
          lastMessage &&
          lastMessage.sender === Sender.Bot &&
          (lastMessage.isError || !lastMessage.text || lastMessage.ghostDetails)
        ) {
          return { ...session, messages: (messages || []).slice(0, -1) };
        }
        return session;
      });
    }

    void processMessage(
      lastAction.payload.text || '',
      currentSessionId || undefined,
      undefined,
      lastAction.payload.displayText || lastAction.payload.text || '',
      undefined,
      { requestKind },
    );
  }, [currentSessionId, lastActionRef, processMessage, requestKind, updateSessionById]);

  return { handleSendMessage, retryLastSendMessage };
}
