import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { storage } from '../services/storage';
import { ChatSession } from '../types';
import { stripInternalMarkers } from '../utils/textCleaners';
import { runIdbToSupabaseMigration } from '../lib/migration/idbToSupabase';

const SESSIONS_LEGACY_KEY = 'scout360_sessions_v1';

export function useSessionStorage() {
  const [sessions, setSessionsState] = useState<ChatSession[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const sessionsRef = useRef<ChatSession[]>([]);
  // Render-phase sync mantem o ref alinhado com o estado commitado,
  // eliminando o lag de 1 render que useEffect introduz.
  // Essencial para que o fallback do waterfall-orchestrator encontre
  // a sessao mesmo sob React 18 automatic batching.
  sessionsRef.current = sessions;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSessions = useCallback<Dispatch<SetStateAction<ChatSession[]>>>(next => {
    const resolved =
      typeof next === 'function'
        ? (next as (prev: ChatSession[]) => ChatSession[])(sessionsRef.current)
        : next;

    sessionsRef.current = resolved;
    setSessionsState(resolved);
  }, []);

  const loadSessions = useCallback(async (): Promise<ChatSession[]> => {
    const sanitizeLoadedSessions = (loaded: ChatSession[]): ChatSession[] =>
      loaded.map(session => ({
        ...session,
        messages: (session.messages || []).map(message => ({
          ...message,
          text: stripInternalMarkers(String(message.text || '')),
          timestamp: new Date(message.timestamp),
        })),
      }));

    // Executa migração IDB → Supabase (1x, guarded by flag)
    try {
      await runIdbToSupabaseMigration({
        upsertFn: async session => {
          await storage.saveDossier(session);
        },
        getOperatorId: () => localStorage.getItem('scout360:operator_id'),
      });
    } catch {
      console.warn('[useSessionStorage] Migration IDB→Supabase failed, trying Supabase direct');
    }

    try {
      const supabaseSessions = await storage.getDossiers();
      if (supabaseSessions && supabaseSessions.length > 0) {
        return sanitizeLoadedSessions(supabaseSessions);
      }
    } catch {
      // Supabase unavailable, try localStorage fallback
    }

    try {
      const raw = localStorage.getItem(SESSIONS_LEGACY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const localSessions = parsed.map((s: Record<string, unknown>) => ({
          ...s,
          messages: ((s.messages as Array<Record<string, unknown>>) || []).map(m => ({
            ...m,
            text: stripInternalMarkers(String(m.text || '')),
            timestamp: new Date(m.timestamp as string),
          })),
        })) as ChatSession[];
        return sanitizeLoadedSessions(localSessions);
      }
    } catch (e) {
      console.error('Session load error', e);
    }

    return [];
  }, []);

  const persistSessions = useCallback(async (data: ChatSession[]) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        await storage.saveAllDossiers(data);
      } catch {
        try {
          localStorage.setItem(SESSIONS_LEGACY_KEY, JSON.stringify(data));
        } catch (e: unknown) {
          const storageErr = e as { name?: string; code?: number };
          if (storageErr?.name === 'QuotaExceededError' || storageErr?.code === 22) {
            console.warn('[Storage] Quota exceeded — trimming oldest sessions');
            const trimmed = data.slice(0, Math.max(data.length - 5, 1));
            localStorage.setItem(SESSIONS_LEGACY_KEY, JSON.stringify(trimmed));
          }
        }
      }
    }, 1000);
  }, []);

  useEffect(() => {
    if (isInitialized && sessions.length >= 0) {
      persistSessions(sessions);
    }
  }, [sessions, isInitialized, persistSessions]);

  // Initial load — finally garante setIsLoading(false) mesmo em erro
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadSessions();
        if (!cancelled) {
          setSessions(prev => {
            const loadedIds = new Set(loaded.map(s => s.id));
            const kept = prev.filter(s => !loadedIds.has(s.id));
            return [...loaded, ...kept];
          });
          setIsInitialized(true);
        }
      } catch (e) {
        console.error('[useSessionStorage] Initial load failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  // Cleanup debounce timer — flush pending write on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // Flush pending write: fire-and-forget save of current sessions
      const pendingSessions = sessionsRef.current;
      if (pendingSessions.length > 0) {
        storage.saveAllDossiers(pendingSessions).catch(() => {});
      }
    };
  }, []);

  // Reload sessions when operatorId changes
  useEffect(() => {
    const handler = () => {
      loadSessions()
        .then(loaded => {
          if (loaded.length > 0) {
            setSessions(prev => {
              const loadedIds = new Set(loaded.map(s => s.id));
              const kept = prev.filter(s => !loadedIds.has(s.id));
              return [...loaded, ...kept];
            });
          }
        })
        .catch(() => {});
    };

    window.addEventListener('operator-relinked', handler);
    return () => window.removeEventListener('operator-relinked', handler);
  }, [loadSessions]);

  return {
    sessions,
    setSessions,
    sessionsRef,
    isInitialized,
    setIsInitialized,
    loadSessions,
  };
}
