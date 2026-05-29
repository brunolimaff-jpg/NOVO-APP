import type { ExistingDossier } from '../lib/supabase/dossierDuplicate';

interface DuplicateDossierModalProps {
  existing: ExistingDossier;
  companyName: string;
  onAccessExisting: () => void;
  onNewResearch: () => void;
  onDismiss: () => void;
}

export function DuplicateDossierModal({
  existing,
  companyName,
  onAccessExisting,
  onNewResearch,
  onDismiss,
}: DuplicateDossierModalProps) {
  const createdAt = existing.createdAt
    ? new Date(existing.createdAt).toLocaleDateString('pt-BR')
    : 'data desconhecida';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Dossiê existente
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Já existe um dossiê para <strong>{companyName}</strong>, gerado em {createdAt}.
        </p>

        {existing.scoreOportunidade != null && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
            <span className="text-sm text-amber-700 dark:text-amber-300">
              Score PORTA: {existing.scoreOportunidade}/100
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={onAccessExisting}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Acessar Dossiê Existente
          </button>
          <button
            onClick={onNewResearch}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
          >
            Nova Pesquisa do Zero
          </button>
        </div>

        <button
          onClick={onDismiss}
          className="mt-3 w-full text-sm text-gray-400 hover:text-gray-500 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
