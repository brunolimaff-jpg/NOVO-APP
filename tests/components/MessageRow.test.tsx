// tests/components/MessageRow.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MessageRow from '../../components/MessageRow';
import type { Message } from '../../types';
import { Sender } from '../../types';
import type { MessageRowData } from '../../components/MessageRow';

// Mock all heavy sub-components
vi.mock('../../components/GhostMessageBlock', () => ({
  default: () => <div data-testid="ghost-block" />,
}));
vi.mock('../../components/ErrorMessageCard', () => ({
  default: ({ error }: { error: { friendlyMessage?: string } }) => (
    <div data-testid="error-card">{error?.friendlyMessage}</div>
  ),
}));
vi.mock('../../components/SectionalBotMessage', () => ({
  default: ({ text }: { text: string }) => <div data-testid="sectional-bot">{text}</div>,
}));
vi.mock('../../components/LoadingSmart', () => ({
  default: () => <div data-testid="loading-smart" />,
}));
vi.mock('../../components/InlineTypingResponse', () => ({
  default: () => <div data-testid="inline-typing-response" />,
}));
vi.mock('../../components/ScorePorta', () => ({
  default: () => <div data-testid="score-porta" />,
}));
vi.mock('../../components/ClienteSeniorScore', () => ({
  default: () => <div data-testid="cliente-senior-score" />,
}));
vi.mock('../../components/MessageActionsBar', () => ({
  default: () => <div data-testid="message-actions-bar" />,
}));
vi.mock('../../components/DeepDiveTopics', () => ({
  DeepDiveTopics: () => <div data-testid="deep-dive-topics" />,
}));
vi.mock('../../utils/textCleaners', () => ({
  buildAuditableSources: vi.fn().mockReturnValue([]),
  normalizeSourceUrl: vi.fn((url: string) => url),
}));
vi.mock('../../utils/linkValidation', () => ({
  fetchLinkStatuses: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../services/portaStateService', () => ({
  getPortaState: vi.fn().mockReturnValue(null),
}));

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    text: 'Hello',
    sender: Sender.User,
    timestamp: new Date(),
    isThinking: false,
    isError: false,
    ...overrides,
  };
}

function makeData(messages: Message[], overrides: Partial<MessageRowData> = {}): MessageRowData {
  return {
    messages,
    isLoading: false,
    isDarkMode: false,
    mode: 'investigacao',
    onFeedback: vi.fn(),
    onSendFeedback: vi.fn(),
    onToggleMessageSources: vi.fn(),
    onRegenerateSuggestions: vi.fn(),
    handleDeleteWithUndo: vi.fn(),
    pendingDeleteId: null,
    hideSuggestionsForMessageId: null,
    setInput: vi.fn(),
    ...overrides,
  };
}

