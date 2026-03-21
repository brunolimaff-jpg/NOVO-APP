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

export const TEMPORARILY_DISABLE_CLERK = false;

export const REQUIRE_CLERK_AUTH = true;

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

// Provedor usado quando Clerk está ATIVO — requer autenticação via Clerk.
const ClerkAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user: clerkUser, isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerkAuth();
  const clerk = useClerk();

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
      : null;

  const login = async () => {
    clerk.openSignIn();
  };
  const register = async () => {
    clerk.openSignUp();
  };
  const logout = async () => {
    await signOut();
  };

  const updateName = async (name: string) => {
    const normalizedName = name.trim() || 'Usuário';

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
        isAuthenticated: !!isSignedIn,
        loading: !isLoaded,
        continueAsGuest: () => {},
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
