import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { storage } from '../services/storage';
import { ChatSession, Sender } from '../types';
import { stripInternalMarkers } from '../utils/textCleaners';
import { scoutDiag } from '../utils/diagnosticLog';
import { withAutoRetry } from '../utils/retry';

const persistFailureHandlers = new Set<(message: string) => void>();

export function subscribeSessionPersistFailure(handler: (message: string) => void): () => void {
  persistFailureHandlers.add(handler);
  return () => {
    persistFailureHandlers.delete(handler);
  };
}

function notifySessionPersistFailure(message: string) {
  persistFailureHandlers.forEach(handler => {
    try {
      handler(message);
    } catch (error) {
      scoutDiag.warn('SessionStorage', 'persist-failure-toast-handler-error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

async function flushPersistableSessions(persistable: ChatSession[], context: string): Promise<void> {
  if (persistable.length === 0) return;
  try {
    await withAutoRetry('sessionStorage.' + context, () => storage.saveAllDossiers(persistable), {
      maxRetries: 2,
      baseDelayMs: 300,
      maxDelayMs: 1500,
    });
  } catch (error) {
    scoutDiag.warn('SessionStorage', context + '-failed', {
      sessionCount: persistable.length,
      error: error instanceof Error ? error.message : String(error),
    });
    notifySessionPersistFailure('Não foi possível salvar o dossiê. Tente novamente em instantes.');
  }
}

function hasPersistableContent(session: ChatSession): boolean {
  return (session.messages || []).some(
    m => m.sender === Sender.Bot && !m.isError && !m.isThinking && (m.text || '').trim().length > 0,
  );
}

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
      typeof next === 'function' ? (next as (prev: ChatSession[]) => ChatSession[])(sessionsRef.current) : next;

    sessionsRef.current = resolved;
    setSessionsState(resolved);
  }, []);

  const loadSessions = useCallback(async (): Promise<ChatSession[]> => {
    const sanitizeLoadedMessage = (message: ChatSession['messages'][number]): ChatSession['messages'][number] => {
      const { loadingVariant: _loadingVariant, isSourcesOpen: _isSourcesOpen, ...stableMessage } = message;
      return {
        ...stableMessage,
        text: stripInternalMarkers(String(message.text || '')),
        timestamp: new Date(message.timestamp),
        isThinking: false,
      };
    };

    const sanitizeLoadedSessions = (loaded: ChatSession[]): ChatSession[] =>
      loaded.map(session => ({
        ...session,
        messages: (session.messages || []).map(sanitizeLoadedMessage),
      }));

    // Limpeza única de dados órfãos da migração IDB→Supabase
    try {
      const legacyV1 = localStorage.getItem('scout360_sessions_v1');
      const legacyFlag = localStorage.getItem('scout360:migration_v2_complete');
      if (legacyV1 !== null || legacyFlag !== null) {
        localStorage.removeItem('scout360_sessions_v1');
        localStorage.removeItem('scout360:migration_v2_complete');
      }
    } catch {
      // localStorage indisponível — ignora
    }

    try {
      const supabaseSessions = await storage.getDossiers();
      if (supabaseSessions && supabaseSessions.length > 0) {
        return sanitizeLoadedSessions(supabaseSessions).filter(hasPersistableContent);
      }
    } catch {
      console.error('[useSessionStorage] Falha ao carregar sessões do Supabase');
    }

    return [];
  }, []);

  const persistSessions = useCallback(async (data: ChatSession[]) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      const persistable = data.filter(hasPersistableContent);
      await flushPersistableSessions(persistable, 'debounced-flush');
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
      const persistable = pendingSessions.filter(hasPersistableContent);
      void flushPersistableSessions(persistable, 'unmount-flush');
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
        .catch(err => {
          scoutDiag.warn('useSessionStorage', 'operator-relinked reload failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
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
