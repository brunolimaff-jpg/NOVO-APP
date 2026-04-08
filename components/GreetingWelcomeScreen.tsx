import React, { useState, useCallback } from 'react';
import { getTimeGreeting } from '../utils/timeGreeting';

interface GreetingWelcomeScreenProps {
  isDarkMode: boolean;
  onConfirmName: (name: string) => void;
}

const GreetingWelcomeScreen: React.FC<GreetingWelcomeScreenProps> = ({ isDarkMode, onConfirmName }) => {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const greeting = getTimeGreeting();
  const trimmed = name.trim();
  const isValid = trimmed.length >= 2;
  const showError = touched && !isValid;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTouched(true);
      if (isValid) {
        onConfirmName(trimmed);
      }
    },
    [isValid, trimmed, onConfirmName],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        setTouched(true);
        if (isValid) onConfirmName(trimmed);
      }
    },
    [isValid, trimmed, onConfirmName],
  );

  const pageBg = isDarkMode ? 'bg-slate-950' : 'bg-slate-50/90';
  const textPrimary = isDarkMode ? 'text-white' : 'text-slate-900';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDarkMode ? 'bg-slate-900/80' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-slate-700/80' : 'border-slate-200';
  const inputClass = `w-full rounded-md border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-600 ${
    isDarkMode
      ? 'border-slate-600 bg-slate-950/50 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
  } ${showError ? 'border-red-500 focus:ring-red-500/25 focus:border-red-500' : ''}`;

  return (
    <div className={`animate-fade-in flex min-h-full w-full flex-col items-center justify-center ${pageBg}`}>
      {/* Barra de acento superior */}
      <div
        className="absolute top-0 left-0 h-0.5 w-full bg-gradient-to-r from-emerald-800 via-emerald-600 to-teal-500"
        aria-hidden
      />

      <div className="mx-auto w-full max-w-md px-6 py-16">
        {/* Saudação por horário */}
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-500 dark:text-emerald-400">
          Senior Scout 360
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-emerald-400 dark:text-emerald-300 md:text-5xl">
          {greeting}!
        </h1>
        <p className={`mt-3 text-lg font-medium ${textPrimary}`}>
          Inteligência de campo para fechar negócios no Agro.
        </p>
        <p className={`mt-1 text-sm ${textSecondary}`}>
          Me diz como te chamo e vamos à caça.
        </p>

        {/* Card com formulário */}
        <div
          data-testid="greeting-card"
          className={`mt-8 overflow-hidden rounded-xl border shadow-sm ${cardBorder} ${cardBg} border-l-[3px] border-l-emerald-600 dark:border-l-emerald-500`}
        >
          <div
            className={`border-b px-5 py-4 ${isDarkMode ? 'border-slate-700/80 bg-slate-900' : 'border-slate-200 bg-slate-50/80'}`}
          >
            <h2 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              Quem está na missão?
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-6" noValidate>
            <div className="space-y-1">
              <label
                htmlFor="greeting-name-input"
                className={`block text-sm font-medium ${textPrimary}`}
              >
                Seu nome
              </label>
              <input
                id="greeting-name-input"
                data-testid="greeting-name-input"
                type="text"
                autoFocus
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                onKeyDown={handleKeyDown}
                placeholder="Nome ou apelido"
                aria-describedby={showError ? 'greeting-name-error' : undefined}
                aria-invalid={showError}
                className={inputClass}
              />
              <div aria-live="polite" className="min-h-[1.25rem]">
                {showError && (
                  <p id="greeting-name-error" className="text-xs text-red-500 dark:text-red-400">
                    Digite pelo menos 2 caracteres para continuar.
                  </p>
                )}
              </div>
            </div>

            <button
              data-testid="greeting-submit-button"
              type="submit"
              disabled={touched && !isValid}
              className="mt-4 w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Entrar em campo →
            </button>
          </form>
        </div>

        <p className={`mt-6 text-center text-xs ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
          Salvo localmente — apenas neste dispositivo.
        </p>
      </div>
    </div>
  );
};

export default GreetingWelcomeScreen;
