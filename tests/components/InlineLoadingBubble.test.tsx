import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InlineLoadingBubble, { formatCnpj } from '../../components/InlineLoadingBubble';

vi.mock('../../components/LoadingShared', () => ({
  ClockIcon: ({ className }: { className?: string }) => <span data-testid="clock-icon" className={className} />,
  StepCheckIcon: ({ isDarkMode }: { isDarkMode: boolean }) => (
    <span data-testid={isDarkMode ? 'check-dark' : 'check-light'} />
  ),
  StepSpinner: ({ isDarkMode }: { isDarkMode: boolean }) => (
    <span data-testid={isDarkMode ? 'spinner-dark' : 'spinner-light'} />
  ),
  StepPending: ({ isDarkMode }: { isDarkMode: boolean }) => (
    <span data-testid={isDarkMode ? 'pending-dark' : 'pending-light'} />
  ),
}));

vi.mock('../../utils/loadingSmartViewModel', () => ({
  buildLoadingSmartViewModel: vi.fn(() => ({
    percent: 64,
    completedCount: 4,
    visiblePlannedStages: [
      { label: 'Identidade e teia societária' },
      { label: 'Operação e cadeia de valor' },
      { label: 'Bordas de controle' },
      { label: 'Pressões e compliance' },
      { label: 'Caminho de venda' },
      { label: 'Referências e sinais de mercado' },
      { label: 'Cards de auditoria' },
    ],
    completedStageKeys: new Set(['key-1', 'key-2', 'key-3', 'key-4']),
    currentStageKey: 'key-5',
    shouldAppendCurrentStage: false,
  })),
  getLoadingStageIdentity: vi.fn((label: string) => `key-${label.slice(0, 5)}`),
  LOADING_STAGE_ORDER_BY_KEY: new Map(),
}));

vi.mock('../../utils/textCleaners', () => ({
  stripInternalMarkers: vi.fn((s: string) => s),
}));

vi.mock('../../utils/loadingBackoff', () => ({
  getLoadingBackoffMessage: vi.fn(() => ''),
  resolveActiveLoadingStageLabel: vi.fn((s: string) => s || 'Caminho de venda'),
}));

