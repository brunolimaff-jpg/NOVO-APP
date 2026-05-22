import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoadingSmart from '../../components/LoadingSmart';

const { generateLoadingCuriositiesMock } = vi.hoisted(() => ({
  generateLoadingCuriositiesMock: vi.fn(),
}));

vi.mock('react-dom', () => ({
  default: {
    createPortal: (node: React.ReactNode) => node,
  },
  createPortal: (node: React.ReactNode) => node,
}));

vi.mock('../../services/geminiService', () => ({
  generateLoadingCuriosities: generateLoadingCuriositiesMock,
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('LoadingSmart (variante hero)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generateLoadingCuriositiesMock.mockReset();
    generateLoadingCuriositiesMock.mockResolvedValue([
      'Insight 1',
      'Insight 2',
    ]);
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
          stage: 'Mapeando conta real e teia societária...',
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

    expect(screen.getAllByText('Mapeando conta real e teia societária...').length).toBeGreaterThan(0);
    expect(screen.getByText('Mapeando operação e cadeia de valor...')).toBeInTheDocument();
    expect(screen.getByText(/Análise em execução/i)).toBeInTheDocument();
    expect(screen.queryByText(/Etapa\s+\d+\s+de\s+\d+/i)).not.toBeInTheDocument();
    // No "Full Roadmap", todas as etapas do plano aparecem desde o início
    expect(screen.getByText('Verificando pressões e compliance...')).toBeInTheDocument();
    expect(screen.queryByText(/📊/i)).not.toBeInTheDocument();
  });

  it('mostra apenas etapas concluídas, atual e próxima etapa planejada', async () => {
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        processing={{
          stage: 'Verificando pressões e compliance...',
          completedStages: [
            'Mapeando conta real e teia societária...',
            'Mapeando operação e cadeia de valor...',
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

    expect(screen.getByText('Mapeando conta real e teia societária...')).toBeInTheDocument();
    expect(screen.getByText('Mapeando operação e cadeia de valor...')).toBeInTheDocument();
    expect(screen.getAllByText('Verificando pressões e compliance...').length).toBeGreaterThan(0);
    // Verificamos que o roadmap está completo com os novos labels
    expect(screen.getByText('Identificando bordas de controle...')).toBeInTheDocument();
    expect(screen.getByText('Mapeando caminho de venda...')).toBeInTheDocument();
  });

  it('não duplica avanço quando a mesma etapa concluída chega em re-renders rápidos', async () => {
    const props = {
      isLoading: true,
      mode: 'investigacao' as const,
      isDarkMode: false,
      processing: {
        stage: 'Entendendo a operação e tecnologia...',
        completedStages: [] as string[],
        totalStages: 7,
        failureCount: 0,
      },
      searchQuery: 'Acme Agro',
      empresaAlvo: 'Acme Agro',
    };

    const { rerender } = render(<LoadingSmart {...props} />);

    rerender(
      <LoadingSmart
        {...props}
        processing={{
          ...props.processing,
          completedStages: ['Mapeando inteligência operacional...'],
        }}
      />,
    );

    rerender(
      <LoadingSmart
        {...props}
        processing={{
          ...props.processing,
          completedStages: ['Mapeando inteligência operacional...'],
        }}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.getAllByText(/14%/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/29%/i)).not.toBeInTheDocument();
  });

  it('não duplica a etapa de compliance quando chegam labels equivalentes', async () => {
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        processing={{
          stage: 'Verificando sinais de risco e conformidade...',
          completedStages: ['Investigando riscos & compliance...'],
          totalStages: 7,
          failureCount: 0,
        }}
        searchQuery="Acme Agro"
        empresaAlvo="Acme Agro"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getAllByText('Verificando sinais de risco e conformidade...')).toHaveLength(2);
  });

  it('reseta o insight imediatamente quando o contexto muda de empresa', async () => {
    const firstRequest = createDeferred<string[]>();
    generateLoadingCuriositiesMock.mockReturnValueOnce(firstRequest.promise);

    const { rerender } = render(
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
        searchQuery="Investigar HART'S - ALIMENTOS NATURAIS LTDA"
        empresaAlvo="HART'S - ALIMENTOS NATURAIS LTDA"
      />,
    );

    rerender(
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
        searchQuery="Investigar Grupo Scheffer"
        empresaAlvo="Grupo Scheffer"
      />,
    );

    expect(
      screen.getByText(/Mapeando sinais operacionais e footprint de mercado da Grupo Scheffer/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/HART'S - ALIMENTOS NATURAIS LTDA/i)).not.toBeInTheDocument();

    await act(async () => {
      firstRequest.resolve(["Desconstruindo a teia societária da HART'S - ALIMENTOS NATURAIS LTDA para calibrar o Score PORTA contra o setor."]);
      await Promise.resolve();
    });
  });

  it('ignora curiosidades atrasadas de uma empresa anterior', async () => {
    const firstRequest = createDeferred<string[]>();
    const secondRequest = createDeferred<string[]>();

    generateLoadingCuriositiesMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const { rerender } = render(
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
        searchQuery="Investigar HART'S - ALIMENTOS NATURAIS LTDA"
        empresaAlvo="HART'S - ALIMENTOS NATURAIS LTDA"
      />,
    );

    rerender(
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
        searchQuery="Investigar Grupo Scheffer"
        empresaAlvo="Grupo Scheffer"
      />,
    );

    await act(async () => {
      secondRequest.resolve([
        'Desconstruindo a teia societária do Grupo Scheffer para calibrar o Score PORTA contra o setor.',
        'Rastreando o perímetro fiscal do Grupo Scheffer para identificar riscos ocultos.',
      ]);
      await Promise.resolve();
    });

    expect(
      screen.getByText(/Desconstruindo a teia societária do Grupo Scheffer/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/HART'S - ALIMENTOS NATURAIS LTDA/i)).not.toBeInTheDocument();

    await act(async () => {
      firstRequest.resolve([
        "Desconstruindo a teia societária da HART'S - ALIMENTOS NATURAIS LTDA para calibrar o Score PORTA contra o setor.",
        "Auditando o perímetro fiscal da HART'S - ALIMENTOS NATURAIS LTDA para detectar riscos e incentivos ocultos.",
      ]);
      await Promise.resolve();
    });

    expect(
      screen.getByText(/Desconstruindo a teia societária do Grupo Scheffer/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/HART'S - ALIMENTOS NATURAIS LTDA/i)).not.toBeInTheDocument();
  });
});
