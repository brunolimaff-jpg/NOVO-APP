import { useState, useEffect } from 'react';
import { storage } from '../services/storage';

export function SyncIndicator() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPending(storage.getSyncQueueSize());
    }, 2000);

    const handleOnline = () => {
      storage.processSyncQueue();
    };

    window.addEventListener('online', handleOnline);

    if (navigator.onLine) {
      storage.processSyncQueue();
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (pending === 0) {
    return (
      <span className="text-xs text-green-500 flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
        Sincronizado
      </span>
    );
  }

  return (
    <span className="text-xs text-yellow-500 flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block animate-pulse" />
      {pending} pendente{pending > 1 ? 's' : ''}
    </span>
  );
}
