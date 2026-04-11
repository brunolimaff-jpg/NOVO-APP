import type { ChatSession } from '../types';

/**
 * Interface para estrutura de backup
 */
export interface SessionBackup {
  version: string;
  exportDate: string;
  sessionCount: number;
  sessions: ChatSession[];
}

/**
 * Exportar todas as sessões como JSON
 */
export async function exportSessionsAsJSON(): Promise<void> {
  try {
    // Tentar obter de IndexedDB primeiro
    const sessions = await getSessionsFromStorage();

    if (!sessions || sessions.length === 0) {
      throw new Error('Nenhuma sessão para exportar');
    }

    const backup: SessionBackup = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      sessionCount: sessions.length,
      sessions,
    };

    // Criar blob e download
    const jsonString = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Criar timestamp para nome do arquivo
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
    const time = now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0');
    const filename = `scout360_backup_${timestamp}_${time}.json`;

    // Fazer download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Erro ao exportar sessões:', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Erro ao exportar sessões',
      { cause: error }
    );
  }
}

/**
 * Importar sessões de arquivo JSON
 */
export async function importSessionsFromJSON(file: File): Promise<SessionBackup> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const backup = JSON.parse(content) as SessionBackup;

        // Validar estrutura
        if (!backup.sessions || !Array.isArray(backup.sessions)) {
          throw new Error('Formato de arquivo inválido');
        }

        if (backup.sessions.length === 0) {
          throw new Error('Arquivo não contém sessões');
        }

        // Salvar sessões em storage
        await saveSessionsToStorage(backup.sessions);

        // Disparar evento de sincronização para outras abas
        const event = new StorageEvent('storage', {
          key: 'scout360_sessions_imported',
          newValue: JSON.stringify({
            timestamp: Date.now(),
            count: backup.sessions.length,
          }),
          storageArea: localStorage,
        });
        window.dispatchEvent(event);

        resolve(backup);
      } catch (error) {
        console.error('Erro ao importar sessões:', error);
        reject(
          new Error(
            error instanceof Error
              ? error.message
              : 'Erro ao importar arquivo'
          )
        );
      }
    };

    reader.onerror = () => {
      reject(new Error('Erro ao ler arquivo'));
    };

    reader.readAsText(file);
  });
}

/**
 * Obter sessões do armazenamento (IndexedDB ou localStorage)
 */
async function getSessionsFromStorage(): Promise<ChatSession[]> {
  try {
    // Tentar IndexedDB primeiro (via idb-keyval)
    const { storageGet } = await import('../utils/idbStorage');

    if (storageGet) {
      const sessions = await storageGet('scout360_sessions_v2') as ChatSession[] | null;
      if (sessions && Array.isArray(sessions)) {
        return sessions;
      }
    }
  } catch (error) {
    console.warn('IndexedDB não disponível, usando localStorage:', error);
  }

  // Fallback para localStorage
  try {
    const localStorageSessions = localStorage.getItem('scout360_sessions_v1');
    if (localStorageSessions) {
      return JSON.parse(localStorageSessions) as ChatSession[];
    }
  } catch (error) {
    console.warn('Erro ao ler localStorage:', error);
  }

  return [];
}

/**
 * Salvar sessões no armazenamento (IndexedDB ou localStorage)
 */
async function saveSessionsToStorage(sessions: ChatSession[]): Promise<void> {
  try {
    // Tentar salvar em IndexedDB primeiro
    const { storageSet } = await import('../utils/idbStorage');

    if (storageSet) {
      const sessionsJson = JSON.stringify(sessions);
      await storageSet('scout360_sessions_v2', sessionsJson);
      return;
    }
  } catch (error) {
    console.warn('Erro ao salvar em IndexedDB, usando localStorage:', error);
  }

  // Fallback para localStorage
  try {
    localStorage.setItem('scout360_sessions_v1', JSON.stringify(sessions));
  } catch (error) {
    console.error('Erro ao salvar em localStorage:', error);
    throw new Error('Armazenamento cheio ou indisponível', {
      cause: error,
    });
  }
}

/**
 * Validar estrutura de backup
 */
export function isValidBackupFile(backup: unknown): backup is SessionBackup {
  if (!backup || typeof backup !== 'object') return false;

  const b = backup as Record<string, unknown>;
  return (
    typeof b.version === 'string' &&
    typeof b.exportDate === 'string' &&
    typeof b.sessionCount === 'number' &&
    Array.isArray(b.sessions)
  );
}

/**
 * Obter tamanho estimado de sessões
 */
export function getSessionsSize(): string {
  const sessions = localStorage.getItem('scout360_sessions_v1');
  if (!sessions) return '0 KB';

  const bytes = new Blob([sessions]).size;
  return formatBytes(bytes);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
