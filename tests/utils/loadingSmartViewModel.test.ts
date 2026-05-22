import { describe, expect, it } from 'vitest';
import { buildLoadingSmartViewModel, getLoadingStageIdentity } from '../../utils/loadingSmartViewModel';

describe('loadingSmartViewModel', () => {
  it('usa o total declarado para calcular progresso do roteiro modular', () => {
    const viewModel = buildLoadingSmartViewModel({
      displayedCompleted: ['Mapeando conta real e teia societária...'],
      displayedCurrent: 'Mapeando operação e cadeia de valor...',
      pendingInQueue: 0,
      processing: {
        completedStages: ['Mapeando conta real e teia societária...'],
        totalStages: 7,
      },
    });

    expect(viewModel.percent).toBe(14);
    expect(viewModel.completedCount).toBe(1);
    expect(viewModel.currentRich.label).toBe('Mapeando operação e cadeia de valor...');
    expect(viewModel.visiblePlannedStages.map(stage => stage.label)).toContain('Finalizando cards de auditoria...');
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

  it('mantém o percentual alinhado às etapas reais mesmo quando há fila visual pendente', () => {
    const viewModel = buildLoadingSmartViewModel({
      displayedCompleted: ['Mapeando conta real e teia societária...'],
      displayedCurrent: 'Identificando bordas de controle...',
      pendingInQueue: 1,
      processing: {
        completedStages: [
          'Mapeando conta real e teia societária...',
          'Mapeando operação e cadeia de valor...',
          'Identificando bordas de controle...',
        ],
        totalStages: 7,
      },
    });

    expect(viewModel.percent).toBe(43);
  });

  it('mantém a barra alinhada ao progresso real quando a fila visual ainda não revelou etapas', () => {
    const viewModel = buildLoadingSmartViewModel({
      displayedCompleted: [],
      displayedCurrent: 'Verificando pressões e compliance...',
      pendingInQueue: 0,
      processing: {
        completedStages: [
          'Mapeando conta real e teia societária...',
          'Mapeando operação e cadeia de valor...',
        ],
        totalStages: 7,
      },
    });

    expect(viewModel.percent).toBe(29);
    expect(viewModel.completedStageKeys.size).toBe(2);
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