describe('MessageRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna null quando index está fora dos limites', () => {
    const messages = [makeMessage()];
    const { container } = render(
      <MessageRow index={5} data={makeData(messages)} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderiza mensagem do usuário com texto', () => {
    const msg = makeMessage({ text: 'Analisar Fazenda Boa Vista', sender: Sender.User });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.getByText('Analisar Fazenda Boa Vista')).toBeInTheDocument();
  });

  it('delegates hero loading to the global App overlay', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      isThinking: true,
      loadingVariant: 'hero',
      text: '',
    });
    const { container } = render(<MessageRow index={0} data={makeData([msg], { isLoading: true })} />);
    expect(container.firstChild).toBeNull();
  });

  it('uses hero as the safe fallback when loadingVariant is absent and lets App own the overlay', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      isThinking: true,
      text: '',
    });
    const { container } = render(<MessageRow index={0} data={makeData([msg], { isLoading: true })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza thinking state inline quando loadingVariant=inline', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      isThinking: true,
      loadingVariant: 'inline',
      text: '',
    });
    render(<MessageRow index={0} data={makeData([msg], { isLoading: true })} />);
    expect(screen.getByTestId('inline-typing-response')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-smart')).not.toBeInTheDocument();
  });

  it('renderiza mensagem de erro com ErrorMessageCard', () => {
    const errorDetails = {
      code: 'NETWORK' as const,
      message: 'Falha de conexão',
      friendlyMessage: 'Falha de conexão',
      httpStatus: 0,
      retryable: true,
      transient: true,
      source: 'UNKNOWN' as const,
    };
    const msg = makeMessage({
      sender: Sender.Bot,
      isError: true,
      errorDetails,
      text: '',
    });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.getByTestId('error-card')).toBeInTheDocument();
    expect(screen.getByText('Falha de conexão')).toBeInTheDocument();
  });

  it('renderiza mensagem do bot com SectionalBotMessage', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Análise Completa\nConteúdo aqui',
    });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.getByTestId('sectional-bot')).toBeInTheDocument();
  });

  it('renderiza badge Cliente Senior quando dados estiverem presentes', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Análise Completa\nConteúdo aqui',
      clienteSeniorData: {
        encontrado: true,
        grupo: 'Grupo Scheffer',
        totalModulos: 4,
        familias: ['ERP'],
        modulosPorFamilia: {},
      },
    });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.getByTestId('cliente-senior-score')).toBeInTheDocument();
  });

  it('renderiza alerta de fallback PORTA no topo quando metadado indica fallback tecnico', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Analise Completa\nConteudo aqui',
      scorePorta: {
        score: 64,
        p: 6,
        o: 5,
        r: 6,
        t: 7,
        a: 6,
        segmento: 'AGI',
        flags: [],
      },
      portaFallbackApplied: true,
      portaFallbackDimensions: ['O'],
    });
    render(
      <MessageRow
        index={0}
        data={makeData([msg], {
          empresaAlvo: 'SCHEFFER & CIA LTDA',
          cnpj: null,
        })}
      />,
    );
    const alert = screen.getByTestId('porta-fallback-alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/fallback técnico/i);
    expect(alert).toHaveTextContent(/Pendências:\s*O/i);
    expect(alert).toHaveTextContent(
      /Para continuar com segurança na análise de SCHEFFER & CIA LTDA, confirme o CNPJ \(14 dígitos\)\./i,
    );
    const score = screen.getByTestId('score-porta');
    expect(
      alert.compareDocumentPosition(score) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('dispara retry guiado das pendencias de PORTA ao clicar no botão do alerta', () => {
    const onSendMessage = vi.fn();
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Analise Completa\nConteudo aqui',
      portaFallbackApplied: true,
      portaFallbackDimensions: ['O', 'T'],
    });
    render(
      <MessageRow
        index={0}
        data={makeData([msg], {
          onSendMessage,
          empresaAlvo: 'SCHEFFER & CIA LTDA',
          cnpj: null,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente pendências/i }));
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    const retryPrompt = onSendMessage.mock.calls[0][0] as string;
    expect(retryPrompt).toContain('SCHEFFER & CIA LTDA');
    expect(retryPrompt).toContain('Dimensões pendentes: O, T');
    expect(retryPrompt).toContain('Raio-X Operacional');
    expect(retryPrompt).toContain('Tech Stack');
  });

  it('oculta lembrete de confirmação de CNPJ quando já existe CNPJ válido', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Analise Completa\nConteudo aqui',
      portaFallbackApplied: true,
      portaFallbackDimensions: ['O'],
    });
    render(
      <MessageRow
        index={0}
        data={makeData([msg], {
          empresaAlvo: 'SCHEFFER & CIA LTDA',
          cnpj: '04252011000110',
        })}
      />,
    );
    expect(
      screen.queryByText(/Para continuar com segurança na análise de SCHEFFER & CIA LTDA/i),
    ).not.toBeInTheDocument();
  });

  it('nao renderiza alerta de fallback PORTA no caminho normal', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Analise Completa\nConteudo aqui',
      portaFallbackApplied: false,
    });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.queryByTestId('porta-fallback-alert')).not.toBeInTheDocument();
  });

  it('renderiza DeepDiveTopics na última mensagem finalizada', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Análise Completa\nConteúdo aqui',
    });
    render(
      <MessageRow
        index={0}
        data={makeData([msg], {
          isLoading: false,
          onDeepDive: vi.fn(),
        })}
      />,
    );
    expect(screen.getByTestId('deep-dive-topics')).toBeInTheDocument();
  });

  it('renderiza mensagem do usuário sem crashar no modo dark', () => {
    const msg = makeMessage({ text: 'Pesquisar empresa', sender: Sender.User });
    expect(() =>
      render(<MessageRow index={0} data={makeData([msg], { isDarkMode: true })} />),
    ).not.toThrow();
  });

  it('mostra GhostMessageBlock para bot com ghostReason', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '',
    });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.getByTestId('ghost-block')).toBeInTheDocument();
  });
});
