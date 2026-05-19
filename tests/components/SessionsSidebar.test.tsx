// tests/components/SessionsSidebar.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SessionsSidebar from '../../components/SessionsSidebar';
import type { ChatSession } from '../../types';

// Mock ConfirmPopover — too complex to render in unit tests
vi.mock('../../components/ConfirmPopover', () => ({
  default: ({ children, onConfirm }: { children: React.ReactNode; onConfirm: () => void }) => (
    <div>
      {children}
      <button data-testid="confirm-delete" onClick={onConfirm}>confirm</button>
    </div>
  ),
}));

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  const base: ChatSession = {
    id: 'sess-1',
    title: 'Investigar Fazenda X',
    messages: [],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    empresaAlvo: null,
    cnpj: null,
    modoPrincipal: 'investigacao',
    scoreOportunidade: null,
    resumoDossie: null,
  };
  return { ...base, ...overrides };
}

const defaultProps = {
  sessions: [],
  currentSessionId: null,
  onSelectSession: vi.fn(),
  onNewSession: vi.fn(),
  onDeleteSession: vi.fn(),
  isOpen: true,
  onCloseMobile: vi.fn(),
  isDarkMode: false,
};

describe('SessionsSidebar', () => {
  it('renderiza sem sessões sem erros', () => {
    render(<SessionsSidebar {...defaultProps} />);
    // Should show the sidebar at least
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('mostra nome da empresa quando empresaAlvo está definido', () => {
    const sessions = [makeSession({ empresaAlvo: 'Fazenda Boa Vista' })];
    render(<SessionsSidebar {...defaultProps} sessions={sessions} />);
    expect(screen.getByText('Fazenda Boa Vista')).toBeInTheDocument();
  });

  it('extrai nome do título com padrão [empresa]', () => {
    const sessions = [makeSession({
      title: 'dossiê completo de [Agropecuária Nova Era]',
      empresaAlvo: null,
    })];
    render(<SessionsSidebar {...defaultProps} sessions={sessions} />);
    expect(screen.getByText('Agropecuária Nova Era')).toBeInTheDocument();
  });

  it('remove prefixo "investigar" do título', () => {
    const sessions = [makeSession({
      title: 'investigar Cooperativa Sul',
      empresaAlvo: null,
    })];
    render(<SessionsSidebar {...defaultProps} sessions={sessions} />);
    expect(screen.getByText('Cooperativa Sul')).toBeInTheDocument();
  });

  it('filtra sessões pela busca (empresa)', async () => {
    const sessions = [
      makeSession({ id: 's1', empresaAlvo: 'Fazenda Verde', updatedAt: new Date('2024-02-01').toISOString() }),
      makeSession({ id: 's2', empresaAlvo: 'Cooperativa Sul', updatedAt: new Date('2024-01-01').toISOString() }),
    ];
    render(<SessionsSidebar {...defaultProps} sessions={sessions} showSearchField />);

    const input = screen.getByPlaceholderText(/buscar/i);
    fireEvent.change(input, { target: { value: 'verde' } });

    expect(screen.getByText('Fazenda Verde')).toBeInTheDocument();
    expect(screen.queryByText('Cooperativa Sul')).not.toBeInTheDocument();
  });

  it('filtra sessões por CNPJ', () => {
    const sessions = [
      makeSession({ id: 's1', cnpj: '12.345.678/0001-99', empresaAlvo: 'Fazenda A' }),
      makeSession({ id: 's2', cnpj: '99.999.999/0001-00', empresaAlvo: 'Fazenda B' }),
    ];
    render(<SessionsSidebar {...defaultProps} sessions={sessions} showSearchField />);

    const input = screen.getByPlaceholderText(/buscar/i);
    fireEvent.change(input, { target: { value: '12.345' } });

    expect(screen.getByText('Fazenda A')).toBeInTheDocument();
    expect(screen.queryByText('Fazenda B')).not.toBeInTheDocument();
  });

  it('chama onNewSession ao clicar em Nova Investigação', () => {
    const onNewSession = vi.fn();
    render(<SessionsSidebar {...defaultProps} onNewSession={onNewSession} />);
    const btn = screen.getByRole('button', { name: /nova investigação/i });
    fireEvent.click(btn);
    expect(onNewSession).toHaveBeenCalledOnce();
  });

  it('chama onSelectSession ao clicar em uma sessão', () => {
    const onSelectSession = vi.fn();
    const sessions = [makeSession({ id: 'sess-99', empresaAlvo: 'Fazenda Test' })];
    render(<SessionsSidebar {...defaultProps} sessions={sessions} onSelectSession={onSelectSession} />);
    fireEvent.click(screen.getByText('Fazenda Test'));
    expect(onSelectSession).toHaveBeenCalledWith('sess-99');
  });

  it('destaca sessão ativa', () => {
    const sessions = [
      makeSession({ id: 'active', empresaAlvo: 'Ativa', updatedAt: new Date('2024-03-01').toISOString() }),
      makeSession({ id: 'other', empresaAlvo: 'Outra', updatedAt: new Date('2024-02-01').toISOString() }),
    ];
    const { container } = render(
      <SessionsSidebar {...defaultProps} sessions={sessions} currentSessionId="active" />,
    );
    // Active session element should have the active border class
    const activeEl = container.querySelector('[class*="border-emerald-500"]');
    expect(activeEl).toBeTruthy();
  });

  it('usa searchTerm controlado quando fornecido pelo pai', () => {
    const onSearchChange = vi.fn();
    const sessions = [
      makeSession({ id: 's1', empresaAlvo: 'Granja X' }),
      makeSession({ id: 's2', empresaAlvo: 'Sítio Y' }),
    ];
    render(
      <SessionsSidebar
        {...defaultProps}
        sessions={sessions}
        searchTerm="granja"
        onSearchChange={onSearchChange}
        showSearchField
      />,
    );
    expect(screen.getByText('Granja X')).toBeInTheDocument();
    expect(screen.queryByText('Sítio Y')).not.toBeInTheDocument();
  });

  it('mostra Sessão sem nome quando título é null', () => {
    const sessions = [makeSession({ title: undefined as unknown as string, empresaAlvo: null })];
    render(<SessionsSidebar {...defaultProps} sessions={sessions} />);
    expect(screen.getByText('Sessão sem nome')).toBeInTheDocument();
  });
});
