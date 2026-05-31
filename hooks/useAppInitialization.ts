import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { ChatSession } from '../types';
import { LOOKUP_URL } from '../services/apiConfig';
import { scoutDiag } from '../utils/diagnosticLog';

interface UseAppInitializationOptions {
  loadSessions: () => Promise<ChatSession[]>;
  setSessions: (updater: (prev: ChatSession[]) => ChatSession[]) => void;
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>;
  setIsSidebarOpen: (open: boolean) => void;
  setIsInitialized: (initialized: boolean) => void;
}

/**
 * Handles app initialization in two phases:
 * 1. (Blocking) Load local sessions immediately so the UI is interactive.
 * 2. (Background) Merge remote sessions without disrupting the current session.
 *
 * Warm-up: dispara um ping silencioso ao Apps Script do lookup logo no boot
 * para evitar cold start quando o vendedor fizer a primeira consulta.
 */
export function useAppInitialization({
  loadSessions,
  setSessions,
  setCurrentSessionId,
  setIsSidebarOpen,
  setIsInitialized,
}: UseAppInitializationOptions) {
  useEffect(() => {
    let cancelled = false;

    // WARM-UP: acorda o Apps Script do lookup silenciosamente.
    // Não aguarda resposta nem trata erros — o objetivo é apenas tirar o serviço do cold start
    // antes do vendedor digitar a primeira empresa.
    fetch(`${LOOKUP_URL}?q=warmup`, { method: 'GET', redirect: 'follow' }).catch(() => {
      scoutDiag.warn('AppInit', 'Warmup do lookup falhou (best-effort)');
    });

    const init = async () => {
      const localSessions = await loadSessions();
      if (cancelled) return;

      // Phase 1: make the app interactive with local data immediately
      if (localSessions.length > 0) {
        setSessions(() => localSessions);
        setCurrentSessionId(localSessions[0].id);
      }
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      setIsInitialized(true);
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);
}
