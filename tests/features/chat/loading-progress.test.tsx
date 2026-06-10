import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useChatLoadingProgress } from '../../../features/chat/loading-progress';

describe('useChatLoadingProgress', () => {
  it('inicia com o contrato de loading esperado pelo App', () => {
    const { result } = renderHook(() => useChatLoadingProgress());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.loadingStatus).toBe('Iniciando análise');
    expect(result.current.failureCount).toBe(0);
    expect(result.current.completedLoadingStatuses).toEqual([]);
    expect(result.current.loadingTotalStages).toBeUndefined();
    expect(result.current.loadingIsIncremental).toBe(false);
    expect(result.current.requestKind).toBe('default');
    expect(result.current.loadingVariant).toBe('hero');
    expect(result.current.loadingPinnedLabel).toBeNull();
  });

  it('reseta progresso regular e limpa falhas', () => {
    const { result } = renderHook(() => useChatLoadingProgress());

    act(() => {
      result.current.setFailureCount(2);
      result.current.resetLoadingProgress('Buscando dados', 7);
    });

    expect(result.current.failureCount).toBe(0);
    expect(result.current.loadingStatus).toBe('Buscando dados');
    expect(result.current.completedLoadingStatuses).toEqual(['Iniciando análise']);
    expect(result.current.loadingTotalStages).toBe(7);
    expect(result.current.loadingIsIncremental).toBe(false);
  });

  it('preserva historico resumido no progresso incremental', () => {
    const { result } = renderHook(() => useChatLoadingProgress());

    act(() => {
      result.current.resetLoadingProgress('Buscando dados', 7);
      result.current.resetLoadingProgress('Aprofundando análise...', 6, {
        incremental: true,
        keepHistory: 2,
      });
    });

    expect(result.current.loadingStatus).toBe('Aprofundando análise...');
    expect(result.current.completedLoadingStatuses).toEqual(['Iniciando análise', 'Buscando dados']);
    expect(result.current.loadingTotalStages).toBe(6);
    expect(result.current.loadingIsIncremental).toBe(true);
  });

  it('avanca e conclui progresso sem perder total de etapas', () => {
    const { result } = renderHook(() => useChatLoadingProgress());

    act(() => {
      result.current.resetLoadingProgress('Buscando dados', 5);
      result.current.advanceLoadingProgress('Validando resposta');
    });

    expect(result.current.loadingStatus).toBe('Validando resposta');
    expect(result.current.completedLoadingStatuses).toEqual(['Iniciando análise', 'Buscando dados']);
    expect(result.current.loadingTotalStages).toBe(5);

    act(() => {
      result.current.completeLoadingProgress();
    });

    expect(result.current.loadingStatus).toBe('');
    expect(result.current.completedLoadingStatuses).toEqual([
      'Iniciando análise',
      'Buscando dados',
      'Validando resposta',
    ]);
    expect(result.current.loadingTotalStages).toBe(5);
  });

  it('expoe estados de loading usados por stop, retry e deep dive', () => {
    const { result } = renderHook(() => useChatLoadingProgress());

    act(() => {
      result.current.setIsLoading(true);
      result.current.setRequestKind('deep_dive');
      result.current.setLoadingVariant('inline');
      result.current.setLoadingPinnedLabel('Deep Dive em andamento');
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.requestKind).toBe('deep_dive');
    expect(result.current.loadingVariant).toBe('inline');
    expect(result.current.loadingPinnedLabel).toBe('Deep Dive em andamento');
  });
});
