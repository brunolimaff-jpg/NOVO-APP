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

const OperatorContext = createContext<OperatorContextType | undefined>(undefined);

export const OperatorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [name, setOperatorName] = useState<string>(() => getSavedOperatorName());
  const [operatorId, setOperatorId] = useState<string>(() => getOrCreateOperatorId());
  const [email, setOperatorEmail] = useState<string>(() => getSavedOperatorEmail());
  const shouldBackfillSavedProfileRef = useRef(name.trim().length > 0 && email.trim().length > 0);
  const didBackfillRef = useRef(false);
  const didTrackAppOpenRef = useRef(false);

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
          .catch(err => console.warn('[OperatorContext] saveUserContext failed:', err));
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
        .catch(err => console.warn('[OperatorContext] saveUserContext failed:', err));
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
        .catch(err => console.warn('[OperatorContext] saveUserContext failed:', err));

      // Tracking (se ainda nao disparou nesta sessao)
      if (!didTrackAppOpenRef.current) {
        didTrackAppOpenRef.current = true;
        void initSessionTracking(existingOperatorId, existingEmail).catch(err =>
          console.warn('[OperatorContext] initSessionTracking failed:', err),
        );
      }

      // Notificar sessões para recarregar com o novo operatorId
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

      // 2. Sync to Supabase (fire-and-forget)
      void storage
        .saveUserContext({
          operatorId,
          name: normalizedName,
          email: normalizedEmail,
        })
        .catch((err: unknown) => console.warn('[OperatorContext] saveUserContext failed:', err));

      // 3. Resolve canonical operatorId before initSessionTracking
      const capturedOperatorId = operatorId;
      (async () => {
        try {
          const existing = await storage.findUserByEmail(normalizedEmail);
          if (existing && existing.operatorId !== capturedOperatorId) {
            // Different canonical operator found — link (handles initSessionTracking)
            linkToExistingOperator(existing.operatorId, normalizedName, normalizedEmail);
            return;
          }
        } catch (err) {
          console.warn('[OperatorContext] findUserByEmail failed:', err);
          // Fall through: use capturedOperatorId
        }

        // 4. No linking needed — init session tracking with current operatorId
        if (!didTrackAppOpenRef.current) {
          didTrackAppOpenRef.current = true;
          try {
            await initSessionTracking(capturedOperatorId, normalizedEmail);
            trackOperatorEvent('operator_registered', {
              operatorId: capturedOperatorId,
              email: normalizedEmail,
            });
          } catch (err) {
            console.warn('[OperatorContext] initSessionTracking failed:', err);
          }
        }
      })();
    },
    [operatorId, linkToExistingOperator],
  );

  useEffect(() => {
    if (!shouldBackfillSavedProfileRef.current || didBackfillRef.current) return;
    if (!operatorId || !name || !email) return;

    didBackfillRef.current = true;
    void storage
      .saveUserContext({ operatorId, name, email })
      .catch(err => console.warn('[OperatorContext] saveUserContext failed:', err));

    // Tracking de sessaoo — dispara apenas 1x por montagem do provider
    if (!didTrackAppOpenRef.current) {
      didTrackAppOpenRef.current = true;
      void initSessionTracking(operatorId, email).catch(err =>
        console.warn('[OperatorContext] initSessionTracking failed:', err),
      );
    }
  }, [email, name, operatorId]);

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
      loading: false,
      setName,
      setEmail,
      registerOperator,
      clearName,
      linkToExistingOperator,
    }),
    [clearName, email, linkToExistingOperator, name, operatorId, registerOperator, setEmail, setName],
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