vi.mock('../../utils/diagnosticLog', () => ({
  scoutDiag: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockChatStore = vi.hoisted(() => vi.fn());

vi.mock('../../stores/chatStore', () => ({
  useMaybeChatStore: mockChatStore,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockChatStore.mockReturnValue(null);
});

/* ── formatCnpj — testes unitários da função pura ── */

describe('formatCnpj', () => {
  it('formata 14 dígitos no padrão XX.XXX.XXX/XXXX-XX', () => {
    expect(formatCnpj('04733767000180')).toBe('04.733.767/0001-80');
  });

  it('formata CNPJ com pontuação já presente', () => {
    expect(formatCnpj('04.733.767/0001-80')).toBe('04.733.767/0001-80');
  });

  it('remove caracteres não numéricos antes de formatar', () => {
    expect(formatCnpj('04.733.767/0001-80   ')).toBe('04.733.767/0001-80');
  });

  it('retorna vazio para string vazia', () => {
    expect(formatCnpj('')).toBe('');
  });

  it('retorna vazio para undefined/null-like', () => {
    expect(formatCnpj(undefined)).toBe('');
    expect(formatCnpj(null)).toBe('');
  });

  it('formata progressivamente para menos de 14 dígitos', () => {
    expect(formatCnpj('123')).toBe('12.3');
    expect(formatCnpj('0473376700018')).toBe('04.733.767/0001-8');
  });

  it('normaliza para 14 dígitos e formata quando excede', () => {
    expect(formatCnpj('04733767000180000')).toBe('04.733.767/0001-80');
  });

  it('formata progressivamente com pontuação parcial', () => {
    expect(formatCnpj('04.733')).toBe('04.733');
  });
});

/* ── Contrato do componente ── */

describe('InlineLoadingBubble — contrato', () => {
  it('renderiza com props mínimas (isDarkMode)', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByTestId('inline-loading-bubble')).toBeInTheDocument();
  });

  it('renderiza com todas as props preenchidas', () => {
    render(
      <InlineLoadingBubble
        isDarkMode={false}
        processing={{ stage: 'Teste', completedStages: [], totalStages: 7 }}
        empresaAlvo="Scheffer"
        cnpj="04733767000180"
        lastUserQuery="Dossiê Scheffer"
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByTestId('inline-loading-bubble')).toBeInTheDocument();
  });

  it('exibe nome da empresa no cabeçalho', () => {
    render(<InlineLoadingBubble isDarkMode={false} empresaAlvo="Grupo Scheffer" />);
    expect(screen.getByText('Grupo Scheffer')).toBeInTheDocument();
  });

  it('exibe "Análise" quando empresaAlvo e lastUserQuery vazios', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByText('Análise')).toBeInTheDocument();
  });

  it('exibe "Dossiê em construção" como subtítulo', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByText(/Dossiê em construção/)).toBeInTheDocument();
  });

  it('exibe contador de etapas a partir de totalStages', () => {
    render(<InlineLoadingBubble isDarkMode={false} processing={{ totalStages: 7 }} />);
    expect(screen.getByText('0/7')).toBeInTheDocument();
  });

  it('exibe contador com fallback 7 quando totalStages ausente', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByText('0/7')).toBeInTheDocument();
  });

  it('exibe etapa atual via processing.stage', () => {
    render(<InlineLoadingBubble isDarkMode={false} processing={{ stage: 'Mapeando operação' }} />);
    expect(screen.getByText('Mapeando operação')).toBeInTheDocument();
  });

  it('renderiza botão Interromper', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByText('Interromper')).toBeInTheDocument();
  });

  it('chama onStop ao clicar Interromper', () => {
    const onStop = vi.fn();
    render(<InlineLoadingBubble isDarkMode={false} onStop={onStop} />);
    fireEvent.click(screen.getByText('Interromper'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

/* ── CNPJ — renderização condicional ── */

describe('InlineLoadingBubble — CNPJ', () => {
  it('exibe CNPJ formatado quando prop cnpj é fornecida', () => {
    render(<InlineLoadingBubble isDarkMode={false} empresaAlvo="Scheffer" cnpj="04733767000180" />);
    expect(screen.getByText('04.733.767/0001-80')).toBeInTheDocument();
  });

  it('não exibe CNPJ quando prop cnpj é undefined', () => {
    render(<InlineLoadingBubble isDarkMode={false} empresaAlvo="Scheffer" />);
    expect(screen.queryByText(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)).not.toBeInTheDocument();
  });

  it('não exibe CNPJ quando prop cnpj é null', () => {
    render(<InlineLoadingBubble isDarkMode={false} empresaAlvo="Scheffer" cnpj={null} />);
    expect(screen.queryByText(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)).not.toBeInTheDocument();
  });

  it('não exibe CNPJ quando prop cnpj é string vazia', () => {
    render(<InlineLoadingBubble isDarkMode={false} empresaAlvo="Scheffer" cnpj="" />);
    expect(screen.queryByText(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)).not.toBeInTheDocument();
  });
});

/* ── chatStore — integração com contexto ── */

describe('InlineLoadingBubble — chatStore integration', () => {
  it('usa processing da prop quando chatStore é null (fallback)', () => {
    mockChatStore.mockReturnValue(null);
    render(
      <InlineLoadingBubble
        isDarkMode={false}
        processing={{ stage: 'Fallback Stage', completedStages: [], totalStages: 7 }}
      />,
    );
    expect(screen.getByText('Fallback Stage')).toBeInTheDocument();
  });

  it('prefere dados do chatStore ao processing da prop', () => {
    mockChatStore.mockReturnValue({
      loadingStatus: 'Store Stage',
      completedLoadingStatuses: [],
      failureCount: 0,
      loadingTotalStages: 7,
      loadingIsIncremental: false,
    });
    render(
      <InlineLoadingBubble
        isDarkMode={false}
        processing={{ stage: 'Prop Stage', completedStages: [], totalStages: 7 }}
      />,
    );
    expect(screen.getByText('Store Stage')).toBeInTheDocument();
    expect(screen.queryByText('Prop Stage')).not.toBeInTheDocument();
  });

  it('lê completedStages do chatStore', () => {
    mockChatStore.mockReturnValue({
      loadingStatus: 'Ativo',
      completedLoadingStatuses: ['Mapeando conta real e teia societária...'],
      failureCount: 0,
      loadingTotalStages: 7,
      loadingIsIncremental: false,
    });
    render(
      <InlineLoadingBubble
        isDarkMode={false}
        processing={{ stage: 'Prop', completedStages: ['Outro'], totalStages: 7 }}
      />,
    );
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.queryByText('Prop')).not.toBeInTheDocument();
  });

  it('lê failureCount e loadingTotalStages do chatStore', () => {
    mockChatStore.mockReturnValue({
      loadingStatus: 'Etapa',
      completedLoadingStatuses: [],
      failureCount: 2,
      loadingTotalStages: 5,
      loadingIsIncremental: true,
    });
    render(
      <InlineLoadingBubble
        isDarkMode={false}
        processing={{ stage: 'X', completedStages: [], totalStages: 99, failureCount: 0 }}
      />,
    );
    expect(screen.getByText('0/5')).toBeInTheDocument();
  });
});

/* ── Regressão visual e de estilo ── */

describe('InlineLoadingBubble — regressão', () => {
  it('renderiza com classes de modo escuro', () => {
    const { container } = render(<InlineLoadingBubble isDarkMode={true} />);
    expect(container.querySelector('.bg-slate-900')).toBeInTheDocument();
  });

  it('renderiza com classes de modo claro', () => {
    const { container } = render(<InlineLoadingBubble isDarkMode={false} />);
    expect(container.querySelector('.bg-white')).toBeInTheDocument();
  });

  it('exibe label "Em foco agora"', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByText('Em foco agora')).toBeInTheDocument();
  });

  it('não vaza referência ao Composer', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.queryByText(/Composer/)).not.toBeInTheDocument();
  });

  it('não vaza referência a radar', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.queryByText(/radar/i)).not.toBeInTheDocument();
  });

  it('não renderiza loading-smart-overlay (contrato do inline)', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.queryByTestId('loading-smart-overlay')).not.toBeInTheDocument();
  });

  it('data-testid é inline-loading-bubble (identidade estável)', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByTestId('inline-loading-bubble')).toBeInTheDocument();
  });

  it('botão Interromper fica disabled após clique (debounce)', () => {
    const onStop = vi.fn();
    render(<InlineLoadingBubble isDarkMode={false} onStop={onStop} />);
    const btn = screen.getByText('Interromper');
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
  });

  it('Interromper não chama onStop múltiplas vezes no debounce', () => {
    const onStop = vi.fn();
    render(<InlineLoadingBubble isDarkMode={false} onStop={onStop} />);
    const btn = screen.getByText('Interromper');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('auto-destrói quando store diz que loading acabou (trava Bug A — stale mount)', async () => {
    // Monta com store dizendo que loading acabou
    mockChatStore.mockReturnValue({ isLoading: false });
    render(<InlineLoadingBubble isDarkMode={false} />);

    // Grace period de 200ms ainda não passou — ainda renderiza
    expect(screen.getByTestId('inline-loading-bubble')).toBeInTheDocument();

    // Aguarda o useEffect disparar o setTimeout(200) → setGraceExpired → re-render → null
    await new Promise(r => setTimeout(r, 250));

    // Trava: componente deve retornar null quando store.isLoading é false após grace period
    expect(screen.queryByTestId('inline-loading-bubble')).not.toBeInTheDocument();
  });
});
