import React, { useEffect, useState } from 'react';
import { HELP_CENTER_FAQS } from '../config/helpCenterContent';

interface HelpCenterFloatingProps {
  isDarkMode: boolean;
}

const HELP_PANEL_ID = 'scout-help-center-panel';

/* ── Constantes de estilo ─────────────────────────────────── */

const PANEL_POSITION_CLASS =
  'fixed inset-x-4 bottom-36 max-h-[min(620px,calc(100dvh-12rem))] overflow-hidden rounded-lg border sm:left-auto sm:right-6 sm:bottom-44 sm:w-[420px]';
const HELP_PANEL_TITLE_CLASS =
  'text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400';
const CONTENT_WRAPPER_CLASS = 'max-h-[calc(min(620px,100dvh-12rem)-92px)] overflow-y-auto px-4 py-4';
const BADGE_NUMBER_CLASS = 'mr-2 text-xs font-bold text-emerald-700 dark:text-emerald-400';
const EXPANDED_ICON_CLASS = 'text-lg leading-none text-emerald-700 dark:text-emerald-400';
const FAB_BUTTON_CLASS =
  'flex min-h-14 min-w-14 items-center justify-center rounded-lg bg-emerald-700 p-4 text-white shadow-xl shadow-emerald-900/20 transition-colors hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950';
const FAB_HELP_ICON_SIZE = 'h-6 w-6';

/* ── Helpers de cor (dark mode) ───────────────────────────── */

const panelClass = (dm: boolean) =>
  dm
    ? 'border-slate-700 bg-slate-950 text-slate-100 shadow-2xl shadow-black/40'
    : 'border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-900/15';
const mutedText = (dm: boolean) => (dm ? 'text-slate-400' : 'text-slate-600');
const questionClass = (dm: boolean) =>
  dm
    ? 'border-slate-800 bg-slate-900 text-slate-100 hover:border-emerald-500/60 hover:bg-slate-800'
    : 'border-slate-200 bg-white text-slate-900 hover:border-emerald-500/60 hover:bg-emerald-50';
const answerClass = (dm: boolean) =>
  dm ? 'border-slate-800 bg-slate-950/70 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700';
const secondaryButton = (dm: boolean) =>
  dm
    ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
const sectionDivider = (dm: boolean) => (dm ? 'border-slate-800' : 'border-slate-200');

/* ── Ícones inline ────────────────────────────────────────── */

const HelpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M9.75 9.5a2.25 2.25 0 114.12 1.25c-.78.86-1.87 1.2-1.87 2.5" />
    <path d="M12 17h.01" />
  </svg>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

/* ── Componente principal ─────────────────────────────────── */

export const HelpCenterFloating: React.FC<HelpCenterFloatingProps> = ({ isDarkMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="fixed bottom-20 right-4 z-[70] sm:bottom-24 sm:right-6">
      {isOpen && (
        <section
          id={HELP_PANEL_ID}
          role="dialog"
          aria-modal="false"
          aria-labelledby="scout-help-center-title"
          className={`${PANEL_POSITION_CLASS} ${panelClass(isDarkMode)}`}
        >
          <div className={`flex items-start justify-between gap-4 border-b px-4 py-3 ${sectionDivider(isDarkMode)}`}>
            <div>
              <p className={HELP_PANEL_TITLE_CLASS}>Ajuda do Scout</p>
              <h2 id="scout-help-center-title" className="mt-1 text-base font-bold">
                Perguntas frequentes
              </h2>
              <p className={`mt-1 text-xs leading-relaxed ${mutedText(isDarkMode)}`}>
                Dúvidas rápidas sobre uso, fases, recursos e limites do Senior Scout 360.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className={`min-h-11 min-w-11 rounded-md p-2 transition-colors ${secondaryButton(isDarkMode)}`}
              aria-label="Fechar ajuda"
            >
              <CloseIcon className="mx-auto h-5 w-5" />
            </button>
          </div>

          <div className={CONTENT_WRAPPER_CLASS}>
            <div className="space-y-2">
              {HELP_CENTER_FAQS.map((faq, index) => {
                const isExpanded = openQuestionId === faq.id;
                const answerId = `help-center-answer-${faq.id}`;

                return (
                  <div key={faq.id}>
                    <button
                      type="button"
                      onClick={() => setOpenQuestionId(isExpanded ? null : faq.id)}
                      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm font-semibold leading-snug transition-colors ${questionClass(isDarkMode)}`}
                      aria-expanded={isExpanded}
                      aria-controls={answerId}
                    >
                      <span>
                        <span className={BADGE_NUMBER_CLASS}>{String(index + 1).padStart(2, '0')}</span>
                        {faq.question}
                      </span>
                      <span className={EXPANDED_ICON_CLASS} aria-hidden="true">
                        {isExpanded ? '-' : '+'}
                      </span>
                    </button>
                    {isExpanded && (
                      <div
                        id={answerId}
                        className={`mt-1 rounded-md border px-3 py-3 text-sm leading-relaxed ${answerClass(isDarkMode)}`}
                      >
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={FAB_BUTTON_CLASS}
        aria-label={isOpen ? 'Fechar ajuda do Scout' : 'Abrir ajuda do Scout'}
        aria-expanded={isOpen}
        aria-controls={HELP_PANEL_ID}
      >
        <HelpIcon className={FAB_HELP_ICON_SIZE} />
        <span className="sr-only">Ajuda</span>
      </button>
    </div>
  );
};

export default HelpCenterFloating;
