import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { storageGet, storageRemove, storageSet } from '../utils/idbStorage';
import { storage } from '../services/storage';

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

  const setName = useCallback((nextName: string) => {
    const normalizedName = nextName.trim();
    if (!normalizedName) return;

    storageSet(OPERATOR_NAME_KEY, normalizedName);
    setOperatorName(normalizedName);

    // Sync to Supabase if email exists
    if (email) {
      storage.saveUserContext({ operatorId, name: normalizedName, email });
    }
  }, [operatorId, email]);

  const setEmail = useCallback((nextEmail: string) => {
    const normalizedEmail = nextEmail.trim();
    if (!normalizedEmail) return;

    storageSet(OPERATOR_EMAIL_KEY, normalizedEmail);
    setOperatorEmail(normalizedEmail);

    // Sync to Supabase (fire and forget)
    storage.saveUserContext({ operatorId, name, email: normalizedEmail });
  }, [operatorId, name]);

  const clearName = useCallback(() => {
    storageRemove(OPERATOR_NAME_KEY);
    setOperatorName('');
  }, []);

  const linkToExistingOperator = useCallback((existingOperatorId: string, existingName: string, existingEmail: string) => {
    storageSet(OPERATOR_ID_KEY, existingOperatorId);
    storageSet(OPERATOR_NAME_KEY, existingName);
    storageSet(OPERATOR_EMAIL_KEY, existingEmail);
    setOperatorId(existingOperatorId);
    setOperatorName(existingName);
    setOperatorEmail(existingEmail);

    // Sync to Supabase
    storage.saveUserContext({ operatorId: existingOperatorId, name: existingName, email: existingEmail });
  }, []);

  const value = useMemo<OperatorContextType>(
    () => ({
      name,
      operatorId,
      email,
      loading: false,
      setName,
      setEmail,
      clearName,
      linkToExistingOperator,
    }),
    [clearName, email, linkToExistingOperator, name, operatorId, setEmail, setName],
  );

  return (
    <OperatorContext.Provider value={value}>
      {children}
    </OperatorContext.Provider>
  );
};

export const useOperator = (): OperatorContextType => {
  const context = useContext(OperatorContext);
  if (!context) {
    throw new Error('useOperator deve estar dentro de OperatorProvider');
  }
  return context;
};

export const useMaybeOperator = (): OperatorContextType | undefined => useContext(OperatorContext);
