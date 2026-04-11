import { useState, useEffect, useCallback, useMemo, useRef, useTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../contexts/AuthContext';
import { useMode } from '../contexts/ModeContext';
import { Message, Sender, Feedback, ChatSession, AppError } from '../types';
import { sendMessageToGemini, generateContinuityQuestion as generateNewSuggestions, resetPortaState as resetChatSession } from '../services/geminiService';
import { listRemoteSessions, getRemoteSession, saveRemoteSession } from '../services/sessionRemoteStore';
import { sendFeedbackRemote } from '../services/feedbackRemoteStore';
import { extractCompanyName } from '../utils/companyNameExtractor';
import { cleanTitle, sanitizeLoadingContextText, stripInternalMarkers } from '../utils/textCleaners';
import { normalizeAppError } from '../utils/errorHelpers';
import { BACKEND_URL } from '../services/apiConfig';
import { useToast } from './useToast';
import { APP_NAME, MODE_LABELS, DEFAULT_MODE } from '../constants';
const SESSIONS_STORAGE_KEY = 'scout360_sessions_v1';
const THEME_KEY = 'scout360_theme';
const PAGE_SIZE = 20;

interface LastAction {
  type: 'sendMessage' | 'regenerateSuggestions';
  payload: any;
}

function sanitizeSessionCompanyName(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const raw = (candidate || '').trim();
    if (!raw) continue;

    const bracketMatch = raw.match(/dossi[eê]\s+completo\s+de\s+\[([^\]]+)\]/i);
    const companyLineMatch = raw.match(/(?:^|\n)\s*-\s*Empresa:\s*([^\n]+)/i);
    const cadastroMatch = raw.match(/Empresa=([^;\n]+)/i);

    const extracted =
      bracketMatch?.[1]?.trim() ||
      companyLineMatch?.[1]?.trim() ||
      cadastroMatch?.[1]?.trim() ||
      extractCompanyName(raw) ||
      raw;

    const cleaned = cleanTitle(
      extracted
        .split(/\.?\s*Protocolo de investiga[cç][aã]o/i)[0]
        .split(/INVESTIGACAO_COMPLETA_INTEGRADA/i)[0]
        .split(/\n\s*---\s*\n/i)[0]
        .trim(),
    );

    if (!cleaned) continue;
    if (/^nova investiga[cç][aã]o$/i.test(cleaned)) continue;
    if (cleaned.length > 120) continue;

    return cleaned;
  }

  return null;
}

