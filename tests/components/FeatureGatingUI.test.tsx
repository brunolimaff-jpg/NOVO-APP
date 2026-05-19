import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  it('hides dashboard and integrity actions when restricted', () => {
    const onExportConversation = vi.fn();
    render(
      <SettingsDrawer
        isOpen={true}
        onClose={vi.fn()}
        operatorName="Maria"
        onUpdateOperatorName={vi.fn()}
        mode="investigacao"
        onSetMode={vi.fn()}
        isDarkMode={true}
        onToggleTheme={vi.fn()}
        onOpenDashboard={vi.fn()}
        onExportPDF={vi.fn()}
        onExportConversation={onExportConversation}
        onCopyMarkdown={vi.fn()}
        onScheduleFollowUp={vi.fn()}
        onClearOperator={vi.fn()}
        exportStatus="idle"
        canAccessDashboard={false}
        canAccessIntegrityCheck={false}
      />
    );

    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Teste de Integridade')).not.toBeInTheDocument();
    expect(screen.queryByText(/modo de investigação/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Baixar Word'));
    expect(onExportConversation).toHaveBeenCalledWith('doc', 'full');
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
      />
    );

    expect(screen.queryByTitle('Abrir Kanban CRM')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Enviar para CRM')).not.toBeInTheDocument();
  });
});
