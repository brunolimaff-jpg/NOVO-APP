import { useState, useEffect, useCallback, useRef } from 'react';
import { storage } from '../services/storage';

interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

function formatSyncResult(result: SyncResult): string {
  const parts: string[] = [];
  if (result.pushed > 0) parts.push(`+${result.pushed}`);
  if (result.pulled > 0) parts.push(`↓${result.pulled}`);
  if (parts.length > 0) return parts.join(' ');
  if (result.errors.length > 0) return 'Falhou';
  return 'Em dia';
}

interface SyncIndicatorProps {
  isDarkMode: boolean;
}

export function SyncIndicator({ isDarkMode }: SyncIndicatorProps) {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const clearResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (clearResultTimerRef.current) {
        clearTimeout(clearResultTimerRef.current);
      }
    };
  }, []);

  const refresh = useCallback(() => {
    const size = storage.getSyncQueueSize();
    setPending(prev => (prev !== size ? size : prev));
  }, []);

  const showTemporaryResult = useCallback((result: string) => {
    setLastResult(result);
    if (clearResultTimerRef.current) {
      clearTimeout(clearResultTimerRef.current);
    }
    clearResultTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setLastResult(null);
    }, 3000);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    storage.scheduleBackgroundSync();

    const handleOnline = () => {
      storage.scheduleBackgroundSync();
      refresh();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [refresh]);

  useEffect(() => {
    const handleSyncComplete = (event: Event) => {
      refresh();
      const detail = (event as CustomEvent<SyncResult>).detail;
      if (detail) {
        showTemporaryResult(formatSyncResult(detail));
      }
    };

    window.addEventListener('scout:sync-complete', handleSyncComplete);
    return () => window.removeEventListener('scout:sync-complete', handleSyncComplete);
  }, [refresh, showTemporaryResult]);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);

    try {
      const result = await storage.syncAll();
      if (!mountedRef.current) return;

      refresh();
      window.dispatchEvent(new CustomEvent('scout:sync-complete', { detail: result }));
    } catch (err) {
      console.warn('SyncIndicator: erro ao sincronizar com nuvem', err);
      if (mountedRef.current) showTemporaryResult('Erro');
    } finally {
      if (mountedRef.current) {
        setSyncing(false);
      }
    }
  }, [syncing, refresh, showTemporaryResult]);

  const hasPending = pending > 0;
  const hasFailure = lastResult === 'Falhou' || lastResult === 'Erro';
  const showBadge = hasPending || hasFailure;

  const statusText = syncing
    ? 'Sincronizando…'
    : lastResult
      ? `Último sync: ${lastResult}`
      : hasPending
        ? `${pending} pendente${pending > 1 ? 's' : ''}`
        : 'Em dia';

  const tooltip = syncing
    ? 'Sincronizando dados com a nuvem…'
    : lastResult === 'Erro'
      ? 'Falha ao sincronizar — toque para tentar novamente'
      : lastResult === 'Falhou'
        ? 'Sincronização falhou — toque para tentar novamente'
        : lastResult
          ? `Sincronizado: ${lastResult}`
          : hasPending
            ? `${pending} alteração${pending > 1 ? 'ões' : ''} local pendente — toque para enviar`
            : 'Nuvem em dia — toque para sincronizar';

  const ariaLabel = `Nuvem · ${statusText}`;

  const colorClasses = syncing
    ? isDarkMode
      ? 'text-emerald-400 hover:bg-gray-800'
      : 'text-emerald-600 hover:bg-gray-100'
    : hasPending
      ? isDarkMode
        ? 'text-amber-400 hover:bg-gray-800'
        : 'text-amber-500 hover:bg-gray-100'
      : hasFailure
        ? isDarkMode
          ? 'text-red-400 hover:bg-gray-800'
          : 'text-red-500 hover:bg-gray-100'
        : isDarkMode
          ? 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600';

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={syncing}
      aria-label={ariaLabel}
      title={tooltip}
      className={`relative flex items-center justify-center rounded-lg p-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-wait disabled:opacity-60 ${colorClasses}`}
    >
      {syncing ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      ) : (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6.5 19a4.5 4.5 0 01-.42-8.98 6.5 6.5 0 0112.23-1.56A4 4 0 0120 16.5" />
          <path d="M17 15l-3-3-3 3" />
          <path d="M14 19v-7" />
        </svg>
      )}

      {showBadge && (
        <span className="absolute top-1.5 right-1.5 flex h-3.5 min-w-[14px] items-center justify-center">
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
              hasFailure ? 'bg-red-400' : 'bg-amber-400 animate-ping'
            }`}
          />
          <span
            className={`relative inline-flex items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white border-2 ${
              hasFailure
                ? 'bg-red-500 border-red-500'
                : isDarkMode
                  ? 'bg-amber-500 border-gray-900'
                  : 'bg-amber-600 border-white'
            }`}
          >
            {hasPending ? pending : '!'}
          </span>
        </span>
      )}
    </button>
  );
}
