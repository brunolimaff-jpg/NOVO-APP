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


import { fireEvent } from '@testing-library/react';

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

    expect(screen.getAllByText(/21%/i).length).toBeGreaterThan(0);
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

  it('incrementa cronômetro da etapa de backoff quando failureCount > 0', async () => {
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        processing={{
          stage: 'Finalizando cards de auditoria...',
          completedStages: [
            'Mapeando conta real e teia societária...',
            'Mapeando operação e cadeia de valor...',
            'Identificando bordas de controle...',
            'Verificando pressões e compliance...',
            'Mapeando caminho de venda...',
            'Cruzando referências de mercado...',
          ],
          totalStages: 7,
          failureCount: 1,
        }}
        searchQuery="Scheffer"
        empresaAlvo="Grupo Scheffer"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });

    const timers = screen.getAllByText(/\d+s|\d+m \d+s/);
    const hasNonZero = timers.some(node => {
      const t = node.textContent || '';
      return !/^0s$/.test(t.trim());
    });
    expect(hasNonZero).toBe(true);
  });

  it('mostra contador de segundos em cada etapa (concluída, ativa e pendente)', async () => {
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        processing={{
          stage: 'Mapeando operação e cadeia de valor...',
          completedStages: ['Mapeando conta real e teia societária...'],
          totalStages: 7,
          failureCount: 0,
        }}
        searchQuery="Acme Agro"
        empresaAlvo="Acme Agro"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    const timers = screen.getAllByText(/\d+s|\d+m \d+s/);
    expect(timers.length).toBeGreaterThanOrEqual(7);
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
          completedStages: ['Mapeando conta real e teia societária...', 'Mapeando operação e cadeia de valor...'],
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

    expect(screen.getAllByText(/21%/i).length).toBeGreaterThan(0);
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

    expect(screen.getAllByText('Verificando sinais de risco e conformidade...')).toHaveLength(1);
    expect(screen.queryByText('Investigando riscos & compliance...')).not.toBeInTheDocument();
  });

  it('atualiza o insight local quando o contexto muda de empresa', () => {
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

    expect(screen.getByText(/Prévia do dossiê da Grupo Scheffer: separando sinais públicos/i)).toBeInTheDocument();
    expect(screen.queryByText(/HART'S - ALIMENTOS NATURAIS LTDA/i)).not.toBeInTheDocument();
  });

  it('mantém curiosidades exclusivamente locais e determinísticas', () => {
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
        searchQuery="Investigar Grupo Scheffer"
        empresaAlvo="Grupo Scheffer"
      />,
    );

    expect(screen.getByText(/Prévia do dossiê da Grupo Scheffer: separando sinais públicos/i)).toBeInTheDocument();
  });

  it('após o tempo máximo, entra em stall observável em vez de sumir silenciosamente', async () => {
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        searchQuery="Acme Agro"
        empresaAlvo="Acme Agro"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });

    // Overlay continua visível com banner de stall (nunca sem feedback)
    expect(screen.getByTestId('loading-smart-overlay')).toHaveAttribute('data-visible', 'true');
    expect(screen.getByTestId('loading-stall-banner')).toBeInTheDocument();
    expect(screen.getByText(/demorando mais que o esperado/)).toBeInTheDocument();
  });

  it('Continuar aguardando sai do stall e reinicia o timer (com nova extensão)', async () => {
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        searchQuery="Acme Agro"
        empresaAlvo="Acme Agro"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });
    expect(screen.getByTestId('loading-stall-banner')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('stall-continue'));
    });

    // Sai do stall; overlay permanece
    expect(screen.queryByTestId('loading-stall-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('loading-smart-overlay')).toHaveAttribute('data-visible', 'true');

    // Nova extensão (60s) também entra em stall em vez de sumir
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('loading-stall-banner')).toBeInTheDocument();
  });

  it('Interromper geração chama onStop', async () => {
    const onStop = vi.fn();
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        onStop={onStop}
        searchQuery="Acme Agro"
        empresaAlvo="Acme Agro"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('stall-stop'));
    });

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('concede 3 extensões completas; após o limite, só resta interromper (sem auto-stop)', async () => {
    const onStop = vi.fn();
    render(
      <LoadingSmart
        isLoading
        mode="investigacao"
        isDarkMode={false}
        onStop={onStop}
        searchQuery="Acme Agro"
        empresaAlvo="Acme Agro"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });

    // As 3 extensões são concedidas integralmente (nunca auto-stop)
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        fireEvent.click(screen.getByTestId('stall-continue'));
        vi.advanceTimersByTime(60_000);
      });
      expect(onStop).not.toHaveBeenCalled();
      // Cada extensão re-entra em stall observável
      expect(screen.getByTestId('loading-stall-banner')).toBeInTheDocument();
    }

    // Limite atingido: botão de continuar some; só resta interromper
    expect(screen.queryByTestId('stall-continue')).not.toBeInTheDocument();
    expect(screen.getByTestId('stall-stop')).toBeInTheDocument();

    // Interromper é ação EXPLÍCITA do usuário
    await act(async () => {
      fireEvent.click(screen.getByTestId('stall-stop'));
    });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('reseta o contador de extensões entre gerações', async () => {
    const onStop = vi.fn();
    const props = {
      isLoading: true,
      mode: 'investigacao' as const,
      isDarkMode: false,
      onStop,
      searchQuery: 'Acme Agro',
      empresaAlvo: 'Acme Agro',
    };

    // 1ª geração: esgota as extensões
    const first = render(<LoadingSmart {...props} />);
    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        fireEvent.click(screen.getByTestId('stall-continue'));
        vi.advanceTimersByTime(60_000);
      });
    }
    expect(screen.queryByTestId('stall-continue')).not.toBeInTheDocument();
    first.unmount();

    // 2ª geração: novo ciclo de loading → contador zerado, extensões disponíveis
    render(<LoadingSmart {...props} />);
    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });

    expect(screen.getByTestId('loading-stall-banner')).toBeInTheDocument();
    expect(screen.getByTestId('stall-continue')).toBeInTheDocument();
    expect(onStop).not.toHaveBeenCalled();
  });
});
