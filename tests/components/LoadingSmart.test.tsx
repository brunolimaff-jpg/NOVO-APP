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

describe('LoadingSmart', () => {
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
          stage: 'Investigando tech stack...',
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
            'Investigando tech stack...',
            'Investigando riscos & compliance...',
            'Investigando estratégia & expansão...',
            'Investigando RH & decisores...',
            'Cruzando referências de mercado...',
            'Finalizando dossiê modular...',
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
});
