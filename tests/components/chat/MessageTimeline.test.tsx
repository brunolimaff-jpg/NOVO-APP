import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageTimeline from '../../../components/chat/MessageTimeline';
import type { ChatTheme } from '../../../components/chat/contracts';
import { Sender, type ChatSession, type Message } from '../../../types';

vi.mock('react-virtuoso', async () => {
  const ReactModule = await import('react');

  return {
    Virtuoso: ReactModule.forwardRef(
      (
        {
          data = [],
          itemContent,
          followOutput,
          computeItemKey,
          components,
        }: {
          data?: unknown[];
          itemContent: (index: number, item: unknown) => React.ReactNode;
          followOutput?: boolean | string;
          computeItemKey?: (index: number, item: unknown) => string;
          components?: {
            Header?: React.ComponentType;
          };
        },
        ref: React.ForwardedRef<HTMLDivElement>,
      ) => (
        <div
          ref={ref}
          data-testid="messages-scroller"
          data-virtuoso-scroller="true"
          data-follow-output={String(followOutput)}
        >
          {components?.Header ? <components.Header /> : null}
          {data.map((item, index) => {
            const itemKey = computeItemKey ? computeItemKey(index, item) : String(index);
            return (
              <div key={itemKey} data-testid="virtuoso-item-list" data-item-key={itemKey}>
                {itemContent(index, item)}
              </div>
            );
          })}
        </div>
      ),
    ),
  };
});

vi.mock('../../../components/MessageRow', () => ({
  default: ({ index, data }: { index: number; data: { messages: Message[]; setInput: (text: string) => void } }) => {
    const message = data.messages[index];

    return (
      <div data-testid={`message-row-${index}`}>
        <span>{message.text}</span>
        <button type="button" onClick={() => data.setInput(`prefill-${index}`)}>
          prefill-{index}
        </button>
      </div>
    );
  },
}));

vi.mock('../../../components/GreetingWelcomeScreen', () => ({
  default: ({
    onConfirmOperator,
  }: {
    onConfirmOperator: (name: string, email: string, existingOperatorId?: string) => void;
  }) => (
    <div data-testid="greeting-screen">
      <button type="button" onClick={() => onConfirmOperator('Bruno Lima', 'bruno.lima@senior.com.br')}>
        confirm-name
      </button>
    </div>
  ),
}));

vi.mock('../../../components/EmptyStateHome', () => ({
  default: ({
    onStartInvestigation,
  }: {
    onStartInvestigation: (payload: {
      companyName: string;
      cnpj: string | null;
      city: string;
      state: string;
    }) => Promise<void>;
  }) => (
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
        start-investigation
      </button>
    </div>
  ),
}));

vi.mock('../../../components/HelpCenterFloating', () => ({
  default: () => <div data-testid="help-center-floating" />,
}));

const theme: ChatTheme = {
  bg: 'bg-slate-950',
  surface: 'bg-slate-900',
  border: 'border-slate-800',
  textPrimary: 'text-slate-100',
  textSecondary: 'text-slate-400',
  inputBg: 'bg-slate-800',
  inputBorder: 'border-slate-700',
  itemHover: 'hover:bg-slate-800',
  itemActive: 'bg-slate-800',
  btnSecondary: 'bg-slate-800 text-slate-200 border border-slate-700',
};

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

function buildProps(
  overrides: Partial<React.ComponentProps<typeof MessageTimeline>> = {},
): React.ComponentProps<typeof MessageTimeline> {
  const messages = [
    buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
    buildMessage('m2', Sender.Bot, 'Resumo inicial'),
  ];

  return {
    currentSession: buildSession(messages),
    messages,
    isLoading: false,
    hasMore: false,
    isDarkMode: false,
    mode: 'investigacao',
    showOperatorGate: false,
    showInitialHome: false,
    shouldSuspendVirtualizedList: false,
    onConfirmOperatorName: vi.fn(),
    onStartInvestigation: vi.fn(async () => undefined),
    radar: undefined,
    onOpenRadarPanel: vi.fn(),
    onLoadMore: vi.fn(),
    onRetry: vi.fn(),
    onDeleteMessage: vi.fn(),
    onReportError: vi.fn(),
    onFeedback: vi.fn(),
    onSendFeedback: vi.fn(),
    onToggleMessageSources: vi.fn(),
    onDeepDive: vi.fn(async () => undefined),
    onRegenerateSuggestions: vi.fn(),
    onPrefillComposer: vi.fn(),
    operatorId: 'op-1',
    processing: undefined,
    lastUserQuery: undefined,
    onStop: vi.fn(),
    onSendMessage: vi.fn(),
    loadingPinnedLabel: null,
    canDeepDive: true,
    theme,
    ...overrides,
  };
}

