import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScorePortaData, ClienteSeniorData } from '../types';
import { OUTPUT_MODE_META } from '../utils/outputModeMeta';
import ScorePorta from './ScorePorta';
import ClienteSeniorScore from './ClienteSeniorScore';
import DossierErrorBoundary from '../features/dossier/DossierErrorBoundary';
import type { AuditableSource } from '../utils/textCleaners';

interface DossierViewerLiteProps {
  text: string;
  outputMode: 'FULL_DOSSIER' | 'DISCOVERY_BRIEF' | 'ENRICHMENT_REQUIRED';
  isDarkMode: boolean;
  empresaAlvo?: string | null;
  cnpj?: string | null;
  scorePorta?: ScorePortaData;
  clienteSeniorData?: ClienteSeniorData;
  groundingSources?: Array<{ title: string; url: string; verification?: 'grounding' | 'fallback' }>;
  auditableSources?: AuditableSource[];
  isOpen: boolean;
  onClose: () => void;
}

const MarkdownRenderer = React.lazy(() => import('./MarkdownRenderer'));

// ============================================================
// FALLBACKS
// ============================================================

const LOADING_FALLBACK = (
  <div className="flex items-center justify-center py-12">
    <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
  </div>
);

// ============================================================
// HELPERS
// ============================================================

function categorizeSources(auditableSources: AuditableSource[]): {
  citedInText: AuditableSource[];
  consultedNotCited: AuditableSource[];
  inferred: AuditableSource[];
} {
  const citedInText = auditableSources.filter(s => s.sourceTypes.includes('inline_citation'));
  const consultedNotCited = auditableSources.filter(
    s => s.sourceTypes.includes('consulted_not_cited') && !s.sourceTypes.includes('inline_citation'),
  );
  const inferred = auditableSources.filter(
    s => s.sourceTypes.includes('inferred_without_url') && !s.sourceTypes.includes('inline_citation'),
  );
  return { citedInText, consultedNotCited, inferred };
}

// ============================================================
// COMPONENTE
// ============================================================

