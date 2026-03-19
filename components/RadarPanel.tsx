import React, { useState, useMemo } from 'react';
import type { RadarAlert, RadarCategory } from '../types';
import { RADAR_CATEGORY_LABELS, RADAR_CATEGORY_ICONS, RADAR_CATEGORY_COLORS } from '../types';

interface RadarPanelProps {
  alerts: RadarAlert[];
  isScanning: boolean;
  lastScanAt: number | null;
  unreadCount: number;
  isConfigured: boolean;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onForceScan: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
  isDarkMode: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

const RELEVANCE_BADGES: Record<string, string> = {
  alta: 'bg-red-500/20 text-red-600 dark:text-red-400',
  media: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  baixa: 'bg-slate-500/20 text-slate-600 dark:text-slate-400',
};

const RadarPanel: React.FC<RadarPanelProps> = ({
  alerts,
  isScanning,
  lastScanAt,
  unreadCount,
  isConfigured,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onForceScan,
  onOpenSettings,
  onClose,
  isDarkMode,
}) => {
  const [filterCategory, setFilterCategory] = useState<RadarCategory | 'all'>('all');
  const [onlyHighRelevance, setOnlyHighRelevance] = useState(false);

  const filtered = useMemo(() => {
    let result = alerts;
    if (filterCategory !== 'all') {
      result = result.filter(a => a.category === filterCategory);
    }
    if (onlyHighRelevance) {
      result = result.filter(a => a.relevance === 'alta');
    }
    return result;
  }, [alerts, filterCategory, onlyHighRelevance]);

  const categories = Object.keys(RADAR_CATEGORY_LABELS) as RadarCategory[];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className={`relative w-full max-w-md h-full flex flex-col shadow-2xl transition-all duration-300 ${
          isDarkMode ? 'bg-gray-900/95 backdrop-blur-xl border-l border-white/10' : 'bg-white/95 backdrop-blur-xl border-l border-gray-200/60'
        }`}
      >
        {/* Header */}
        <div className={`flex-shrink-0 p-4 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📡</span>
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Radar Setorial
              </h2>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenSettings}
                className={`p-1.5 rounded-lg text-sm transition-colors ${
                  isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title="Configurações do Radar"
              >
                ⚙️
              </button>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-lg text-sm transition-colors ${
                  isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value as RadarCategory | 'all')}
              className={`text-xs px-2 py-1 rounded-md border ${
                isDarkMode
                  ? 'bg-gray-800 border-gray-700 text-gray-300'
                  : 'bg-gray-50 border-gray-200 text-gray-700'
              }`}
            >
              <option value="all">Todas categorias</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {RADAR_CATEGORY_ICONS[cat]} {RADAR_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
            <label className={`flex items-center gap-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <input
                type="checkbox"
                checked={onlyHighRelevance}
                onChange={e => setOnlyHighRelevance(e.target.checked)}
                className="rounded"
              />
              Só alta relevância
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={onForceScan}
              disabled={isScanning}
              className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                isScanning
                  ? 'opacity-50 cursor-not-allowed'
                  : isDarkMode
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white'
              }`}
            >
              {isScanning ? '⏳ Varrendo...' : '🔄 Varrer agora'}
            </button>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className={`text-xs px-3 py-1 rounded-md transition-colors ${
                  isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          {lastScanAt && (
            <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              Último scan: {new Date(lastScanAt).toLocaleString('pt-BR')}
            </p>
          )}
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto p-2">
          {!isConfigured ? (
            <div className={`flex flex-col items-center justify-center h-full px-6 text-center`}>
              <div className={`w-full max-w-xs p-6 rounded-2xl border-2 border-dashed ${
                isDarkMode
                  ? 'border-emerald-800/50 bg-emerald-900/10'
                  : 'border-emerald-300 bg-emerald-50/50'
              }`}>
                <span className="text-5xl block mb-4">🛰️</span>
                <h3 className={`text-base font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Configure seu Radar
                </h3>
                <p className={`text-xs leading-relaxed mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Selecione as categorias e estados que deseja monitorar para receber alertas personalizados do setor.
                </p>
                <button
                  onClick={onOpenSettings}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98]"
                >
                  ⚙️ Configurar Radar
                </button>
              </div>
            </div>
          ) : isScanning && filtered.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-48 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              <span className="text-4xl mb-3 animate-pulse">📡</span>
              <p className="text-sm font-medium animate-pulse">Buscando notícias do setor...</p>
              <p className="text-xs mt-2">Isso costuma levar de 15 a 30 segundos</p>
              <div className="flex gap-1 mt-3">
                {[0, 1, 2].map(i => (
                  <span key={i} className={`w-2 h-2 rounded-full bg-emerald-400 animate-bounce`} style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-48 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              <span className="text-4xl mb-2">📡</span>
              <p className="text-sm font-medium">Nenhum alerta encontrado</p>
              <p className="text-xs mt-1">
                {alerts.length === 0 ? 'Clique em "Varrer agora" para iniciar' : 'Tente ajustar os filtros'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(alert => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer group hover:-translate-y-0.5 hover:shadow-lg ${
                    !alert.read
                      ? isDarkMode
                        ? 'bg-gradient-to-br from-emerald-900/20 to-gray-800/80 border-emerald-500/30 shadow-[0_4px_20px_-4px_rgba(16,185,129,0.15)]'
                        : 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200 shadow-[0_4px_20px_-4px_rgba(16,185,129,0.15)]'
                      : isDarkMode
                        ? 'bg-gray-800/40 border-gray-700/50 hover:bg-gray-800/60 hover:border-gray-600'
                        : 'bg-gray-50/80 border-gray-200/60 hover:bg-white hover:border-gray-300'
                  }`}
                  onClick={() => {
                    onMarkAsRead(alert.id);
                    if (alert.sourceUrl && alert.sourceUrl !== '#') {
                      window.open(alert.sourceUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Category + Relevance tags */}
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${RADAR_CATEGORY_COLORS[alert.category]}`}>
                          {RADAR_CATEGORY_ICONS[alert.category]} {RADAR_CATEGORY_LABELS[alert.category]}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${RELEVANCE_BADGES[alert.relevance]}`}>
                          {alert.relevance}
                        </span>
                        {alert.estado && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                            {alert.estado}
                          </span>
                        )}
                        {!alert.read && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        )}
                      </div>

                      {/* Title with external link indicator */}
                      <div className="flex items-start gap-1">
                        <span className={`text-sm font-semibold leading-tight flex-1 ${
                          isDarkMode ? 'text-gray-200 group-hover:text-emerald-400' : 'text-slate-800 group-hover:text-emerald-600'
                        } transition-colors`}>
                          {alert.title}
                        </span>
                        <span className={`text-[10px] mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                          isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
                        }`}>↗</span>
                      </div>

                      {/* Summary */}
                      <p className={`text-xs mt-1 leading-relaxed line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {alert.summary}
                      </p>

                      {/* Footer */}
                      <div className={`flex items-center gap-2 mt-1.5 text-[10px] ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                        <span>{alert.sourceName || 'Fonte'}</span>
                        <span>·</span>
                        <span>{timeAgo(alert.scannedAt)}</span>
                      </div>
                    </div>

                    {/* Dismiss button */}
                    <button
                      onClick={e => { e.stopPropagation(); onDismiss(alert.id); }}
                      className={`p-1 rounded text-xs transition-colors flex-shrink-0 ${
                        isDarkMode ? 'text-gray-600 hover:text-gray-400' : 'text-gray-300 hover:text-gray-500'
                      }`}
                      title="Remover alerta"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RadarPanel;