export const useChat = () => {
  const { userId, user, isAuthenticated } = useAuth();
  const { mode, systemInstruction } = useMode();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [pdfReportContent, setPdfReportContent] = useState<string | null>(null);
  const [investigationLogged, setInvestigationLogged] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastActionRef = useRef<LastAction | null>(null);
  const activeGenerationRef = useRef<Record<string, string>>({}); // Fixed from boolean
  const lastStatusRef = useRef<string>('');

  const { data: remoteSessions } = useQuery({
    queryKey: ['remoteSessions'],
    queryFn: listRemoteSessions,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const sessionsRef = useRef<ChatSession[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('Iniciando análise');
  const [completedLoadingStatuses, setCompletedLoadingStatuses] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastQuery, setLastQuery] = useState<string>('');
  const [isSavingRemote, setIsSavingRemote] = useState(false);
  const [remoteSaveStatus, setRemoteSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const updateSessionById = useCallback(
    (id: string, updater: (session: ChatSession) => ChatSession) => {
      setSessions(prev => 
        prev.map(s => (s.id === id ? { ...updater(s), updatedAt: new Date().toISOString() } : s))
      );
    },
    [],
  );

  const updateCurrentSession = useCallback(
    (updater: (session: ChatSession) => ChatSession) => {
      if (currentSessionId) updateSessionById(currentSessionId, updater);
    },
    [currentSessionId, updateSessionById],
  );

  const currentSession = useMemo(() => 
    sessions.find(s => s.id === currentSessionId) || null,
    [sessions, currentSessionId]
  );

  const handleNewSession = useCallback(() => {
    if (isLoading && abortControllerRef.current) abortControllerRef.current.abort();
    const newSession: ChatSession = {
      id: uuidv4(),
      title: 'Nova Investigação',
      empresaAlvo: null,
      cnpj: null,
      modoPrincipal: DEFAULT_MODE,
      scoreOportunidade: null,
      resumoDossie: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setVisibleCount(PAGE_SIZE);
    resetChatSession();
    setRemoteSaveStatus('idle');
    setExportStatus('idle');
    setPdfReportContent(null);
    setInvestigationLogged(false);
    lastActionRef.current = null;
    setLastQuery('');
    setLoadingStatus('Iniciando análise');
  }, [isLoading]);

  const handleSelectSession = async (sessionId: string) => {
    if (isLoading && abortControllerRef.current) abortControllerRef.current.abort();
    setCurrentSessionId(sessionId);
    setVisibleCount(PAGE_SIZE);
    resetChatSession();
    setRemoteSaveStatus('idle');
    setExportStatus('idle');
    setPdfReportContent(null);
    setInvestigationLogged(false);
    lastActionRef.current = null;
    setLoadingStatus('Iniciando análise');
    const targetSession = sessions.find(s => s.id === sessionId);
    if (targetSession && targetSession.messages.length === 0) {
      setIsLoadingSession(true);
      try {
        const fullSession = await getRemoteSession(sessionId);
        if (fullSession) updateSessionById(sessionId, () => fullSession);
      } catch (e) {
        console.error('Lazy load error', e);
      } finally {
        setIsLoadingSession(false);
      }
    }
  };

  useEffect(() => {
    const savedSessions = localStorage.getItem(SESSIONS_STORAGE_KEY);
    let localSessions: ChatSession[] = [];
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        localSessions = parsed.map((s: any) => ({
          ...s,
          messages: (s.messages || []).map((m: any) => ({
            ...m,
            text: stripInternalMarkers(m.text || ''),
            timestamp: new Date(m.timestamp),
          })),
        }));
      } catch (e) {
        console.error('Load error', e);
      }
    }
    if (localSessions.length > 0) {
      setSessions(localSessions);
      setCurrentSessionId(localSessions[0].id);
    } else {
      handleNewSession();
    }
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) setIsDarkMode(savedTheme === 'dark');
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    setIsInitialized(true);
  }, [handleNewSession]);

  useEffect(() => {
    if (!remoteSessions || remoteSessions.length === 0) return;
    setSessions(prev => {
      const sessionMap = new Map<string, ChatSession>();
      prev.forEach(s => sessionMap.set(s.id, s));
      remoteSessions.forEach(r => {
        const existing = sessionMap.get(r.id);
        if (existing) {
          sessionMap.set(r.id, {
            ...existing,
            ...r,
            messages: existing.messages.length > 0 ? existing.messages : [],
          });
        } else {
          sessionMap.set(r.id, r);
        }
      });
      return Array.from(sessionMap.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    });
  }, [remoteSessions]);

  useEffect(() => {
    sessionsRef.current = sessions;
    if (isInitialized) {
      try {
        localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
      } catch (e: any) {
        if (e?.name === 'QuotaExceededError' || e?.code === 22) {
          console.warn('[Storage] Quota exceeded — clearing oldest sessions');
          const trimmed = sessions.slice(0, Math.max(sessions.length - 5, 1));
          try {
            localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(trimmed));
          } catch {
            // ignore secondary quota failure on fallback write
          }
          toast.error('Armazenamento local cheio. Sessões antigas foram removidas.');
        }
      }
    }
  }, [sessions, isInitialized]);

  useEffect(() => {
    document.body.className = isDarkMode ? 'dark' : 'light';
    document.body.style.backgroundColor = isDarkMode ? '#020617' : '#f8fafc';
    document.body.style.color = isDarkMode ? '#e2e8f0' : '#0f172a';
    localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    resetChatSession();
    document.title = APP_NAME;
  }, [mode]);

  const handleDeleteSession = (sessionId: string) => {
    if (sessionId === currentSessionId && isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
    delete activeGenerationRef.current[sessionId];
    const newSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(newSessions);
    if (currentSessionId === sessionId) {
      resetChatSession();
      if (newSessions.length > 0) {
        const nextSession = newSessions[0];
        setCurrentSessionId(nextSession.id);
        if (nextSession.messages.length === 0) {
          setIsLoadingSession(true);
          getRemoteSession(nextSession.id)
            .then(fullSession => {
              if (fullSession) updateSessionById(nextSession.id, () => fullSession);
              setIsLoadingSession(false);
            })
            .catch(() => setIsLoadingSession(false));
        }
      } else {
        handleNewSession();
      }
    }
  };

  const handleSaveRemote = async () => {
    if (!currentSession || !isAuthenticated) return;
    setIsSavingRemote(true);
    setRemoteSaveStatus('idle');
    const snapshotSessionId = currentSession.id;
    const finalized: ChatSession = {
      ...currentSession,
      updatedAt: new Date().toISOString(),
    };
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
    resetChatSession();
    updateCurrentSession(session => ({
      ...session,
      messages: [],
      title: 'Nova Investigação',
      empresaAlvo: null,
      updatedAt: new Date().toISOString(),
    }));
    setInvestigationLogged(false);
    setLoadingStatus('Realizando pesquisa...');
    lastActionRef.current = null;
    setLastQuery('');
    setVisibleCount(PAGE_SIZE);
  };

  const processMessage = async (
    text: string,
    explicitSessionId?: string,
    explicitHistory?: Message[],
  ) => {
    const sessionId = explicitSessionId || currentSessionId;
    if (!sessionId) return;

    setIsLoading(true);
    setLoadingStatus('Realizando pesquisa...');
    setCompletedLoadingStatuses([]);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    lastActionRef.current = { type: 'sendMessage', payload: { text } };

    let historyToPass: Message[] = [];
    let hintedCompany: string | null = null;
    if (explicitHistory) {
      historyToPass = explicitHistory;
      const explicitSession = sessionsRef.current.find(s => s.id === sessionId);
      hintedCompany = explicitSession?.empresaAlvo || null;
    } else {
      const session = sessionsRef.current.find(s => s.id === sessionId);
      if (session) {
        hintedCompany = session.empresaAlvo || null;
        const msgs = session.messages;
        historyToPass =
          msgs.length > 0 && msgs[msgs.length - 1].text === text && msgs[msgs.length - 1].sender === Sender.User
            ? msgs.slice(0, -1)
            : msgs;
      }
    }
    setLastQuery(sanitizeLoadingContextText(text, hintedCompany || ''));

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
      const {
        text: responseText,
        sources,
        suggestions,
        scorePorta,
        ghostReason,
      } = await sendMessageToGemini(text, historyToPass, systemInstruction, {
        signal,
        onText: () => {},
        onStatus: newStatus => {
          setLoadingStatus(prev => {
            if (prev && prev !== newStatus) lastStatusRef.current = prev;
            return newStatus;
          });
          if (lastStatusRef.current && lastStatusRef.current !== newStatus) {
            const statusToAdd = lastStatusRef.current;
            setCompletedLoadingStatuses(completed =>
              statusToAdd && !completed.includes(statusToAdd) ? [...completed, statusToAdd] : completed,
            );
          }
        },
        nomeVendedor: typeof user?.displayName === 'string' ? user.displayName : 'Vendedor',
        sessionId,
        hintedCompany,
      });

      if (activeGenerationRef.current[sessionId] !== botMessageId) return;

      startTransition(() => {
        updateSessionById(sessionId, s => {
          const lastUserMessage = [...s.messages].reverse().find(msg => msg.sender === Sender.User)?.text || '';
          const resolvedCompany = sanitizeSessionCompanyName(s.empresaAlvo, lastUserMessage, text, s.title);

          return {
            ...s,
            title:
              s.messages.length <= 2 || s.title === 'Nova Investigação'
                ? resolvedCompany || s.title
                : s.title,
            empresaAlvo: resolvedCompany || s.empresaAlvo,
            messages: s.messages.map(msg =>
              msg.id === botMessageId
                ? {
                    ...msg,
                    text: responseText,
                    groundingSources: sources,
                    suggestions,
                    scorePorta: scorePorta || undefined,
                    isThinking: false,
                    ...(ghostReason && { ghostDetails: ghostReason }),
                  }
                : msg,
            ),
          };
        });
      });

      if (!investigationLogged && responseText.length > 500) {
        setInvestigationLogged(true);
        fetch(BACKEND_URL, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'logInvestigation',
            vendedor: user?.displayName || 'Anônimo',
            empresa: sanitizeSessionCompanyName(text, responseText, currentSession?.empresaAlvo) || cleanTitle(extractCompanyName(text)),
            modo: mode || '',
            resumo: responseText.substring(0, 200),
          }),
        }).catch(err => console.log('Log falhou:', err));
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        setSessions(prev =>
          prev.map(s =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.filter(msg => msg.id !== botMessageId || msg.text.trim().length > 0),
                }
              : s,
          ),
        );
        setIsLoading(false);
        abortControllerRef.current = null;
        return;
      }
      if (activeGenerationRef.current[sessionId] !== botMessageId) return;
      const appError = normalizeAppError(error);
      updateSessionById(sessionId, s => ({
        ...s,
        messages: [
          ...s.messages.filter(m => m.id !== botMessageId),
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

  const handleSendMessage = async (text: string, displayText?: string) => {
    let sessionId = currentSessionId;
    let currentHistory: Message[];
    if (!sessionId) {
      sessionId = uuidv4();
      const resolvedCompany = sanitizeSessionCompanyName(displayText || text, text);
      const immediateTitle = resolvedCompany || 'Nova Investigação';
      const newSession: ChatSession = {
        id: sessionId,
        title: immediateTitle,
        empresaAlvo: resolvedCompany,
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
      currentHistory = session ? [...session.messages] : [];
    }
    const userMessage: Message = {
      id: uuidv4(),
      sender: Sender.User,
      text: displayText || text,
      timestamp: new Date(),
    };
    setSessions(prev =>
      prev.map(s =>
        s.id === sessionId
          ? {
              ...s,
              messages: [...s.messages, userMessage],
              updatedAt: new Date().toISOString(),
            }
          : s,
      ),
    );
    setVisibleCount(prev => prev + 1);
    await processMessage(text, sessionId, currentHistory);
  };

  const handleDeepDive = async (
    displayMessage: string,
    hiddenPrompt: string,
    explicitCompanyName?: string,
  ) => {
    const resolvedCompany = sanitizeSessionCompanyName(
      explicitCompanyName,
      currentSession?.empresaAlvo,
      currentSession?.title,
      displayMessage,
      hiddenPrompt,
    );

    let finalPrompt = hiddenPrompt;
    if (resolvedCompany) {
      finalPrompt = hiddenPrompt.replace(/\[NOME DA EMPRESA\]/g, resolvedCompany);
    }

    const empresaContext = resolvedCompany || 'a empresa desta conversa';
    await handleSendMessage(
      `Dossiê completo de [${empresaContext}]. Protocolo de investigação forense especializada:\n\n${finalPrompt}`,
      displayMessage,
    );
  };

  const handleDeleteMessage = (id: string) => {
    if (!currentSessionId) return;
    updateSessionById(currentSessionId, session => {
      const msgIndex = session.messages.findIndex(m => m.id === id);
      if (msgIndex === -1) return session;

      const truncatedMessages = session.messages.slice(0, msgIndex);

      return {
        ...session,
        messages: truncatedMessages,
      };
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
            return { ...session, messages: messages.slice(0, -1) };
          }
          return session;
        });
      }
      processMessage(lastActionRef.current.payload.text, currentSessionId || undefined);
    } else if (lastActionRef.current.type === 'regenerateSuggestions') {
      handleRegenerateSuggestions(lastActionRef.current.payload.messageId);
    }
  };

  const handleRegenerateSuggestions = async (messageId: string) => {
    const sessionId = currentSessionId;
    if (!sessionId) return;
    lastActionRef.current = {
      type: 'regenerateSuggestions',
      payload: { messageId },
    };
    const targetSession = sessions.find(s => s.id === sessionId);
    if (!targetSession) return;
    const targetMessage = targetSession.messages.find(m => m.id === messageId);
    if (!targetMessage) return;
    const companyName =
      targetSession.empresaAlvo ||
      extractCompanyName(targetSession.title || '') ||
      'Empresa não identificada';
    let lastUserQuestion = '';
    const msgs = targetSession.messages;
    const idx = msgs.findIndex(m => m.id === messageId);
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].sender === Sender.User) {
        lastUserQuestion = msgs[i].text;
        break;
      }
    }
    const snippet = (targetMessage.text || '').slice(0, 3000);
    const contextText = [
      `EMPRESA: ${companyName}`,
      lastUserQuestion ? `PERGUNTA_ANTERIOR: ${lastUserQuestion}` : '',
      'TRECHO_DOSSIE:',
      snippet,
    ]
      .filter(Boolean)
      .join('\n\n');
    const oldSuggestions = targetMessage.suggestions || [];
    updateSessionById(sessionId, session => ({
      ...session,
      messages: session.messages.map(msg =>
        msg.id === messageId ? { ...msg, isRegeneratingSuggestions: true } : msg,
      ),
    }));
    try {
      const newSuggestions = await generateNewSuggestions(targetSession.messages, companyName, user?.displayName || 'Vendedor');
      updateSessionById(sessionId, session => ({
        ...session,
        messages: session.messages.map(msg =>
          msg.id === messageId
            ? {
                ...msg,
                suggestions: newSuggestions,
                isRegeneratingSuggestions: false,
              }
            : msg,
        ),
      }));
    } catch (e: any) {
      console.warn('Suggestion regeneration failed', e);
      toast.error(e.message || 'Falha na conexão com a IA.');
      updateSessionById(sessionId, session => ({
        ...session,
        messages: session.messages.map(msg =>
          msg.id === messageId ? { ...msg, isRegeneratingSuggestions: false } : msg,
        ),
      }));
    }
  };

  const handleReportError = async (messageId: string, error: AppError) => {
    if (!currentSession) return;
    const errorPayload = JSON.stringify(
      {
        code: error.code,
        source: error.source,
        message: error.message,
        details: error.details,
      },
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
      messages: session.messages.map(m =>
        m.id === messageId ? { ...m, feedback: m.feedback === feedback ? undefined : feedback } : m,
      ),
    }));
  };

  const handleSendFeedback = async (
    messageId: string,
    feedback: Feedback,
    comment: string,
    content: string,
  ) => {
    if (!currentSession) return;
    const snapshotSessionId = currentSession.id;
    updateSessionById(snapshotSessionId, session => ({
      ...session,
      messages: session.messages.map(m => (m.id === messageId ? { ...m, feedback } : m)),
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

  const handleSectionFeedback = (
    messageId: string,
    sectionTitle: string,
    feedback: Feedback,
  ) => {
    updateCurrentSession(session => ({
      ...session,
      messages: session.messages.map(msg => {
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
      messages: session.messages.map(msg =>
        msg.id === messageId ? { ...msg, isSourcesOpen: !msg.isSourcesOpen } : msg,
      ),
    }));
  };

  return {
    sessions,
    currentSessionId,
    currentSession: sessions.find(s => s.id === currentSessionId) || null,
    allMessages: sessions.find(s => s.id === currentSessionId)?.messages || [],
    isLoading,
    isLoadingSession,
    loadingStatus,
    completedLoadingStatuses,
    lastQuery,
    isSavingRemote,
    remoteSaveStatus,
    isInitialized,
    visibleCount,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
    handleSaveRemote,
    handleClearChat,
    handleSendMessage,
    processMessage,
    handleDeepDive,
    handleDeleteMessage,
    handleStopGeneration,
    handleRetry,
    handleRegenerateSuggestions,
    handleReportError,
    handleFeedback,
    handleSendFeedback,
    handleSectionFeedback,
    handleToggleMessageSources,
    setVisibleCount,
    setSessions,
    updateCurrentSession,
    isDarkMode,
    setIsDarkMode,
    isSidebarOpen,
    setIsSidebarOpen,
    exportStatus,
    pdfReportContent,
    investigationLogged,
    setInvestigationLogged
  };
};
