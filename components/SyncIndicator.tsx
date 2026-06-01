import { useState, useEffect } from 'react';
import { isSupabaseAvailable } from '../lib/supabaseClient';

interface SyncIndicatorProps {
  isDarkMode: boolean;
}

/* ── Helpers de estilo ───────────────────────────────────── */

const getStatusText = (isOnline: boolean, supabaseAvailable: boolean) =>
  !isOnline ? 'Offline' : !supabaseAvailable ? 'Nuvem indisponível' : 'Conectado';

const getColorClasses = (isOnline: boolean, supabaseAvailable: boolean, isDarkMode: boolean) =>
  !isOnline
    ? isDarkMode
      ? 'text-red-400'
      : 'text-red-500'
    : !supabaseAvailable
      ? isDarkMode
        ? 'text-amber-400'
        : 'text-amber-500'
      : isDarkMode
        ? 'text-emerald-400'
        : 'text-emerald-600';

const getDotColor = (isOnline: boolean, supabaseAvailable: boolean) =>
  !isOnline ? 'bg-red-500' : !supabaseAvailable ? 'bg-amber-500' : 'bg-emerald-500';

const STATUS_LABEL_CLASS = 'hidden sm:inline';

/* ── Componente principal ─────────────────────────────────── */

export function SyncIndicator({ isDarkMode }: SyncIndicatorProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [supabaseAvailable, setSupabaseAvailable] = useState(isSupabaseAvailable());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setSupabaseAvailable(isSupabaseAvailable());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusText = getStatusText(isOnline, supabaseAvailable);
  const colorClasses = getColorClasses(isOnline, supabaseAvailable, isDarkMode);
  const dotColor = getDotColor(isOnline, supabaseAvailable);

  return (
    <div
      title={statusText}
      aria-label={`Nuvem · ${statusText}`}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs ${colorClasses}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
      <span className={STATUS_LABEL_CLASS}>{statusText}</span>
    </div>
  );
}
