import React, { useState, useEffect } from 'react';
import { useAuthGate } from '../hooks/useAuthGate';

const DEADLINE = new Date('2026-06-18T23:59:59-03:00');

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export const MigrationBanner: React.FC = () => {
  const { openAuthModal } = useAuthGate();
  const [remaining, setRemaining] = useState(() => daysUntil(DEADLINE));

  useEffect(() => {
    const t = setInterval(() => setRemaining(daysUntil(DEADLINE)), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-amber-200">
          {remaining > 0
            ? `Faltam ${remaining} dia${remaining > 1 ? 's' : ''} para o prazo de migração. `
            : 'Último dia! '}
          Cadastre sua senha para não perder o acesso aos seus dados.
        </p>
        <button
          onClick={openAuthModal}
          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-900 text-sm font-medium transition-colors whitespace-nowrap"
        >
          Criar minha conta
        </button>
      </div>
    </div>
  );
};
