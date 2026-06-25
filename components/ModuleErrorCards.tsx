import type { DossierModuleError } from '../types';

interface ModuleErrorCardsProps {
  errors: DossierModuleError[];
  onCopyDiagnostic?: (error: DossierModuleError) => void;
}

export function ModuleErrorCards({ errors, onCopyDiagnostic }: ModuleErrorCardsProps) {
  if (!errors || errors.length === 0) return null;

  const handleCopy = (error: DossierModuleError) => {
    const diagnostic = [
      `Módulo: ${error.moduleName}`,
      `Modelo: ${error.modelDisplayName} (${error.modelId})`,
      `Erro: ${error.errorMessage}`,
      `Tipo: ${error.errorType}`,
      `Timestamp: ${error.timestamp}`,
      error.stack ? `Stack: ${error.stack}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (onCopyDiagnostic) {
      onCopyDiagnostic(error);
    } else {
      navigator.clipboard.writeText(diagnostic).catch(() => {});
    }
  };

  return (
    <div className="space-y-2 mt-3 mb-4" data-testid="module-error-cards">
      <p className="text-xs font-semibold text-amber-400 mb-2">
        ⚠️ {errors.length} módulo{errors.length > 1 ? 's' : ''} não gerado{errors.length > 1 ? 's' : ''}
      </p>
      {errors.map((error, i) => (
        <div
          key={`${error.moduleName}-${i}`}
          className="rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-sm"
          data-testid={`module-error-${error.moduleName}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-red-300 font-medium truncate">
                {error.moduleName} — {error.modelDisplayName}
              </p>
              <p className="text-red-400/70 text-xs mt-1 line-clamp-2">{error.errorMessage}</p>
              <p className="text-gray-500 text-xs mt-1">
                {error.errorType} · {new Date(error.timestamp).toLocaleTimeString('pt-BR')}
              </p>
            </div>
            <button
              onClick={() => handleCopy(error)}
              className="shrink-0 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
              title="Copiar diagnóstico"
            >
              📋 Copiar
            </button>
          </div>
        </div>
      ))}
      <p className="text-xs text-gray-500 mt-2">
        Erro persiste?{' '}
        <a
          href="mailto:bruno.ferreira@senior.com.br?subject=Erro%20Scout%20360%20-%20Módulos%20ausentes"
          className="underline hover:text-gray-300"
        >
          bruno.ferreira@senior.com.br
        </a>
      </p>
    </div>
  );
}
