import React, { useState } from 'react';
import { exportSessionsAsJSON } from '../utils/sessionExport';
import { useToast } from '../hooks/useToast';

interface UpdateNotificationModalProps {
  currentVersion: string | null;
  newVersion: string | null;
  isDarkMode: boolean;
  onDismiss: () => void;
  onUpdate: () => void;
  isOpen: boolean;
}

export const UpdateNotificationModal: React.FC<UpdateNotificationModalProps> = ({
  currentVersion,
  newVersion,
  isDarkMode,
  onDismiss,
  onUpdate,
  isOpen,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleSaveAndUpdate = async () => {
    setIsExporting(true);
    try {
      await exportSessionsAsJSON();
      toast.success('Histórico salvo com sucesso!');
      // Aguardar 1s antes de atualizar para garantir que o file download foi iniciado
      setTimeout(() => {
        onUpdate();
      }, 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar histórico');
      setIsExporting(false);
    }
  };

  const handleUpdateNow = () => {
    onUpdate();
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
        aria-labelledby="update-title"
        aria-modal="true"
      >
        {/* Header */}
        <div
          className={`flex items-center gap-3 p-6 border-b ${isDarkMode ? 'border-gray-700/50' : 'border-gray-200'}`}
        >
          <span className="text-3xl">✅</span>
          <div>
            <h2 id="update-title" className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Nova versão disponível
            </h2>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Uma atualização está pronta para instalar
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className={`ml-auto text-2xl p-1 rounded-lg transition-colors ${
              isDarkMode
                ? 'text-gray-500 hover:text-white hover:bg-gray-800'
                : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
            }`}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={`p-6 space-y-4 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
          {/* Version Info */}
          <div className={`rounded-xl p-4 space-y-2 ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Versão atual:
              </span>
              <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                {currentVersion || 'desconhecida'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Nova versão:
              </span>
              <span
                className={`text-sm font-bold bg-gradient-to-r from-emerald-400 to-green-500 bg-clip-text text-transparent`}
              >
                {newVersion || 'desconhecida'}
              </span>
            </div>
          </div>

          {/* Warning */}
          <div
            className={`rounded-xl p-4 flex gap-3 ${
              isDarkMode ? 'bg-orange-900/20 border border-orange-700/30' : 'bg-orange-50 border border-orange-200'
            }`}
          >
            <span className="text-xl flex-shrink-0 mt-1">⚠️</span>
            <div>
              <p className={`text-sm font-medium ${isDarkMode ? 'text-orange-300' : 'text-orange-900'}`}>
                Histórico será limpo
              </p>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-orange-400/80' : 'text-orange-700'}`}>
                Ao atualizar, seu histórico local será removido. Clique em "Salvar Histórico" para fazer backup antes de
                continuar.
              </p>
            </div>
          </div>

          {/* Help Text */}
          <p className={`text-xs text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            💡 Você pode restaurar o histórico depois pelas Configurações
          </p>
        </div>

        {/* Footer with Actions */}
        <div
          className={`flex gap-3 p-6 border-t ${
            isDarkMode ? 'border-gray-700/50 bg-gray-900/50' : 'border-gray-200 bg-gray-50/50'
          }`}
        >
          <button
            onClick={handleDismiss}
            disabled={isExporting}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all text-sm ${
              isDarkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            Depois (1h)
          </button>

          <button
            onClick={handleSaveAndUpdate}
            disabled={isExporting}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all text-sm flex items-center justify-center gap-2 ${
              isDarkMode
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {isExporting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Salvando...
              </>
            ) : (
              <>📥 Salvar Histórico</>
            )}
          </button>

          <button
            onClick={handleUpdateNow}
            disabled={isExporting}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all text-sm ${
              isDarkMode
                ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:shadow-lg hover:shadow-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-green-500 text-white hover:shadow-lg hover:shadow-emerald-400/50 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            Atualizar Agora
          </button>
        </div>
      </div>
    </>
  );
};
