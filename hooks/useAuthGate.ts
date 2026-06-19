import { useState, useCallback } from 'react';
import { useMaybeAuth } from '../contexts/AuthContext';
import { storageGet, storageSet } from '../utils/localStorage';

export const MIGRATION_DEADLINE = new Date('2026-06-18T23:59:59-03:00');

interface AuthGateState {
  showAuthModal: boolean;
  showBanner: boolean;
  canSkip: boolean;
  checking: boolean;
  pastDeadline: boolean;
  isGuest: boolean;
  hasStoredEmail: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  continueAsGuest: () => void;
}

const MIGRATION_SKIP_KEY = 'auth_skip_until';

export function useAuthGate(): AuthGateState {
  const auth = useMaybeAuth();
  const loading = auth?.loading ?? false;
  const isGuest = auth ? auth.isGuest : true;
  const hasStoredEmail = Boolean(storageGet('operator_email')?.trim());
  const pastDeadline = new Date() > MIGRATION_DEADLINE;
  const [forcedOpen, setForcedOpen] = useState(false);

  const [dismissed, setDismissed] = useState(() => {
    const skipUntil = storageGet(MIGRATION_SKIP_KEY);
    if (skipUntil) {
      const until = new Date(skipUntil);
      if (until > new Date()) return true;
    }
    return false;
  });

  const canSkip = hasStoredEmail;
  const checking = loading;

  const showAuthModal = auth !== undefined && !loading && isGuest && (forcedOpen || !dismissed);
  const showBanner = auth !== undefined && !loading && isGuest && hasStoredEmail && dismissed;

  const openAuthModal = useCallback(() => {
    setDismissed(false);
    setForcedOpen(true);
  }, []);
  const closeAuthModal = useCallback(() => {
    if (canSkip) setDismissed(true);
    setForcedOpen(false);
  }, [canSkip]);

  const continueAsGuest = useCallback(() => {
    const next = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    storageSet(MIGRATION_SKIP_KEY, next);
    setDismissed(true);
  }, []);

  return {
    showAuthModal,
    showBanner,
    canSkip,
    checking,
    pastDeadline,
    isGuest,
    hasStoredEmail,
    openAuthModal,
    closeAuthModal,
    continueAsGuest,
  };
}
