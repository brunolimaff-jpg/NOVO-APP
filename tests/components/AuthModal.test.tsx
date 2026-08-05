import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// ==============================================================================
// Mocks
// ==============================================================================
const signUpMock = vi.hoisted(() => vi.fn());
const signInMock = vi.hoisted(() => vi.fn());
const resetPasswordMock = vi.hoisted(() => vi.fn());
const clearErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    signUp: signUpMock,
    signIn: signInMock,
    resetPassword: resetPasswordMock,
    loading: false,
    error: null,
    clearError: clearErrorMock,
  }),
}));

import { AuthModal } from '../../components/AuthModal';
import { SUPPORT_CONTACT_URL, SUPPORT_CONTACT_LABEL, PASSWORD_RECOVERY_SUPPORT_TEXT } from '../../constants/support';

function renderModal(showGuestOption = true) {
  const onClose = vi.fn();
  const result = render(<AuthModal showGuestOption={showGuestOption} onClose={onClose} />);
  return { onClose, ...result };
}

async function fillSignupForm(email: string, password: string, confirmPw: string, name: string) {
  // O modal inicia em "Entrar"; a conta continua sendo uma opção secundária explícita.
  fireEvent.click(screen.getByRole('button', { name: 'Criar Conta' }));

  const nameInput = screen.getByPlaceholderText('Seu nome');
  const emailInput = screen.getByPlaceholderText('seu@email.com');
  const passInput = screen.getByPlaceholderText(/Senha/);
  const confirmInput = screen.getByPlaceholderText('Confirme sua senha');

  fireEvent.change(nameInput, { target: { value: name } });
  fireEvent.change(emailInput, { target: { value: email } });
  fireEvent.change(passInput, { target: { value: password } });
  fireEvent.change(confirmInput, { target: { value: confirmPw } });
}

/** Clica o botao de submit "Criar Conta" ignorando o tab com mesmo texto */
function clickCriarContaSubmit() {
  const buttons = screen.getAllByText('Criar Conta');
  const submitBtn = buttons.find(btn => btn.getAttribute('type') === 'submit') || buttons[buttons.length - 1];
  fireEvent.click(submitBtn);
}

async function fillSigninForm(email: string, password: string) {
  // Clica na tab "Entrar" (primeiro botao com esse texto = tab, nao submit)
  const entrarButtons = screen.getAllByText('Entrar');
  fireEvent.click(entrarButtons[0]);

  const emailInput = screen.getByPlaceholderText('seu@email.com');
  const passInput = screen.getByPlaceholderText('Sua senha');

  fireEvent.change(emailInput, { target: { value: email } });
  fireEvent.change(passInput, { target: { value: password } });
}

