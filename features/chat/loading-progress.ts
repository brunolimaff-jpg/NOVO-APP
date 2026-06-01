import { useCallback, useEffect, useRef, useState } from 'react';
import {
  finalizeLoadingProgress,
  startIncrementalLoadingProgress,
  transitionLoadingProgress,
} from '../../utils/loadingStatus';
import type { LoadingVariant, RequestKind } from '../../utils/loadingVariant';
import { updateVisibilityState } from '../../utils/diagnosticLog';

interface LoadingProgressState {
  stage: string;
  completedStages: string[];
  totalStages?: number;
}

interface ResetLoadingProgressOptions {
  incremental?: boolean;
  keepHistory?: number;
}

interface CommitLoadingProgressInput {
  stage?: string;
  completedStages?: string[];
  totalStages?: number;
}

const INITIAL_LOADING_STAGE = 'Iniciando análise';

export function useChatLoadingProgress() {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>(INITIAL_LOADING_STAGE);
  const [failureCount, setFailureCount] = useState(0);
  const [completedLoadingStatuses, setCompletedLoadingStatuses] = useState<string[]>([]);
  const [loadingTotalStages, setLoadingTotalStages] = useState<number | undefined>(undefined);
  const [loadingIsIncremental, setLoadingIsIncremental] = useState(false);
  const [requestKind, setRequestKind] = useState<RequestKind>('default');
  const [loadingVariant, setLoadingVariant] = useState<LoadingVariant | undefined>('hero');
  const [loadingPinnedLabel, setLoadingPinnedLabel] = useState<string | null>(null);

  const loadingProgressRef = useRef<LoadingProgressState>({
    stage: INITIAL_LOADING_STAGE,
    completedStages: [],
    totalStages: undefined,
  });

  // Sincroniza estado do loading para listeners de visibilidade (fora do ciclo React)
  useEffect(() => {
    updateVisibilityState({
      isLoading,
      loadingVariant,
      requestKind,
    });
  }, [isLoading, loadingVariant, requestKind]);

  const commitLoadingProgress = useCallback((nextState: CommitLoadingProgressInput) => {
    const updated = {
      stage: typeof nextState.stage === 'string' ? nextState.stage : loadingProgressRef.current.stage,
      completedStages: Array.isArray(nextState.completedStages)
        ? nextState.completedStages
        : loadingProgressRef.current.completedStages,
      totalStages: Object.prototype.hasOwnProperty.call(nextState, 'totalStages')
        ? nextState.totalStages
        : loadingProgressRef.current.totalStages,
    };

    loadingProgressRef.current = updated;
    setLoadingStatus(updated.stage);
    setCompletedLoadingStatuses(updated.completedStages);
    setLoadingTotalStages(updated.totalStages);
  }, []);

  const resetLoadingProgress = useCallback(
    (stage: string = 'Realizando pesquisa...', totalStages?: number, options?: ResetLoadingProgressOptions) => {
      setFailureCount(0);
      const useIncremental = Boolean(options?.incremental);
      if (useIncremental) {
        const next = startIncrementalLoadingProgress(
          loadingProgressRef.current.stage,
          loadingProgressRef.current.completedStages,
          {
            stage,
            totalStages,
            maxHistory: options?.keepHistory ?? 4,
          },
        );
        setLoadingIsIncremental(true);
        commitLoadingProgress(next);
        return;
      }

      setLoadingIsIncremental(false);
      commitLoadingProgress({ stage, completedStages: [], totalStages });
    },
    [commitLoadingProgress],
  );

  const advanceLoadingProgress = useCallback(
    (nextStage: string, totalStages?: number) => {
      const next = transitionLoadingProgress(
        loadingProgressRef.current.stage,
        nextStage,
        loadingProgressRef.current.completedStages,
      );
      commitLoadingProgress({
        ...next,
        totalStages: typeof totalStages === 'number' ? totalStages : loadingProgressRef.current.totalStages,
      });
    },
    [commitLoadingProgress],
  );

  const replaceLoadingProgressStage = useCallback(
    (stage: string, totalStages?: number) => {
      commitLoadingProgress({
        stage,
        completedStages: loadingProgressRef.current.completedStages,
        totalStages: typeof totalStages === 'number' ? totalStages : loadingProgressRef.current.totalStages,
      });
    },
    [commitLoadingProgress],
  );

  const completeLoadingProgress = useCallback(() => {
    const next = finalizeLoadingProgress(loadingProgressRef.current.stage, loadingProgressRef.current.completedStages);
    commitLoadingProgress({
      ...next,
      totalStages: loadingProgressRef.current.totalStages,
    });
    setLoadingVariant(undefined);
  }, [commitLoadingProgress]);

  return {
    isLoading,
    setIsLoading,
    loadingStatus,
    failureCount,
    setFailureCount,
    completedLoadingStatuses,
    loadingTotalStages,
    loadingIsIncremental,
    requestKind,
    setRequestKind,
    loadingVariant,
    setLoadingVariant,
    loadingPinnedLabel,
    setLoadingPinnedLabel,
    resetLoadingProgress,
    advanceLoadingProgress,
    replaceLoadingProgressStage,
    completeLoadingProgress,
  };
}
