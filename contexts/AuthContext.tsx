import React, { createContext, useContext, ReactNode, useCallback, useEffect, useState } from 'react';
import { useUser, useAuth as useClerkAuth, useClerk } from '@clerk/react';

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  isGuest: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  userId: string;
  isAuthenticated: boolean;
  loading: boolean;
  continueAsGuest: () => void;
  login: (email?: string, password?: string) => Promise<void>;
  register: (name?: string, email?: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateName: (name: string) => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const GUEST_MODE_STORAGE_KEY = 'scout360:guest_mode';
const GUEST_NAME_STORAGE_KEY = 'scout360:guest_name';

export const TEMPORARILY_DISABLE_CLERK = true;

export const REQUIRE_CLERK_AUTH = false;

function readGuestModePreference(): boolean {
  if (TEMPORARILY_DISABLE_CLERK) return true;
  if (REQUIRE_CLERK_AUTH) return false;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(GUEST_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function readGuestNamePreference(): string {
  if (typeof window === 'undefined') return 'Visitante';
  try {
    const stored = (window.localStorage.getItem(GUEST_NAME_STORAGE_KEY) || '').trim();
    return stored || 'Visitante';
  } catch {
    return 'Visitante';
  }
}

// Provedor usado quando Clerk está DESATIVADO — não chama nenhum hook do Clerk.
const GuestOnlyAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AuthContext.Provider
      value={{
        user: { id: 'guest', displayName: 'Visitante', email: '', isGuest: true },
        userId: 'guest',
        isAuthenticated: true,
        loading: false,
        continueAsGuest: () => {},
        login: async () => {},
        register: async () => {},
        logout: async () => {},
        updateName: () => {},
        error: null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Provedor usado quando Clerk está ATIVO — suporta Clerk auth + guest mode.
const ClerkAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user: clerkUser, isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerkAuth();
  const clerk = useClerk();
  const [guestModeEnabled, setGuestModeEnabled] = useState<boolean>(() => readGuestModePreference());
  const [guestDisplayName, setGuestDisplayName] = useState<string>(() => readGuestNamePreference());

  const setGuestMode = useCallback((enabled: boolean) => {
    setGuestModeEnabled(enabled);
    if (typeof window === 'undefined') return;
    try {
      if (enabled) {
        window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
      }
    } catch {
      // Ignora falhas de storage (modo privado/restrições do browser).
    }
  }, []);

  // Auto-desativa guest mode quando o usuário faz login via Clerk
  useEffect(() => {
    if (isSignedIn && guestModeEnabled) setGuestMode(false);
  }, [guestModeEnabled, isSignedIn, setGuestMode]);

  const user: AuthUser | null =
    isSignedIn && clerkUser
      ? {
          id: clerkUser.id,
          displayName:
            clerkUser.fullName ||
            clerkUser.firstName ||
            clerkUser.primaryEmailAddress?.emailAddress?.split('@')[0] ||
            'Usuário',
          email: clerkUser.primaryEmailAddress?.emailAddress || '',
          isGuest: false,
        }
      : guestModeEnabled
        ? {
            id: 'guest',
            displayName: guestDisplayName || 'Visitante',
            email: '',
            isGuest: true,
          }
        : null;

  const continueAsGuest = () => {
    if (REQUIRE_CLERK_AUTH) return;
    setGuestMode(true);
  };
  const login = async () => {
    setGuestMode(false);
    clerk.openSignIn();
  };
  const register = async () => {
    setGuestMode(false);
    clerk.openSignUp();
  };
  const logout = async () => {
    if (guestModeEnabled && !isSignedIn) {
      setGuestMode(false);
      return;
    }
    await signOut();
    setGuestMode(false);
  };

  const updateName = async (name: string) => {
    const normalizedName = name.trim() || 'Visitante';

    if (guestModeEnabled || !isSignedIn) {
      setGuestDisplayName(normalizedName);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(GUEST_NAME_STORAGE_KEY, normalizedName);
        } catch {
          // Ignora falhas de storage.
        }
      }
      return;
    }

    if (clerkUser) {
      const parts = normalizedName.split(' ');
      await clerkUser.update({
        firstName: parts[0],
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.id || '',
        isAuthenticated: !!isSignedIn || guestModeEnabled,
        loading: !isLoaded,
        continueAsGuest,
        login,
        register,
        logout,
        updateName,
        error: null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  if (TEMPORARILY_DISABLE_CLERK) {
    return <GuestOnlyAuthProvider>{children}</GuestOnlyAuthProvider>;
  }
  return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve estar dentro de AuthProvider');
  return ctx;
};
