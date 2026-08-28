import React, { useState } from 'react';

const GPT_SCOUT_URL = 'https://chatgpt.com/g/g-6a4e4ef8f62c81919ad14a9f981b6aab-senior-scout-360';
const DISMISS_KEY = 'scout-contingencia-banner-fechado';

/**
 * Aviso de contingência (fornecedor de IA fora do ar).
 * Comunicação para o operador: o problema é externo (fornecedor), os dossiês
 * seguem nos canais oficiais (Copilot Senior e GPT Senior Scout 360).
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
    <div className="fixed top-0 inset-x-0 z-[101] bg-amber-500/10 border-b border-amber-500/30 px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-200">O problema não é você. Nem eu.</p>
          <p className="text-sm text-amber-100/90 mt-0.5">
            O fornecedor de IA que alimenta os dossiês está fora do ar. Seus dossiês seguem de pé no{' '}
            <a
              href={GPT_SCOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
            >
              GPT Senior Scout 360
            </a>{' '}
            e no Copilot (Senior). Use só esses dois: o site pode até abrir, mas vai devolver resultado meio estranho.
          </p>
          <p className="text-xs text-amber-100/70 mt-1">Avisamos por aqui quando o fornecedor voltar.</p>
        </div>
        <button
          onClick={handleClose}
          aria-label="Fechar aviso"
          className="shrink-0 text-amber-200/70 hover:text-amber-100 transition-colors p-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};
