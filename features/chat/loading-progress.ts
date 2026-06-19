import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  finalizeLoadingProgress,
  startIncrementalLoadingProgress,
  transitionLoadingProgress,
} from '../../utils/loadingStatus';
import type { LoadingVariant, RequestKind } from '../../utils/loadingVariant';
import { updateVisibilityState } from '../../utils/diagnosticLog';
import type { GenerationKind } from '../../utils/cofreLifecycle';
import {
  INITIAL_LOADING_STAGE,
  initialLoadingStoreState,
  loadingStoreReducer,
  type LoadingProgressState,
} from './loading-progress-reducer';

interface ResetLoadingProgressOptions {
  incremental?: boolean;
  keepHistory?: number;
}

interface CommitLoadingProgressInput {
  stage?: string;
  completedStages?: string[];
  totalStages?: number;
}

export function useChatLoadingProgress() {
  const [state, dispatch] = useReducer(loadingStoreReducer, undefined, initialLoadingStoreState);

  const loadingProgressRef = useRef<LoadingProgressState>({
    stage: INITIAL_LOADING_STAGE,
    completedStages: [],
    totalStages: undefined,
  });

  useEffect(() => {
    updateVisibilityState({
      isLoading: state.isLoading,
      loadingVariant: state.loadingVariant,
      requestKind: state.requestKind,
    });
  }, [state.isLoading, state.loadingVariant, state.requestKind]);

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
    dispatch({ type: 'commit_progress', patch: updated });
  }, []);

  const resetLoadingProgress = useCallback(
    (stage: string = 'Realizando pesquisa...', totalStages?: number, options?: ResetLoadingProgressOptions) => {
      dispatch({ type: 'set_failure_count', value: 0 });
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
        dispatch({ type: 'set_incremental', value: true });
        commitLoadingProgress(next);
        return;
      }

      dispatch({ type: 'set_incremental', value: false });
      const priorStage = loadingProgressRef.current.stage;
      const priorCompleted = loadingProgressRef.current.completedStages;
      const carryOver = priorStage && priorStage !== stage ? [priorStage] : [];
      commitLoadingProgress({
        stage,
        completedStages: [...priorCompleted, ...carryOver],
        totalStages,
      });
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
  }, [commitLoadingProgress]);

  const setIsLoading = useCallback((value: boolean) => {
    dispatch({ type: 'set_is_loading', value });
  }, []);

  const setFailureCount = useCallback((value: number | ((prev: number) => number)) => {
    dispatch({ type: 'set_failure_count', value });
  }, []);

  const setRequestKind = useCallback((value: RequestKind) => {
    dispatch({ type: 'set_request_kind', value });
  }, []);

  const setLoadingVariant = useCallback((value: LoadingVariant | undefined) => {
    dispatch({ type: 'set_loading_variant', value });
  }, []);

  const setLoadingPinnedLabel = useCallback((value: string | null) => {
    dispatch({ type: 'set_loading_pinned_label', value });
  }, []);

  const setGenerationKind = useCallback((value: GenerationKind) => {
    dispatch({ type: 'set_generation_kind', value });
  }, []);

  return {
    isLoading: state.isLoading,
    setIsLoading,
    loadingStatus: state.loadingStatus,
    failureCount: state.failureCount,
    setFailureCount,
    completedLoadingStatuses: state.completedLoadingStatuses,
    loadingTotalStages: state.loadingTotalStages,
    loadingIsIncremental: state.loadingIsIncremental,
    requestKind: state.requestKind,
    setRequestKind,
    loadingVariant: state.loadingVariant,
    setLoadingVariant,
    loadingPinnedLabel: state.loadingPinnedLabel,
    setLoadingPinnedLabel,
    generationKind: state.generationKind,
    setGenerationKind,
    resetLoadingProgress,
    advanceLoadingProgress,
    replaceLoadingProgressStage,
    completeLoadingProgress,
  };
}
