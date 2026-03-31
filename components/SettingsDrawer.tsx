import React, { useState, useEffect } from 'react';
import { ChatMode } from '../constants';
import { usePWA } from '../hooks/usePWA';
import { version } from '../package.json';
const SystemHealthCheck = React.lazy(() => import('./SystemHealthCheck'));

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  onUpdateName: (name: string) => void;
  mode: ChatMode;
  onSetMode: (mode: ChatMode) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenDashboard: () => void;
  onExportPDF: () => void;
  onCopyMarkdown: () => void;
  onScheduleFollowUp: () => void;
  onLogout?: () => void;
  exportStatus: 'idle' | 'loading' | 'success' | 'error';
  canAccessDashboard?: boolean;
  canAccessIntegrityCheck?: boolean;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  userName,
  onUpdateName,
  mode,
  onSetMode,
  isDarkMode,
  onToggleTheme,
  onOpenDashboard,
  onExportPDF,
  onCopyMarkdown,
  onScheduleFollowUp,
  onLogout,
  exportStatus,
  canAccessDashboard = true,
  canAccessIntegrityCheck = true,
}) => {
  const { canInstall, isInstalled, installApp } = usePWA();
  const [showHealthCheck, setShowHealthCheck] = useState(false);

  // Estado local para edição do nome — evita cursor pulando ao digitar
  const [localName, setLocalName] = useState(userName);

  // Sincroniza se o userName externo mudar (ex: logout/login)
  useEffect(() => {
    setLocalName(userName);
  }, [userName]);

  // Confirma a alteração ao sair do campo ou pressionar Enter
  const commitName = () => {
    const trimmed = localName.trim();
    if (trimmed && trimmed !== userName) {
      onUpdateName(trimmed);
    } else if (!trimmed) {
      // Não permite nome vazio — restaura o valor anterior
      setLocalName(userName);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay escuro */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer lateral direito */}
      <div className={`fixed right-0 top-0 h-full w-80 md:w-96 border-l z-50 overflow-y-auto shadow-2xl transform transition-transform duration-300 animate-slide-in ${
        isDarkMode
          ? 'bg-gray-900 border-gray-700/50'
          : 'bg-white border-gray-200'
      }`}>

        {/* Header do painel */}
        <div className={`flex items-center justify-between p-5 border-b sticky top-0 backdrop-blur-md z-10 ${
          isDarkMode
            ? 'border-gray-700/50 bg-gray-900/95'
            : 'border-gray-200 bg-white/95'
        }`}>
          <h2 className={`text-lg font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            <span>⚙️</span> Configurações
          </h2>
          <button
            onClick={onClose}
            className={`text-xl p-2 rounded-lg transition-colors ${
              isDarkMode
                ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-8">

          {/* ===== PERFIL ===== */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Perfil</h3>

            <div className="space-y-2">
              <label className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Como quer ser chamado?</label>
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Ex: Bruno Lima"
                className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all ${
                  isDarkMode
                    ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-600'
                    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'
                }`}
              />
              <p className={`text-[10px] ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Pressione Enter ou clique fora para salvar.
              </p>
            </div>
          </section>

          {/* ===== MODO DE INVESTIGAÇÃO ===== */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Modo de Investigação</h3>

            <div className="grid gap-3">
              {/* Operação */}
              <button
                onClick={() => onSetMode('operacao')}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all relative overflow-hidden group ${
                  mode === 'operacao'
                    ? 'border-orange-500/50 bg-orange-500/10'
                    : 'border-gray-700/50 bg-gray-800/30 hover:bg-gray-800 hover:border-gray-600'
                }`}
              >
                <span className="text-3xl filter drop-shadow-lg group-hover:scale-110 transition-transform">🛰️</span>
                <div className="text-left">
                  <p className={`text-sm font-bold ${mode === 'operacao' ? 'text-orange-400' : 'text-gray-200'}`}>Operação</p>
                  <p className="text-xs text-gray-400 mt-0.5">Direto ao ponto, linguagem de campo</p>
                </div>
                {mode === 'operacao' && <span className="absolute top-3 right-3 text-orange-500">✓</span>}
              </button>
              <div
                className={`w-full flex items-center justify-between p-3 rounded-xl border ${
                  isDarkMode ? 'border-slate-700/50 bg-slate-800/30' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Modo Diretoria temporariamente desativado no MVP
                </span>
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                  isDarkMode ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'
                }`}>
                  Em breve
                </span>
              </div>
            </div>
          </section>

          {/* ===== APARÊNCIA ===== */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Aparência</h3>

            <div className={`flex items-center justify-between p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800/50 border-gray-700/50' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <span className="text-xl">{isDarkMode ? '🌙' : '☀️'}</span>
                <div>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Tema Escuro</p>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{isDarkMode ? 'Ativado' : 'Desativado'}</p>
                </div>
              </div>
              <button
                onClick={onToggleTheme}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none ${
                  isDarkMode ? 'bg-emerald-600' : 'bg-gray-600'
                }`}
              >
                <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm ${
                  isDarkMode ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </section>

          {/* ===== AÇÕES ===== */}
          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Ações</h3>

            <div className="space-y-2">
              {canInstall && (
                <button
                  onClick={installApp}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group border-emerald-500/40 ${
                    isDarkMode
                      ? 'bg-emerald-900/20 hover:bg-emerald-900/40'
                      : 'bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  <span className={`text-lg p-2 rounded-lg ${isDarkMode ? 'bg-emerald-800/60' : 'bg-emerald-200'}`}>📲</span>
                  <div>
                    <p className={`text-sm font-medium ${isDarkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>Instalar aplicativo</p>
                    <p className={`text-xs ${isDarkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>Adicionar à tela inicial</p>
                  </div>
                </button>
              )}
              {isInstalled && (
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${isDarkMode ? 'border-emerald-700/30 bg-emerald-900/10' : 'border-emerald-200 bg-emerald-50'}`}>
                  <span className="text-lg">✅</span>
                  <p className={`text-xs ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>App instalado na tela inicial</p>
                </div>
              )}

              {canAccessDashboard && (
                <button
                  onClick={() => { onOpenDashboard(); onClose(); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${
                    isDarkMode
                      ? 'bg-gray-800/30 border-gray-700/30 hover:bg-gray-800 hover:border-gray-600'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                  }`}
                >
                  <span className={`text-lg p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-gray-700 group-hover:bg-gray-600' : 'bg-gray-200 group-hover:bg-gray-300'}`}>📊</span>
                  <div>
                    <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Dashboard</p>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Histórico e estatísticas</p>
                  </div>
                </button>
              )}

              {canAccessIntegrityCheck && (
                <button
                  onClick={() => setShowHealthCheck(true)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group border-blue-500/40 ${
                    isDarkMode
                      ? 'bg-blue-900/20 hover:bg-blue-900/40'
                      : 'bg-blue-50 hover:bg-blue-100'
                  }`}
                >
                  <span className={`text-lg p-2 rounded-lg ${isDarkMode ? 'bg-blue-800/60' : 'bg-blue-200'}`}>🔧</span>
                  <div>
                    <p className={`text-sm font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-800'}`}>Teste de Integridade</p>
                    <p className={`text-xs ${isDarkMode ? 'text-blue-500' : 'text-blue-600'}`}>Verificar sistema completo</p>
                  </div>
                </button>
              )}

              <button
                onClick={() => {
                  onClose();
                  onLogout?.();
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group border-red-500/40 ${
                  isDarkMode
                    ? 'bg-red-900/20 hover:bg-red-900/40'
                    : 'bg-red-50 hover:bg-red-100'
                }`}
              >
                <span className={`text-lg p-2 rounded-lg ${isDarkMode ? 'bg-red-800/60' : 'bg-red-200'}`}>🚪</span>
                <div>
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-red-300' : 'text-red-800'}`}>Sair da conta</p>
                  <p className={`text-xs ${isDarkMode ? 'text-red-500' : 'text-red-600'}`}>Encerrar sessão atual</p>
                </div>
              </button>
            </div>
          </section>

          {/* ===== SOBRE ===== */}
          <section>
            <div className={`text-center pt-6 border-t ${isDarkMode ? 'border-gray-700/30' : 'border-gray-200'}`}>
              <p className={`text-xs font-bold ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>🦅 Senior Scout 360 · v{version}</p>
              <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>Inteligência Comercial para Agronegócio</p>
            </div>
          </section>

        </div>
      </div>

      {/* Modal de Teste de Integridade */}
      {showHealthCheck && canAccessIntegrityCheck && (
        <React.Suspense fallback={null}>
          <SystemHealthCheck
            isDarkMode={isDarkMode}
            onClose={() => setShowHealthCheck(false)}
          />
        </React.Suspense>
      )}
    </>
  );
};

export default SettingsDrawer;
