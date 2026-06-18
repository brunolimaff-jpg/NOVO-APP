import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import CofreOverlay from '../../components/CofreOverlay';
import type { CofrePhase, CofreStage } from '../../components/CofreOverlay';

// ── Helpers ──

function defaultProps(overrides: Partial<{
  phase: CofrePhase;
  isDarkMode: boolean;
  empresaAlvo: string | null;
  cnpj: string | null;
  completedStageCount: number;
  totalStageCount: number;
  stages: CofreStage[];
  elapsedTimeMs: number;
  onStop: () => void;
}> = {}) {
  return {
    phase: 'visible' as CofrePhase,
    isDarkMode: false,
    empresaAlvo: null,
    cnpj: null,
    completedStageCount: 0,
    totalStageCount: 0,
    stages: [] as CofreStage[],
    elapsedTimeMs: 0,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────
//  RENDERIZAÇÃO POR FASE
// ─────────────────────────────────────────────────────

describe('CofreOverlay', () => {
  it('retorna null quando phase = hidden', () => {
    const { container } = render(<CofreOverlay {...defaultProps({ phase: 'hidden' })} />);
    expect(container.innerHTML).toBe('');
  });

  it('renderiza overlay quando phase = entering', () => {
    const { container, getByText } = render(<CofreOverlay {...defaultProps({ phase: 'entering' })} />);

    // O data-cofre-phase deve refletir o valor
    const overlay = container.querySelector('[data-cofre-phase="entering"]');
    expect(overlay).toBeInTheDocument();

    // Título principal presente
    expect(getByText('Briefing estrategico')).toBeInTheDocument();
    expect(getByText('sendo preparado')).toBeInTheDocument();
  });

  it('renderiza overlay quando phase = visible', () => {
    const { container, getByText } = render(<CofreOverlay {...defaultProps({ phase: 'visible' })} />);

    const overlay = container.querySelector('[data-cofre-phase="visible"]');
    expect(overlay).toBeInTheDocument();

    expect(getByText('Briefing estrategico')).toBeInTheDocument();
  });

  it('renderiza overlay quando phase = dissolving', () => {
    const { container, getByText } = render(<CofreOverlay {...defaultProps({ phase: 'dissolving' })} />);

    const overlay = container.querySelector('[data-cofre-phase="dissolving"]');
    expect(overlay).toBeInTheDocument();

    expect(getByText('Briefing estrategico')).toBeInTheDocument();
  });

  // ── Botão Interromper ──

  it('dispara onStop ao clicar em Interromper', () => {
    const onStop = vi.fn();
    const { getByText } = render(
      <CofreOverlay {...defaultProps({ phase: 'visible', onStop })} />,
    );

    fireEvent.click(getByText('Interromper'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('não renderiza botão Interromper se onStop não for fornecido', () => {
    const { queryByText } = render(
      <CofreOverlay {...defaultProps({ phase: 'visible', onStop: undefined })} />,
    );

    expect(queryByText('Interromper')).not.toBeInTheDocument();
  });

  // ── Dados da empresa ──

  it('exibe nome da empresa e CNPJ formatado', () => {
    const { getByText } = render(
      <CofreOverlay
        {...defaultProps({
          phase: 'visible',
          empresaAlvo: 'Empresa Exemplo Ltda',
          cnpj: '11222333000181',
        })}
      />,
    );

    expect(getByText('Empresa Exemplo Ltda')).toBeInTheDocument();
    expect(getByText('11.222.333/0001-81')).toBeInTheDocument();
  });

  it('exibe fallback "Empresa" quando empresaAlvo é null', () => {
    const { getByText } = render(
      <CofreOverlay
        {...defaultProps({
          phase: 'visible',
          empresaAlvo: null,
          cnpj: null,
        })}
      />,
    );

    expect(getByText('Empresa')).toBeInTheDocument();
  });

  // ── Lista de estágios ──

  it('exibe lista de estágios com checkmarks e spinners', () => {
    const stages: CofreStage[] = [
      { label: 'Perfil Comercial', completed: true, elapsedMs: 4500 },
      { label: 'Mercado', completed: false, elapsedMs: 2000 },
      { label: 'Riscos', completed: false, elapsedMs: 0 },
    ];

    const { getByText, container } = render(
      <CofreOverlay
        {...defaultProps({
          phase: 'visible',
          stages,
          completedStageCount: 1,
          totalStageCount: 3,
        })}
      />,
    );

    // Cabeçalho de progresso
    expect(getByText('1 de 3 modulos concluidos')).toBeInTheDocument();

    // Nomes dos estágios
    expect(getByText('Perfil Comercial')).toBeInTheDocument();
    expect(getByText('Mercado')).toBeInTheDocument();
    expect(getByText('Riscos')).toBeInTheDocument();

    // O estágio concluído exibe o tempo formatado
    expect(getByText('4s')).toBeInTheDocument();
  });

  it('não exibe lista de estágios se array vazio', () => {
    const { queryByText } = render(
      <CofreOverlay
        {...defaultProps({
          phase: 'visible',
          stages: [],
          completedStageCount: 0,
          totalStageCount: 0,
        })}
      />,
    );

    // O cabeçalho de progresso deve renderizar mesmo sem estágios
    expect(queryByText('0 de 0 modulos concluidos')).toBeInTheDocument();

    // Nenhum label de estágio deve aparecer
    expect(queryByText('Perfil')).not.toBeInTheDocument();
  });

  // ── Role / Acessibilidade ──

  it('possui role="status" e aria-label apropriado', () => {
    const { container } = render(<CofreOverlay {...defaultProps({ phase: 'visible' })} />);

    const statusEl = container.querySelector('[role="status"]');
    expect(statusEl).toBeInTheDocument();
    expect(statusEl).toHaveAttribute('aria-label', 'Briefing estrategico sendo preparado');
  });
});
