import { useCallback, MutableRefObject } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession } from '../types';
import { getRemoteSession } from '../services/sessionRemoteStore';

const PAGE_SIZE = 20;

interface UseSessionManagerOptions {
  sessions: ChatSession[];
  setSessions: (updater: ((prev: ChatSession[]) => ChatSession[]) | ChatSession[]) => void;
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
  isLoading: boolean;
  abortControllerRef: MutableRefObject<AbortController | null>;
  activeGenerationRef: MutableRefObject<Record<string, string>>;
  updateSessionById: (id: string, updater: (s: ChatSession) => ChatSession) => void;
  setVisibleCount: (count: number) => void;
  setRemoteSaveStatus: (status: 'idle' | 'success' | 'error') => void;
  setExportStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void;
  setPdfReportContent: (content: string | null) => void;
  setInvestigationLogged: (logged: boolean) => void;
  lastActionRef: MutableRefObject<unknown>;
  setLastQuery: (query: string) => void;
  setLoadingStatus: (status: string) => void;
  setIsLoading: (loading: boolean) => void;
}

/**
 * Manages session lifecycle: create, select, delete.
 * Extracted from App.tsx to reduce its complexity.
 */
export function useSessionManager({
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
  setLoadingStatus,
  setIsLoading,
}: UseSessionManagerOptions) {
  const resetSessionUI = useCallback(() => {
    setVisibleCount(PAGE_SIZE);
    setRemoteSaveStatus('idle');
    setExportStatus('idle');
    setPdfReportContent(null);
    setInvestigationLogged(false);
    lastActionRef.current = null;
    setLastQuery('');
    setLoadingStatus('Iniciando análise');
  }, [
    setVisibleCount, setRemoteSaveStatus, setExportStatus,
    setPdfReportContent, setInvestigationLogged, lastActionRef,
    setLastQuery, setLoadingStatus,
  ]);

  const handleNewSession = useCallback(() => {
    if (isLoading && abortControllerRef.current) abortControllerRef.current.abort();
    const newSession: ChatSession = {
      id: uuidv4(),
      title: 'Nova Investigação',
      empresaAlvo: null,
      cnpj: null,
      modoPrincipal: null,
      scoreOportunidade: null,
      resumoDossie: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    setSessions(prev => [newSession, ...(Array.isArray(prev) ? prev : [])]);
    setCurrentSessionId(newSession.id);
    resetSessionUI();
  }, [isLoading, abortControllerRef, setSessions, setCurrentSessionId, resetSessionUI]);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    if (isLoading && abortControllerRef.current) abortControllerRef.current.abort();
    setCurrentSessionId(sessionId);
    resetSessionUI();
    const targetSession = sessions.find(s => s.id === sessionId);
    if (targetSession && targetSession.messages.length === 0) {
      try {
        const fullSession = await getRemoteSession(sessionId);
        if (fullSession) updateSessionById(sessionId, () => fullSession);
      } catch (e) {
        console.error('Lazy load error', e);
      }
    }
  }, [isLoading, abortControllerRef, setCurrentSessionId, resetSessionUI, sessions, updateSessionById]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    if (sessionId === currentSessionId && isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
    delete activeGenerationRef.current[sessionId];
    const newSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(newSessions);
    if (currentSessionId === sessionId) {
      if (newSessions.length > 0) {
        const nextSession = newSessions[0];
        setCurrentSessionId(nextSession.id);
        if (nextSession.messages.length === 0) {
          getRemoteSession(nextSession.id)
            .then(fullSession => {
              if (fullSession) updateSessionById(nextSession.id, () => fullSession);
            })
            .catch(() => {});
        }
      } else {
        handleNewSession();
      }
    }
  }, [
    currentSessionId, isLoading, abortControllerRef, setIsLoading,
    activeGenerationRef, sessions, setSessions, setCurrentSessionId,
    updateSessionById, handleNewSession,
  ]);

  return { handleNewSession, handleSelectSession, handleDeleteSession };
}
