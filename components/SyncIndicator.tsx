import { useState, useEffect } from 'react';
import { storage } from '../services/storage';
import Tooltip from './Tooltip';

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
      <Tooltip label="Seus dados estão salvos com segurança no Scout 360. Você pode acessar de qualquer dispositivo." position="bottom">
        <span className="text-xs text-green-500 flex items-center gap-1 cursor-help">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          Sincronizado
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={`${pending} alteraç${pending > 1 ? 'ões' : 'ão'} aguardando para ser salva. Seus dados continuam disponíveis offline e serão sincronizados assim que houver conexão.`} position="bottom">
      <span className="text-xs text-yellow-500 flex items-center gap-1 cursor-help">
        <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block animate-pulse" />
        {pending} pendente{pending > 1 ? 's' : ''}
      </span>
    </Tooltip>
  );
}
