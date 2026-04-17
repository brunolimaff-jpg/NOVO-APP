import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { storageGet, storageRemove, storageSet } from '../utils/idbStorage';

export interface OperatorProfile {
  operatorId: string;
  name: string;
}

interface OperatorContextType {
  name: string;
  operatorId: string;
  loading: boolean;
  setName: (name: string) => void;
  clearName: () => void;
}

const OPERATOR_NAME_KEY = 'operator_name';
const OPERATOR_ID_KEY = 'operator_id';

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

const OperatorContext = createContext<OperatorContextType | undefined>(undefined);

export const OperatorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [name, setOperatorName] = useState<string>(() => getSavedOperatorName());
  const [operatorId] = useState<string>(() => getOrCreateOperatorId());

  const setName = useCallback((nextName: string) => {
    const normalizedName = nextName.trim();
    if (!normalizedName) return;

    storageSet(OPERATOR_NAME_KEY, normalizedName);
    setOperatorName(normalizedName);
  }, []);

  const clearName = useCallback(() => {
    storageRemove(OPERATOR_NAME_KEY);
    setOperatorName('');
  }, []);

  const value = useMemo<OperatorContextType>(
    () => ({
      name,
      operatorId,
      loading: false,
      setName,
      clearName,
    }),
    [clearName, name, operatorId, setName],
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
