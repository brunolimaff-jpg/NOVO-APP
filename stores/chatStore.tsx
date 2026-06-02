import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useChatLoadingProgress } from '../features/chat/loading-progress';
import { useSessionStorage } from '../hooks/useSessionStorage';
import type { ChatSession } from '../types';
import type { LastAction } from '../types';

const PAGE_SIZE = 20;

interface ChatStoreViewState {
  currentSessionId: string | null;
  visibleCount: number;
  lastQuery: string;
  investigationLogged: boolean;
}

type ChatStoreViewAction =
  | { type: 'set_current_session_id'; payload: SetStateAction<string | null> }
  | { type: 'set_visible_count'; payload: SetStateAction<number> }
  | { type: 'set_last_query'; payload: SetStateAction<string> }
  | { type: 'set_investigation_logged'; payload: SetStateAction<boolean> };

export interface ChatStoreValue {
  sessions: ChatSession[];
  setSessions: Dispatch<SetStateAction<ChatSession[]>>;
  sessionsRef: MutableRefObject<ChatSession[]>;
  isInitialized: boolean;
  setIsInitialized: Dispatch<SetStateAction<boolean>>;
  loadSessions: () => Promise<ChatSession[]>;
  currentSessionId: string | null;
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>;
  currentSession: ChatSession | null;
  allMessages: ChatSession['messages'];
  visibleCount: number;
  setVisibleCount: Dispatch<SetStateAction<number>>;
  lastQuery: string;
  setLastQuery: Dispatch<SetStateAction<string>>;
  investigationLogged: boolean;
  setInvestigationLogged: Dispatch<SetStateAction<boolean>>;
  updateSessionById: (sessionId: string, updater: (session: ChatSession) => ChatSession) => ChatSession | null;
  updateCurrentSession: (updater: (session: ChatSession) => ChatSession) => void;
  lastActionRef: MutableRefObject<LastAction | null>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  activeGenerationRef: MutableRefObject<Record<string, string>>;
  isLoading: boolean;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  loadingStatus: string;
  failureCount: number;
  setFailureCount: Dispatch<SetStateAction<number>>;
  completedLoadingStatuses: string[];
  loadingTotalStages?: number;
  loadingIsIncremental: boolean;
  requestKind: ReturnType<typeof useChatLoadingProgress>['requestKind'];
  setRequestKind: ReturnType<typeof useChatLoadingProgress>['setRequestKind'];
  loadingVariant: ReturnType<typeof useChatLoadingProgress>['loadingVariant'];
  setLoadingVariant: ReturnType<typeof useChatLoadingProgress>['setLoadingVariant'];
  loadingPinnedLabel: string | null;
  setLoadingPinnedLabel: Dispatch<SetStateAction<string | null>>;
  resetLoadingProgress: ReturnType<typeof useChatLoadingProgress>['resetLoadingProgress'];
  advanceLoadingProgress: ReturnType<typeof useChatLoadingProgress>['advanceLoadingProgress'];
  replaceLoadingProgressStage: ReturnType<typeof useChatLoadingProgress>['replaceLoadingProgressStage'];
  completeLoadingProgress: ReturnType<typeof useChatLoadingProgress>['completeLoadingProgress'];
}

const ChatStoreContext = createContext<ChatStoreValue | null>(null);

function chatStoreViewReducer(state: ChatStoreViewState, action: ChatStoreViewAction): ChatStoreViewState {
  switch (action.type) {
    case 'set_current_session_id':
      return { ...state, currentSessionId: applyStateUpdate(state.currentSessionId, action.payload) };
    case 'set_visible_count':
      return { ...state, visibleCount: applyStateUpdate(state.visibleCount, action.payload) };
    case 'set_last_query':
      return { ...state, lastQuery: applyStateUpdate(state.lastQuery, action.payload) };
    case 'set_investigation_logged':
      return { ...state, investigationLogged: applyStateUpdate(state.investigationLogged, action.payload) };
    default:
      return state;
  }
}

