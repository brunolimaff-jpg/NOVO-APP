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
import { storageGet, storageRemove, storageSet } from '../utils/localStorage';
import { storage } from '../services/storage';
import { initSessionTracking, trackOperatorEvent, endOperatorSession } from '../services/operatorTracking';
import { useMaybeAuth } from './AuthContext';

export interface OperatorProfile {
  operatorId: string;
  name: string;
  email: string;
}

interface OperatorContextType {
  name: string;
  operatorId: string;
  email: string;
  loading: boolean;
  setName: (name: string) => void;
  setEmail: (email: string) => void;
  registerOperator: (name: string, email: string) => void;
  clearName: () => void;
  linkToExistingOperator: (operatorId: string, name: string, email: string) => void;
}

// ===================================================================
// IMPORTANTE DE SEGURANCA
// ===================================================================
// operatorId NAO e identidade autenticada. Email e auto-reportado
// (nao verificado). findUserByEmail client-side so e seguro porque
// operatorId e usado EXCLUSIVAMENTE para analytics/tracking.
//
// NUNCA usar operatorId para:
//   - RLS policies de autorizacao
//   - Controle de acesso a recursos protegidos
//   - Permissoes de escrita/leitura no banco
//   - Qualquer decisao de seguranca
//
// Se no futuro o app precisar de identidade real, implementar auth
// via Supabase Auth (magic link, OAuth, OTP) e usar auth.uid().
// ===================================================================

const OPERATOR_NAME_KEY = 'operator_name';
const OPERATOR_ID_KEY = 'operator_id';
const OPERATOR_EMAIL_KEY = 'operator_email';

