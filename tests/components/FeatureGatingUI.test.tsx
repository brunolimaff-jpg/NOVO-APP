import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SettingsDrawer from '../../components/SettingsDrawer';
import SessionsSidebar from '../../components/SessionsSidebar';
import { ChatSession } from '../../types';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const baseSession: ChatSession = {
  id: 'session-1',
  title: 'Empresa Teste',
  empresaAlvo: 'Empresa Teste',
  cnpj: null,
  modoPrincipal: null,
  scoreOportunidade: null,
  resumoDossie: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messages: [],
};

describe('MVP feature gating UI', () => {
  it('mostra aviso estático no lugar do teste de integridade', () => {
    render(
      <SettingsDrawer
        isOpen={true}
        onClose={vi.fn()}
        operatorName="Maria"
        onUpdateOperatorName={vi.fn()}
        isDarkMode={true}
        onToggleTheme={vi.fn()}
        onClearOperator={vi.fn()}
      />,
    );

    expect(screen.getByText('Disponível em breve.')).toBeInTheDocument();
    expect(screen.getByText('Estamos priorizando a estabilização e a qualidade dos dossiês.')).toBeInTheDocument();
  });

  it('does not render removed mini CRM entries in sessions sidebar', () => {
    render(
      <SessionsSidebar
        sessions={[baseSession]}
        currentSessionId={baseSession.id}
        onSelectSession={vi.fn()}
        onNewSession={vi.fn()}
        onDeleteSession={vi.fn()}
        isOpen={true}
        onCloseMobile={vi.fn()}
        isDarkMode={true}
      />,
    );

    expect(screen.queryByTitle('Abrir Kanban CRM')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Enviar para CRM')).not.toBeInTheDocument();
  });
});
