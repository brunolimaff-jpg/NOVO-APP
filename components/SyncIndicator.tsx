import { useState, useEffect, useCallback } from 'react';
import { storage } from '../services/storage';
import Tooltip from './Tooltip';

const TABLE_LABELS: Record<string, string> = {
  dossies: 'Dossiê',
  radar_alerts: 'Alertas do Radar',
  radar_configs: 'Configuração do Radar',
  radar_config: 'Configuração do Radar',
  extract_cache: 'Cache de pesquisa',
  user_context: 'Seu cadastro',
  audit_log: 'Registro de atividade',
  favorites: 'Favorito',
  shared_dossiers: 'Compartilhamento',
};

function describeItems(items: { table: string }[]): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = TABLE_LABELS[item.table] || item.table;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => (count > 1 ? `${count}× ${label}` : label))
    .join(', ');
}

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
      <Tooltip label="Seus dados estão salvos com segurança. Você pode acessar seus dossiês de qualquer dispositivo." position="left">
        <span className="text-xs text-green-500 flex items-center gap-1 cursor-help select-none">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          Tudo sincronizado
        </span>
      </Tooltip>
    );
  }

  const description = describeItems(items);

  return (
    <Tooltip label={`${pending} alteraç${pending > 1 ? 'ões' : 'ão'} será${pending > 1 ? 'm' : ''} salva${pending > 1 ? 's' : ''} na nuvem assim que possível. ${description}.`} position="left">
      <button
        type="button"
        onClick={handleClearStuck}
        className="text-xs text-yellow-500 flex items-center gap-1 cursor-pointer hover:text-yellow-400 transition-colors select-none"
      >
        <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block animate-pulse" />
        {pending} pendente{pending > 1 ? 's' : ''}
      </button>
    </Tooltip>
  );
}
