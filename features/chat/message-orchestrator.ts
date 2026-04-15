import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_MODE } from '../../constants';
import { BACKEND_URL } from '../../services/apiConfig';
import { sendMessageToGemini } from '../../services/geminiService';
import { Sender, type ChatSession, type Message } from '../../types';
import { scoutDiag } from '../../utils/diagnosticLog';
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

interface ResetLoadingProgressOptions {
  incremental?: boolean;
  keepHistory?: number;
}

export interface LastAction {
  type: 'sendMessage' | 'regenerateSuggestions';
  payload: { text?: string; displayText?: string; messageId?: string };
}

export interface HandleSendMessageOptions {
  requestKind?: RequestKind;
  fixedLoadingLine?: string;
}

interface ProcessMessageOptions extends HandleSendMessageOptions {
  isFollowUp?: boolean;
  isDeepDive?: boolean;
  isFirstInteraction?: boolean;
}

export interface RunMegaPromptWaterfallArgs {
  sessionId: string;
  text: string;
  safeVisibleText: string;
  hintedCompany: string | null;
  normalizedCompany: string;
  historyToPass: Message[];
  botMessageId: string;
  signal: AbortSignal;
  isFirstInteraction: boolean;
  sessionCnpjDigits: string;
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
  resetLoadingProgress: (
    stage?: string,
    totalStages?: number,
    options?: ResetLoadingProgressOptions,
  ) => void;
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
}

export function useChatMessageOrchestrator({
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
}: UseChatMessageOrchestratorOptions) {
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
      const hintedCompany =
        hintedCompanyOverride || resolveHintedCompany(sessionForHint?.empresaAlvo, safeVisibleText);
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
          message.sender === Sender.Bot &&
          !message.isError &&
          !message.isThinking &&
          Boolean(message.text?.trim()),
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

      try {
        const normalizedUpperText = text
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();
        const isMegaPrompt =
          normalizedUpperText.includes('DOSSIE COMPLETO') && resolvedRequestKind !== 'deep_dive';

        if (isMegaPrompt) {
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
          return;
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
          },
          canUseLookup,
        );

        const safeSuggestions = ensureContinuitySuggestions(
          suggestions,
          normalizedCompany || hintedCompany || null,
        );

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
                    text: responseText,
                    groundingSources: sources as { title: string; url: string }[] | undefined,
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

        if (!investigationLogged && responseText.length > 500) {
          setInvestigationLogged(true);
          fetch(BACKEND_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              action: 'logInvestigation',
              vendedor: resolvedOperatorName,
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
        setIsLoading(false);
        setLoadingPinnedLabel(null);
        abortControllerRef.current = null;
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
      const fixedLoadingLine =
        resolvedRequestKind === 'deep_dive' ? options?.fixedLoadingLine ?? null : null;

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
        currentHistory = existingSession.messages ? [...existingSession.messages] : [];
        immediateCompany = hintedCompanyOverride || existingSession.empresaAlvo || null;
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
