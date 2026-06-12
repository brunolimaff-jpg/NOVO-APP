import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { storageGet, storageRemove } from '../utils/localStorage';

interface AuthGateState {
  /** AuthModal visível (novo usuário sem login ou existente que clicou CTA) */
  showAuthModal: boolean;
  /** Banner "cadastre até 18/06" visível */
  showBanner: boolean;
  /** Usuário pode pular login (só existentes) */
  canSkip: boolean;
  /** Auth ainda está verificando sessão */
  checking: boolean;
  /** Abre o modal */
  openAuthModal: () => void;
  /** Fecha o modal (só se canSkip = true) */
  closeAuthModal: () => void;
  /** Usuário clicou "Continuar sem login" */
  continueAsGuest: () => void;
}

const MIGRATION_SKIP_KEY = 'scout360:auth_skip_until';
const MIGRATION_DEADLINE = new Date('2026-06-18T23:59:59-03:00');

export function useAuthGate(): AuthGateState {
  const { loading, isGuest } = useAuth();
  const hasStoredEmail = Boolean(storageGet('operator_email')?.trim());

  const [dismissed, setDismissed] = useState(() => {
    const skipUntil = storageGet(MIGRATION_SKIP_KEY);
    if (skipUntil) {
      const until = new Date(skipUntil);
      if (until > new Date()) return true;
    }
    return false;
  });

  // Verificar se o prazo de migração já passou
  const pastDeadline = new Date() > MIGRATION_DEADLINE;

  const canSkip = hasStoredEmail && !pastDeadline;
  const checking = loading;

  // Mostrar modal se:
  // - Auth terminou de carregar
  // - Usuário é guest (não logado)
  // - E (é novo usuário OU existente que ainda não dispensou)
  const showAuthModal = !loading && isGuest && !dismissed;

  // Banner só para existentes que estão em guest mode e não estão vendo o modal
  const showBanner = !loading && isGuest && hasStoredEmail && dismissed;

  const openAuthModal = useCallback(() => setDismissed(false), []);
  const closeAuthModal = useCallback(() => {
    if (canSkip) setDismissed(true);
  }, [canSkip]);

  const continueAsGuest = useCallback(() => {
    // Salva skip por 24h
    const next = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(MIGRATION_SKIP_KEY, next);
    setDismissed(true);
  }, []);

  return {
    showAuthModal,
    showBanner,
    canSkip,
    checking,
    openAuthModal,
    closeAuthModal,
    continueAsGuest,
  };
}
