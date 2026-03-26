import React, { useState } from 'react';
import { loadWithChunkRetry } from '../utils/chunkRetry';
import { useCRM } from '../contexts/CRMContext';
import { useToast } from '../hooks/useToast';
import { CRMStage } from '../types';

const CRMPipeline = React.lazy(() =>
  loadWithChunkRetry(() => import('./CRMPipeline')).then(m => ({ default: m.CRMPipeline })),
);

function CRMLoadingSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className={`flex h-full w-full items-center justify-center ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
        <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Carregando CRM...
        </p>
      </div>
    </div>
  );
}

interface CRMViewProps {
  isDarkMode: boolean;
  onSelectCard: (cardId: string) => void;
  onBackToChat: () => void;
  canAccessMiniCRM: boolean;
}

export function CRMView({ isDarkMode, onSelectCard, onBackToChat, canAccessMiniCRM }: CRMViewProps) {
  const { cards, createManualCard, moveCardToStage } = useCRM();
  const { toast } = useToast();

  const [showNewCrmForm, setShowNewCrmForm] = useState(false);
  const [newCrmName, setNewCrmName] = useState('');
  const [newCrmWebsite, setNewCrmWebsite] = useState('');
  const [newCrmResumo, setNewCrmResumo] = useState('');
  const [isCreatingCrmCard, setIsCreatingCrmCard] = useState(false);

  const handleCreateManualCRMCard = async () => {
    if (!newCrmName.trim()) return;
    setIsCreatingCrmCard(true);
    try {
      const card = await createManualCard({
        companyName: newCrmName.trim(),
        website: newCrmWebsite.trim() || undefined,
        briefDescription: newCrmResumo.trim() || undefined,
        stage: 'prospeccao',
      });
      setNewCrmName('');
      setNewCrmWebsite('');
      setNewCrmResumo('');
      setShowNewCrmForm(false);
      onSelectCard(card.id);
    } catch (err) {
      console.error('Erro ao criar card:', err);
      toast.error('Não foi possível criar a empresa. Tente novamente.');
    } finally {
      setIsCreatingCrmCard(false);
    }
  };

  const handleMoveCRMCard = async (cardId: string, toStage: CRMStage) => {
    await moveCardToStage(cardId, toStage);
  };

  if (!canAccessMiniCRM) return null;

  return (
    <div className={`flex h-full w-full ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Pipeline · Kanban
            </p>
            <h1 className="text-sm md:text-base font-semibold text-slate-800 dark:text-slate-100">Mini CRM</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewCrmForm(prev => !prev)}
              className="text-[11px] px-3 py-1.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 font-medium transition-colors"
            >
              {showNewCrmForm ? '✕ Cancelar' : '+ Nova empresa'}
            </button>
            <button
              onClick={onBackToChat}
              className="text-[11px] px-3 py-1.5 rounded-full border border-slate-300/70 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              ← Voltar
            </button>
          </div>
        </div>

        {showNewCrmForm && (
          <div
            className={`mb-5 rounded-xl border p-4 space-y-3 ${
              isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                value={newCrmName}
                onChange={e => setNewCrmName(e.target.value)}
                placeholder="Nome da empresa *"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreateManualCRMCard()}
                className={`rounded-lg border px-3 py-2 text-sm bg-transparent ${
                  isDarkMode ? 'border-slate-700 text-slate-100' : 'border-slate-300 text-slate-900'
                }`}
              />
              <input
                type="text"
                value={newCrmWebsite}
                onChange={e => setNewCrmWebsite(e.target.value)}
                placeholder="Website (opcional)"
                className={`rounded-lg border px-3 py-2 text-sm bg-transparent ${
                  isDarkMode ? 'border-slate-700 text-slate-100' : 'border-slate-300 text-slate-900'
                }`}
              />
              <input
                type="text"
                value={newCrmResumo}
                onChange={e => setNewCrmResumo(e.target.value)}
                placeholder="Resumo breve (opcional)"
                className={`rounded-lg border px-3 py-2 text-sm bg-transparent ${
                  isDarkMode ? 'border-slate-700 text-slate-100' : 'border-slate-300 text-slate-900'
                }`}
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleCreateManualCRMCard}
                disabled={!newCrmName.trim() || isCreatingCrmCard}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-slate-400 disabled:cursor-not-allowed"
              >
                {isCreatingCrmCard ? 'Criando...' : 'Criar empresa'}
              </button>
            </div>
          </div>
        )}

        <React.Suspense fallback={<CRMLoadingSkeleton isDarkMode={isDarkMode} />}>
          <CRMPipeline cards={cards} onMoveCard={handleMoveCRMCard} onSelectCard={onSelectCard} />
        </React.Suspense>
      </div>
    </div>
  );
}