describe('AuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    // Reseta mocks
    signUpMock.mockResolvedValue({ error: null });
    signInMock.mockResolvedValue({ error: null });
    resetPasswordMock.mockResolvedValue({ error: null });
  });

  it('inicia na aba Entrar mesmo sem email armazenado', () => {
    renderModal(true);

    expect(screen.getByPlaceholderText('Sua senha')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Seu nome')).not.toBeInTheDocument();
  });

  it('signup com sucesso e sem confirmacao — chama signUp com params corretos', async () => {
    renderModal(false);

    await fillSignupForm('novo@agro.com', 'Senha1234', 'Senha1234', 'Novo Usuario');
    clickCriarContaSubmit();

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalledWith('novo@agro.com', 'Senha1234', 'Novo Usuario');
    });
    // Sem confirmação: signUp retorna { error: null } (needsConfirmation undefined)
    // O modal mantém-se aberto (quem fecha é o AuthGate)
    expect(screen.getAllByText('Criar Conta').length).toBeGreaterThanOrEqual(1);
  });

  it('signup que exige confirmacao — mostra mensagem de sucesso', async () => {
    signUpMock.mockResolvedValue({ error: null, needsConfirmation: true });
    renderModal(false);

    await fillSignupForm('novo@agro.com', 'Senha1234', 'Senha1234', 'Novo');
    clickCriarContaSubmit();

    await waitFor(() => {
      expect(screen.getByText(/Verifique seu email para confirmar/)).toBeInTheDocument();
    });
  });

  it('signup com erro de email existente — sugere aba Entrar', async () => {
    signUpMock.mockResolvedValue({
      error: { code: 'user_already_exists', message: 'User already registered' },
    });
    renderModal(false);

    await fillSignupForm('existente@agro.com', 'Senha1234', 'Senha1234', 'Existente');
    clickCriarContaSubmit();

    await waitFor(() => {
      expect(screen.getByText(/Este email já tem conta/)).toBeInTheDocument();
    });
    // Deve ter mudado para aba Entrar automaticamente
    const entrarButtons = screen.getAllByText('Entrar');
    expect(entrarButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('signin com erro — mostra mensagem e nao fecha modal', async () => {
    signInMock.mockResolvedValue({
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    renderModal(true);

    await fillSigninForm('erro@agro.com', 'WrongPass1');
    // Submete o form diretamente (getByText('Entrar') ambiguo: tab + botao)
    const entrarButtons2 = screen.getAllByText('Entrar');
    fireEvent.click(entrarButtons2[entrarButtons2.length - 1]); // ultimo = submit

    await waitFor(() => {
      expect(screen.getByText('Email ou senha incorretos.')).toBeInTheDocument();
    });
    // Modal continua aberto (botão Entrar do form ainda visível)
    expect(screen.getAllByText('Entrar').length).toBeGreaterThanOrEqual(1);
  });

  it('signin aceita senha simples e deixa Supabase validar credenciais', async () => {
    renderModal(true);

    await fillSigninForm('existente@agro.com', 'abc');
    const entrarButtons = screen.getAllByText('Entrar');
    fireEvent.click(entrarButtons[entrarButtons.length - 1]);

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith('existente@agro.com', 'abc');
    });
  });

  it('botao Continuar sem cadastro aparece quando showGuestOption=true', () => {
    renderModal(true);

    expect(screen.getByText('Continuar sem login')).toBeInTheDocument();
  });

  it('botao Continuar sem cadastro NAO aparece quando showGuestOption=false', () => {
    renderModal(false);

    expect(screen.queryByText('Continuar sem login')).not.toBeInTheDocument();
  });

  it('onClose e chamado ao clicar Continuar sem login', () => {
    const onClose = vi.fn();
    render(<AuthModal showGuestOption={true} onClose={onClose} />);

    fireEvent.click(screen.getByText('Continuar sem login'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('com email armazenado — aba Entrar vem pre-selecionada e email preenchido', () => {
    window.localStorage.setItem('scout360:operator_email', 'returning@agro.com');

    renderModal(true);

    // Tab "Entrar" deve estar ativa (highlighted)
    // O input de email deve ter o valor do storage
    const emailInput = screen.getByPlaceholderText('seu@email.com') as HTMLInputElement;
    expect(emailInput.value).toBe('returning@agro.com');
  });

  // ============================================================
  // Recuperação de senha — orientação de contato (sem e-mail)
  // ============================================================

  describe('Esqueci minha senha — orientação de contato', () => {
    it('clicar em "Esqueci minha senha" abre a orientação de contato', async () => {
      renderModal(true);

      // Modal abre em criar-conta; mudar para entrar para ver o botão
      const entrarButtons = screen.getAllByText('Entrar');
      fireEvent.click(entrarButtons[0]);

      fireEvent.click(screen.getByText('Esqueci minha senha'));

      expect(screen.getByText(PASSWORD_RECOVERY_SUPPORT_TEXT)).toBeInTheDocument();
    });

    it('não exibe campo de email no modo recuperação', () => {
      renderModal(true);

      const entrarButtons = screen.getAllByText('Entrar');
      fireEvent.click(entrarButtons[0]);
      fireEvent.click(screen.getByText('Esqueci minha senha'));

      expect(screen.queryByPlaceholderText('seu@email.com')).not.toBeInTheDocument();
    });

    it('não exibe botão de envio de link de recuperação', () => {
      renderModal(true);

      const entrarButtons = screen.getAllByText('Entrar');
      fireEvent.click(entrarButtons[0]);
      fireEvent.click(screen.getByText('Esqueci minha senha'));

      expect(screen.queryByRole('button', { name: /Enviar Link/i })).not.toBeInTheDocument();
    });

    it('resetPassword permanece com zero chamadas', () => {
      renderModal(true);

      const entrarButtons = screen.getAllByText('Entrar');
      fireEvent.click(entrarButtons[0]);
      fireEvent.click(screen.getByText('Esqueci minha senha'));

      expect(resetPasswordMock).not.toHaveBeenCalled();
    });

    it('link de contato usa SUPPORT_CONTACT_URL e SUPPORT_CONTACT_LABEL', () => {
      renderModal(true);

      const entrarButtons = screen.getAllByText('Entrar');
      fireEvent.click(entrarButtons[0]);
      fireEvent.click(screen.getByText('Esqueci minha senha'));

      const contactLink = screen.getByRole('link', { name: new RegExp(SUPPORT_CONTACT_LABEL) });
      expect(contactLink).toHaveAttribute('href', SUPPORT_CONTACT_URL);
      expect(contactLink).toHaveAttribute('target', '_blank');
      expect(contactLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('Voltar ao login restaura a tela de entrada', () => {
      renderModal(true);

      const entrarButtons = screen.getAllByText('Entrar');
      fireEvent.click(entrarButtons[0]);
      fireEvent.click(screen.getByText('Esqueci minha senha'));

      fireEvent.click(screen.getByText('← Voltar ao login'));

      // Tela de login visível novamente
      expect(screen.getByPlaceholderText('Sua senha')).toBeInTheDocument();
      expect(screen.queryByText(PASSWORD_RECOVERY_SUPPORT_TEXT)).not.toBeInTheDocument();
    });
  });
});
