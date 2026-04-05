import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CRMPipelineProps, CRM_STAGE_LABELS, CRMStage } from '../types';

export const CRMPipeline: React.FC<CRMPipelineProps> = ({ cards, onMoveCard, onSelectCard }) => {
  const stages: CRMStage[] = ['prospeccao', 'primeira_reuniao', 'levantamento', 'defesa_tecnica', 'dossie_final'];
  
  // Estado para controle visual do drag
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CRMStage | null>(null);

  // Estado para undo de movimento
  const [lastMove, setLastMove] = useState<{ cardId: string; from: CRMStage; to: CRMStage } | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimeoutRef = useRef<number | null>(null);

  const playMoveFeedback = () => {
    try {
      if (typeof window === 'undefined') return;

      if ('vibrate' in navigator) {
        // Pequena vibração em dispositivos que suportam
        navigator.vibrate(25);
      }

      const AnyAudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AnyAudioContext) return;

      const ctx = new AnyAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.value = 660;

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // falha silenciosa — feedback é só um plus
    }
  };

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    setDraggedCardId(cardId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stage: CRMStage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: CRMStage) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    
    if (cardId && targetStage) {
      const card = cards.find(c => c.id === cardId);
      if (card && card.stage !== targetStage) {
        const fromStage = card.stage as CRMStage;
        onMoveCard(cardId, targetStage);
        setLastMove({ cardId, from: fromStage, to: targetStage });
        setUndoVisible(true);
        playMoveFeedback();
      }
    }
    
    setDraggedCardId(null);
    setDragOverStage(null);
  };

  const handleUndoMove = () => {
    if (lastMove) {
      onMoveCard(lastMove.cardId, lastMove.from);
    }
    setLastMove(null);
    setUndoVisible(false);
  };

  useEffect(() => {
    if (!undoVisible || !lastMove) return;

    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
    }

    undoTimeoutRef.current = window.setTimeout(() => {
      setUndoVisible(false);
      setLastMove(null);
    }, 5000);

    return () => {
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
      }
    };
  }, [undoVisible, lastMove]);

  const cardsByStage = useMemo(() => {
    const map: Record<string, typeof cards> = {};
    const safeCards = cards || [];
    for (const stage of stages) {
      map[stage] = safeCards.filter(c => c.stage === stage);
    }
    return map;
  }, [cards]);

  return (
    <div className="w-full h-full overflow-x-auto">
      <div className="flex flex-col gap-2 mb-2">
        {undoVisible && lastMove && (
          <div className="mx-1 mb-1 inline-flex items-center gap-2 rounded-full bg-slate-900 text-slate-50 px-3 py-1 text-[11px] shadow-sm dark:bg-slate-800">
            <span>
              Empresa movida para <span className="font-semibold">{CRM_STAGE_LABELS[lastMove.to]}</span>.
            </span>
            <button
              type="button"
              onClick={handleUndoMove}
              className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-600 transition-colors"
            >
              Desfazer
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 min-w-[980px]">
        {stages.map(stage => {
          const stageCards = cardsByStage[stage] ?? [];
          const total = stageCards.length;
          const isDragOver = dragOverStage === stage;

          return (
            <div
              key={stage}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage)}
              className={`rounded-2xl border p-3 flex flex-col shadow-sm transition-colors duration-200 ${
                isDragOver
                  ? 'bg-emerald-50/70 dark:bg-emerald-900/30 border-emerald-400 dark:border-emerald-500'
                  : 'bg-slate-50/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    {CRM_STAGE_LABELS[stage]}
                  </h3>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {total} {total === 1 ? 'empresa' : 'empresas'}
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto min-h-[140px] pb-1">
                {stageCards.map(raw => {
                  const card: any = raw;
                  const isDragging = draggedCardId === card.id;
                  const isRecentlyMoved = lastMove && lastMove.cardId === card.id && lastMove.to === stage && undoVisible;

                  const porta = card.latestScorePorta as number | undefined;
                  const portaColor = (porta !== undefined && porta >= 71) ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' :
                    (porta !== undefined && porta >= 41) ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' :
                    'bg-red-500/15 text-red-700 dark:text-red-300';

                  const healthLabel = card.health === 'green'
                    ? 'Saudável'
                    : card.health === 'yellow'
                      ? 'Atenção'
                      : 'Crítica';

                  const investigationsCount = Array.isArray(card.linkedSessionIds)
                    ? card.linkedSessionIds.length
                    : undefined;

                  const updatedAt = card.updatedAt
                    ? new Date(card.updatedAt).toLocaleDateString('pt-BR')
                    : null;

                  return (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, card.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onSelectCard(card.id)}
                      className={`w-full text-left rounded-2xl border bg-white/90 dark:bg-slate-900/90 p-3 flex flex-col gap-1.5 cursor-pointer transition-all duration-150 ${
                        isDragging
                          ? 'opacity-50 border-dashed border-slate-400'
                          : 'hover:border-emerald-500/70 hover:shadow-md border-slate-200 dark:border-slate-700'
                      } ${
                        isRecentlyMoved
                          ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-100 dark:ring-offset-slate-900 animate-pulse'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-50 truncate">
                          {card.companyName || 'Empresa sem nome'}
                        </p>
                        {porta !== undefined && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${portaColor}`}>
                            PORTA {porta}/100
                          </span>
                        )}
                      </div>

                      {card.briefDescription && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                          {card.briefDescription}
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <span
                            className={`inline-block w-2 h-2 rounded-full ${
                              card.health === 'green'
                                ? 'bg-emerald-500'
                                : card.health === 'yellow'
                                  ? 'bg-amber-400'
                                  : 'bg-red-500'
                            }`}
                          />
                          {healthLabel}
                        </span>

                        <div className="flex items-center gap-2">
                          {investigationsCount !== undefined && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              {investigationsCount} inv.
                            </span>
                          )}
                        </div>
                      </div>

                      {updatedAt && (
                        <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                          Atualizado em {updatedAt}
                        </p>
                      )}
                    </div>
                  );
                })}

                {stageCards.length === 0 && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-500 text-center py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                    Nenhuma empresa nesta etapa.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
