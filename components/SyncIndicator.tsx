import { useState, useEffect, useCallback } from 'react';
import { storage } from '../services/storage';
import Tooltip from './Tooltip';

export function SyncIndicator() {
  const [pending, setPending] = useState(0);
  const [items, setItems] = useState<{ table: string; operation: string }[]>([]);

  const refresh = useCallback(() => {
    setPending(storage.getSyncQueueSize());
    setItems(storage.getSyncQueueItems());
  }, []);

  useEffect(() => {
    refresh();

    const interval = setInterval(refresh, 2000);

    const handleOnline = () => {
      storage.processSyncQueue().then(refresh);
    };

    window.addEventListener('online', handleOnline);

    if (navigator.onLine) {
      storage.processSyncQueue().then(refresh);
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [refresh]);

  const handleClearStuck = useCallback(() => {
    storage.resetSyncQueue();
    refresh();
  }, [refresh]);

  if (pending === 0) {
    return (
      <Tooltip label="Dados salvos no Scout 360. Acesse de qualquer dispositivo." position="left">
        <span className="text-xs text-green-500 flex items-center gap-1 cursor-help">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          Sincronizado
        </span>
      </Tooltip>
    );
  }

  const itemList = items.map((i) => i.table).join(', ');

  return (
    <Tooltip label={`${itemList} — clique para limpar`} position="left">
      <button
        type="button"
        onClick={handleClearStuck}
        className="text-xs text-yellow-500 flex items-center gap-1 cursor-pointer hover:text-yellow-400 transition-colors"
        title="Clique para limpar pendências travadas"
      >
        <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block animate-pulse" />
        {pending} pendente{pending > 1 ? 's' : ''}
      </button>
    </Tooltip>
  );
}
