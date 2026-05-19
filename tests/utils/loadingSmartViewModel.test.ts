import { describe, expect, it } from 'vitest';
import { buildLoadingSmartViewModel, getLoadingStageIdentity } from '../../utils/loadingSmartViewModel';

describe('loadingSmartViewModel', () => {
  it('usa o total declarado para calcular progresso do roteiro modular', () => {
    const viewModel = buildLoadingSmartViewModel({
      displayedCompleted: ['Mapeando inteligência operacional...'],
      displayedCurrent: 'Entendendo a operação e tecnologia...',
      pendingInQueue: 0,
      processing: {
        completedStages: ['Mapeando inteligência operacional...'],
        totalStages: 7,
      },
    });

    expect(viewModel.percent).toBe(14);
    expect(viewModel.completedCount).toBe(1);
    expect(viewModel.currentRich.label).toBe('Entendendo a operação e tecnologia...');
    expect(viewModel.visiblePlannedStages.map(stage => stage.label)).toContain('Consolidando dossiê de inteligência final...');
  });

  it('mostra o roadmap de investigação quando a etapa observada pertence a esse plano', () => {
    const viewModel = buildLoadingSmartViewModel({
      displayedCompleted: ['Consolidando perímetro da conta alvo...'],
      displayedCurrent: 'Recuperando inteligência de conversas anteriores...',
      pendingInQueue: 0,
      processing: {
        completedStages: ['Consolidando perímetro da conta alvo...'],
      },
    });

    expect(viewModel.visiblePlannedStages.map(stage => stage.label)).toContain('Consultando inteligência Senior...');
    expect(viewModel.visiblePlannedStages.map(stage => stage.label)).toContain('Materializando recomendações práticas...');
  });

  it('suaviza o percentual quando há etapas reais pendentes na fila visual', () => {
    const viewModel = buildLoadingSmartViewModel({
      displayedCompleted: ['Mapeando inteligência operacional...'],
      displayedCurrent: 'Verificando sinais de risco e conformidade...',
      pendingInQueue: 1,
      processing: {
        completedStages: [
          'Mapeando inteligência operacional...',
          'Entendendo a operação e tecnologia...',
          'Verificando sinais de risco e conformidade...',
        ],
        totalStages: 7,
      },
    });

    expect(viewModel.percent).toBe(23);
  });

  it('usa fallback incremental quando a etapa atual não pertence a um plano fixo', () => {
    const viewModel = buildLoadingSmartViewModel({
      displayedCompleted: ['Preparando dados internos...'],
      displayedCurrent: 'Consultando endpoint interno customizado...',
      pendingInQueue: 0,
      processing: {
        completedStages: ['Preparando dados internos...'],
        isIncremental: true,
      },
    });

    expect(viewModel.shouldAppendCurrentStage).toBe(false);
    expect(viewModel.percent).toBe(17);
    expect(viewModel.visiblePlannedStages.map(stage => stage.label)).toEqual([
      'Preparando dados internos...',
      'Consultando endpoint interno customizado...',
    ]);
  });

  it('não usa labels observados como total fixo quando não há roadmap reconhecido', () => {
    const viewModel = buildLoadingSmartViewModel({
      displayedCompleted: ['Preparando dados internos...'],
      displayedCurrent: 'Consultando endpoint interno customizado...',
      pendingInQueue: 0,
      processing: {
        completedStages: ['Preparando dados internos...'],
      },
    });

    expect(viewModel.percent).toBe(8);
  });

  it('normaliza labels equivalentes para evitar duplicação visual', () => {
    expect(getLoadingStageIdentity('Investigando riscos & compliance...')).toBe(
      getLoadingStageIdentity('Verificando sinais de risco e conformidade...'),
    );
  });
});
