import React, { useState } from 'react';

const GPT_SCOUT_URL = 'https://chatgpt.com/g/g-6a4e4ef8f62c81919ad14a9f981b6aab-senior-scout-360';
const DISMISS_KEY = 'scout-contingencia-banner-fechado';

/**
 * Aviso de contingência (fornecedor de IA fora do ar).
 * Estático no topo do fluxo (empurra o conteúdo, não cobre nada) e compacto.
 * Tema claro e escuro suportados via variantes dark:.
 */
export const ContingencyBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const handleClose = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage indisponível: só não persiste o fechamento */
    }
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/30 px-3 sm:px-4 py-2">
      <div className="max-w-5xl mx-auto flex items-center gap-2">
        <p className="flex-1 min-w-0 text-xs sm:text-[13px] leading-snug text-amber-900 dark:text-amber-200">
          O fornecedor de IA que alimenta os dossiês está fora do ar. Use só o{' '}
          <a
            href={GPT_SCOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-700 dark:text-emerald-300 underline underline-offset-2 hover:text-emerald-600 dark:hover:text-emerald-200"
          >
            GPT Senior Scout 360
          </a>{' '}
          ou o Copilot (Senior). Avisamos aqui quando o fornecedor voltar.
        </p>
        <button
          onClick={handleClose}
          aria-label="Fechar aviso"
          className="shrink-0 text-amber-500 hover:text-amber-700 dark:text-amber-300/70 dark:hover:text-amber-200 transition-colors p-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};
