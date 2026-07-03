import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Feedback, ScorePortaData, ClienteSeniorData } from '../types';
import { OUTPUT_MODE_META } from '../utils/outputModeMeta';
import ScorePorta from './ScorePorta';
import ClienteSeniorScore from './ClienteSeniorScore';
import MessageActionsBar from './MessageActionsBar';

const EXCERPT_MAX_CHARS = 500;

// ============================================================
// PROPS
// ============================================================

interface DossierReadyCardProps {
  text: string;
  outputMode: 'FULL_DOSSIER' | 'DISCOVERY_BRIEF' | 'ENRICHMENT_REQUIRED';
  isDarkMode: boolean;
  empresaAlvo?: string | null;
  cnpj?: string | null;
  scorePorta?: ScorePortaData;
  clienteSeniorData?: ClienteSeniorData;
  groundingSources?: Array<{ title: string; url: string; verification?: 'grounding' | 'fallback' }>;
  onViewDossier: () => void;
  onFeedback: (feedback: Feedback) => void;
  onSubmitFeedback: (feedback: Feedback, comment: string, content: string) => void;
  onToggleSources: () => void;
  isSourcesOpen: boolean;
}

// ============================================================
// HELPERS
// ============================================================

function buildExcerpt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Corta no ultimo espaco antes do limite para nao quebrar palavra
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed = lastSpace > maxChars * 0.8 ? slice.slice(0, lastSpace) : slice;
  return trimmed.replace(/\s+$/, '');
}

// ============================================================
// COMPONENTE
// ============================================================

const DossierReadyCard: React.FC<DossierReadyCardProps> = ({
  text,
  outputMode,
  isDarkMode,
  empresaAlvo,
  cnpj,
  scorePorta,
  clienteSeniorData,
  groundingSources,
  onViewDossier,
  onFeedback,
  onSubmitFeedback,
  onToggleSources,
  isSourcesOpen,
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const handleCopyFullText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 3000);
    } catch (err) {
      console.warn('[DossierReadyCard] clipboard.writeText falhou', err);
    }
  }, [text]);

  const modeMeta = OUTPUT_MODE_META[outputMode] ?? OUTPUT_MODE_META.FULL_DOSSIER;
  const excerpt = buildExcerpt(text, EXCERPT_MAX_CHARS);
  const hasMore = text.length > EXCERPT_MAX_CHARS;
  const totalSourcesCount = groundingSources?.length ?? 0;

  const cardBg = isDarkMode ? 'bg-slate-900' : 'bg-white';
  const borderColor = isDarkMode ? 'border-gray-700/30' : 'border-gray-200';
  const excerptTextColor = isDarkMode ? 'text-slate-300' : 'text-slate-700';
  const fadeOverlay = isDarkMode
    ? 'from-slate-900/0 via-slate-900/40 to-slate-900'
    : 'from-white/0 via-white/40 to-white';
  const companyLabelColor = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const companyValueColor = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const sectionHeaderColor = isDarkMode ? 'text-slate-500' : 'text-slate-400';
  const secondaryBg = isDarkMode ? 'bg-slate-800/60' : 'bg-slate-50';
  const secondaryBorder = isDarkMode ? 'border-slate-700/50' : 'border-slate-200';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`animate-fade-in rounded-2xl shadow-sm border p-4 md:p-5 w-full ${cardBg} ${borderColor}`}
    >
      {/* ================================================================ */}
      {/* CABECALHO — empresa + badge de outputMode                        */}
      {/* ================================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex flex-col gap-1">
          {empresaAlvo && <h3 className={`text-sm font-semibold ${companyValueColor}`}>{empresaAlvo}</h3>}
          {cnpj && <span className={`text-xs font-mono ${companyLabelColor}`}>CNPJ {cnpj}</span>}
        </div>

        <span
          className={`inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-xs font-semibold border ${modeMeta.badgeClass}`}
        >
          <span aria-hidden="true">{modeMeta.icon}</span>
          {modeMeta.label}
        </span>
      </div>

      {/* ================================================================ */}
      {/* DESCRICAO DO MODO                                                  */}
      {/* ================================================================ */}
      <p className={`text-xs mb-4 ${companyLabelColor}`}>{modeMeta.description}</p>

      {/* ================================================================ */}
      {/* SCORE PORTA                                                        */}
      {/* ================================================================ */}
      {scorePorta && <ScorePorta {...scorePorta} isDarkMode={isDarkMode} />}

      {/* ================================================================ */}
      {/* CLIENTE SENIOR SCORE                                               */}
      {/* ================================================================ */}
      {clienteSeniorData?.encontrado && (
        <ClienteSeniorScore data={clienteSeniorData} cnpj={cnpj} isDarkMode={isDarkMode} />
      )}

      {/* ================================================================ */}
      {/* EXCERTO DO TEXTO                                                   */}
      {/* ================================================================ */}
      <div className={`relative rounded-xl border p-3 md:p-4 mb-4 ${secondaryBg} ${secondaryBorder}`}>
        <span className={`block text-[10px] uppercase tracking-wider font-bold mb-2 ${sectionHeaderColor}`}>
          Previa do Dossie
        </span>
        <div className="relative max-h-32 overflow-hidden">
          <p className={`text-xs leading-relaxed whitespace-pre-wrap ${excerptTextColor}`}>
            {excerpt}
            {hasMore && '…'}
          </p>
          {hasMore && (
            <div
              className={`absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t ${fadeOverlay} pointer-events-none`}
            />
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* BOTOES DE ACAO                                                     */}
      {/* ================================================================ */}
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <button
          type="button"
          onClick={onViewDossier}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm ${
            isDarkMode
              ? 'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700'
              : 'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700'
          }`}
        >
          <span aria-hidden="true">{'📄'}</span>
          Ver Dossie Completo
        </button>

        <button
          type="button"
          onClick={handleCopyFullText}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
            isDarkMode
              ? 'border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
              : 'border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
          }`}
        >
          <span aria-hidden="true">{copyState === 'copied' ? '✅' : '📋'}</span>
          {copyState === 'copied' ? 'Copiado' : 'Copiar'}
        </button>

        {totalSourcesCount > 0 && (
          <span className={`ml-auto text-xs ${companyLabelColor}`}>
            {'📚'} {totalSourcesCount} fonte{totalSourcesCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ================================================================ */}
      {/* MESSAGE ACTIONS BAR                                                 */}
      {/* ================================================================ */}
      <MessageActionsBar
        content={text}
        verifiedSourcesCount={0}
        citedLinksCount={totalSourcesCount}
        currentFeedback={undefined}
        onFeedback={onFeedback}
        onSubmitFeedback={onSubmitFeedback}
        onToggleSources={onToggleSources}
        isSourcesVisible={isSourcesOpen}
        isDarkMode={isDarkMode}
      />
    </motion.div>
  );
};

export default DossierReadyCard;