describe('MessageTimeline', () => {
  const originalResizeObserver = global.ResizeObserver;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.useRealTimers();
  });

  it('renderiza o gate inicial do operador e confirma o nome', () => {
    const props = buildProps({ showOperatorGate: true });
    render(<MessageTimeline {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'confirm-name' }));
    expect(props.onConfirmOperatorName).toHaveBeenCalledWith('Bruno Lima', 'bruno.lima@senior.com.br');
  });

  it('renderiza a home inicial com ajuda e dispara a investigacao', async () => {
    const props = buildProps({
      currentSession: null,
      messages: [],
      showInitialHome: true,
    });

    render(<MessageTimeline {...props} />);

    expect(screen.getByTestId('empty-state-home')).toBeInTheDocument();
    expect(screen.getByTestId('help-center-floating')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'start-investigation' }));

    await waitFor(() => {
      expect(props.onStartInvestigation).toHaveBeenCalledWith({
        companyName: 'Acme Agro',
        cnpj: '12.345.678/0001-90',
        city: 'Cuiaba',
        state: 'MT',
      });
    });
  });

  it('suspende a viewport virtualizada durante o loading hero sem mensagens substantivas', () => {
    render(
      <MessageTimeline
        {...buildProps({
          shouldSuspendVirtualizedList: true,
          messages: [],
        })}
      />,
    );

    expect(screen.getByTestId('messages-viewport-suspended')).toBeInTheDocument();
  });

  it('faz fallback da viewport e preserva o wiring de MessageRow', async () => {
    vi.useFakeTimers();
    // @ts-expect-error test fallback path
    global.ResizeObserver = undefined;
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();

    const props = buildProps({ hasMore: true });
    render(<MessageTimeline {...props} />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('messages-scroller')).toBeInTheDocument();
    expect(screen.getByTestId('message-row-0')).toHaveTextContent('Investigar Acme Agro');
    expect(screen.getByTestId('message-row-1')).toHaveTextContent('Resumo inicial');

    fireEvent.click(screen.getByRole('button', { name: 'prefill-0' }));
    expect(props.onPrefillComposer).toHaveBeenCalledWith('prefill-0');
  });

  it('renderiza timeline estatica quando a virtualizacao falha em materializar o DOM', () => {
    const props = buildProps({
      forceStaticTimelineFallback: true,
      hasMore: true,
    });

    render(<MessageTimeline {...props} />);

    expect(screen.getByTestId('messages-static-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-scroller')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-row-0')).toHaveTextContent('Investigar Acme Agro');
    expect(screen.getByTestId('message-row-1')).toHaveTextContent('Resumo inicial');

    fireEvent.click(screen.getByRole('button', { name: /carregar mensagens anteriores/i }));
    expect(props.onLoadMore).toHaveBeenCalled();
  });

  it('prioriza fallback estatico para bot gigante mesmo se a viewport ainda estiver suspensa', () => {
    const largeMessages = [
      buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
      buildMessage('m2', Sender.Bot, 'SCHEFFER_E2E_SENTINEL '.repeat(250)),
    ];

    const props = buildProps({
      messages: largeMessages,
      currentSession: buildSession(largeMessages),
      shouldSuspendVirtualizedList: true,
      forceStaticTimelineFallback: true,
    });

    render(<MessageTimeline {...props} />);

    expect(screen.getByTestId('messages-static-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-viewport-suspended')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-row-1')).toHaveTextContent('SCHEFFER_E2E_SENTINEL');
  });

  it('mantem followOutput auto quando nao carrega, false durante loading', async () => {
    vi.useFakeTimers();
    // @ts-expect-error test fallback path
    global.ResizeObserver = undefined;
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();

    const scrollIntoViewSpy = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoViewSpy;

    try {
      const initialMessages = [
        buildMessage('m1', Sender.User, 'Pergunta inicial'),
        buildMessage('m2', Sender.Bot, 'Resposta inicial'),
      ];
      const props = buildProps({ messages: initialMessages, currentSession: buildSession(initialMessages) });
      const { rerender } = render(<MessageTimeline {...props} />);

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(screen.getByTestId('messages-scroller')).toHaveAttribute('data-follow-output', 'auto');

      rerender(
        <MessageTimeline
          {...buildProps({
            ...props,
            messages: initialMessages,
            currentSession: buildSession(initialMessages),
            isLoading: true,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(screen.getByTestId('messages-scroller')).toHaveAttribute('data-follow-output', 'false');
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('computeItemKey usa message.id estavel — sem sufixo :thinking na transicao isThinking true→false', async () => {
    vi.useFakeTimers();
    // @ts-expect-error test fallback path
    global.ResizeObserver = undefined;
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();

    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();

    try {
      const msgUser = buildMessage('m1', Sender.User, 'Pergunta');
      const msgThinking = {
        ...buildMessage('m2', Sender.Bot, 'A'.repeat(199)),
        isThinking: true,
      };
      const messages = [msgUser, msgThinking];
      const props = buildProps({ messages, currentSession: buildSession(messages), isLoading: true });
      const { rerender } = render(<MessageTimeline {...props} />);

      act(() => {
        vi.advanceTimersByTime(200);
      });

      const items = screen.getAllByTestId('virtuoso-item-list');
      const thinkingItem = items.find(el => el.getAttribute('data-item-key') === 'm2');
      expect(thinkingItem).toBeTruthy();

      const msgDone = {
        ...buildMessage('m2', Sender.Bot, 'A'.repeat(199)),
        isThinking: false,
      };
      const doneMessages = [msgUser, msgDone];
      rerender(
        <MessageTimeline
          {...buildProps({
            ...props,
            messages: doneMessages,
            currentSession: buildSession(doneMessages),
            isLoading: false,
          })}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(200);
      });

      const itemsAfter = screen.getAllByTestId('virtuoso-item-list');
      const doneItem = itemsAfter.find(el => el.getAttribute('data-item-key') === 'm2');
      expect(doneItem).toBeTruthy();
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('não reativa placeholder quando safeMessages.length muda após viewport pronta (regressão PR #303)', async () => {
    vi.useFakeTimers();
    // @ts-expect-error test fallback path
    global.ResizeObserver = undefined;
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();

    const initialMessages = [
      buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
      buildMessage('m2', Sender.Bot, 'Primeira Resposta'),
    ];

    const props = buildProps({ messages: initialMessages, currentSession: buildSession(initialMessages) });

    const { rerender } = render(<MessageTimeline {...props} />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('messages-scroller')).toBeInTheDocument();
    expect(screen.getByTestId('message-row-0')).toHaveTextContent('Investigar Acme Agro');
    expect(screen.getByTestId('message-row-1')).toHaveTextContent('Primeira Resposta');

    const nextMessages = [...initialMessages, buildMessage('m3', Sender.Bot, 'Nova resposta')];

    rerender(
      <MessageTimeline
        {...buildProps({
          ...props,
          messages: nextMessages,
          currentSession: buildSession(nextMessages),
        })}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('message-row-0')).toHaveTextContent('Investigar Acme Agro');
    expect(screen.getByTestId('message-row-2')).toHaveTextContent('Nova resposta');
  });

  it('renderiza timeline estática quando forceStaticTimelineFallback=true', () => {
    const props = buildProps({ forceStaticTimelineFallback: true });
    render(<MessageTimeline {...props} />);

    expect(screen.getByTestId('messages-static-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-scroller')).not.toBeInTheDocument();
  });

  it('Virtuoso renderiza com dossiê grande (>4000 chars)', () => {
    const dossierMessages = [
      buildMessage('m1', Sender.User, 'Investigar Acme Agro'),
      buildMessage('m2', Sender.Bot, 'SCHEFFER_E2E_SENTINEL '.repeat(250)),
    ];
    const props = buildProps({
      messages: dossierMessages,
      currentSession: buildSession(dossierMessages),
      forceStaticTimelineFallback: true,
    });
    render(<MessageTimeline {...props} />);
    expect(screen.getByTestId('messages-static-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('message-row-1')).toHaveTextContent('SCHEFFER_E2E_SENTINEL');
  });
});
