import { useState, useEffect } from 'react';
import { isSupabaseAvailable } from '../lib/supabaseClient';

interface SyncIndicatorProps {
  isDarkMode: boolean;
}

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

  const statusText = !isOnline ? 'Offline' : !supabaseAvailable ? 'Nuvem indisponível' : 'Conectado';

  const colorClasses = !isOnline
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

  const dotColor = !isOnline ? 'bg-red-500' : !supabaseAvailable ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div
      title={statusText}
      aria-label={`Nuvem · ${statusText}`}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs ${colorClasses}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
      <span className="hidden sm:inline">{statusText}</span>
    </div>
  );
}
