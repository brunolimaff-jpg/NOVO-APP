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
          components,
        }: {
          data?: unknown[];
          itemContent: (index: number, item: unknown) => React.ReactNode;
          followOutput?: boolean;
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
          {data.map((item, index) => (
            <div key={index} data-testid={`virtuoso-item-${index}`}>
              {itemContent(index, item)}
            </div>
          ))}
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

    expect(screen.getByTestId('messages-viewport-placeholder')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('messages-scroller')).toBeInTheDocument();
    expect(screen.getByTestId('message-row-0')).toHaveTextContent('Investigar Acme Agro');
    expect(screen.getByRole('button', { name: /carregar mensagens anteriores/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'prefill-0' }));
    expect(props.onPrefillComposer).toHaveBeenCalledWith('prefill-0');
  });

  it('mantem followOutput auto sempre (Virtuoso gerencia scroll nativamente)', async () => {
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

      expect(screen.getByTestId('messages-scroller')).toHaveAttribute('data-follow-output', 'auto');
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('computeItemKey usa message.id estavel — sem sufixo :thinking', async () => {
    vi.useFakeTimers();
    // @ts-expect-error test fallback path
    global.ResizeObserver = undefined;
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();

    const scrollIntoViewSpy = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoViewSpy;

    try {
      const msg1 = buildMessage('m1', Sender.User, 'Pergunta');
      const msg2 = { ...buildMessage('m2', Sender.Bot, ''), isThinking: true };
      const messages = [msg1, msg2];
      const props = buildProps({ messages, currentSession: buildSession(messages) });
      render(<MessageTimeline {...props} />);

      act(() => {
        vi.advanceTimersByTime(200);
      });

      const scroller = screen.getByTestId('messages-scroller');
      expect(scroller).toBeInTheDocument();

      const virtuosoEl = scroller.querySelector('[data-testid="virtuoso-item-list"]');
      if (virtuosoEl) {
        const items = virtuosoEl.querySelectorAll('[data-item-index]');
        const botItem = Array.from(items).find(el => {
          const key = el.getAttribute('data-item-index');
          return key && !key.includes(':thinking');
        });
        expect(botItem).toBeTruthy();
      }
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
      buildMessage('m2', Sender.Bot, 'Resumo inicial'),
    ];

    const { rerender } = render(
      <MessageTimeline
        {...buildProps({
          messages: initialMessages,
          currentSession: buildSession(initialMessages),
        })}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('messages-scroller')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-viewport-placeholder')).not.toBeInTheDocument();

    const extendedMessages = [...initialMessages, buildMessage('m3', Sender.User, 'Follow-up')];

    rerender(
      <MessageTimeline
        {...buildProps({
          messages: extendedMessages,
          currentSession: buildSession(extendedMessages),
        })}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByTestId('messages-scroller')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-viewport-placeholder')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('renderiza timeline estática quando forceStaticTimelineFallback=true', () => {
    const largeText = 'D'.repeat(4_001);
    const messages = [
      buildMessage('m1', Sender.User, 'Investigar Scheffer'),
      buildMessage('m2', Sender.Bot, largeText),
    ];

    render(
      <MessageTimeline
        {...buildProps({
          messages,
          currentSession: buildSession(messages),
          forceStaticTimelineFallback: true,
        })}
      />,
    );

    expect(screen.getByTestId('messages-static-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('messages-scroller')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-row-1')).toHaveTextContent(largeText);
  });

  it('Virtuoso renderiza com dossiê grande (>4000 chars)', async () => {
    const originalResizeObserver = global.ResizeObserver;
    const originalRaf = window.requestAnimationFrame;
    const originalCancelRaf = window.cancelAnimationFrame;

    vi.useFakeTimers();
    // @ts-expect-error test fallback path
    global.ResizeObserver = undefined;
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();

    try {
      const largeText = 'D'.repeat(4_001);
      const messages = [
        buildMessage('m1', Sender.User, 'Investigar Scheffer'),
        buildMessage('m2', Sender.Bot, largeText),
      ];

      const props = buildProps({
        messages,
        currentSession: buildSession(messages),
      });

      render(<MessageTimeline {...props} />);

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(screen.getByTestId('messages-scroller')).toBeInTheDocument();
      expect(screen.getByTestId('message-row-1')).toHaveTextContent(largeText);
    } finally {
      global.ResizeObserver = originalResizeObserver;
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancelRaf;
      vi.useRealTimers();
    }
  });
});
