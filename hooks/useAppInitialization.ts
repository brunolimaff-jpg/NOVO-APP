import { useEffect } from 'react';
import { ChatSession } from '../types';
import { listRemoteSessions } from '../services/sessionRemoteStore';
import { LOOKUP_URL } from '../services/apiConfig';

interface UseAppInitializationOptions {
  loadSessions: () => Promise<ChatSession[]>;
  setSessions: (updater: (prev: ChatSession[]) => ChatSession[]) => void;
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSidebarOpen: (open: boolean) => void;
  setIsInitialized: (initialized: boolean) => void;
  handleNewSession: () => void;
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
  handleNewSession,
}: UseAppInitializationOptions) {
  useEffect(() => {
    let cancelled = false;

    // WARM-UP: acorda o Apps Script do lookup silenciosamente.
    // Não aguarda resposta nem trata erros — o objetivo é apenas tirar o serviço do cold start
    // antes do vendedor digitar a primeira empresa.
    fetch(`${LOOKUP_URL}?q=warmup`, { method: 'GET', redirect: 'follow' }).catch(() => {});

    const init = async () => {
      const localSessions = await loadSessions();
      if (cancelled) return;

      // Phase 1: make the app interactive with local data immediately
      if (localSessions.length > 0) {
        setSessions(() => localSessions);
        setCurrentSessionId(localSessions[0].id);
      } else {
        handleNewSession();
      }
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      setIsInitialized(true);

      // Phase 2: background sync — merge remote without blocking or disrupting
      listRemoteSessions()
        .then(remoteList => {
          if (cancelled) return;
          setSessions(current => {
            const sessionMap = new Map<string, ChatSession>();
            current.forEach(s => sessionMap.set(s.id, s));
            remoteList.forEach(r => {
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
          // Only update selected session if user hasn't started interacting
          setCurrentSessionId(prev => {
            if (prev) return prev;
            return null;
          });
        })
        .catch(() => { /* remote sync is best-effort */ });
    };

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
