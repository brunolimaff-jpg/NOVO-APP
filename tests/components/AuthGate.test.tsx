import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// ==============================================================================
// Mocks — hoisted antes de qualquer import
// ==============================================================================
const mockUseMaybeAuth = vi.hoisted(() =>
  vi.fn<() => { isGuest: boolean; loading: boolean; user: unknown } | undefined>(),
);

vi.mock('../../contexts/AuthContext', () => ({
  useMaybeAuth: mockUseMaybeAuth,
}));

vi.mock('../../components/AuthModal', () => ({
  AuthModal: ({ showGuestOption, onClose }: { showGuestOption: boolean; onClose: () => void }) => (
    <div data-testid="auth-modal" data-guest-option={String(showGuestOption)}>
      <span>AuthModal</span>
      <button onClick={onClose} data-testid="modal-close-btn">
        Fechar
      </button>
      {showGuestOption && (
        <button onClick={onClose} data-testid="continue-as-guest">
          Continuar sem login
        </button>
      )}
    </div>
  ),
}));

vi.mock('../../components/MigrationBanner', () => ({
  MigrationBanner: ({ openAuthModal }: { openAuthModal: () => void }) => (
    <div data-testid="migration-banner">
      <button onClick={openAuthModal} data-testid="banner-open-modal">
        Criar minha conta
      </button>
    </div>
  ),
}));

import { AuthGate } from '../../components/AuthGate';

// ==============================================================================
// Helpers
// ==============================================================================
const GUEST_STATE = { isGuest: true, loading: false, user: null } as const;
const AUTHENTICATED_STATE = { isGuest: false, loading: false, user: { id: 'u1' } } as const;

function renderGate() {
  return render(
    <AuthGate>
      <div data-testid="protected-content">Conteudo protegido</div>
    </AuthGate>,
  );
}

describe('AuthGate — guest e migração', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUseMaybeAuth.mockReturnValue(GUEST_STATE);
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('mostra spinner enquanto loading', () => {
    mockUseMaybeAuth.mockReturnValue({ isGuest: true, loading: true, user: null });
    renderGate();

    expect(screen.getByText('Verificando sessão...')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('guest novo sem email armazenado — modal obrigatorio sem opcao de fechar', () => {
    renderGate();

    const modal = screen.getByTestId('auth-modal');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute('data-guest-option', 'false');
    // Conteudo protegido esta visivel (modal e overlay, nao substitui children)
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    // Botao continuar sem login NAO deve existir
    expect(screen.queryByTestId('continue-as-guest')).not.toBeInTheDocument();
  });

  it('usuario legado com email antes do deadline — pode pular (showGuestOption=true)', () => {
    window.localStorage.setItem('scout360:operator_email', 'bruno@agro.com');

    renderGate();

    const modal = screen.getByTestId('auth-modal');
    expect(modal).toHaveAttribute('data-guest-option', 'true');
    expect(screen.getByTestId('continue-as-guest')).toBeInTheDocument();
  });

  it('continueAsGuest salva skip e fecha modal', () => {
    window.localStorage.setItem('scout360:operator_email', 'bruno@agro.com');

    renderGate();

    // Clicar "continuar sem login" — deve fechar modal via onClose
    fireEvent.click(screen.getByTestId('continue-as-guest'));

    // Modal some, banner aparece (guest + hasStoredEmail + dismissed)
    expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('migration-banner')).toBeInTheDocument();
    // Conteudo protegido deve aparecer junto com o banner
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    // skip deve estar salvo no localStorage
    const skipRaw = window.localStorage.getItem('scout360:auth_skip_until');
    expect(skipRaw).not.toBeNull();
    const skipDate = new Date(skipRaw!);
    expect(skipDate.getTime()).toBeGreaterThan(Date.now());
  });

  it('skip futuro antes do deadline — respeitado, modal nao aparece', () => {
    window.localStorage.setItem('scout360:operator_email', 'bruno@agro.com');
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem('scout360:auth_skip_until', future);

    renderGate();

    expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();
    // Banner deve aparecer porque tem email + dismissed
    expect(screen.getByTestId('migration-banner')).toBeInTheDocument();
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('banner abre modal — clicar no botao do banner dispara openAuthModal', () => {
    window.localStorage.setItem('scout360:operator_email', 'bruno@agro.com');
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem('scout360:auth_skip_until', future);

    renderGate();

    // Inicialmente: banner visivel, modal oculto
    expect(screen.getByTestId('migration-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();

    // Clicar no botao do banner
    fireEvent.click(screen.getByTestId('banner-open-modal'));

    // openAuthModal seta dismissed=false → modal aparece, banner some
    expect(screen.queryByTestId('migration-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('auth-modal')).toBeInTheDocument();
  });
});

describe('AuthGate — pós-deadline (guest liberado, sem lockout)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T12:00:00-03:00'));
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUseMaybeAuth.mockReturnValue(GUEST_STATE);
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('apos deadline — legado com email ainda pode continuar como guest', () => {
    window.localStorage.setItem('scout360:operator_email', 'bruno@agro.com');

    renderGate();

    const modal = screen.getByTestId('auth-modal');
    expect(modal).toHaveAttribute('data-guest-option', 'true');
    expect(screen.getByTestId('continue-as-guest')).toBeInTheDocument();
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('apos deadline — continueAsGuest funciona e exibe banner (sem bloqueio)', () => {
    window.localStorage.setItem('scout360:operator_email', 'bruno@agro.com');

    renderGate();
    fireEvent.click(screen.getByTestId('continue-as-guest'));

    expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('migration-banner')).toBeInTheDocument();
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});

describe('AuthGate — usuario autenticado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockUseMaybeAuth.mockReturnValue(AUTHENTICATED_STATE);
  });

  it('nao mostra modal nem banner — apenas children', () => {
    renderGate();

    expect(screen.queryByTestId('auth-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('migration-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });
});
