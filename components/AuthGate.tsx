import React, { type ReactNode } from 'react';
import { useAuthGate } from '../hooks/useAuthGate';
import { AuthModal } from './AuthModal';
import { MigrationBanner } from './MigrationBanner';
import { ContingencyBanner } from './ContingencyBanner';

interface AuthGateProps {
  children: ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const { showAuthModal, showBanner, canSkip, checking, openAuthModal, closeAuthModal, continueAsGuest } =
    useAuthGate();

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
      initialTab="entrar"
    />
  ) : null;

  // Quando a autenticação é obrigatória, o modal precisa ser a tela inteira.
  // Montar children em paralelo deixa o onboarding ativo por baixo e permite
  // consultas/persistências pre-auth antes de auth.uid() existir.
  const mandatoryAuth = showAuthModal && !canSkip;
  if (mandatoryAuth) {
    return <>{authModal}</>;
  }

  return (
    <>
      <ContingencyBanner />
      {authModal}
      {showBanner && <MigrationBanner openAuthModal={openAuthModal} />}
      {children}
    </>
  );
};
