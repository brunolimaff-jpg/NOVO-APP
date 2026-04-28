import { useEffect, useSyncExternalStore } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAState {
  installPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  isPromptDismissed: boolean;
}

interface UsePWAReturn {
  canInstall: boolean;
  isInstalled: boolean;
  showInstallPrompt: boolean;
  installApp: () => Promise<void>;
  dismissInstallPrompt: () => void;
}

const listeners = new Set<() => void>();
let isInitialized = false;
let pwaState: PWAState = {
  installPrompt: null,
  isInstalled: false,
  isPromptDismissed: false,
};

function emitChange(): void {
  listeners.forEach(listener => listener());
}

function setPWAState(nextState: Partial<PWAState>): void {
  pwaState = { ...pwaState, ...nextState };
  emitChange();
}

function getStandaloneStatus(): boolean {
  if (typeof window === 'undefined') return false;

  const nav = navigator as Navigator & { standalone?: boolean };
  const mediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)')
    : null;

  return mediaQuery?.matches === true || nav.standalone === true;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PWAState {
  return pwaState;
}

function initializePWAStore(): void {
  if (isInitialized || typeof window === 'undefined') return;

  isInitialized = true;
  setPWAState({ isInstalled: getStandaloneStatus() });

  const mediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)')
    : null;

  const handleDisplayModeChange = (event: MediaQueryListEvent) => {
    setPWAState({ isInstalled: event.matches });
  };

  const handleBeforeInstall = (event: Event) => {
    event.preventDefault();
    setPWAState({
      installPrompt: event as BeforeInstallPromptEvent,
      isPromptDismissed: false,
    });
  };

  const handleAppInstalled = () => {
    setPWAState({
      installPrompt: null,
      isInstalled: true,
      isPromptDismissed: false,
    });
  };

  mediaQuery?.addEventListener('change', handleDisplayModeChange);
  window.addEventListener('beforeinstallprompt', handleBeforeInstall);
  window.addEventListener('appinstalled', handleAppInstalled);
}

export function usePWA(): UsePWAReturn {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    initializePWAStore();
  }, []);

  const canInstall = !!snapshot.installPrompt && !snapshot.isInstalled;
  const showInstallPrompt = canInstall && !snapshot.isPromptDismissed;

  const installApp = async () => {
    const currentPrompt = pwaState.installPrompt;
    if (!currentPrompt) return;

    await currentPrompt.prompt();
    const { outcome } = await currentPrompt.userChoice;

    if (outcome === 'accepted') {
      setPWAState({
        installPrompt: null,
        isPromptDismissed: false,
      });
    }
  };

  const dismissInstallPrompt = () => {
    if (!pwaState.installPrompt) return;
    setPWAState({ isPromptDismissed: true });
  };

  return {
    canInstall,
    isInstalled: snapshot.isInstalled,
    showInstallPrompt,
    installApp,
    dismissInstallPrompt,
  };
}
