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

export function SyncIndicator() {
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
    setPending(storage.getSyncQueueSize());
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

      // Notify hooks to reload from IDB
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

  const statusText = syncing
    ? 'Sincronizando'
    : lastResult || (pending > 0 ? `${pending} pendente${pending > 1 ? 's' : ''}` : 'Em dia');
  const hasFailure = lastResult === 'Falhou' || lastResult === 'Erro';
  const hasAttention = pending > 0 || hasFailure;

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={syncing}
      aria-label={`Nuvem ${statusText}`}
      className={`group relative inline-flex min-w-[116px] items-center gap-2 rounded-lg border px-3 py-2 text-left
                 transition-all duration-200 ease-out
                 disabled:opacity-60 disabled:cursor-wait
                 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                   hasAttention
                     ? 'bg-amber-950/40 border-amber-500/40 hover:bg-amber-900/50'
                     : 'bg-slate-800/70 border-slate-700/70 hover:bg-slate-700/80 hover:border-slate-600/80'
                 }`}
      title={
        lastResult
          ? `Último sync: ${lastResult}`
        : pending > 0
            ? `${pending} pendente${pending > 1 ? 's' : ''} — toque para sincronizar`
            : 'Toque para sincronizar com a nuvem'
      }
    >
      {/* Pulse ring on hover */}
      <span className="absolute inset-0 rounded-lg bg-emerald-500/0 group-hover:bg-emerald-500/5 transition-colors duration-300" />

      {/* Dot indicator */}
      <span className="relative flex h-3 w-3 shrink-0">
        {syncing ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
        ) : (
          <>
            <span
              className={`absolute inset-0 rounded-full transition-colors duration-300 ${
                lastResult
                  ? hasFailure
                    ? 'bg-red-400'
                    : 'bg-emerald-400'
                  : pending > 0
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-slate-500 group-hover:bg-emerald-400'
              }`}
            />
            <span
              className={`absolute inset-0 rounded-full transition-opacity duration-300 ${
                lastResult
                  ? hasFailure
                    ? 'bg-red-400 opacity-20 animate-ping'
                    : 'bg-emerald-400 opacity-20 animate-ping'
                  : pending > 0
                    ? 'bg-amber-400 opacity-20 animate-ping'
                    : 'opacity-0'
              }`}
            />
          </>
        )}
      </span>

      {/* Label */}
      <span className="relative flex min-w-0 flex-col leading-tight">
        <span className="text-[11px] font-semibold text-slate-200">Nuvem</span>
        <span
          className={`text-[10px] font-medium transition-colors duration-200 ${
            hasAttention
              ? hasFailure
                ? 'text-red-300'
                : 'text-amber-300'
              : lastResult
                ? 'text-emerald-300'
                : 'text-slate-400 group-hover:text-slate-300'
          }`}
        >
          {statusText}
        </span>
      </span>
    </button>
  );
}
