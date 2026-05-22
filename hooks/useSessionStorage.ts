import { useState, useEffect, useRef, useCallback } from 'react';
import { storage } from '../services/storage';
import { ChatSession } from '../types';
import { stripInternalMarkers } from '../utils/textCleaners';

const SESSIONS_LEGACY_KEY = 'scout360_sessions_v1';

export function useSessionStorage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const sessionsRef = useRef<ChatSession[]>([]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const loadSessions = useCallback(async (): Promise<ChatSession[]> => {
    const sanitizeLoadedSessions = (loaded: ChatSession[]): ChatSession[] =>
      loaded.map((session) => ({
        ...session,
        messages: (session.messages || []).map((message) => ({
          ...message,
          text: stripInternalMarkers(String(message.text || '')),
          timestamp: new Date(message.timestamp),
        })),
      }));

    try {
      const idbSessions = await storage.getDossiers();
      if (idbSessions && idbSessions.length > 0) return sanitizeLoadedSessions(idbSessions);
    } catch {
      // IndexedDB unavailable, try localStorage fallback
    }

    try {
      const raw = localStorage.getItem(SESSIONS_LEGACY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const localSessions = parsed.map((s: Record<string, unknown>) => ({
          ...s,
          messages: ((s.messages as Array<Record<string, unknown>>) || []).map((m) => ({
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
  }, []);

  useEffect(() => {
    if (isInitialized && sessions.length >= 0) {
      persistSessions(sessions);
    }
  }, [sessions, isInitialized, persistSessions]);

  return {
    sessions,
    setSessions,
    sessionsRef,
    isInitialized,
    setIsInitialized,
    loadSessions,
  };
}
