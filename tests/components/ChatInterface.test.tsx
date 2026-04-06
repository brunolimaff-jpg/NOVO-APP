import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatInterface from '../../components/ChatInterface';
import { Sender, type Message, type ChatSession } from '../../types';

const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
}));

vi.mock('react-virtuoso', () => {
  const Virtuoso = React.forwardRef<HTMLDivElement, any>(({ data = [], itemContent, components, style }, _ref) => (
    <div data-testid="virtuoso" style={style}>
      {components?.Header ? <components.Header /> : null}
      {data.map((item: any, index: number) => (
        <div key={item?.id ?? index}>{itemContent(index, item)}</div>
      ))}
    </div>
  ));
  Virtuoso.displayName = 'VirtuosoMock';

  return { Virtuoso };
});

vi.mock('../../components/MessageRow', () => ({
  default: ({ index, data }: { index: number; data: { messages: Array<any>; onDeepDive?: (display: string, hidden: string) => Promise<void>; isLoading?: boolean } }) => {
    const message = data.messages[index];

    return (
      <div data-testid={`message-row-${index}`}>
        <span>{message.text}</span>
        {message.isThinking && message.loadingVariant === 'inline' ? (
          <span data-testid={`loading-inline-${index}`}>loading-inline</span>
        ) : null}
        {message.isThinking && message.loadingVariant !== 'inline' ? (
          <span data-testid={`loading-smart-hero-${index}`}>loading-smart-hero</span>
        ) : null}
        {message.sender === 'bot' && !message.isThinking && !data.isLoading && data.onDeepDive ? (
          <button
            type="button"
            onClick={() => data.onDeepDive?.('Dossiê completo: Tech Stack', 'HIDDEN_PROMPT_TECH')}
          >
            deep-dive-row-{index}
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock('../../contexts/ModeContext', () => ({
  useMode: () => ({ mode: 'investigacao', setMode: vi.fn() }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      displayName: 'Bruno Lima',
      email: 'bruno@example.com',
      isGuest: false,
      isAdmin: false,
    },
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
  default: ({ onStartInvestigation }: { onStartInvestigation: (payload: { companyName: string; cnpj: string | null; city: string; state: string }) => void }) => (
    <div data-testid="empty-state-home">
      <button
        type="button"
        onClick={() =>
          onStartInvestigation({
            companyName: 'Acme Agro',
            cnpj: '12.345.678/0001-90',
            city: 'Cuiaba',
            state: 'MT',
          })
        }
      >
        mock-start-investigation
      </button>
    </div>
  ),
}));

vi.mock('../../utils/diagnosticLog', () => ({
  scoutDiag: { warn: warnMock, info: vi.fn(), error: vi.fn() },
}));

function buildMessage(id: string, sender: Sender, text: string): Message {
  return {
    id,
    sender,
    text,
    timestamp: new Date('2026-04-04T12:00:00.000Z'),
  };
}

function buildSession(messages: Message[]): ChatSession {
  return {
    id: 'session-1',
    title: 'Acme Agro',
    empresaAlvo: 'Acme Agro',
    cnpj: '12.345.678/0001-90',
    modoPrincipal: null,
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: '2026-04-04T12:00:00.000Z',
    updatedAt: '2026-04-04T12:00:00.000Z',
    messages,
  };
}

function buildProps(overrides: Partial<React.ComponentProps<typeof ChatInterface>> = {}): React.ComponentProps<typeof ChatInterface> {
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
    ...overrides,
  };
}

describe('ChatInterface shell regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mantem a home inicial sem footer de chat quando ainda nao existe sessao', () => {
    render(<ChatInterface {...buildProps()} />);

    expect(screen.getByTestId('empty-state-home')).toBeInTheDocument();
    expect(screen.queryByLabelText('Campo de mensagem')).not.toBeInTheDocument();
  });

  it('aciona a investigacao inicial a partir da home', async () => {
    const onDeepDive = vi.fn(async () => undefined);

    render(<ChatInterface {...buildProps({ onDeepDive })} />);

    fireEvent.click(screen.getByRole('button', { name: 'mock-start-investigation' }));

    await waitFor(() => {
      expect(onDeepDive).toHaveBeenCalledWith(
        '🔍 Investigando Acme Agro...',
        expect.stringContaining('Acme Agro'),
        'Acme Agro',
      );
    });
  });

  it('renderiza mensagens no contrato esperado pelo MessageRow', () => {
    const messages = [
      buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
      buildMessage('m2', Sender.Bot, 'Resumo inicial da investigacao'),
    ];

    render(
      <ChatInterface
        {...buildProps({
          currentSession: buildSession(messages),
          sessions: [buildSession(messages)],
          messages,
        })}
      />,
    );

    expect(screen.getByTestId('virtuoso')).toBeInTheDocument();
    expect(screen.getByTestId('message-row-0')).toHaveTextContent('Investigar Acme Agro');
    expect(screen.getByTestId('message-row-1')).toHaveTextContent('Resumo inicial da investigacao');
  });


  it('cobre 2ª mensagem na mesma sessão com loading inline e sem hero na tela bonita', () => {
    const firstRoundMessages = [
      buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
      buildMessage('m2', Sender.Bot, 'Resumo inicial da investigacao'),
    ];

    const secondRoundMessages: Message[] = [
      ...firstRoundMessages,
      buildMessage('m3', Sender.User, 'Quais riscos fiscais mais críticos?'),
      {
        ...buildMessage('m4', Sender.Bot, ''),
        isThinking: true,
        loadingVariant: 'inline',
      },
    ];

    const { rerender } = render(
      <ChatInterface
        {...buildProps({
          currentSession: buildSession(firstRoundMessages),
          sessions: [buildSession(firstRoundMessages)],
          messages: firstRoundMessages,
        })}
      />,
    );

    expect(screen.queryByTestId('loading-inline-3')).not.toBeInTheDocument();

    rerender(
      <ChatInterface
        {...buildProps({
          currentSession: buildSession(secondRoundMessages),
          sessions: [buildSession(secondRoundMessages)],
          messages: secondRoundMessages,
          isLoading: true,
        })}
      />,
    );

    expect(screen.getByTestId('loading-inline-3')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-smart-hero-3')).not.toBeInTheDocument();
    expect(screen.queryByText('loading-smart-hero')).not.toBeInTheDocument();
  });

  it('dispara Deep Dive e mantém loadingVariant inline na rodada seguinte', async () => {
    const onDeepDive = vi.fn(async () => undefined);
    const baseMessages = [
      buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
      buildMessage('m2', Sender.Bot, 'Resumo inicial da investigacao'),
    ];

    const { rerender } = render(
      <ChatInterface
        {...buildProps({
          currentSession: buildSession(baseMessages),
          sessions: [buildSession(baseMessages)],
          messages: baseMessages,
          onDeepDive,
          canDeepDive: true,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'deep-dive-row-1' }));

    await waitFor(() => {
      expect(onDeepDive).toHaveBeenCalledWith('Dossiê completo: Tech Stack', 'HIDDEN_PROMPT_TECH');
    });

    const deepDiveThinkingMessages: Message[] = [
      ...baseMessages,
      buildMessage('m3', Sender.User, 'Dossiê completo: Tech Stack'),
      {
        ...buildMessage('m4', Sender.Bot, ''),
        isThinking: true,
        loadingVariant: 'inline',
      },
    ];

    rerender(
      <ChatInterface
        {...buildProps({
          currentSession: buildSession(deepDiveThinkingMessages),
          sessions: [buildSession(deepDiveThinkingMessages)],
          messages: deepDiveThinkingMessages,
          isLoading: true,
          onDeepDive,
          canDeepDive: true,
        })}
      />,
    );

    expect(screen.getByTestId('loading-inline-3')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-smart-hero-3')).not.toBeInTheDocument();
    expect(screen.queryByText('loading-smart-hero')).not.toBeInTheDocument();
  });

  it('renderiza o status de processamento sem imprimir o objeto bruto', () => {
    const messages = [buildMessage('m1', Sender.User, 'Investigar Acme Agro')];

    render(
      <ChatInterface
        {...buildProps({
          currentSession: buildSession(messages),
          sessions: [buildSession(messages)],
          messages,
          isLoading: true,
          processing: {
            stage: 'Buscando dados',
            completedStages: ['consulta', 'analise'],
            failureCount: 1,
          },
        })}
      />,
    );

    expect(screen.getByText('Buscando dados')).toBeInTheDocument();
    expect(screen.getByText(/2 etapas/i)).toBeInTheDocument();
    expect(screen.getByText(/tentativa 2/i)).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/i)).not.toBeInTheDocument();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('faz fallback seguro e loga quando processing vem malformado', async () => {
    const messages = [buildMessage('m1', Sender.User, 'Investigar Acme Agro')];

    render(
      <ChatInterface
        {...buildProps({
          currentSession: buildSession(messages),
          sessions: [buildSession(messages)],
          messages,
          isLoading: true,
          processing: { failureCount: 0 } as React.ComponentProps<typeof ChatInterface>['processing'],
        })}
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
          sessionId: 'session-1',
        }),
      );
    });
  });
});