const DossierViewerLite: React.FC<DossierViewerLiteProps> = ({
  text,
  outputMode,
  isDarkMode,
  empresaAlvo,
  cnpj,
  scorePorta,
  clienteSeniorData,
  groundingSources,
  auditableSources,
  isOpen,
  onClose,
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [showSources, setShowSources] = useState(false);

  // ----------------------------------------------------------
  // Close on Escape
  // ----------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const scrollLockRef = useRef(false);

  useEffect(() => {
    if (isOpen && !scrollLockRef.current) {
      scrollLockRef.current = true;
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        scrollLockRef.current = false;
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  // ----------------------------------------------------------
  // Copy full text
  // ----------------------------------------------------------
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 3000);
    } catch (err) {
      console.warn('[DossierViewerLite] clipboard.writeText falhou', err);
    }
  }, [text]);

  // ----------------------------------------------------------
  // Sources
  // ----------------------------------------------------------
  const effectiveAuditable = auditableSources ?? [];
  const { citedInText, consultedNotCited, inferred } = useMemo(
    () => categorizeSources(effectiveAuditable),
    [effectiveAuditable],
  );

  const totalSourcesCount = citedInText.length + consultedNotCited.length + inferred.length;
  const modeMeta = OUTPUT_MODE_META[outputMode] ?? OUTPUT_MODE_META.FULL_DOSSIER;

  // ----------------------------------------------------------
  // Derive colors
  // ----------------------------------------------------------
  const overlayBg = isDarkMode ? 'bg-slate-950/80' : 'bg-slate-900/40';
  const modalBg = isDarkMode ? 'bg-slate-900' : 'bg-white';
  const modalBorder = isDarkMode ? 'border-slate-700/40' : 'border-slate-200';
  const headerBorder = isDarkMode ? 'border-slate-700/40' : 'border-slate-200';
  const companyLabelColor = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const companyValueColor = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const bodyTextColor = isDarkMode ? 'text-slate-300' : 'text-slate-700';
  const footerBg = isDarkMode ? 'bg-slate-800/60' : 'bg-slate-50';
  const footerBorder = isDarkMode ? 'border-slate-700/40' : 'border-slate-200';
  const copyBtnBase = isDarkMode
    ? 'border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
    : 'border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-800';
  const closeBtnBase = isDarkMode
    ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100';

  // ----------------------------------------------------------
  // Don't render if not open
  // ----------------------------------------------------------
  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center ${overlayBg} backdrop-blur-sm transition-opacity duration-300`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de Dossie"
    >
      {/* -------------------------------------------------- */}
      {/* MODAL CARD                                         */}
      {/* -------------------------------------------------- */}
      <div
        className={`relative flex flex-col w-full max-w-4xl mx-4 rounded-2xl shadow-2xl border ${modalBg} ${modalBorder}`}
        style={{
          maxHeight: 'calc(100vh - 48px)',
          animation: 'dossierViewerLiteEnter 0.3s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ================================================ */}
        {/* HEADER BAR                                       */}
        {/* ================================================ */}
        <div className={`flex items-center justify-between gap-3 shrink-0 px-5 py-4 border-b ${headerBorder}`}>
          {/* Empresa + label */}
          <div className="flex flex-col gap-0.5 min-w-0">
            {empresaAlvo && <h2 className={`text-base font-bold truncate ${companyValueColor}`}>{empresaAlvo}</h2>}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold uppercase tracking-wide ${companyLabelColor}`}>Dossie</span>
              {cnpj && <span className={`text-[11px] font-mono ${companyLabelColor}`}>CNPJ {cnpj}</span>}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${modeMeta.badgeClass}`}
              >
                <span aria-hidden="true">{modeMeta.icon}</span>
                {modeMeta.label}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${copyBtnBase}`}
            >
              <span aria-hidden="true">{copyState === 'copied' ? '✅' : '📋'}</span>
              {copyState === 'copied' ? 'Copiado' : 'Copiar'}
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-lg transition-all ${closeBtnBase}`}
              aria-label="Fechar visualizador"
            >
              {'✕'}
            </button>
          </div>
        </div>

        {/* ================================================ */}
        {/* BODY                                              */}
        {/* ================================================ */}
        <div className={`flex-1 overflow-y-auto px-5 py-5 ${bodyTextColor}`}>
          {/* ScorePorta */}
          {scorePorta && <ScorePorta {...scorePorta} isDarkMode={isDarkMode} />}

          {/* ClienteSeniorScore */}
          {clienteSeniorData?.encontrado && (
            <ClienteSeniorScore data={clienteSeniorData} cnpj={cnpj} isDarkMode={isDarkMode} />
          )}

          {/* Output mode description */}
          <p className={`text-xs mb-4 ${companyLabelColor}`}>{modeMeta.description}</p>

          {/* MarkdownRenderer — lazy + error boundary */}
          <DossierErrorBoundary isDarkMode={isDarkMode}>
            <React.Suspense fallback={LOADING_FALLBACK}>
              <MarkdownRenderer
                content={text}
                isDarkMode={isDarkMode}
                groundingSources={groundingSources}
                auditableSources={effectiveAuditable}
              />
            </React.Suspense>
          </DossierErrorBoundary>
        </div>

        {/* ================================================ */}
        {/* FOOTER BAR                                        */}
        {/* ================================================ */}
        <div className={`shrink-0 px-5 py-3 border-t ${footerBorder} ${footerBg} rounded-b-2xl`}>
          {totalSourcesCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowSources(prev => !prev)}
                className={`inline-flex items-center gap-2 text-xs font-semibold ${companyLabelColor} hover:opacity-80 transition-opacity`}
              >
                <span aria-hidden="true">{'📚'}</span>
                {totalSourcesCount} fonte{totalSourcesCount !== 1 ? 's' : ''}
                <span className="text-[10px] opacity-60">{showSources ? '▲' : '▼'}</span>
              </button>

              {showSources && (
                <div className="mt-3 space-y-3">
                  {[
                    { label: 'Citadas no texto', items: citedInText },
                    { label: 'Consultadas pela IA (nao citadas)', items: consultedNotCited },
                    { label: 'Inferidas sem URL', items: inferred },
                  ].flatMap(group =>
                    group.items.length > 0
                      ? [
                          <div key={group.label}>
                            <p
                              className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${companyLabelColor}`}
                            >
                              {group.label}
                            </p>
                            <ol className="space-y-2 list-decimal pl-4">
                              {group.items.map((s, i) => (
                                <li key={s.key || i} className="text-xs">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="font-semibold text-[10px] opacity-80">
                                      {s.citationIndex ? `^${s.citationIndex}` : '^?'}
                                    </span>
                                    {s.url ? (
                                      <a
                                        href={s.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`text-emerald-600 hover:underline break-all ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
                                      >
                                        {s.title || 'Fonte'}
                                      </a>
                                    ) : (
                                      <span className={companyValueColor}>{s.title}</span>
                                    )}
                                  </div>
                                  {s.url && (
                                    <p className={`mt-1 text-[10px] break-all ${companyLabelColor}`}>{s.url}</p>
                                  )}
                                  {s.contexts[0] && (
                                    <p className={`mt-1 text-[10px] leading-snug ${companyLabelColor}`}>
                                      {s.contexts[0]}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ol>
                          </div>,
                        ]
                      : [],
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* ENTER ANIMATION KEYFRAMES                           */}
      {/* -------------------------------------------------- */}
      <style>{`
        @keyframes dossierViewerLiteEnter {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default DossierViewerLite;
