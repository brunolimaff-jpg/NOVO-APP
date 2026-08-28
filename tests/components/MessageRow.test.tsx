// tests/components/MessageRow.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MessageRow from '../../components/MessageRow';
import type { AppError, Message } from '../../types';
import { Sender } from '../../types';
import type { MessageRowData } from '../../components/MessageRow';

const { sectionalBotShouldThrowRef, sectionalBotPropsRef } = vi.hoisted(() => ({
  sectionalBotShouldThrowRef: { current: false },
  sectionalBotPropsRef: { current: null as null | { empresaAlvo?: string | null; cnpj?: string | null } },
}));

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
  default: (props: { message?: Message; empresaAlvo?: string | null; cnpj?: string | null }) => {
    if (sectionalBotShouldThrowRef.current) {
      throw new Error('sectional render failed');
    }

    sectionalBotPropsRef.current = props;
    return <div data-testid="sectional-bot">{props.message?.text}</div>;
  },
}));
vi.mock('../../components/LoadingSmart', () => ({
  default: () => <div data-testid="loading-smart" />,
}));
vi.mock('../../components/InlineTypingResponse', () => ({
  default: () => <div data-testid="inline-typing-response" />,
}));
vi.mock('../../components/InlineLoadingBubble', () => ({
  default: () => <div data-testid="inline-loading-bubble" />,
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
  stripInternalMarkers: vi.fn((s: string) => s),
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
    firstBotIndex: messages.findIndex(m => m.sender === Sender.Bot && !m.isError && !m.isThinking),
    ...overrides,
  };
}

describe('MessageRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sectionalBotShouldThrowRef.current = false;
    sectionalBotPropsRef.current = null;
  });

  it('retorna null quando index está fora dos limites', () => {
    const messages = [makeMessage()];
    const { container } = render(<MessageRow index={5} data={makeData(messages)} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza mensagem do usuário com texto', () => {
    const msg = makeMessage({ text: 'Analisar Fazenda Boa Vista', sender: Sender.User });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.getByText('Analisar Fazenda Boa Vista')).toBeInTheDocument();
  });

  it('renderiza botão de excluir com ícone, sem escape Unicode cru', () => {
    const msg = makeMessage({ text: 'Mensagem descartável', sender: Sender.User });
    const handleDeleteWithUndo = vi.fn();
    render(
      <MessageRow
        index={0}
        data={makeData([msg], {
          onDeleteMessage: vi.fn(),
          handleDeleteWithUndo,
        })}
      />,
    );

    const deleteButton = screen.getByRole('button', { name: 'Excluir esta mensagem' });
    expect(deleteButton).toHaveTextContent('🗑️');
    expect(deleteButton).not.toHaveTextContent('\\\\uD83D');

    fireEvent.click(deleteButton);
    expect(handleDeleteWithUndo).toHaveBeenCalledWith('msg-1');
  });

  it('renderiza fallback visivel para loading hero quando a timeline fica exposta', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      isThinking: true,
      loadingVariant: 'hero',
      text: '',
    });
    render(<MessageRow index={0} data={makeData([msg], { isLoading: true })} />);
    expect(screen.getByTestId('hero-loading-inline-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('inline-typing-response')).toBeInTheDocument();
  });

  it('usa hero como fallback seguro quando loadingVariant esta ausente sem deixar painel branco', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      isThinking: true,
      text: '',
    });
    render(<MessageRow index={0} data={makeData([msg], { isLoading: true })} />);
    expect(screen.getByTestId('hero-loading-inline-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('inline-typing-response')).toBeInTheDocument();
  });

  it('renderiza thinking state inline com InlineLoadingBubble quando loadingVariant=inline', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      isThinking: true,
      loadingVariant: 'inline',
      text: '',
    });
    render(<MessageRow index={0} data={makeData([msg], { isLoading: true })} />);
    expect(screen.getByTestId('inline-loading-bubble')).toBeInTheDocument();
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

  it('preserva dossiê renderizado quando a persistência falha após gerar conteúdo', () => {
    const errorDetails = {
      code: 'UNKNOWN' as const,
      message: 'Persistência indisponível',
      friendlyMessage: 'Persistência indisponível',
      httpStatus: 0,
      retryable: true,
      transient: true,
      source: 'UNKNOWN' as const,
    };
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Dossiê consolidado\n\nConteúdo preservado.',
      isError: true,
      errorDetails,
      groundingSources: [{ title: 'Fonte validada', url: 'https://example.com' }],
      suggestions: ['Próximo passo'],
      scorePorta: { score: 72, p: 7, o: 7, r: 6, t: 8, a: 6, segmento: 'PRD', flags: [], scoreBruto: 72 },
    });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.getByTestId('sectional-bot')).toHaveTextContent('Dossiê consolidado');
    expect(screen.getByTestId('dossier-persistence-warning')).toBeInTheDocument();
    expect(screen.queryByTestId('error-card')).not.toBeInTheDocument();
  });

  it('renderiza mensagem do bot com SectionalBotMessage', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Análise Completa\nConteúdo aqui',
    });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.getByTestId('sectional-bot')).toBeInTheDocument();
  });

  it('repassa empresa alvo e CNPJ para o SectionalBotMessage', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Análise Completa\nConteúdo aqui',
    });

    render(
      <MessageRow
        index={0}
        data={makeData([msg], {
          empresaAlvo: 'Scheffer & Cia',
          cnpj: '04733767000180',
        })}
      />,
    );

    expect(sectionalBotPropsRef.current).toMatchObject({
      empresaAlvo: 'Scheffer & Cia',
      cnpj: '04733767000180',
    });
  });

  it('não renderiza badge visual de verificação web no chat', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Análise Completa\nConteúdo aqui',
      webVerificationStatus: 'fallback_verified',
      groundingUsed: true,
      groundingSources: [{ title: 'Fonte', url: 'https://example.org/fonte', verification: 'fallback' }],
    });
    render(<MessageRow index={0} data={makeData([msg])} />);

    expect(screen.queryByText(/Verificado via fallback web/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Verificado na web/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resposta sem verificacao web/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('message-actions-bar')).toBeInTheDocument();
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
    expect(() => render(<MessageRow index={0} data={makeData([msg], { isDarkMode: true })} />)).not.toThrow();
  });

  it('mantem fallback local quando a renderizacao do dossie explode', () => {
    sectionalBotShouldThrowRef.current = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '## Analise Completa\nConteudo aqui',
    });

    render(<MessageRow index={0} data={makeData([msg])} />);

    expect(screen.getByTestId('dossier-error-boundary')).toBeInTheDocument();
    expect(screen.getByText(/Nao foi possivel renderizar este bloco do dossier/i)).toBeInTheDocument();
  });

  it('mostra GhostMessageBlock para bot com ghostReason', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '',
    });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.getByTestId('ghost-block')).toBeInTheDocument();
  });

  it('NÃO mostra inline loading quando msg já tem texto final (isThinking true mas hasRenderableText)', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: 'Dossiê completo com análise de porte e operação',
      isThinking: true,
      loadingVariant: 'inline',
    });
    render(<MessageRow index={0} data={makeData([msg])} />);
    // inline-loading-bubble NÃO deve aparecer porque há texto renderizável
    expect(screen.queryByTestId('inline-loading-bubble')).not.toBeInTheDocument();
    // conteúdo normal deve aparecer
    expect(screen.getByTestId('sectional-bot')).toBeInTheDocument();
  });

  it('NÃO mostra bolha inline quando store já liberou loading mas msg ainda tem isThinking (trava Bug C — stale thinking)', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: '',
      isThinking: true,
      loadingVariant: 'inline',
    });
    // Simula: store diz que loading acabou, mas msg ainda está com isThinking=true (bug de propagação)
    const data = { ...makeData([msg]), isLoading: false };
    const { container } = render(<MessageRow index={0} data={data} />);

    // Trava: bolha NÃO deve aparecer quando store.isLoading é false
    expect(screen.queryByTestId('inline-loading-bubble')).not.toBeInTheDocument();
    // Stale-thinking retorna null — não renderiza erro alarmista (Finding 3 adversarial)
    expect(container.innerHTML).toBe('');
  });

  it('exibe banner persistente SC-429 quando o dossiê terminou parcial', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: 'Dossiê completo com conteúdo válido',
      partialReason: 'SC-429',
    });
    render(<MessageRow index={0} data={makeData([msg])} />);

    const banner = screen.getByTestId('dossier-partial-warning');
    expect(banner).toHaveTextContent('Dossiê concluído parcialmente');
    expect(banner).toHaveTextContent('informações parciais');
    expect(banner).toHaveTextContent('Código para suporte: SC-429');
    expect(banner).toHaveTextContent('Parcial');
    // O conteúdo do dossiê continua renderizado abaixo do banner
    expect(screen.getByTestId('sectional-bot')).toBeInTheDocument();
  });

  it('não exibe banner SC-429 em dossiê completo sem degradação', () => {
    const msg = makeMessage({ sender: Sender.Bot, text: 'Dossiê completo' });
    render(<MessageRow index={0} data={makeData([msg])} />);
    expect(screen.queryByTestId('dossier-partial-warning')).not.toBeInTheDocument();
  });
});

  it('SC-429 aparece mesmo com text="Erro no processamento" (regressão Lote A)', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: 'Erro no processamento',
      isError: true,
      errorDetails: {
        code: 'RATE_LIMIT' as const,
        message: 'LLM proxy failed (429): ...',
        friendlyMessage: 'Muitas requisições simultâneas. Aguarde alguns instantes.',
        retryable: true,
        transient: true,
        source: 'UNKNOWN' as const,
        httpStatus: 429,
      },
    });
    render(<MessageRow index={0} data={makeData([msg])} />);

    // O mock do ErrorMessageCard (data-testid="error-card") foi renderizado → componente SC-429 ativo
    expect(screen.getByTestId('error-card')).toHaveTextContent('Muitas requisições simultâneas.');

    // "Erro no processamento" NÃO deve aparecer como texto visível
    expect(screen.queryByText('Erro no processamento')).not.toBeInTheDocument();

    // Banner de persistência NÃO deve aparecer
    expect(screen.queryByTestId('dossier-persistence-warning')).not.toBeInTheDocument();

    // O componente SectionalBotMessage NÃO deve ser renderizado (o card SC-429 o substitui)
    expect(screen.queryByTestId('sectional-bot')).not.toBeInTheDocument();
  });

  it('Erros normais mantêm comportamento anterior (sem SC-429)', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: 'Erro no processamento',
      isError: true,
      errorDetails: {
        code: 'SERVER' as const,
        message: 'LLM proxy failed (500): interno',
        friendlyMessage: 'Ocorreu uma falha temporária nos servidores de IA.',
        retryable: true,
        transient: true,
        source: 'UNKNOWN' as const,
        httpStatus: 500,
      },
    });
    render(<MessageRow index={0} data={makeData([msg])} />);

    // SC-429 NÃO foi chamado (error-card não mostra friendlyMessage de RATE_LIMIT)
    expect(screen.queryByTestId('error-card')).toBeNull();
    // Mensagem de persistência aparece (comportamento normal para erros com texto)
    expect(screen.getByTestId('dossier-persistence-warning')).toBeInTheDocument();
    // Texto do bot aparece via SectionalBotMessage mockado
    expect(screen.getByTestId('sectional-bot')).toHaveTextContent('Erro no processamento');
  });

  it('SC-429B substitui placeholder preenchido e não renderiza dossiê ou persistência', () => {
    const msg = makeMessage({
      sender: Sender.Bot,
      text: 'Erro no processamento',
      isError: true,
      errorDetails: {
        code: 'LLM_BUDGET_EXCEEDED' as AppError['code'],
        message: 'O serviço de análise está temporariamente indisponível. Tente novamente mais tarde.',
        friendlyMessage: 'O serviço de análise está temporariamente indisponível. Tente novamente mais tarde.',
        retryable: false,
        transient: false,
        source: 'LLM',
        httpStatus: 429,
      },
    });
    render(<MessageRow index={0} data={makeData([msg])} />);

    expect(screen.getByTestId('error-card')).toHaveTextContent('O serviço de análise está temporariamente indisponível.');
    expect(screen.queryByText('Erro no processamento')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dossier-persistence-warning')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sectional-bot')).not.toBeInTheDocument();
  });
