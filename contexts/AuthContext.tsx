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
import { supabase } from '../lib/supabaseClient';
import { AuthError, type Session, type User } from '@supabase/supabase-js';

// Mensagens amigáveis e sanitizadas: detalhes técnicos do Supabase nunca chegam
// à interface. Erros não-AuthError (rede, cliente indisponível, exceção
// inesperada) viram AuthError com mensagem de ação.
function authUnavailableError(): AuthError {
  return new AuthError('Cliente de autenticação indisponível. Verifique sua conexão e tente novamente.');
}

// Códigos do Supabase Auth cujas mensagens são seguras para exibir na UI.
// Qualquer outro AuthError tem a mensagem substituída pelo fallback amigável
// (o código/status são preservados para diagnóstico).
const AUTH_SAFE_ERROR_CODES = new Set([
  'invalid_credentials',
  'user_already_exists',
  'email_not_confirmed',
  'weak_password',
  'over_request_rate_limit',
  'signup_disabled',
  'same_password',
]);

function toSanitizedAuthError(err: unknown, fallbackMessage: string): AuthError {
  if (err instanceof AuthError) {
    if (err.code && AUTH_SAFE_ERROR_CODES.has(err.code)) return err;
    return new AuthError(fallbackMessage, err.status, err.code);
  }
  return new AuthError(fallbackMessage);
}

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isGuest: boolean;
  error: AuthError | null;
}

interface AuthContextType extends AuthState {
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ error: AuthError | null; needsConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const SupabaseAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data: { session: currentSession }, error: sessionError }) => {
        if (sessionError) {
          console.warn('[Auth] Erro ao recuperar sessão:', sessionError.message);
        }
        setSession(currentSession ?? null);
        setUser(currentSession?.user ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('[Auth] getSession() rejeitada:', err instanceof Error ? err.message : err);
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
      const unavailable = authUnavailableError();
      setError(unavailable);
      return { error: unavailable };
    }

    setError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      if (error) {
        const sanitized = toSanitizedAuthError(
          error,
          'Não foi possível concluir o cadastro. Verifique sua conexão e tente novamente.',
        );
        setError(sanitized);
        return { error: sanitized };
      }

      // Com confirmacao de email ativada, data.session vem null
      const needsConfirmation = data.user !== null && data.session === null;

      if (data.user && data.session) {
        setSession(data.session);
        setUser(data.user);
      }

      return { error: null, needsConfirmation };
    } catch (err) {
      const sanitized = toSanitizedAuthError(
        err,
        'Não foi possível concluir o cadastro. Verifique sua conexão e tente novamente.',
      );
      setError(sanitized);
      return { error: sanitized };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      const unavailable = authUnavailableError();
      setError(unavailable);
      return { error: unavailable };
    }

    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const sanitized = toSanitizedAuthError(
          error,
          'Não foi possível entrar. Verifique sua conexão e tente novamente.',
        );
        setError(sanitized);
        return { error: sanitized };
      }

      setSession(data.session);
      setUser(data.user);
      return { error: null };
    } catch (err) {
      const sanitized = toSanitizedAuthError(
        err,
        'Não foi possível entrar. Verifique sua conexão e tente novamente.',
      );
      setError(sanitized);
      return { error: sanitized };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;

    setError(null);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[Auth] Erro ao chamar signOut no Supabase:', err);
      setError(err instanceof AuthError ? err : new AuthError('Falha ao desconectar'));
    } finally {
      setSession(null);
      setUser(null);
      window.dispatchEvent(new CustomEvent('operator-signed-out'));
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) {
      const unavailable = authUnavailableError();
      setError(unavailable);
      return { error: unavailable };
    }

    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
      if (resetError) {
        const sanitized = toSanitizedAuthError(
          resetError,
          'Não foi possível iniciar a recuperação de senha. Verifique sua conexão e tente novamente.',
        );
        setError(sanitized);
        return { error: sanitized };
      }
      return { error: null };
    } catch (err) {
      const sanitized = toSanitizedAuthError(
        err,
        'Não foi possível iniciar a recuperação de senha. Verifique sua conexão e tente novamente.',
      );
      setError(sanitized);
      return { error: sanitized };
    }
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