function generateOperatorId(): string {
  return `op_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function getOrCreateOperatorId(): string {
  const savedId = storageGet(OPERATOR_ID_KEY)?.trim();
  if (savedId) return savedId;

  const nextId = generateOperatorId();
  storageSet(OPERATOR_ID_KEY, nextId);
  return nextId;
}

function getSavedOperatorName(): string {
  return storageGet(OPERATOR_NAME_KEY)?.trim() || '';
}

function getSavedOperatorEmail(): string {
  return storageGet(OPERATOR_EMAIL_KEY)?.trim() || '';
}

// Helper de logging: em producao nao expoe objeto de erro (evita vazamento de PII)
function warnOperator(message: string, err?: unknown): void {
  if (import.meta.env.DEV && err instanceof Error) {
    console.warn(message, err.message);
  } else {
    console.warn(message);
  }
}

const OperatorContext = createContext<OperatorContextType | undefined>(undefined);

export const OperatorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useMaybeAuth();
  const authUser = auth?.user ?? null;
  const authLoading = auth?.loading ?? false;
  const isAuthenticated = !authLoading && authUser !== null;

  const [name, setOperatorName] = useState<string>(() => {
    if (authUser?.user_metadata?.name) return authUser.user_metadata.name;
    return getSavedOperatorName();
  });
  const [operatorId, setOperatorId] = useState<string>(() => getOrCreateOperatorId());
  const [email, setOperatorEmail] = useState<string>(() => {
    if (authUser?.email) return authUser.email;
    return getSavedOperatorEmail();
  });
  const shouldBackfillSavedProfileRef = useRef(name.trim().length > 0 && email.trim().length > 0);
  const didBackfillRef = useRef(false);
  const didTrackAppOpenRef = useRef(false);
  const didTrackInFlightRef = useRef(false);
  const didBackfillInFlightRef = useRef(false);

  const setName = useCallback(
    (nextName: string) => {
      const normalizedName = nextName.trim();
      if (!normalizedName) return;

      storageSet(OPERATOR_NAME_KEY, normalizedName);
      setOperatorName(normalizedName);

      // Sync to Supabase if email exists
      if (email) {
        void storage
          .saveUserContext({ operatorId, name: normalizedName, email })
          .catch(err => warnOperator('[OperatorContext] saveUserContext failed:', err));
      }
    },
    [operatorId, email],
  );

  const setEmail = useCallback(
    (nextEmail: string) => {
      const normalizedEmail = nextEmail.trim();
      if (!normalizedEmail) return;

      storageSet(OPERATOR_EMAIL_KEY, normalizedEmail);
      setOperatorEmail(normalizedEmail);

      // Sync to Supabase (fire and forget)
      void storage
        .saveUserContext({ operatorId, name, email: normalizedEmail })
        .catch(err => warnOperator('[OperatorContext] saveUserContext failed:', err));
    },
    [operatorId, name],
  );

  const linkToExistingOperator = useCallback(
    (existingOperatorId: string, existingName: string, existingEmail: string) => {
      storageSet(OPERATOR_ID_KEY, existingOperatorId);
      storageSet(OPERATOR_NAME_KEY, existingName);
      storageSet(OPERATOR_EMAIL_KEY, existingEmail);
      setOperatorId(existingOperatorId);
      setOperatorName(existingName);
      setOperatorEmail(existingEmail);

      // Sync to Supabase
      void storage
        .saveUserContext({ operatorId: existingOperatorId, name: existingName, email: existingEmail })
        .catch(err => warnOperator('[OperatorContext] saveUserContext failed:', err));

      // Tracking (se ainda nao disparou nesta sessao)
      if (!didTrackAppOpenRef.current && !didTrackInFlightRef.current) {
        didTrackInFlightRef.current = true;
        void initSessionTracking(existingOperatorId, existingEmail)
          .then(() => {
            didTrackAppOpenRef.current = true;
          })
          .catch(err => {
            warnOperator('[OperatorContext] initSessionTracking failed:', err);
            // Permite retry futuro
          })
          .finally(() => {
            didTrackInFlightRef.current = false;
          });
      }

      // Notificar sessoes para recarregar com o novo operatorId
      window.dispatchEvent(new CustomEvent('operator-relinked'));
    },
    [],
  );

  const registerOperator = useCallback(
    (nextName: string, nextEmail: string) => {
      const normalizedName = nextName.trim();
      const normalizedEmail = nextEmail.trim();
      if (!normalizedName || !normalizedEmail) return;

      // 1. Persist to localStorage first (sync)
      storageSet(OPERATOR_NAME_KEY, normalizedName);
      storageSet(OPERATOR_EMAIL_KEY, normalizedEmail);
      setOperatorName(normalizedName);
      setOperatorEmail(normalizedEmail);

      const capturedOperatorId = operatorId;

      // 2. Resolve canonical operatorId — depois persiste e inicia tracking
      void (async () => {
        let effectiveOperatorId = capturedOperatorId;

        try {
          const existing = await storage.findUserByEmail(normalizedEmail);
          if (existing && existing.operatorId !== capturedOperatorId) {
            // Canonical operator encontrado — delegar para linkToExistingOperator
            // (que chama saveUserContext + initSessionTracking com ID canonico)
            linkToExistingOperator(existing.operatorId, normalizedName, normalizedEmail);
            return;
          }
          // Se encontrou com mesmo operatorId ou nao encontrou:
          // effectiveOperatorId permanece capturedOperatorId
        } catch (err) {
          warnOperator('[OperatorContext] findUserByEmail failed, using current operatorId:', err);
          // Fall through: usa capturedOperatorId
        }

        // 3. Persiste no Supabase com o operatorId efetivo
        void storage
          .saveUserContext({
            operatorId: effectiveOperatorId,
            name: normalizedName,
            email: normalizedEmail,
          })
          .catch(err => warnOperator('[OperatorContext] saveUserContext failed:', err));

        // 4. Inicia tracking APENAS se ainda nao foi iniciado
        if (!didTrackAppOpenRef.current && !didTrackInFlightRef.current) {
          didTrackInFlightRef.current = true;
          try {
            await initSessionTracking(effectiveOperatorId, normalizedEmail);
            didTrackAppOpenRef.current = true;
            trackOperatorEvent('operator_registered', {
              operatorId: effectiveOperatorId,
              email: normalizedEmail,
            });
          } catch (err) {
            warnOperator('[OperatorContext] initSessionTracking failed:', err);
            // Permite retry futuro (didTrackAppOpenRef continua false)
          } finally {
            didTrackInFlightRef.current = false;
          }
        }
      })();
    },
    [operatorId, linkToExistingOperator],
  );

  useEffect(() => {
    if (!shouldBackfillSavedProfileRef.current || didBackfillRef.current || didBackfillInFlightRef.current) return;
    if (!operatorId || !name || !email) return;

    didBackfillInFlightRef.current = true;
    const capturedOperatorId = operatorId;
    const capturedName = name;
    const capturedEmail = email;

    void (async () => {
      let effectiveOperatorId = capturedOperatorId;

      try {
        const existing = await storage.findUserByEmail(capturedEmail);
        if (existing && existing.operatorId !== capturedOperatorId) {
          effectiveOperatorId = existing.operatorId;
          storageSet(OPERATOR_ID_KEY, existing.operatorId);
          setOperatorId(existing.operatorId);
          if (existing.displayName) {
            storageSet(OPERATOR_NAME_KEY, existing.displayName);
            setOperatorName(existing.displayName);
          }
        }
      } catch (err) {
        warnOperator('[OperatorContext] findUserByEmail failed during backfill:', err);
        // Permite retry futuro — nao seta didBackfillRef
        didBackfillInFlightRef.current = false;
        return;
      }

      // Persiste com o operatorId canonico
      void storage
        .saveUserContext({ operatorId: effectiveOperatorId, name: capturedName, email: capturedEmail })
        .catch(err => warnOperator('[OperatorContext] saveUserContext failed:', err));

      // Tracking de sessaoo — dispara apenas 1x por montagem do provider
      if (!didTrackAppOpenRef.current && !didTrackInFlightRef.current) {
        didTrackInFlightRef.current = true;
        void initSessionTracking(effectiveOperatorId, capturedEmail)
          .then(() => {
            didTrackAppOpenRef.current = true;
          })
          .catch(err => {
            warnOperator('[OperatorContext] initSessionTracking failed:', err);
          })
          .finally(() => {
            didTrackInFlightRef.current = false;
          });
      }

      didBackfillRef.current = true;
      didBackfillInFlightRef.current = false;
    })();
  }, [email, name, operatorId]);

  // Refs para evitar stale closure no effect de sync com auth
  const operatorIdRef = useRef(operatorId);
  operatorIdRef.current = operatorId;
  const nameRef = useRef(name);
  nameRef.current = name;

  // Sincroniza dados do Auth quando usuario loga
  useEffect(() => {
    if (authUser?.email) {
      const authName = authUser.user_metadata?.name || '';
      const authEmail = authUser.email || '';
      const currentOperatorId = operatorIdRef.current;
      const currentName = nameRef.current;
      if (authName) {
        storageSet(OPERATOR_NAME_KEY, authName);
        setOperatorName(authName);
      }
      if (authEmail) {
        storageSet(OPERATOR_EMAIL_KEY, authEmail);
        setOperatorEmail(authEmail);
      }
      void storage
        .saveUserContext({ operatorId: currentOperatorId, name: authName || currentName, email: authEmail })
        .catch(err => warnOperator('[OperatorContext] auth sync failed:', err));
    }
  }, [authUser?.id]);

  // Limpa dados do operador ao fazer logout
  useEffect(() => {
    const handleSignedOut = () => {
      storageRemove(OPERATOR_NAME_KEY);
      storageRemove(OPERATOR_EMAIL_KEY);
      setOperatorName('');
      setOperatorEmail('');
    };
    window.addEventListener('operator-signed-out', handleSignedOut);
    return () => window.removeEventListener('operator-signed-out', handleSignedOut);
  }, []);

  // Listener de encerramento de sessao — apenas pagehide (fechar tab)
  // NOTA: visibilitychange NAO encerra sessao — trocar de aba nao deve quebrar metricas
  useEffect(() => {
    const handlePageHide = () => endOperatorSession('pagehide');
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  const clearName = useCallback(() => {
    storageRemove(OPERATOR_NAME_KEY);
    setOperatorName('');
  }, []);

  const value = useMemo<OperatorContextType>(
    () => ({
      name,
      operatorId,
      email,
      loading: authLoading,
      setName,
      setEmail,
      registerOperator,
      clearName,
      linkToExistingOperator,
    }),
    [clearName, email, linkToExistingOperator, name, operatorId, registerOperator, setEmail, setName, authLoading],
  );

  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>;
};

export const useOperator = (): OperatorContextType => {
  const context = useContext(OperatorContext);
  if (!context) {
    throw new Error('useOperator deve estar dentro de OperatorProvider');
  }
  return context;
};

export const useMaybeOperator = (): OperatorContextType | undefined => useContext(OperatorContext);
