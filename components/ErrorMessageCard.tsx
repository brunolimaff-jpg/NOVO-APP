import React, { useState } from 'react';
import { AppError } from '../types';
import { getFriendlyErrorMessage } from '../utils/errorHelpers';
import { ChatMode } from '../constants';

interface ErrorMessageCardProps {
  error: AppError;
  onRetry: () => void;
  isLoadingRetry: boolean;
  isDarkMode: boolean;
  mode?: ChatMode;
  onReportError?: () => void;
}

const ErrorMessageCard: React.FC<ErrorMessageCardProps> = ({
  error,
  onRetry,
  isLoadingRetry,
  isDarkMode,
  mode = 'investigacao',
  onReportError,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [isReported, setIsReported] = useState(false);
  const [isReporting, setIsReporting] = useState(false);

  const friendlyMessage = getFriendlyErrorMessage(error, mode as ChatMode);

  // SC-429: sobrecarga temporária do serviço — comunicação própria (contrato do Planejador),
  // sem jargão técnico; o card substitui o erro genérico e não expõe detalhes internos.
  const isSc429 = error.code === 'RATE_LIMIT' && error.httpStatus === 429;

  if (isSc429) {
    return (
      <div
        data-testid="error-message-card"
        data-error-code="SC-429"
        className={`rounded-2xl border p-5 animate-fade-in w-full shadow-sm ${
          isDarkMode ? 'border-amber-700/60 bg-amber-950/30' : 'border-amber-300 bg-amber-50'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl mt-0.5 select-none" aria-hidden="true">
            ⚠️
          </div>
          <div className="flex-1 space-y-3 min-w-0">
            <h3 className={`font-bold text-sm md:text-base ${isDarkMode ? 'text-amber-200' : 'text-amber-900'}`}>
              Não foi possível concluir o dossiê agora
            </h3>
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-amber-200/80' : 'text-amber-800'}`}>
              O serviço de análise do Scout está com alta demanda no momento. Aguarde um pouco e tente novamente.
            </p>
            <button
              onClick={e => {
                e.stopPropagation();
                onRetry();
              }}
              disabled={isLoadingRetry}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md border disabled:opacity-50 disabled:cursor-not-allowed ${
                isDarkMode
                  ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500/50'
                  : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600'
              }`}
            >
              {isLoadingRetry ? (
                <>
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  <span>Tentando de novo...</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>Tentar novamente</span>
                </>
              )}
            </button>
            <p className={`text-xs opacity-70 ${isDarkMode ? 'text-amber-200/70' : 'text-amber-800'}`}>
              Código para suporte: SC-429
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ PENSANDO EM AMBOS OS MODOS: Temas consistentes e harmon izados
  const theme = {
    bg: isDarkMode ? 'bg-red-950/20' : 'bg-red-50',
    border: isDarkMode ? 'border-red-900/50' : 'border-red-200',
    textPrimary: isDarkMode ? 'text-red-300' : 'text-red-800',
    textSecondary: isDarkMode ? 'text-red-400/80' : 'text-red-600',
    codeBg: isDarkMode ? 'bg-slate-900/50' : 'bg-white',
    codeBorder: isDarkMode ? 'border-red-800/30' : 'border-red-200',
    button: isDarkMode
      ? 'bg-red-600 hover:bg-red-500 text-white border-red-500/50'
      : 'bg-red-600 hover:bg-red-500 text-white border-red-500',
    reportButton: isDarkMode
      ? 'text-red-400 hover:bg-red-900/30 border-red-800/30'
      : 'text-red-600 hover:bg-red-100 border-red-200',
  };

  const handleReport = () => {
    if (onReportError) {
      setIsReporting(true);
      onReportError();
      setTimeout(() => {
        setIsReporting(false);
        setIsReported(true);
      }, 800);
    }
  };

  return (
    <div
      data-testid="error-message-card"
      className={`rounded-2xl border ${theme.border} ${theme.bg} p-5 animate-fade-in w-full shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl mt-0.5 select-none">❌</div>

        <div className="flex-1 space-y-3 min-w-0">
          <div>
            <h3 className={`font-bold text-sm md:text-base ${theme.textPrimary}`}>
              Não foi possível concluir a investigação.
            </h3>
            <p className={`text-sm mt-1 leading-relaxed ${theme.textSecondary}`}>{friendlyMessage}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Sempre oferecemos regeneração manual, mesmo quando o backend marca como não-retryable. */}
            <button
              onClick={e => {
                e.stopPropagation();
                onRetry();
              }}
              disabled={isLoadingRetry}
              className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md border
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${theme.button}
              `}
            >
              {isLoadingRetry ? (
                <>
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  <span>{error.retryable ? 'Tentando de novo...' : 'Regenerando...'}</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span>{error.retryable ? 'Tentar novamente' : 'Regenerar resposta'}</span>
                </>
              )}
            </button>

            {/* Report Button */}
            {onReportError && (
              <button
                onClick={handleReport}
                disabled={isReported || isReporting}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${theme.reportButton} disabled:opacity-50 disabled:cursor-default`}
                title="Enviar detalhes deste erro para análise"
              >
                {isReporting ? (
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                ) : isReported ? (
                  <>
                    <span>✅</span>
                    <span>Reportado</span>
                  </>
                ) : (
                  <>
                    <span>👎</span>
                    <span>Reportar erro</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Technical Details (Expandable) */}
          <div className="pt-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className={`text-xs opacity-70 hover:opacity-100 underline decoration-dotted transition-opacity focus:outline-none ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}
            >
              {showDetails ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos'}
            </button>

            {showDetails && (
              <div
                className={`mt-2 p-3 rounded text-xs font-mono overflow-x-auto ${theme.codeBg} border ${theme.codeBorder} select-text`}
              >
                <p>
                  <strong>Code:</strong> {error.code}
                </p>
                <p>
                  <strong>Source:</strong> {error.source}
                </p>
                {error.httpStatus && (
                  <p>
                    <strong>Status:</strong> {error.httpStatus}
                  </p>
                )}
                <p>
                  <strong>Message:</strong> {error.message}
                </p>
                {error.transient && (
                  <p>
                    <strong>Transient:</strong> Yes
                  </p>
                )}
                {!error.retryable && (
                  <p className="text-red-500">
                    <strong>Retryable:</strong> No
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ErrorMessageCard);
