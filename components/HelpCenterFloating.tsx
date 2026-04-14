import React, { useEffect, useMemo, useState } from 'react';
import {
  HELP_CENTER_REFUSAL_MESSAGE,
  HELP_CENTER_SECTIONS,
  type HelpCenterQuestion,
} from '../config/helpCenterContent';
import { buildHelpAssistantPrompt } from '../prompts/helpAssistantPrompt';
import {
  isHelpCenterAllowedQuestion,
  normalizeHelpCenterQuestion,
  type HelpCenterGuardrailResult,
} from '../utils/helpCenterGuardrails';

interface HelpCenterFloatingProps {
  isDarkMode: boolean;
  onAskScout: (prompt: string, displayText: string) => void;
}

const HELP_PANEL_ID = 'scout-help-center-panel';

function getQuestionSearchText(question: HelpCenterQuestion): string {
  return normalizeHelpCenterQuestion(
    [
      question.question,
      question.answer,
      question.tags.join(' '),
      question.allowedIntents.join(' '),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function buildFallbackQuestion(text: string): HelpCenterQuestion {
  return {
    id: 'custom-help-question',
    question: text,
    answer:
      'Essa duvida esta dentro do uso do Scout. Use os blocos do guia para uma resposta rapida ou aprofunde no Scout para receber uma explicacao contextual.',
    tags: ['duvida', 'scout', 'uso'],
    allowedIntents: ['usage'],
    deepDivePrompt: text,
  };
}

const HelpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.75 9.5a2.25 2.25 0 114.12 1.25c-.78.86-1.87 1.2-1.87 2.5" />
    <path d="M12 17h.01" />
  </svg>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const SendIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

export const HelpCenterFloating: React.FC<HelpCenterFloatingProps> = ({ isDarkMode, onAskScout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState<HelpCenterQuestion | null>(
    HELP_CENTER_SECTIONS[0]?.questions[0] ?? null,
  );
  const [guardrailResult, setGuardrailResult] = useState<HelpCenterGuardrailResult | null>(null);

  const allQuestions = useMemo(
    () =>
      HELP_CENTER_SECTIONS.flatMap(section =>
        section.questions.map(question => ({
          question,
          searchText: getQuestionSearchText(question),
        })),
      ),
    [],
  );

  const normalizedQuery = normalizeHelpCenterQuestion(query);
  const filteredQuestions = useMemo(() => {
    if (!normalizedQuery) return allQuestions;
    return allQuestions.filter(item => item.searchText.includes(normalizedQuery));
  }, [allQuestions, normalizedQuery]);

  const hasValidSelectedQuestion =
    !!selectedQuestion && isHelpCenterAllowedQuestion(selectedQuestion.question).allowed;

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

  const selectQuestion = (question: HelpCenterQuestion) => {
    setSelectedQuestion(question);
    setGuardrailResult(null);
  };

  const findBestQuestion = (): HelpCenterQuestion | null => {
    if (!normalizedQuery) return null;
    const directMatch = filteredQuestions[0]?.question;
    if (directMatch) return directMatch;

    const tokenMatch = allQuestions.find(({ question }) =>
      question.tags.some(tag => normalizedQuery.includes(normalizeHelpCenterQuestion(tag))),
    );
    return tokenMatch?.question ?? null;
  };

  const handleLocalAnswer = () => {
    const result = isHelpCenterAllowedQuestion(query);
    if (!result.allowed) {
      setGuardrailResult(result);
      setSelectedQuestion(null);
      return;
    }

    const bestQuestion = findBestQuestion() ?? buildFallbackQuestion(query.trim());
    setSelectedQuestion(bestQuestion);
    setGuardrailResult(null);
  };

  const handleAskScout = () => {
    if (!selectedQuestion || !hasValidSelectedQuestion) return;
    const prompt = buildHelpAssistantPrompt(selectedQuestion.deepDivePrompt || selectedQuestion.question);
    onAskScout(prompt, `Quero entender melhor: ${selectedQuestion.question}`);
    setIsOpen(false);
  };

  const panelClass = isDarkMode
    ? 'border-slate-700 bg-slate-950 text-slate-100 shadow-2xl shadow-black/40'
    : 'border-slate-200 bg-white text-slate-900 shadow-2xl shadow-slate-900/15';
  const mutedText = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const softSurface = isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200';
  const inputClass = isDarkMode
    ? 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20'
    : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-emerald-600/20';
  const buttonSecondary = isDarkMode
    ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';

  return (
    <div className="fixed bottom-5 right-4 z-[70] sm:bottom-6 sm:right-6">
      {isOpen && (
        <section
          id={HELP_PANEL_ID}
          role="dialog"
          aria-modal="false"
          aria-labelledby="scout-help-center-title"
          className={`fixed inset-x-4 bottom-20 max-h-[min(720px,calc(100dvh-7rem))] overflow-hidden rounded-lg border sm:left-auto sm:right-6 sm:w-[420px] ${panelClass}`}
        >
          <div className={`flex items-start justify-between gap-4 border-b px-4 py-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
                Guia rapido
              </p>
              <h2 id="scout-help-center-title" className="mt-1 text-base font-bold">
                Entenda o Senior Scout 360
              </h2>
              <p className={`mt-1 text-xs leading-relaxed ${mutedText}`}>
                Fases, features, limites e uso correto em uma leitura direta.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className={`min-h-11 min-w-11 rounded-md p-2 transition-colors ${buttonSecondary}`}
              aria-label="Fechar ajuda"
            >
              <CloseIcon className="mx-auto h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[calc(min(720px,100dvh-7rem)-96px)] overflow-y-auto px-4 py-4">
            <div className="space-y-3">
              <label htmlFor="help-center-search" className="block text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Pergunte sobre o Scout
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="help-center-search"
                  value={query}
                  onChange={event => {
                    setQuery(event.target.value);
                    setGuardrailResult(null);
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleLocalAnswer();
                    }
                  }}
                  placeholder="Ex: Quais sao as fases?"
                  className={`min-h-11 flex-1 rounded-md border px-3 py-2 text-sm outline-none transition focus:ring-2 ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={handleLocalAnswer}
                  className="min-h-11 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950"
                >
                  Responder
                </button>
              </div>
            </div>

            {guardrailResult && !guardrailResult.allowed && (
              <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                {guardrailResult.suggestedRedirect || HELP_CENTER_REFUSAL_MESSAGE}
              </div>
            )}

            <div className="mt-5 space-y-3">
              {HELP_CENTER_SECTIONS.map(section => (
                <section key={section.id} className={`rounded-md border px-3 py-3 ${softSurface}`}>
                  <h3 className="text-sm font-bold">{section.title}</h3>
                  <p className={`mt-1 text-xs leading-relaxed ${mutedText}`}>{section.summary}</p>
                </section>
              ))}
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Perguntas prontas
              </h3>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {(normalizedQuery ? filteredQuestions : allQuestions).slice(0, 8).map(({ question }) => (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => selectQuestion(question)}
                    className={`min-h-11 rounded-md border px-3 py-2 text-left text-sm leading-snug transition-colors ${buttonSecondary}`}
                  >
                    {question.question}
                  </button>
                ))}
              </div>
              {normalizedQuery && filteredQuestions.length === 0 && !guardrailResult && (
                <p className={`mt-2 text-xs ${mutedText}`}>
                  Nenhuma pergunta pronta encontrada. Se for sobre o Scout, clique em Responder.
                </p>
              )}
            </div>

            {selectedQuestion && (
              <article className={`mt-5 rounded-md border px-4 py-4 ${isDarkMode ? 'border-emerald-700/50 bg-emerald-950/20' : 'border-emerald-200 bg-emerald-50'}`}>
                <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-100">{selectedQuestion.question}</h3>
                <p className="mt-2 text-sm leading-relaxed text-emerald-950 dark:text-emerald-100">
                  {selectedQuestion.answer}
                </p>
                {hasValidSelectedQuestion && (
                  <button
                    type="button"
                    onClick={handleAskScout}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950"
                  >
                    Aprofundar no Scout
                    <SendIcon className="h-4 w-4" />
                  </button>
                )}
              </article>
            )}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="flex min-h-14 min-w-14 items-center justify-center rounded-lg bg-emerald-700 p-4 text-white shadow-xl shadow-emerald-900/20 transition-colors hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950"
        aria-label={isOpen ? 'Fechar ajuda do Scout' : 'Abrir ajuda do Scout'}
        aria-expanded={isOpen}
        aria-controls={HELP_PANEL_ID}
      >
        <HelpIcon className="h-6 w-6" />
        <span className="sr-only">Ajuda</span>
      </button>
    </div>
  );
};

export default HelpCenterFloating;