function applyStateUpdate<T>(current: T, next: SetStateAction<T>): T {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const { sessions, setSessions, sessionsRef, isInitialized, setIsInitialized, loadSessions } = useSessionStorage();
  const loading = useChatLoadingProgress();
  const [viewState, dispatch] = useReducer(chatStoreViewReducer, {
    currentSessionId: null,
    visibleCount: PAGE_SIZE,
    lastQuery: '',
    investigationLogged: false,
  });

  const lastActionRef = useRef<LastAction | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeGenerationRef = useRef<Record<string, string>>({});

  const setCurrentSessionId = useCallback<Dispatch<SetStateAction<string | null>>>(next => {
    dispatch({ type: 'set_current_session_id', payload: next });
  }, []);

  const setVisibleCount = useCallback<Dispatch<SetStateAction<number>>>(next => {
    dispatch({ type: 'set_visible_count', payload: next });
  }, []);

  const setLastQuery = useCallback<Dispatch<SetStateAction<string>>>(next => {
    dispatch({ type: 'set_last_query', payload: next });
  }, []);

  const setInvestigationLogged = useCallback<Dispatch<SetStateAction<boolean>>>(next => {
    dispatch({ type: 'set_investigation_logged', payload: next });
  }, []);

  const updateSessionById = useCallback(
    (sessionId: string, updater: (session: ChatSession) => ChatSession) => {
      let updatedSession: ChatSession | null = null;
      const source = sessionsRef.current.some(session => session.id === sessionId) ? sessionsRef.current : sessions;
      const nextSessions = source.map(session => {
        if (session.id !== sessionId) return session;
        const nextSession = { ...updater(session), updatedAt: new Date().toISOString() };
        updatedSession = nextSession;
        return nextSession;
      });

      if (!updatedSession) return null;

      sessionsRef.current = nextSessions;
      setSessions(nextSessions);
      return updatedSession;
    },
    [sessions, sessionsRef, setSessions],
  );

  const updateCurrentSession = useCallback(
    (updater: (session: ChatSession) => ChatSession) => {
      if (!viewState.currentSessionId) return;
      updateSessionById(viewState.currentSessionId, updater);
    },
    [updateSessionById, viewState.currentSessionId],
  );

  const currentSession = useMemo(
    () => sessions.find(session => session.id === viewState.currentSessionId) || null,
    [sessions, viewState.currentSessionId],
  );

  // ── Instrumentação: detecta esvaziamento de mensagens ──
  useEffect(() => {
    const msgCount = currentSession?.messages?.length ?? 0;
    const sessionId = viewState.currentSessionId;
    const title = currentSession?.title ?? null;
    const hasDossier = Boolean(currentSession?.resumoDossie);

    if (msgCount === 0 && sessionId) {
      console.warn(
        '[Scout360][chatStore] currentSession.messages VAZIO',
        JSON.stringify({ sessionId, title, hasDossier, sessionsCount: sessions.length }),
      );
    }
  }, [
    currentSession?.messages?.length,
    currentSession?.resumoDossie,
    viewState.currentSessionId,
    sessions.length,
    currentSession?.title,
  ]);

  // ── Instrumentação: detecta currentSession null com geração ativa ──
  useEffect(() => {
    const hasActiveGeneration = Object.values(activeGenerationRef.current).some(Boolean);
    if (!currentSession && hasActiveGeneration && viewState.currentSessionId) {
      console.error(
        '[Scout360][chatStore] ⚠ currentSession null com geração ativa',
        JSON.stringify({
          expectedSessionId: viewState.currentSessionId,
          sessionsCount: sessions.length,
          sessionIds: sessions.map(s => s.id),
          activeGenerationKeys: Object.keys(activeGenerationRef.current).filter(k => activeGenerationRef.current[k]),
        }),
      );
    }
  }, [currentSession, sessions.length, viewState.currentSessionId]);

  const prevMsgCountRef = useRef(currentSession?.messages?.length ?? 0);
  useEffect(() => {
    const current = currentSession?.messages?.length ?? 0;
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = current;

    if (prev > 0 && current === 0 && viewState.currentSessionId) {
      console.error(
        '[Scout360][chatStore] ⚠ MENSAGENS DESAPARECERAM',
        JSON.stringify({
          sessionId: viewState.currentSessionId,
          before: prev,
          after: current,
          stack: new Error().stack?.split('\n').slice(1, 4).join(' <- '),
        }),
      );
    }
  }, [currentSession?.messages?.length, viewState.currentSessionId]);

  const value = useMemo<ChatStoreValue>(
    () => ({
      sessions,
      setSessions,
      sessionsRef,
      isInitialized,
      setIsInitialized,
      loadSessions,
      currentSessionId: viewState.currentSessionId,
      setCurrentSessionId,
      currentSession,
      allMessages: Array.isArray(currentSession?.messages) ? currentSession.messages : [],
      visibleCount: viewState.visibleCount,
      setVisibleCount,
      lastQuery: viewState.lastQuery,
      setLastQuery,
      investigationLogged: viewState.investigationLogged,
      setInvestigationLogged,
      updateSessionById,
      updateCurrentSession,
      lastActionRef,
      abortControllerRef,
      activeGenerationRef,
      isLoading: loading.isLoading,
      setIsLoading: loading.setIsLoading,
      loadingStatus: loading.loadingStatus,
      failureCount: loading.failureCount,
      setFailureCount: loading.setFailureCount,
      completedLoadingStatuses: loading.completedLoadingStatuses,
      loadingTotalStages: loading.loadingTotalStages,
      loadingIsIncremental: loading.loadingIsIncremental,
      requestKind: loading.requestKind,
      setRequestKind: loading.setRequestKind,
      loadingVariant: loading.loadingVariant,
      setLoadingVariant: loading.setLoadingVariant,
      loadingPinnedLabel: loading.loadingPinnedLabel,
      setLoadingPinnedLabel: loading.setLoadingPinnedLabel,
      resetLoadingProgress: loading.resetLoadingProgress,
      advanceLoadingProgress: loading.advanceLoadingProgress,
      replaceLoadingProgressStage: loading.replaceLoadingProgressStage,
      completeLoadingProgress: loading.completeLoadingProgress,
    }),
    [
      currentSession,
      isInitialized,
      loadSessions,
      loading,
      sessions,
      sessionsRef,
      setCurrentSessionId,
      setInvestigationLogged,
      setIsInitialized,
      setLastQuery,
      setSessions,
      setVisibleCount,
      updateCurrentSession,
      updateSessionById,
      viewState.currentSessionId,
      viewState.investigationLogged,
      viewState.lastQuery,
      viewState.visibleCount,
    ],
  );

  return <ChatStoreContext.Provider value={value}>{children}</ChatStoreContext.Provider>;
}

export function useChatStore() {
  const context = useContext(ChatStoreContext);
  if (!context) {
    throw new Error('useChatStore must be used within a ChatStoreProvider');
  }

  return context;
}

export function useMaybeChatStore() {
  return useContext(ChatStoreContext);
}
