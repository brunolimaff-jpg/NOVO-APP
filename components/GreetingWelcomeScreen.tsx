import React, { useState, useCallback, useEffect } from 'react';
import { getTimeGreeting } from '../utils/timeGreeting';
import { storage } from '../services/storage';

interface GreetingWelcomeScreenProps {
  isDarkMode: boolean;
  onConfirmOperator: (name: string, email: string, existingOperatorId?: string) => void;
}

const GreetingWelcomeScreen: React.FC<GreetingWelcomeScreenProps> = ({ isDarkMode, onConfirmOperator }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [existingUser, setExistingUser] = useState<{ operatorId: string; displayName: string } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  const greeting = getTimeGreeting();
  const trimmed = name.trim();
  const trimmedEmail = email.trim();
  const nameWords = trimmed.split(/\s+/).filter(w => w.length >= 2);
  const isNameValid = nameWords.length >= 2;
  const isEmailValid = trimmedEmail.endsWith('@senior.com.br') && trimmedEmail.length > '@senior.com.br'.length;
  const isValid = isNameValid && isEmailValid;
  const showNameError = touched && !isNameValid && trimmed.length > 0;
  const showEmailError = touched && trimmedEmail.length > 0 && !isEmailValid;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTouched(true);
      if (isValid) {
        onConfirmOperator(trimmed, trimmedEmail);
      }
    },
    [isValid, trimmed, trimmedEmail, onConfirmOperator],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        setTouched(true);
        if (isValid) onConfirmOperator(trimmed, trimmedEmail);
      }
    },
    [isValid, trimmed, trimmedEmail, onConfirmOperator],
  );

  const checkEmailExists = useCallback(() => {
    if (!isEmailValid) return;
    const emailToCheck = trimmedEmail;
    setCheckingEmail(true);
    storage.findUserByEmail(emailToCheck).then((found) => {
      if (emailToCheck === trimmedEmail) {
        setExistingUser(found);
      }
    }).catch(() => {
      if (emailToCheck === trimmedEmail) {
        setExistingUser(null);
      }
    }).finally(() => {
      if (emailToCheck === trimmedEmail) {
        setCheckingEmail(false);
      }
    });
  }, [isEmailValid, trimmedEmail]);

  useEffect(() => {
    checkEmailExists();
  }, [checkEmailExists]);

  const handleLink = useCallback(() => {
    if (existingUser) {
      onConfirmOperator(trimmed, trimmedEmail, existingUser.operatorId);
    }
  }, [existingUser, trimmed, trimmedEmail, onConfirmOperator]);

  const handleCreateNew = useCallback(() => {
    setExistingUser(null);
    onConfirmOperator(trimmed, trimmedEmail);
  }, [trimmed, trimmedEmail, onConfirmOperator]);

  const pageBg = isDarkMode ? 'bg-slate-950' : 'bg-slate-50/90';
  const textPrimary = isDarkMode ? 'text-white' : 'text-slate-900';
  const textSecondary = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = isDarkMode ? 'bg-slate-900/80' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-slate-700/80' : 'border-slate-200';
  const getInputClass = (hasError: boolean) => `w-full rounded-md border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-600 ${
    isDarkMode
      ? 'border-slate-600 bg-slate-950/50 text-slate-100 placeholder:text-slate-500'
      : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
  } ${hasError ? 'border-red-500 focus:ring-red-500/25 focus:border-red-500' : ''}`;

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
          Seu nome e email para salvar seus dossiês e acessá-los em qualquer dispositivo.
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

          {existingUser ? (
            <div className="px-5 py-6">
              <div className={`text-sm ${textPrimary}`}>
                <p className="font-medium">Já existe um cadastro com este email.</p>
                <p className={`mt-1 text-xs ${textSecondary}`}>{trimmedEmail}</p>
                {existingUser.displayName && (
                  <p className={`mt-2 text-xs ${textSecondary}`}>
                    Nome cadastrado: <span className="font-medium">{existingUser.displayName}</span>
                  </p>
                )}
              </div>
              <div className="mt-6 space-y-3">
                <button
                  data-testid="greeting-link-button"
                  type="button"
                  onClick={handleLink}
                  className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  Vincular este dispositivo
                </button>
                <button
                  data-testid="greeting-create-new-button"
                  type="button"
                  onClick={handleCreateNew}
                  className={`w-full rounded-md border px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400/50 ${isDarkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  Criar novo cadastro
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="px-5 py-6" noValidate>
              <div className="space-y-4">
                {/* Campo Nome */}
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
                    placeholder="Nome e sobrenome"
                    aria-describedby={showNameError ? 'greeting-name-error' : undefined}
                    aria-invalid={showNameError}
                    className={getInputClass(showNameError)}
                  />
                  <div aria-live="polite" className="min-h-[1.25rem]">
                    {showNameError && (
                      <p id="greeting-name-error" className="text-xs text-red-500 dark:text-red-400">
                        Digite nome e sobrenome para continuar.
                      </p>
                    )}
                  </div>
                </div>

                {/* Campo Email */}
                <div className="space-y-1">
                  <label
                    htmlFor="greeting-email-input"
                    className={`block text-sm font-medium ${textPrimary}`}
                  >
                    Seu email
                  </label>
                  <input
                    id="greeting-email-input"
                    data-testid="greeting-email-input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (existingUser) setExistingUser(null);
                    }}
                    onBlur={() => {
                      setTouched(true);
                      checkEmailExists();
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="seu.nome@senior.com.br"
                    aria-describedby={showEmailError ? 'greeting-email-error' : undefined}
                    aria-invalid={showEmailError}
                    className={getInputClass(showEmailError)}
                  />
                  <div aria-live="polite" className="min-h-[1.25rem]">
                    {showEmailError && (
                      <p id="greeting-email-error" className="text-xs text-red-500 dark:text-red-400">
                        Use seu email @senior.com.br.
                      </p>
                    )}
                    {checkingEmail && (
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        Verificando email...
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <button
                data-testid="greeting-submit-button"
                type="submit"
                disabled={touched && !isValid}
                className="mt-5 w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continuar →
              </button>
            </form>
          )}
        </div>

        <p className={`mt-6 text-center text-xs ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
          Salvo com segurança no Scout 360. Acesse seus dossiês em qualquer dispositivo.
        </p>
      </div>
    </div>
  );
};

export default GreetingWelcomeScreen;
