import React from 'react';
import type { RadarConfig, RadarCategory } from '../types';
import { RADAR_CATEGORY_LABELS, RADAR_CATEGORY_ICONS, BRASIL_UFS } from '../types';

interface RadarSettingsProps {
  config: RadarConfig;
  onUpdateConfig: (partial: Partial<RadarConfig>) => void;
  lastScanAt: number | null;
  onClose: () => void;
  isDarkMode: boolean;
}

const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais',
  MS: 'Mato Grosso do Sul', MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco',
  PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia',
  RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe',
  SP: 'São Paulo', TO: 'Tocantins',
};

const INTERVAL_OPTIONS = [
  { value: 6, label: '4x/dia (6h)' },
  { value: 8, label: '3x/dia (8h)' },
  { value: 12, label: '2x/dia (12h)' },
  { value: 24, label: '1x/dia (24h)' },
];

const RadarSettings: React.FC<RadarSettingsProps> = ({
  config,
  onUpdateConfig,
  lastScanAt,
  onClose,
  isDarkMode,
}) => {
  const categories = Object.keys(RADAR_CATEGORY_LABELS) as RadarCategory[];

  const toggleCategory = (cat: RadarCategory) => {
    const current = config.categories;
    const updated = current.includes(cat)
      ? current.filter(c => c !== cat)
      : [...current, cat];
    onUpdateConfig({ categories: updated });
  };

  const toggleEstado = (uf: string) => {
    const current = config.estados;
    const updated = current.includes(uf)
      ? current.filter(u => u !== uf)
      : [...current, uf];
    onUpdateConfig({ estados: updated });
  };

  const selectAllEstados = () => onUpdateConfig({ estados: [...BRASIL_UFS] });
  const clearEstados = () => onUpdateConfig({ estados: [] });

  const nextScanIn = (() => {
    if (!lastScanAt || !config.enabled) return null;
    const nextMs = lastScanAt + config.scanIntervalHours * 3600_000;
    const diff = nextMs - Date.now();
    if (diff <= 0) return 'Em breve';
    const hours = Math.floor(diff / 3600_000);
    const mins = Math.floor((diff % 3600_000) / 60_000);
    return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
  })();

  const cardClass = `rounded-lg border p-3 ${isDarkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`;
  const labelClass = `text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`;
  const subClass = `text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl shadow-2xl mx-4 ${
        isDarkMode ? 'bg-gray-900' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`flex-shrink-0 flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">📡</span>
            <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Configurações do Radar
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Toggle geral */}
          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <div>
                <p className={labelClass}>Radar ativo</p>
                <p className={subClass}>Varredura automática de inteligência setorial</p>
              </div>
              <button
                onClick={() => onUpdateConfig({ enabled: !config.enabled })}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  config.enabled ? 'bg-emerald-500' : isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  config.enabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            {nextScanIn && config.enabled && (
              <p className={`text-[10px] mt-2 ${isDarkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>
                Próximo scan em: {nextScanIn}
              </p>
            )}
          </div>

          {/* Frequência */}
          <div className={cardClass}>
            <p className={labelClass}>Frequência de varredura</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {INTERVAL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onUpdateConfig({ scanIntervalHours: opt.value })}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    config.scanIntervalHours === opt.value
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : isDarkMode
                        ? 'border-gray-700 text-gray-400 hover:border-gray-600'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Categorias */}
          <div className={cardClass}>
            <p className={labelClass}>Categorias monitoradas</p>
            <p className={subClass}>Selecione quais temas o radar deve vigiar</p>
            <div className="grid grid-cols-1 gap-2 mt-2">
              {categories.map(cat => (
                <label
                  key={cat}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                    config.categories.includes(cat)
                      ? isDarkMode ? 'bg-gray-700/50' : 'bg-emerald-50'
                      : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={config.categories.includes(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="rounded text-emerald-500"
                  />
                  <span className="text-base">{RADAR_CATEGORY_ICONS[cat]}</span>
                  <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {RADAR_CATEGORY_LABELS[cat]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Estados */}
          <div className={cardClass}>
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className={labelClass}>Estados monitorados</p>
                <p className={subClass}>Vazio = Brasil todo. Selecione para foco regional.</p>
              </div>
            </div>
            <div className="flex gap-2 mb-2">
              <button
                onClick={selectAllEstados}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Selecionar todos
              </button>
              <button
                onClick={clearEstados}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Limpar
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {BRASIL_UFS.map(uf => (
                <button
                  key={uf}
                  onClick={() => toggleEstado(uf)}
                  className={`text-xs px-2 py-1.5 rounded-md border transition-all text-center ${
                    config.estados.includes(uf)
                      ? 'bg-emerald-500 border-emerald-500 text-white font-medium'
                      : isDarkMode
                        ? 'border-gray-700 text-gray-400 hover:border-gray-600'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                  title={UF_NAMES[uf]}
                >
                  {uf}
                </button>
              ))}
            </div>
            {config.estados.length > 0 && (
              <p className={`text-[10px] mt-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {config.estados.length} estado{config.estados.length > 1 ? 's' : ''} selecionado{config.estados.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Footer CTA */}
        <div className={`flex-shrink-0 p-4 border-t ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          {!config.isConfigured && config.categories.length === 0 && (
            <p className={`text-xs text-center mb-2 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>
              ⚠️ Selecione pelo menos 1 categoria para ativar o Radar
            </p>
          )}
          <button
            onClick={() => {
              if (config.categories.length === 0) return;
              onUpdateConfig({ isConfigured: true, enabled: true });
              onClose();
            }}
            disabled={config.categories.length === 0}
            className={`w-full px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              config.categories.length === 0
                ? isDarkMode
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:scale-[1.01] active:scale-[0.99]'
            }`}
          >
            {config.isConfigured ? '💾 Salvar Configurações' : '🚀 Salvar e Ativar Radar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RadarSettings;
