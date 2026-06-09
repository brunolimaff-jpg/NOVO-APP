import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InlineLoadingBubble from '../../components/InlineLoadingBubble';

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

describe('InlineLoadingBubble', () => {
  it('renderiza o componente com data-testid', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByTestId('inline-loading-bubble')).toBeInTheDocument();
  });

  it('mostra nome da empresa quando empresaAlvo é fornecido', () => {
    render(<InlineLoadingBubble isDarkMode={false} empresaAlvo="Grupo Scheffer" />);
    expect(screen.getByText('Grupo Scheffer')).toBeInTheDocument();
  });

  it('mostra "Análise" quando empresaAlvo e lastUserQuery estão vazios', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByText('Análise')).toBeInTheDocument();
  });

  it('mostra "Dossiê em construção" como subtítulo', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByText(/Dossiê em construção/)).toBeInTheDocument();
  });

  it('renderiza botão Interromper', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByText('Interromper')).toBeInTheDocument();
  });

  it('chama onStop quando botão Interromper é clicado', () => {
    const onStop = vi.fn();
    render(<InlineLoadingBubble isDarkMode={false} onStop={onStop} />);
    fireEvent.click(screen.getByText('Interromper'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('mostra "Em foco agora" como label da etapa atual', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByText('Em foco agora')).toBeInTheDocument();
  });

  it('mostra etapa atual do processing quando fornecida', () => {
    render(<InlineLoadingBubble isDarkMode={false} processing={{ stage: 'Mapeando operação' }} />);
    expect(screen.getByText('Mapeando operação')).toBeInTheDocument();
  });

  it('mostra contador de etapas', () => {
    render(<InlineLoadingBubble isDarkMode={false} processing={{ totalStages: 7 }} />);
    expect(screen.getByText('0/7')).toBeInTheDocument();
  });

  it('renderiza com classes de modo escuro', () => {
    const { container } = render(<InlineLoadingBubble isDarkMode={true} />);
    expect(container.querySelector('.bg-slate-900')).toBeInTheDocument();
  });

  it('renderiza com classes de modo claro', () => {
    const { container } = render(<InlineLoadingBubble isDarkMode={false} />);
    expect(container.querySelector('.bg-white')).toBeInTheDocument();
  });

  it('não renderiza menção ao Composer', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.queryByText(/Composer/)).not.toBeInTheDocument();
  });

  it('não renderiza referência a radar', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.queryByText(/radar/i)).not.toBeInTheDocument();
  });
});
