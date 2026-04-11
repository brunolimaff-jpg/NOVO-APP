import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatInterface from '../../components/ChatInterface';
import { Sender, type Message, type ChatSession } from '../../types';

const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
}));
const { sessionsSidebarMock } = vi.hoisted(() => ({
  sessionsSidebarMock: vi.fn(),
}));
const { operatorStateRef } = vi.hoisted(() => ({
  operatorStateRef: {
    current: {
      name: 'Bruno Lima',
      operatorId: 'op-1',
      loading: false,
      setName: vi.fn(),
      clearName: vi.fn(),
    },
  },
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent, components }: any) => (
    <div data-testid="virtuoso-mock">
      {components?.Header?.()}
      {data.map((item: any, index: number) => (
        <div key={index}>{itemContent(index, item)}</div>
      ))}
      {components?.Footer?.()}
    </div>
  ),
}));

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

vi.mock('../../contexts/OperatorContext', () => ({
  useOperator: () => operatorStateRef.current,
}));

vi.mock('../../components/SessionsSidebar', () => ({
  default: (props: any) => {
    sessionsSidebarMock(props);
    return (
      <div data-testid="sessions-sidebar">
        <button type="button" onClick={props.onCloseMobile}>
          close-mobile
        </button>
      </div>
    );
  },
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

vi.mock('../../components/GreetingWelcomeScreen', () => ({
  default: ({ onConfirmName }: { onConfirmName: (name: string) => void }) => (
    <div data-testid="greeting-screen">
      <button type="button" onClick={() => onConfirmName('Bruno Lima')}>
        confirm-name
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
    onClearOperator: vi.fn(),
    ...overrides,
  };
}

describe('ChatInterface shell regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
    operatorStateRef.current = {
      name: 'Bruno Lima',
      operatorId: 'op-1',
      loading: false,
      setName: vi.fn(),
      clearName: vi.fn(),
    };
  });

  it('mantem a home inicial sem footer de chat quando ainda nao existe sessao', () => {
    render(<ChatInterface {...buildProps()} />);

    expect(screen.getByTestId('empty-state-home')).toBeInTheDocument();
    expect(screen.queryByLabelText('Campo de mensagem')).not.toBeInTheDocument();
  });

  it('bloqueia a home e mostra o gate de nome quando nao existe operador local', () => {
    operatorStateRef.current = {
      name: '',
      operatorId: 'op-1',
      loading: false,
      setName: vi.fn(),
      clearName: vi.fn(),
    };

    render(<ChatInterface {...buildProps()} />);

    expect(screen.getByTestId('greeting-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-home')).not.toBeInTheDocument();
  });

  it('aciona a investigacao inicial a partir da home', async () => {
    const onDeepDive = vi.fn(async () => undefined);

    render(<ChatInterface {...buildProps({ onDeepDive })} />);

    fireEvent.click(screen.getByRole('button', { name: 'mock-start-investigation' }));

    await waitFor(() => {
      expect(onDeepDive).toHaveBeenCalledWith(
        '🔍 Investigando Acme Agro...',
        expect.stringContaining('Empresa=Acme Agro'),
        'Acme Agro',
      );
    });
  });

  it('renderiza mensagens no contrato esperado pelo MessageRow', async () => {
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

    expect(screen.getByTestId('messages-scroller')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('message-row-0')).toHaveTextContent('Investigar Acme Agro');
      expect(screen.getByTestId('message-row-1')).toHaveTextContent('Resumo inicial da investigacao');
    });
  });

  it('mantem o shell do chat ancorado em flex-1 min-h-0 sem depender de h-full', () => {
    const messages = [
      buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
      buildMessage('m2', Sender.Bot, 'Resumo inicial da investigacao'),
    ];

    const { container } = render(
      <ChatInterface
        {...buildProps({
          currentSession: buildSession(messages),
          sessions: [buildSession(messages)],
          messages,
        })}
      />,
    );

    const shell = container.firstElementChild;
    expect(shell).not.toBeNull();
    expect(shell?.className).toContain('flex-1');
    expect(shell?.className).toContain('min-h-0');
    expect(shell?.className).not.toContain('h-full');
  });

  it('nao reabre a sidebar em mobile quando recebe comando de fechar com estado fechado', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
    const onToggleSidebar = vi.fn();

    render(<ChatInterface {...buildProps({ isSidebarOpen: false, onToggleSidebar })} />);

    fireEvent.click(screen.getByRole('button', { name: 'close-mobile' }));

    expect(onToggleSidebar).not.toHaveBeenCalled();
    expect(sessionsSidebarMock).toHaveBeenCalled();
  });


  it('cobre 2ª mensagem na mesma sessão com loading inline e sem hero na tela bonita', async () => {
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

    await waitFor(() => {
      expect(screen.queryByTestId('loading-inline-3')).not.toBeInTheDocument();
    });

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

    await waitFor(() => {
      expect(screen.getByTestId('loading-inline-3')).toBeInTheDocument();
      expect(screen.queryByTestId('loading-smart-hero-3')).not.toBeInTheDocument();
      expect(screen.queryByText('loading-smart-hero')).not.toBeInTheDocument();
    });
  });

  it('dispara Deep Dive e mantém loadingVariant hero na rodada seguinte', async () => {
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

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'deep-dive-row-1' })).toBeInTheDocument();
    });

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
        loadingVariant: 'hero',
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

    await waitFor(() => {
      expect(screen.queryByTestId('loading-inline-3')).not.toBeInTheDocument();
      expect(screen.getByTestId('loading-smart-hero-3')).toBeInTheDocument();
      expect(screen.getByText('loading-smart-hero')).toBeInTheDocument();
    });
  });

  it('oculta CTA de Deep Dive quando canDeepDive=false', async () => {
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
          canDeepDive: false,
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'deep-dive-row-1' })).not.toBeInTheDocument();
    });
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

  it('nao faz auto-scroll quando o loading termina', async () => {
    const loadingMessages: Message[] = [
      buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
      {
        ...buildMessage('m2', Sender.Bot, ''),
        isThinking: true,
        loadingVariant: 'hero',
      },
    ];

    const finalMessages: Message[] = [
      buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
      {
        ...buildMessage('m2', Sender.Bot, '# Dossie final\n\nConclusao pronta'),
        isThinking: false,
        loadingVariant: 'hero',
      },
    ];

    const { rerender } = render(
      <ChatInterface
        {...buildProps({
          currentSession: buildSession(loadingMessages),
          sessions: [buildSession(loadingMessages)],
          messages: loadingMessages,
          isLoading: true,
        })}
      />,
    );

    rerender(
      <ChatInterface
        {...buildProps({
          currentSession: buildSession(finalMessages),
          sessions: [buildSession(finalMessages)],
          messages: finalMessages,
          isLoading: false,
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages-scroller')).toBeInTheDocument();
    });
  });

  it('renderiza mensagens mesmo quando ResizeObserver nao sinaliza viewport pronta', async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    class SilentResizeObserver {
      observe() {}
      disconnect() {}
    }
    try {
      // @ts-expect-error test override
      globalThis.ResizeObserver = SilentResizeObserver;

      const messages = [
        buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
        buildMessage('m2', Sender.Bot, 'Resumo final disponível'),
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

      await waitFor(() => {
        expect(screen.getByTestId('message-row-0')).toHaveTextContent('Investigar Acme Agro');
        expect(screen.getByTestId('message-row-1')).toHaveTextContent('Resumo final disponível');
      });
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('renderiza mensagens mesmo quando ResizeObserver e requestAnimationFrame falham juntos', async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalRaf = window.requestAnimationFrame;
    class SilentResizeObserver {
      observe() {}
      disconnect() {}
    }
    try {
      // @ts-expect-error test override
      globalThis.ResizeObserver = SilentResizeObserver;
      window.requestAnimationFrame = vi.fn(() => 1);

      const messages = [
        buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
        buildMessage('m2', Sender.Bot, 'Resumo final disponível com score e sugestões'),
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

      await waitFor(() => {
        expect(screen.getByTestId('message-row-0')).toHaveTextContent('Investigar Acme Agro');
        expect(screen.getByTestId('message-row-1')).toHaveTextContent('Resumo final disponível com score e sugestões');
      });
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
      window.requestAnimationFrame = originalRaf;
    }
  });
});
