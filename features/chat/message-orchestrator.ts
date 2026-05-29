import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_MODE } from '../../constants';
import { useMaybeMode } from '../../contexts/ModeContext';
import { BACKEND_URL } from '../../services/apiConfig';
import { sendMessageToGemini } from '../../services/geminiService';
import { withAutoRetry } from '../../utils/retry';
import { useMaybeChatStore } from '../../stores/chatStore';
import { Sender, type ChatSession, type LastAction, type Message, type RunMegaPromptWaterfallArgs } from '../../types';
import { scoutDiag, setDiagnosticsSessionId, flushDiagnosticsNow } from '../../utils/diagnosticLog';
import { normalizeAppError } from '../../utils/errorHelpers';
import { extractCompanyName } from '../../utils/companyNameExtractor';
import { cleanTitle, sanitizeLoadingContextText } from '../../utils/textCleaners';
import {
  resolveLoadingVariant,
  resolvePlaceholderLoadingVariant,
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

interface ResetLoadingProgressOptions {
  incremental?: boolean;
  keepHistory?: number;
}

export interface HandleSendMessageOptions {
  requestKind?: RequestKind;
  fixedLoadingLine?: string;
  cnpj?: string | null;
}

interface ProcessMessageOptions extends HandleSendMessageOptions {
  isFollowUp?: boolean;
  isDeepDive?: boolean;
  isFirstInteraction?: boolean;
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
  runMegaPromptWaterfall: (args: RunMegaPromptWaterfallArgs) => Promise<void>;
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

  let cleanupPostCompletion: (() => void) | null = null;

  /**
   * Agenda verificações pós-finalização do dossiê em 0/100/500/1k/3k/10k ms.
   * Cada check captura estado do DOM, overlays, composer e viewport.
   * Retorna função de cancelamento para limpar timers pendentes.
   */
  function schedulePostCompletionChecks(sessionId: string): () => void {
    const delays = [0, 100, 500, 1_000, 3_000, 10_000];
    const timerIds: ReturnType<typeof setTimeout>[] = [];

    for (const delay of delays) {
      const id = setTimeout(() => {
        try {
          const bodyText = document.body?.textContent || '';
          const loadingOverlay = document.querySelector('[data-testid="loading-smart-overlay"]');
          const botMessages = document.querySelectorAll('[data-testid="bot-message-content"]');
          const composer = document.querySelector('[data-testid="composer-input"]');
          const scroller = document.querySelector('[data-virtuoso-scroller]');

          scoutDiag.info('PostCompletion', `check:${delay}ms`, {
            sessionId,
            bodyLen: bodyText.length,
            containsDossie: /dossi[eê]/i.test(bodyText),
            containsLoading: /Preparando|Mapeando|Verificando|Investigando|Interromper/i.test(bodyText),
            loadingOverlayExists: Boolean(loadingOverlay),
            botMessageCount: botMessages.length,
            botTextMaxLen: Math.max(0, ...[...botMessages].map(el => (el as HTMLElement).textContent?.length || 0)),
            composerDisabled: (composer as HTMLInputElement)?.disabled || false,
            scrollerHeight: (scroller as HTMLElement)?.clientHeight || 0,
            documentReadyState: document.readyState,
            activeElement: document.activeElement?.tagName || '',
          });
        } catch {
          /* non-critical DOM check */
        }
      }, delay);
      timerIds.push(id);
    }

    return () => timerIds.forEach(id => clearTimeout(id));
  }

  const processMessage = useCallback(
    async (
      text: string,
      explicitSessionId?: string,
      explicitHistory?: Message[],
      visibleTextForUi?: string,
      hintedCompanyOverride?: string | null,
      options?: ProcessMessageOptions,
    ) => {
      const sessionId = explicitSessionId || currentSessionId;
      if (!sessionId) return;

      const resolvedRequestKind = options?.requestKind ?? requestKind;
      const fixedLoadingLine = options?.fixedLoadingLine ?? null;
      const resolvedLoadingVariant = resolveLoadingVariant({
        requestKind: resolvedRequestKind,
        isFollowUp: options?.isFollowUp,
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
      const hasConsolidatedBotResponse = historyToPass.some(
        message =>
          message.sender === Sender.Bot && !message.isError && !message.isThinking && Boolean(message.text?.trim()),
      );

      const placeholderLoadingVariant: LoadingVariant = resolvePlaceholderLoadingVariant({
        requestKind: resolvedRequestKind,
        isFollowUp: options?.isFollowUp,
        hasConsolidatedBotResponse,
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
                messages: [...session.messages.filter(message => !message.isError), botMessagePlaceholder],
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      );
      setVisibleCount(prev => prev + 1);

      const normalizedUpperText = text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      const isMegaPrompt = normalizedUpperText.includes('DOSSIE COMPLETO') && resolvedRequestKind !== 'deep_dive';

      try {
        if (isMegaPrompt) {
          scoutDiag.info('MessageOrchestrator', 'processMessage:waterfall:start', {
            sessionId,
            company: normalizedCompany,
          });
          trackOperatorEvent('dossier_started', {
            operatorId,
            email: operatorEmail || undefined,
            sessionId,
            entityType: 'session',
            entityId: botMessageId,
            companyCnpj: sessionCnpjDigits || undefined,
            companyName: normalizedCompany || undefined,
          });
          await runMegaPromptWaterfall({
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
          });
          completeLoadingProgress();
          trackOperatorEvent('dossier_completed', {
            operatorId,
            email: operatorEmail || undefined,
            sessionId,
            entityType: 'session',
            entityId: botMessageId,
            companyCnpj: sessionCnpjDigits || undefined,
            companyName: normalizedCompany || undefined,
          });
          scoutDiag.info('MessageOrchestrator', 'processMessage:waterfall:returned', {
            sessionId,
          });
          return;
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
          'sendMessageToGemini',
          () =>
            sendMessageToGemini(
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

        // Guard: resposta vazia do Gemini não deve gerar card invisível
        const fallbackText = '*Sem resposta do assistente.*';
        const finalResponseText = responseText && responseText.trim().length > 0 ? responseText : fallbackText;

        if (finalResponseText === fallbackText) {
          scoutDiag.warn('MessageOrchestrator', 'Gemini retornou texto vazio — usando fallback', {
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
        completeLoadingProgress();

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

        if (activeGenerationRef.current[sessionId] !== botMessageId) return;

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
        const isAbort = !abortControllerRef.current;

        scoutDiag.info('MessageOrchestrator', 'processMessage:finally', {
          sessionId,
          requestKind: resolvedRequestKind,
          isAbort,
        });

        setIsLoading(false);
        completeLoadingProgress();
        setRequestKind('default');
        setLoadingPinnedLabel(null);
        abortControllerRef.current = null;

        if (!isAbort) {
          // Flush imediato dos diagnósticos — garante que eventos após o finally
          // cheguem ao Supabase mesmo se a UI travar em seguida.
          flushDiagnosticsNow('processMessage:finally');
        }

        // Cancela checks anteriores (evita acúmulo de timers entre mensagens)
        if (cleanupPostCompletion) cleanupPostCompletion();

        // Agenda checks pós-finalização para monitorar DOM/composer/overlays
        cleanupPostCompletion = schedulePostCompletionChecks(sessionId);
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
    ) => {
      const resolvedDisplayText = displayText || text;
      let sessionId = currentSessionId;
      let currentHistory: Message[];
      let immediateCompany: string | null;
      const resolvedRequestKind = options?.requestKind ?? 'default';
      const fixedLoadingLine = resolvedRequestKind === 'deep_dive' ? (options?.fixedLoadingLine ?? null) : null;

      setRequestKind(resolvedRequestKind);
      setLoadingPinnedLabel(fixedLoadingLine);

      const existingSession = sessionId ? sessionsRef.current.find(session => session.id === sessionId) : null;
      if (!sessionId || !existingSession) {
        sessionId = uuidv4();
        const rawTitle = cleanTitle(hintedCompanyOverride || extractCompanyName(resolvedDisplayText));
        const immediateTitle = rawTitle && !isGenericCompanyLabel(rawTitle) ? rawTitle : '';
        immediateCompany = immediateTitle || null;
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
      await processMessage(
        text,
        sessionId,
        currentHistory,
        resolvedDisplayText,
        hintedCompanyOverride || immediateCompany,
        {
          isFollowUp: previousUserMessages > 0,
          isDeepDive,
          isFirstInteraction: previousUserMessages === 0,
          requestKind: resolvedRequestKind,
          fixedLoadingLine: fixedLoadingLine ?? undefined,
        },
      );
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
