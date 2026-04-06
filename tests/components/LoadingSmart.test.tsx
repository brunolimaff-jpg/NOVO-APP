import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoadingSmart from '../../components/LoadingSmart';

vi.mock('react-dom', () => ({
  default: {
    createPortal: (node: React.ReactNode) => node,
  },
  createPortal: (node: React.ReactNode) => node,
}));

vi.mock('../../services/geminiService', () => ({
  generateLoadingCuriosities: vi.fn().mockResolvedValue([
    'Insight 1',
    'Insight 2',
  ]),
}));

describe('LoadingSmart (variante hero)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('usa processing.totalStages para fazer o progresso sair de 0%', async () => {
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        processing={{
          stage: 'Entendendo a operação e tecnologia...',
          completedStages: ['Mapeando inteligência operacional...'],
          totalStages: 7,
          failureCount: 0,
        }}
        searchQuery="Acme Agro"
        empresaAlvo="Acme Agro"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getAllByText(/14%/i).length).toBeGreaterThan(0);
  });

  it('não mantém a última etapa pendente quando todas já foram concluídas', async () => {
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        processing={{
          stage: '',
          completedStages: [
            'Mapeando inteligência operacional...',
            'Entendendo a operação e tecnologia...',
            'Verificando sinais de risco e conformidade...',
            'Analisando movimento e posicionamento de mercado...',
            'Identificando estrutura, liderança e decisores...',
            'Reunindo referências e sinais de mercado...',
            'Consolidando a análise final...',
          ],
          totalStages: 7,
          failureCount: 0,
        }}
        searchQuery="Acme Agro"
        empresaAlvo="Acme Agro"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.getAllByText(/95%/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/próxima etapa/i)).not.toBeInTheDocument();
  });

  it('mostra a análise em execução com etapas enxutas e sem emoji', async () => {
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        processing={{
          stage: 'Mapeando inteligência operacional...',
          completedStages: [],
          totalStages: 7,
          failureCount: 0,
        }}
        searchQuery="Acme Agro"
        empresaAlvo="Acme Agro"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getAllByText('Mapeando inteligência operacional...').length).toBeGreaterThan(0);
    expect(screen.getByText('Entendendo a operação e tecnologia...')).toBeInTheDocument();
    expect(screen.getByText(/Análise em execução/i)).toBeInTheDocument();
    expect(screen.queryByText(/Etapa\s+\d+\s+de\s+\d+/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Verificando sinais de risco e conformidade...')).not.toBeInTheDocument();
    expect(screen.queryByText(/📊/i)).not.toBeInTheDocument();
  });

  it('mostra apenas etapas concluídas, atual e próxima etapa planejada', async () => {
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        processing={{
          stage: 'Verificando sinais de risco e conformidade...',
          completedStages: [
            'Mapeando inteligência operacional...',
            'Entendendo a operação e tecnologia...',
          ],
          totalStages: 7,
          failureCount: 0,
        }}
        searchQuery="Acme Agro"
        empresaAlvo="Acme Agro"
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Mapeando inteligência operacional...')).toBeInTheDocument();
    expect(screen.getByText('Entendendo a operação e tecnologia...')).toBeInTheDocument();
    expect(screen.getAllByText('Verificando sinais de risco e conformidade...').length).toBeGreaterThan(0);
    expect(screen.getByText('Analisando movimento e posicionamento de mercado...')).toBeInTheDocument();
    expect(screen.queryByText('Identificando estrutura, liderança e decisores...')).not.toBeInTheDocument();
  });
});
