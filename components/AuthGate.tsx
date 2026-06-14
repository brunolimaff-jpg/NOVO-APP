import React, { type ReactNode } from 'react';
import { useAuthGate } from '../hooks/useAuthGate';
import { AuthModal } from './AuthModal';
import { MigrationBanner } from './MigrationBanner';

interface AuthGateProps {
  children: ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const {
    showAuthModal,
    showBanner,
    canSkip,
    checking,
    pastDeadline,
    isGuest,
    hasStoredEmail,
    openAuthModal,
    closeAuthModal,
    continueAsGuest,
  } = useAuthGate();

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Verificando sessão...</span>
        </div>
      </div>
    );
  }

  const authModal = showAuthModal ? (
    <AuthModal
      showGuestOption={canSkip}
      onClose={
        canSkip
          ? () => {
              continueAsGuest();
              closeAuthModal();
            }
          : () => {
              /* novos usuários não podem fechar */
            }
      }
    />
  ) : null;

  // Apos prazo: bloquear acesso para usuarios nao autenticados
  if (pastDeadline && isGuest) {
    if (!hasStoredEmail) {
      return (
        <>
          <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
            <div className="max-w-md text-center space-y-4">
              <h1 className="text-xl font-semibold text-gray-100">Acesso temporariamente bloqueado</h1>
              <p className="text-sm text-gray-400 leading-relaxed">
                O prazo de migração se encerrou. Para continuar usando o Senior Scout 360,
                crie sua conta com e-mail e senha.
              </p>
              <button
                onClick={openAuthModal}
                className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-medium transition-colors"
              >
                Criar minha conta agora
              </button>
            </div>
          </div>
          {authModal}
        </>
      );
    }

    return (
      <>
        <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-xl font-semibold text-gray-100">Recuperação de acesso</h1>
            <p className="text-sm text-gray-400 leading-relaxed">
              Identificamos seu e-mail nos nossos registros. Para continuar usando o
              Senior Scout 360, crie uma senha para sua conta.
            </p>
            <button
              onClick={openAuthModal}
              className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-medium transition-colors"
            >
              Criar minha senha
            </button>
          </div>
        </div>
        {authModal}
      </>
    );
  }

  return (
    <>
      {authModal}
      {showBanner && <MigrationBanner openAuthModal={openAuthModal} />}
      {children}
    </>
  );
};
