import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { storageGet, storageSet, storageRemove } from '../utils/idbStorage';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  isGuest: boolean;
  isAdmin: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  userId: string;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (name: string) => void;
  logout: () => void;
  updateName: (name: string) => void;
  error: string | null;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const STORAGE_KEY_NAME = 'username';
const STORAGE_KEY_ID   = 'userid';

/**
 * Lista de userNames que recebem acesso ao Dashboard Admin.
 * Configurável via variável de ambiente para nunca precisar mudar código.
 * Ex: VITE_ADMIN_USERNAMES=admin123,brunolima
 */
function getAdminNames(): string[] {
  const raw = import.meta.env.VITE_ADMIN_USERNAMES ?? '';
  return raw
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminUser(name: string): boolean {
  return getAdminNames().includes(name.trim().toLowerCase());
}

/** Gera um ID único e persistente para o dispositivo/usuário. */
function generateUserId(): string {
  return 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Na montagem: restaura sessão persistida pelo PWA (localStorage).
  useEffect(() => {
    const savedName = storageGet(STORAGE_KEY_NAME);
    const savedId   = storageGet(STORAGE_KEY_ID);

    if (savedName) {
      const id = savedId || generateUserId();
      if (!savedId) storageSet(STORAGE_KEY_ID, id);

      setUser({
        id,
        displayName: savedName,
        email: '',
        isGuest: false,
        isAdmin: isAdminUser(savedName),
      });
    }
    setLoading(false);
  }, []);

  /**
   * login — registra o nome do vendedor e persiste no dispositivo.
   * Em PWA instalado, este dado sobrevive entre sessões.
   */
  const login = useCallback((name: string) => {
    const displayName = name.trim() || 'Visitante';
    let id = storageGet(STORAGE_KEY_ID);
    if (!id) {
      id = generateUserId();
      storageSet(STORAGE_KEY_ID, id);
    }
    storageSet(STORAGE_KEY_NAME, displayName);
    setUser({
      id,
      displayName,
      email: '',
      isGuest: false,
      isAdmin: isAdminUser(displayName),
    });
  }, []);

  const logout = useCallback(() => {
    storageRemove(STORAGE_KEY_NAME);
    storageRemove(STORAGE_KEY_ID);
    setUser(null);
  }, []);

  const updateName = useCallback((name: string) => {
    const displayName = name.trim() || 'Visitante';
    storageSet(STORAGE_KEY_NAME, displayName);
    setUser((prev) =>
      prev
        ? { ...prev, displayName, isAdmin: isAdminUser(displayName) }
        : null,
    );
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        userId: user?.id ?? '',
        isAuthenticated: !!user,
        isAdmin: user?.isAdmin ?? false,
        loading,
        login,
        logout,
        updateName,
        error: null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve estar dentro de AuthProvider');
  return ctx;
};
