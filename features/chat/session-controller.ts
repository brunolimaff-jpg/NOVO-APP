import { useCallback, useState, type MutableRefObject } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_MODE } from '../../constants';
import { useMaybeOperator } from '../../contexts/OperatorContext';
import { getRemoteSession, saveRemoteSession } from '../../services/sessionRemoteStore';
import { storage } from '../../services/storage';
import { requestCancellationForActiveDossierRun } from '../dossier/cancel-active-dossier-run';
import { trackOperatorEvent } from '../../services/operatorTracking';
import { useMaybeChatStore } from '../../stores/chatStore';
import { useMaybeDossierStore, type RemoteSaveStatus } from '../../stores/dossierStore';
import { isSessionReusable } from './session-reuse';
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
  const operator = useMaybeOperator();

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
  const setVisibleCount = requireDependency(options.setVisibleCount ?? chatStore?.setVisibleCount, 'setVisibleCount');
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
  const setLoadingPinnedLabel = chatStore?.setLoadingPinnedLabel;

  const resetSessionUI = useCallback(() => {
    setVisibleCount(PAGE_SIZE);
    setRemoteSaveStatus('idle');
    setExportStatus('idle');
    setPdfReportContent(null);
    setInvestigationLogged(false);
    lastActionRef.current = null;
    setLastQuery('');
    resetLoadingProgress('Iniciando análise');
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
    if (isLoading) {
      if (currentSessionId) void requestCancellationForActiveDossierRun(currentSessionId, 'new_session').catch(() => undefined);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsLoading(false);
      setCurrentSessionId(null);
      resetSessionUI();
      return;
    }

    // Idempotência: se currentSessionId já aponta para sessão vazia
    // recém-criada, reutiliza em vez de criar uuid novo.
    const currentSession = currentSessionId ? sessions.find(s => s.id === currentSessionId) : null;
    if (currentSession && isSessionReusable(currentSession)) {
      setCurrentSessionId(currentSession.id);
      resetSessionUI();
      return;
    }

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

    setSessions(prev => [newSession, ...(Array.isArray(prev) ? prev : [])]);
    setCurrentSessionId(newSession.id);
    resetSessionUI();
  }, [
    abortControllerRef,
    currentSessionId,
    isLoading,
    resetSessionUI,
    sessions,
    setCurrentSessionId,
    setIsLoading,
    setSessions,
  ]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (isLoading) {
        if (currentSessionId) void requestCancellationForActiveDossierRun(currentSessionId, 'session_switch').catch(() => undefined);
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setIsLoading(false);
        setLoadingPinnedLabel?.(null);
      }

      setCurrentSessionId(sessionId);
      resetSessionUI();
      const targetSession = sessions.find(session => session.id === sessionId);

      if (operator?.operatorId) {
        trackOperatorEvent('dossier_opened', {
          operatorId: operator.operatorId,
          email: operator.email,
          entityType: 'session',
          entityId: sessionId,
          companyCnpj: targetSession?.cnpj || undefined,
          companyName: targetSession?.empresaAlvo || undefined,
        });
      }

      if (targetSession && targetSession.messages.length === 0) {
        try {
          const fullSession = await getRemoteSession(sessionId);
          if (fullSession) updateSessionById(sessionId, () => fullSession);
        } catch (error) {
          console.error('Lazy load error', error);
        }
      } else if (!targetSession) {
        // Sessão não está em sessions[] — carrega do remoto e injeta
        try {
          const fullSession = await getRemoteSession(sessionId);
          if (fullSession) {
            setSessions(prev => [fullSession, ...prev]);
          }
        } catch (error) {
          console.error('Lazy load error (orphan session)', error);
        }
      }
    },
    [
      abortControllerRef,
      isLoading,
      resetSessionUI,
      sessions,
      setCurrentSessionId,
      setIsLoading,
      setLoadingPinnedLabel,
      setSessions,
      updateSessionById,
    ],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      void requestCancellationForActiveDossierRun(sessionId, 'session_delete').catch(() => undefined);
      if (sessionId === currentSessionId && isLoading && abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsLoading(false);
      }

      // Delete from Supabase (fire-and-forget)
      storage.deleteDossier(sessionId).catch(() => {});
      delete activeGenerationRef.current[sessionId];
      setSessions(prev => prev.filter(s => s.id !== sessionId));

      if (currentSessionId === sessionId) {
        const remaining = (chatStore?.sessionsRef?.current ?? sessions).filter(s => s.id !== sessionId);
        if (remaining.length > 0) {
          const nextSession = remaining[0];
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
