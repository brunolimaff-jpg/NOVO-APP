import { useCallback, useState, type MutableRefObject } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_MODE } from '../../constants';
import { useMaybeOperator } from '../../contexts/OperatorContext';
import { getRemoteSession, saveRemoteSession } from '../../services/sessionRemoteStore';
import { useMaybeChatStore } from '../../stores/chatStore';
import { useMaybeDossierStore, type RemoteSaveStatus } from '../../stores/dossierStore';
import type { ChatSession } from '../../types';

const PAGE_SIZE = 20;
const REMOTE_SAVE_SUCCESS_RESET_MS = 3000;

function requireDependency<T>(value: T | null | undefined, dependencyName: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${dependencyName} is required for session-controller`);
  }

  return value;
}

export interface UseSessionManagerOptions {
  sessions: ChatSession[];
  setSessions: (updater: ((prev: ChatSession[]) => ChatSession[]) | ChatSession[]) => void;
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
  isLoading: boolean;
  abortControllerRef: MutableRefObject<AbortController | null>;
  activeGenerationRef: MutableRefObject<Record<string, string>>;
  updateSessionById: (id: string, updater: (session: ChatSession) => ChatSession) => void;
  setVisibleCount: (count: number | ((prev: number) => number)) => void;
  setRemoteSaveStatus: (status: RemoteSaveStatus) => void;
  setExportStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void;
  setPdfReportContent: (content: string | null) => void;
  setInvestigationLogged: (logged: boolean) => void;
  lastActionRef: MutableRefObject<unknown>;
  setLastQuery: (query: string) => void;
  resetLoadingProgress: (stage?: string) => void;
  setIsLoading: (loading: boolean) => void;
}

export interface UseSessionRemoteSaveOptions {
  currentSession?: ChatSession | null;
  operatorId?: string;
  operatorName?: string;
  updateSessionById?: (id: string, updater: (session: ChatSession) => ChatSession) => void;
}

export function useSessionRemoteSave(options: UseSessionRemoteSaveOptions = {}) {
  const chatStore = useMaybeChatStore();
  const dossierStore = useMaybeDossierStore();
  const operator = useMaybeOperator();
  const [localIsSavingRemote, setLocalIsSavingRemote] = useState(false);
  const [localRemoteSaveStatus, setLocalRemoteSaveStatus] = useState<RemoteSaveStatus>('idle');

  const currentSession = options.currentSession ?? chatStore?.currentSession ?? null;
  const operatorId = options.operatorId ?? operator?.operatorId;
  const operatorName = options.operatorName ?? operator?.name;
  const updateSessionById = options.updateSessionById ?? chatStore?.updateSessionById;
  const isSavingRemote = dossierStore?.isSavingRemote ?? localIsSavingRemote;
  const setIsSavingRemote = dossierStore?.setIsSavingRemote ?? setLocalIsSavingRemote;
  const remoteSaveStatus = dossierStore?.remoteSaveStatus ?? localRemoteSaveStatus;
  const setRemoteSaveStatus = dossierStore?.setRemoteSaveStatus ?? setLocalRemoteSaveStatus;

  const handleSaveRemote = useCallback(async () => {
    if (!currentSession || !updateSessionById) return;

    setIsSavingRemote(true);
    setRemoteSaveStatus('idle');

    const snapshotSessionId = currentSession.id;
    const finalized: ChatSession = { ...currentSession, updatedAt: new Date().toISOString() };
    updateSessionById(snapshotSessionId, () => finalized);

    try {
      await saveRemoteSession(finalized, operatorId, operatorName);
      setRemoteSaveStatus('success');
      setTimeout(() => setRemoteSaveStatus('idle'), REMOTE_SAVE_SUCCESS_RESET_MS);
    } catch (error) {
      console.error('Remote session save failed', error);
      setRemoteSaveStatus('error');
    } finally {
      setIsSavingRemote(false);
    }
  }, [currentSession, operatorId, operatorName, setIsSavingRemote, setRemoteSaveStatus, updateSessionById]);

  return {
    isSavingRemote,
    remoteSaveStatus,
    setRemoteSaveStatus,
    handleSaveRemote,
  };
}

/**
 * Manages session lifecycle: create, select, delete.
 * Extracted from App.tsx to reduce its complexity.
 */
export function useSessionManager(options: Partial<UseSessionManagerOptions> = {}) {
  const chatStore = useMaybeChatStore();
  const dossierStore = useMaybeDossierStore();

  const sessions = options.sessions ?? chatStore?.sessions ?? [];
  const setSessions = requireDependency(options.setSessions ?? chatStore?.setSessions, 'setSessions');
  const currentSessionId = options.currentSessionId ?? chatStore?.currentSessionId ?? null;
  const setCurrentSessionId = requireDependency(
    options.setCurrentSessionId ?? chatStore?.setCurrentSessionId,
    'setCurrentSessionId',
  );
  const isLoading = options.isLoading ?? chatStore?.isLoading ?? false;
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
  const setVisibleCount = requireDependency(
    options.setVisibleCount ?? chatStore?.setVisibleCount,
    'setVisibleCount',
  );
  const setRemoteSaveStatus = requireDependency(
    options.setRemoteSaveStatus ?? dossierStore?.setRemoteSaveStatus,
    'setRemoteSaveStatus',
  );
  const setExportStatus = requireDependency(
    options.setExportStatus ?? dossierStore?.setExportStatus,
    'setExportStatus',
  );
  const setPdfReportContent = requireDependency(
    options.setPdfReportContent ?? dossierStore?.setPdfReportContent,
    'setPdfReportContent',
  );
  const setInvestigationLogged = requireDependency(
    options.setInvestigationLogged ?? chatStore?.setInvestigationLogged,
    'setInvestigationLogged',
  );
  const lastActionRef = requireDependency(options.lastActionRef ?? chatStore?.lastActionRef, 'lastActionRef');
  const setLastQuery = requireDependency(options.setLastQuery ?? chatStore?.setLastQuery, 'setLastQuery');
  const resetLoadingProgress = requireDependency(
    options.resetLoadingProgress ?? chatStore?.resetLoadingProgress,
    'resetLoadingProgress',
  );
  const setIsLoading = requireDependency(options.setIsLoading ?? chatStore?.setIsLoading, 'setIsLoading');

  const resetSessionUI = useCallback(() => {
    setVisibleCount(PAGE_SIZE);
    setRemoteSaveStatus('idle');
    setExportStatus('idle');
    setPdfReportContent(null);
    setInvestigationLogged(false);
    lastActionRef.current = null;
    setLastQuery('');
    resetLoadingProgress('Iniciando an\u00e1lise');
  }, [
    lastActionRef,
    resetLoadingProgress,
    setExportStatus,
    setInvestigationLogged,
    setLastQuery,
    setPdfReportContent,
    setRemoteSaveStatus,
    setVisibleCount,
  ]);

  const handleNewSession = useCallback(() => {
    if (isLoading && abortControllerRef.current) abortControllerRef.current.abort();

    const newSession: ChatSession = {
      id: uuidv4(),
      title: 'Nova Investiga\u00e7\u00e3o',
      empresaAlvo: null,
      cnpj: null,
      modoPrincipal: DEFAULT_MODE,
      scoreOportunidade: null,
      resumoDossie: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    setSessions(prev => [newSession, ...(Array.isArray(prev) ? prev : [])]);
    setCurrentSessionId(newSession.id);
    resetSessionUI();
  }, [abortControllerRef, isLoading, resetSessionUI, setCurrentSessionId, setSessions]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (isLoading && abortControllerRef.current) abortControllerRef.current.abort();

      setCurrentSessionId(sessionId);
      resetSessionUI();
      const targetSession = sessions.find(session => session.id === sessionId);

      if (targetSession && targetSession.messages.length === 0) {
        try {
          const fullSession = await getRemoteSession(sessionId);
          if (fullSession) updateSessionById(sessionId, () => fullSession);
        } catch (error) {
          console.error('Lazy load error', error);
        }
      }
    },
    [abortControllerRef, isLoading, resetSessionUI, sessions, setCurrentSessionId, updateSessionById],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      if (sessionId === currentSessionId && isLoading && abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsLoading(false);
      }

      delete activeGenerationRef.current[sessionId];
      const newSessions = sessions.filter(session => session.id !== sessionId);
      setSessions(newSessions);

      if (currentSessionId === sessionId) {
        if (newSessions.length > 0) {
          const nextSession = newSessions[0];
          setCurrentSessionId(nextSession.id);
          resetSessionUI();

          if (nextSession.messages.length === 0) {
            getRemoteSession(nextSession.id)
              .then(fullSession => {
                if (fullSession) updateSessionById(nextSession.id, () => fullSession);
              })
              .catch(error => {
                console.error('Lazy load error during session deletion', error);
              });
          }
        } else {
          handleNewSession();
        }
      }
    },
    [
      abortControllerRef,
      activeGenerationRef,
      currentSessionId,
      handleNewSession,
      isLoading,
      resetSessionUI,
      sessions,
      setCurrentSessionId,
      setIsLoading,
      setSessions,
      updateSessionById,
    ],
  );

  return { handleNewSession, handleSelectSession, handleDeleteSession };
}
