import React, { useState } from 'react';

interface GhostMessageBlockProps {
  msg: { ghostDetails?: string };
  onRetry?: () => void;
  isLoading: boolean;
  isDarkMode: boolean;
}

const GhostMessageBlock: React.FC<GhostMessageBlockProps> = ({ msg, onRetry, isLoading, isDarkMode }) => {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div
      className={`rounded-2xl p-5 shadow-sm w-full border ${
        isDarkMode ? 'bg-red-950/20 border-red-900/50' : 'bg-red-50 border-red-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-1">👻</span>
        <div className="flex-1">
          <h4
            className={`text-xs font-black uppercase tracking-widest mb-1 ${
              isDarkMode ? 'text-red-400' : 'text-red-700'
            }`}
          >
            Conexão Degolada (Ghost Message)
          </h4>
          <p className={`text-xs leading-relaxed mb-4 ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>
            A conexão com o motor de inteligência foi interrompida pelo navegador (timeout ou oscilação de rede) antes
            da resposta chegar. O sistema preservou o histórico, mas os dados não puderam ser exibidos.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={() => onRetry?.()}
              disabled={isLoading}
              className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg shadow-lg transition-all flex items-center gap-2 ${
                isLoading
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed shadow-none'
                  : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
              }`}
            >
              <span>↻</span> {isLoading ? 'Processando...' : 'Tentar Novamente'}
            </button>
            {msg.ghostDetails && (
              <button
                onClick={() => setShowDetails(v => !v)}
                className={`text-xs underline decoration-dotted opacity-70 hover:opacity-100 transition-opacity ${
                  isDarkMode ? 'text-red-400' : 'text-red-600'
                }`}
              >
                {showDetails ? 'Ocultar detalhes' : 'Ver detalhes'}
              </button>
            )}
          </div>
          {showDetails && msg.ghostDetails && (
            <div
              className={`mt-3 p-3 rounded text-xs font-mono whitespace-pre-wrap select-text border ${
                isDarkMode ? 'bg-slate-900/50 border-red-800/30 text-red-300' : 'bg-white border-red-200 text-red-700'
              }`}
            >
              {msg.ghostDetails}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GhostMessageBlock;
