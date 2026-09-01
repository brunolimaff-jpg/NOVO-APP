import type { ExistingDossier } from '../lib/supabase/dossierDuplicate';

interface DuplicateDossierModalProps {
  existing: ExistingDossier;
  companyName: string;
  /** BRU-11 camada 1: true quando o dossiê pertence a outro operador — interface fail-closed. */
  isForeign?: boolean;
  onAccessExisting: () => void;
  onNewResearch: () => void;
  onDismiss: () => void;
}

const FOREIGN_BLOCK_MESSAGE =
  'Já existe um dossiê para esta empresa, mas ele pertence a outro operador e o compartilhamento ainda não está autorizado. Nenhum conteúdo foi aberto ou copiado. Você pode cancelar ou iniciar uma nova pesquisa do zero.';

/**
 * BRU-162: transformado de modal bloqueante (overlay z-50) para banner inline
 * não-bloqueante — não cobre o fluxo, não impede cliques, e pode ser
 * interagido via automação (data-testid).
 */
export function DuplicateDossierModal({
  existing,
  companyName,
  isForeign = false,
  onAccessExisting,
  onNewResearch,
  onDismiss,
}: DuplicateDossierModalProps) {
  const date = existing.createdAt ? new Date(existing.createdAt) : null;
  const createdAt = date && !isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : 'data desconhecida';

  return (
    <div
      data-testid="duplicate-dossier-banner"
      className="w-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-4 py-3 mb-3"
    >
      <div className="flex items-start gap-3 mb-2">
        <span className="shrink-0 text-amber-600 dark:text-amber-300 font-semibold text-sm leading-none pt-0.5">⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Dossiê existente para {companyName}</p>
          <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
            Gerado em {createdAt}
            {!isForeign && existing.scoreOportunidade != null ? ` · Score PORTA: ${existing.scoreOportunidade}/100` : ''}
          </p>
        </div>
      </div>

      {isForeign && (
        <p className="text-xs text-amber-800 dark:text-amber-200 mb-3 pl-6">{FOREIGN_BLOCK_MESSAGE}</p>
      )}

      <div className="flex items-center gap-2 pl-6">
        {!isForeign && (
          <button
            data-testid="btn-access-existing"
            onClick={onAccessExisting}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Acessar Existente
          </button>
        )}
        <button
          data-testid="btn-new-research"
          onClick={onNewResearch}
          className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded transition-colors"
        >
          Nova Pesquisa
        </button>
        <button
          data-testid="btn-dismiss-duplicate"
          onClick={onDismiss}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
