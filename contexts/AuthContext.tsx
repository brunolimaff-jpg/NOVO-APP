import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase, isSupabaseAvailable } from '../lib/supabaseClient';
import type { AuthError, Session, User } from '@supabase/supabase-js';

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isGuest: boolean;
  error: AuthError | null;
}

interface AuthContextType extends AuthState {
  signUp: (email: string, password: string, name: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const SupabaseAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => isSupabaseAvailable());
  const [error, setError] = useState<AuthError | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session: currentSession }, error: sessionError }) => {
      if (sessionError) {
        console.warn('[Auth] Erro ao recuperar sessão:', sessionError.message);
      }
      setSession(currentSession ?? null);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    if (!supabase) {
      return { error: null }; // fallback silencioso
    }

    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (signUpError) {
      setError(signUpError);
      return { error: signUpError };
    }

    if (data.user) {
      setSession(data.session);
      setUser(data.user);
    }

    return { error: null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { error: null };
    }

    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError);
      return { error: signInError };
    }

    setSession(data.session);
    setUser(data.user);
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;

    setError(null);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) {
      return { error: null };
    }

    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
    if (resetError) {
      setError(resetError);
    }
    return { error: resetError };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      loading,
      isGuest: !user && !loading,
      error,
      signUp,
      signIn,
      signOut,
      resetPassword,
      clearError,
    }),
    [session, user, loading, error, signUp, signIn, signOut, resetPassword, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve estar dentro de SupabaseAuthProvider');
  }
  return context;
};

export const useMaybeAuth = (): AuthContextType | undefined => useContext(AuthContext);
