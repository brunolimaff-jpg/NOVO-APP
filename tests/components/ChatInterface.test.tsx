import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ChatInterface from '../../components/ChatInterface';

const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
}));

vi.mock('../../contexts/ModeContext', () => ({
  useMode: () => ({ mode: 'operacao', setMode: vi.fn() }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { firstName: 'Bruno', lastName: 'Lima', username: 'bruno' },
    userId: 'user-1',
    updateName: vi.fn(),
  }),
}));

vi.mock('../../components/SessionsSidebar', () => ({
  default: () => <div data-testid="sessions-sidebar" />,
}));

vi.mock('../../components/UserMenu', () => ({
  default: () => <div data-testid="user-menu" />,
}));

vi.mock('../../components/EmptyStateHome', () => ({
  default: () => <div data-testid="empty-state-home" />,
}));

vi.mock('../../utils/diagnosticLog', () => ({
  scoutDiag: { warn: warnMock },
}));

function buildProps(): React.ComponentProps<typeof ChatInterface> {
  return {
    currentSession: null,
    sessions: [],
    onNewSession: vi.fn(),
    onSelectSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onSaveToCRM: vi.fn(),
    onDeepDive: vi.fn(async () => undefined),
    onOpenKanban: vi.fn(),
    isSidebarOpen: false,
    onToggleSidebar: vi.fn(),
    messages: [],
    isLoading: false,
    hasMore: false,
    onSendMessage: vi.fn(),
    onFeedback: vi.fn(),
    onSendFeedback: vi.fn(),
    onSectionFeedback: vi.fn(),
    onLoadMore: vi.fn(),
    onExportConversation: vi.fn(),
    onExportPDF: vi.fn(),
    onExportMessage: vi.fn(),
    onRetry: vi.fn(),
    onClearChat: vi.fn(),
    onRegenerateSuggestions: vi.fn(),
    onStop: vi.fn(),
    onReportError: vi.fn(),
    onSaveRemote: vi.fn(),
    isSavingRemote: false,
    remoteSaveStatus: 'idle',
    isDarkMode: false,
    onToggleTheme: vi.fn(),
    onToggleMessageSources: vi.fn(),
    exportStatus: 'idle',
    exportError: null,
    pdfReportContent: null,
    onOpenEmailModal: vi.fn(),
    onOpenFollowUpModal: vi.fn(),
    onLogout: vi.fn(),
  };
}

describe('ChatInterface processing indicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza o status de processamento sem tentar imprimir o objeto bruto', () => {
    render(
      <ChatInterface
        {...buildProps()}
        processing={{
          stage: 'Buscando dados',
          completedStages: ['consulta', 'analise'],
          failureCount: 1,
        }}
      />,
    );

    expect(screen.getByText('Buscando dados')).toBeInTheDocument();
    expect(screen.getByText(/2 etapas/i)).toBeInTheDocument();
    expect(screen.getByText(/tentativa 2/i)).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/i)).not.toBeInTheDocument();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('faz fallback para texto seguro e loga quando processing vem malformado', async () => {
    render(
      <ChatInterface
        {...buildProps()}
        processing={{ failureCount: 0 } as React.ComponentProps<typeof ChatInterface>['processing']}
      />,
    );

    expect(screen.getByText('Processando...')).toBeInTheDocument();

    await waitFor(() => {
      expect(warnMock).toHaveBeenCalledWith(
        'ChatInterface',
        'processing payload malformado no indicador inferior',
        expect.objectContaining({
          stageType: 'undefined',
          completedStagesIsArray: false,
          failureCountType: 'number',
          sessionId: null,
        }),
      );
    });
  });
});
