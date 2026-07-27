import React, { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { storageGet } from '../utils/localStorage';
import { SUPPORT_CONTACT_URL, SUPPORT_CONTACT_LABEL, PASSWORD_RECOVERY_SUPPORT_TEXT } from '../constants/support';

type Tab = 'entrar' | 'criar-conta';

interface AuthModalProps {
  showGuestOption: boolean;
  onClose: () => void;
}

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email é obrigatório.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'Email inválido.';
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Mínimo de 8 caracteres.';
  if (!/[A-Z]/.test(password)) return 'Inclua ao menos 1 letra maiúscula.';
  if (!/[0-9]/.test(password)) return 'Inclua ao menos 1 número.';
  return null;
}

export const AuthModal: React.FC<AuthModalProps> = ({ showGuestOption, onClose }) => {
  const { signIn, signUp, loading: authLoading, error: authError, clearError } = useAuth();

  const hasStoredEmail = Boolean(storageGet('operator_email')?.trim());

  const [activeTab, setActiveTab] = useState<Tab>(hasStoredEmail ? 'entrar' : 'criar-conta');
  const [email, setEmail] = useState(() => storageGet('operator_email')?.trim() || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState(() => storageGet('operator_name')?.trim() || '');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    clearError();

    const emailErr = validateEmail(email);
    if (emailErr) {
      setFieldError(emailErr);
      return;
    }

    if (!password) {
      setFieldError('Senha é obrigatória.');
      return;
    }

    if (activeTab === 'criar-conta') {
      const passErr = validatePassword(password);
      if (passErr) {
        setFieldError(passErr);
        return;
      }
      if (password !== confirmPassword) {
        setFieldError('As senhas não conferem.');
        return;
      }
      if (!name.trim()) {
        setFieldError('Nome é obrigatório.');
        return;
      }
    }

    setSubmitting(true);

    try {
      if (activeTab === 'criar-conta') {
        const { error, needsConfirmation } = await signUp(email.trim(), password, name.trim());
        if (error) {
          if (error.code === 'user_already_exists' || error.message?.includes('already registered')) {
            setFieldError('Este email já tem conta. Faça login na aba "Entrar".');
            setActiveTab('entrar');
          } else {
            setFieldError(error.message);
          }
        } else if (needsConfirmation) {
          setSuccessMessage('Conta criada! Verifique seu email para confirmar o cadastro.');
        }
        // Se não precisa de confirmação, o AuthGate fecha o modal automaticamente
      } else {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          setFieldError('Email ou senha incorretos.');
        }
        // Se login bem-sucedido, AuthGate fecha o modal automaticamente
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = submitting || authLoading;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={showGuestOption ? onClose : undefined} />
      <div className="fixed inset-0 flex items-center justify-center z-50 px-4 pointer-events-none">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-xl pointer-events-auto">
          {resetMode ? (
            <>
              <h3 className="text-lg font-bold text-white mb-1">Recuperar Senha</h3>
              <p className="text-sm text-gray-400 mb-4">{PASSWORD_RECOVERY_SUPPORT_TEXT}</p>
              <a
                href={SUPPORT_CONTACT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm text-center transition-colors"
              >
                Falar com {SUPPORT_CONTACT_LABEL}
              </a>
              <button
                onClick={() => {
                  setResetMode(false);
                  setFieldError(null);
                  setSuccessMessage(null);
                }}
                className="w-full mt-2 px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm"
              >
                ← Voltar ao login
              </button>
            </>
          ) : (
            <>
              <div className="flex border-b border-gray-700 mb-4">
                <button
                  onClick={() => {
                    setActiveTab('entrar');
                    setFieldError(null);
                  }}
                  className={`flex-1 pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'entrar'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  Entrar
                </button>
                <button
                  onClick={() => {
                    setActiveTab('criar-conta');
                    setFieldError(null);
                  }}
                  className={`flex-1 pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'criar-conta'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  Criar Conta
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {activeTab === 'criar-conta' && (
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700/50 text-white text-sm focus:outline-none focus:border-emerald-500"
                    autoFocus
                    disabled={isBusy}
                  />
                )}
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700/50 text-white text-sm focus:outline-none focus:border-emerald-500"
                  autoFocus={activeTab === 'entrar'}
                  disabled={isBusy}
                />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={
                    activeTab === 'criar-conta' ? 'Senha (min. 8 chars, 1 maiúscula, 1 número)' : 'Sua senha'
                  }
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700/50 text-white text-sm focus:outline-none focus:border-emerald-500"
                  disabled={isBusy}
                />
                {activeTab === 'criar-conta' && (
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirme sua senha"
                    className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700/50 text-white text-sm focus:outline-none focus:border-emerald-500"
                    disabled={isBusy}
                  />
                )}

                {fieldError && (
                  <div className="text-sm p-2.5 rounded-lg text-red-400 bg-red-500/10 border border-red-500/20">
                    {fieldError}
                  </div>
                )}

                {authError && !fieldError && (
                  <div className="text-sm p-2.5 rounded-lg text-red-400 bg-red-500/10 border border-red-500/20">
                    {authError.message}
                  </div>
                )}

                {successMessage && (
                  <div className="text-sm p-2.5 rounded-lg text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                    {successMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />
                      {activeTab === 'criar-conta' ? 'Criando conta...' : 'Entrando...'}
                    </span>
                  ) : activeTab === 'criar-conta' ? (
                    'Criar Conta'
                  ) : (
                    'Entrar'
                  )}
                </button>
              </form>

              {activeTab === 'entrar' && (
                <button
                  onClick={() => {
                    setResetMode(true);
                    setFieldError(null);
                    setSuccessMessage(null);
                  }}
                  className="w-full mt-2 px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm"
                >
                  Esqueci minha senha
                </button>
              )}
            </>
          )}

          {showGuestOption && !resetMode && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <button
                onClick={onClose}
                className="w-full px-4 py-2 rounded-lg border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors"
              >
                Continuar sem login
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
