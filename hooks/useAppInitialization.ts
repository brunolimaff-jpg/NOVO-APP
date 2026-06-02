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
 * Handles app initialization:
 * 1. Warm-up: dispara ping silencioso ao Apps Script do lookup.
 * 2. Load sessions do Supabase e faz merge funcional com sessões locais
 *    criadas antes da resolução do load — NUNCA sobrescreve prev.
 * 3. Seleciona sessão inicial apenas se nenhuma foi criada localmente.
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
    fetch(`${LOOKUP_URL}?q=warmup`, { method: 'GET', redirect: 'follow' }).catch(() => {
      scoutDiag.warn('AppInit', 'Warmup do lookup falhou (best-effort)');
    });

    const init = async () => {
      const loaded = await loadSessions();
      if (cancelled) return;

      // Merge funcional: preserva sessões criadas localmente entre o início
      // do load e sua resolução. loaded vence para IDs sobrepostos (source of truth).
      setSessions(prev => {
        const loadedIds = new Set(loaded.map(s => s.id));
        const kept = prev.filter(s => !loadedIds.has(s.id));
        return loaded.length > 0 ? [...loaded, ...kept] : prev;
      });

      // Só seleciona sessão inicial se o usuário ainda não iniciou uma investigação.
      // Se prevId já existe, mantém — evita sobrescrever sessão ativa ou geração em andamento.
      if (loaded.length > 0) {
        setCurrentSessionId(prevId => prevId ?? loaded[0].id);
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
