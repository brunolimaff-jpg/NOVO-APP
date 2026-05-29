import React, { useState } from 'react';
import { exportSessionsAsJSON } from '../utils/sessionExport';
import { useToast } from '../hooks/useToast';

interface MigrationNoticeModalProps {
  isDarkMode: boolean;
  isOpen: boolean;
  onDismiss: () => void;
}

export const MigrationNoticeModal: React.FC<MigrationNoticeModalProps> = ({ isDarkMode, isOpen, onDismiss }) => {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportSessionsAsJSON();
      toast.success('Histórico exportado com sucesso!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao exportar histórico');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDismiss = () => {
    onDismiss();
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity animate-fade-in"
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl shadow-2xl z-50 transform transition-all duration-300 animate-scale-in ${
          isDarkMode ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'
        }`}
        role="dialog"
        aria-labelledby="migration-title"
        aria-modal="true"
      >
        {/* Header */}
        <div
          className={`flex items-center gap-3 p-6 border-b ${isDarkMode ? 'border-gray-700/50' : 'border-gray-200'}`}
        >
          <span className="text-3xl">☁️</span>
          <div>
            <h2 id="migration-title" className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Agora seus dados ficam salvos na nuvem!
            </h2>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Nova versão com banco de dados integrado
            </p>
          </div>
        </div>

        {/* Body */}
        <div className={`p-6 space-y-4 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
          {/* Good news */}
          <div
            className={`rounded-xl p-4 flex gap-3 ${
              isDarkMode ? 'bg-emerald-900/20 border border-emerald-700/30' : 'bg-emerald-50 border border-emerald-200'
            }`}
          >
            <span className="text-xl flex-shrink-0 mt-1">🔒</span>
            <div>
              <p className={`text-sm font-medium ${isDarkMode ? 'text-emerald-300' : 'text-emerald-900'}`}>
                Seus novos dossiês serão sincronizados automaticamente
              </p>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-emerald-400/80' : 'text-emerald-700'}`}>
                Acesse de qualquer navegador, mesmo offline. Seus dados estão seguros e disponíveis.
              </p>
            </div>
          </div>

          {/* Warning about old data */}
          <div
            className={`rounded-xl p-4 flex gap-3 ${
              isDarkMode ? 'bg-orange-900/20 border border-orange-700/30' : 'bg-orange-50 border border-orange-200'
            }`}
          >
            <span className="text-xl flex-shrink-0 mt-1">⚠️</span>
            <div>
              <p className={`text-sm font-medium ${isDarkMode ? 'text-orange-300' : 'text-orange-900'}`}>
                Pesquisas anteriores ficam no navegador
              </p>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-orange-400/80' : 'text-orange-700'}`}>
                Como não havia banco de dados antes, suas pesquisas antigas não podem ser migradas automaticamente.
                Exporte seu histórico se quiser guardá-lo.
              </p>
            </div>
          </div>

          {/* Help Text */}
          <p className={`text-xs text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            💡 Novas pesquisas já vão direto para o banco seguro
          </p>
        </div>

        {/* Footer */}
        <div
          className={`flex gap-3 p-6 border-t ${
            isDarkMode ? 'border-gray-700/50 bg-gray-900/50' : 'border-gray-200 bg-gray-50/50'
          }`}
        >
          <button
            onClick={handleExport}
            disabled={isExporting}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all text-sm flex items-center justify-center gap-2 ${
              isDarkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {isExporting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Exportando...
              </>
            ) : (
              <>📥 Exportar histórico</>
            )}
          </button>

          <button
            onClick={handleDismiss}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all text-sm ${
              isDarkMode
                ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:shadow-lg hover:shadow-emerald-500/50'
                : 'bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:shadow-lg hover:shadow-emerald-400/50'
            }`}
          >
            Entendi, começar
          </button>
        </div>
      </div>
    </>
  );
};
