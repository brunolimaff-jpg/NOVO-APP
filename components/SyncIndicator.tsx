import { useState, useEffect, useCallback, useRef } from 'react';
import { storage } from '../services/storage';

export function SyncIndicator() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(() => {
    setPending(storage.getSyncQueueSize());
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

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);

    try {
      const result = await storage.syncAll();
      if (!mountedRef.current) return;

      refresh();

      // Notify hooks to reload from IDB
      window.dispatchEvent(new CustomEvent('scout:sync-complete'));

      const parts: string[] = [];
      if (result.pushed > 0) parts.push(`+${result.pushed}`);
      if (result.pulled > 0) parts.push(`↓${result.pulled}`);

      if (parts.length > 0) {
        setLastResult(parts.join(' '));
      } else if (result.errors.length > 0) {
        setLastResult('Falhou');
      } else {
        setLastResult('OK');
      }
    } catch (err) {
      console.warn('SyncIndicator: erro ao sincronizar com nuvem', err);
      if (mountedRef.current) setLastResult('Erro');
    } finally {
      if (mountedRef.current) {
        setSyncing(false);
        setTimeout(() => {
          if (mountedRef.current) setLastResult(null);
        }, 3000);
      }
    }
  }, [syncing, refresh]);

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={syncing}
      className="group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium
                 bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 hover:border-slate-600/80
                 transition-all duration-200 ease-out
                 disabled:opacity-60 disabled:cursor-wait
                 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600/50"
      title={
        lastResult
          ? `Último sync: ${lastResult}`
          : pending > 0
            ? `${pending} pendente${pending > 1 ? 's' : ''} — toque para sincronizar`
            : 'Toque para sincronizar com a nuvem'
      }
    >
      {/* Pulse ring on hover */}
      <span className="absolute inset-0 rounded-full bg-emerald-500/0 group-hover:bg-emerald-500/5 transition-colors duration-300" />

      {/* Dot indicator */}
      <span className="relative flex h-2 w-2">
        {syncing ? (
          <span className="animate-spin h-2 w-2 rounded-full border border-emerald-400 border-t-transparent" />
        ) : (
          <>
            <span
              className={`absolute inset-0 rounded-full transition-colors duration-300 ${
                lastResult
                  ? 'bg-emerald-400'
                  : pending > 0
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-slate-500 group-hover:bg-emerald-400'
              }`}
            />
            <span
              className={`absolute inset-0 rounded-full transition-opacity duration-300 ${
                lastResult
                  ? 'bg-emerald-400 opacity-20 animate-ping'
                  : pending > 0
                    ? 'bg-amber-400 opacity-20 animate-ping'
                    : 'opacity-0'
              }`}
            />
          </>
        )}
      </span>

      {/* Label */}
      <span
        className={`transition-colors duration-200 ${
          lastResult
            ? 'text-emerald-400'
            : pending > 0
              ? 'text-amber-400'
              : 'text-slate-400 group-hover:text-slate-300'
        }`}
      >
        {syncing ? 'Sync...' : lastResult || (pending > 0 ? `${pending}` : 'Sync')}
      </span>
    </button>
  );
}
