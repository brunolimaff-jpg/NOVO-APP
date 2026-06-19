import type { GenerationKind } from '../../utils/cofreLifecycle';
import type { LoadingVariant, RequestKind } from '../../utils/loadingVariant';

export const INITIAL_LOADING_STAGE = 'Iniciando análise';

export interface LoadingProgressState {
  stage: string;
  completedStages: string[];
  totalStages?: number;
}

export interface LoadingStoreState {
  isLoading: boolean;
  loadingStatus: string;
  failureCount: number;
  completedLoadingStatuses: string[];
  loadingTotalStages?: number;
  loadingIsIncremental: boolean;
  requestKind: RequestKind;
  loadingVariant?: LoadingVariant;
  loadingPinnedLabel: string | null;
  generationKind: GenerationKind;
}

export const initialLoadingStoreState = (): LoadingStoreState => ({
  isLoading: false,
  loadingStatus: INITIAL_LOADING_STAGE,
  failureCount: 0,
  completedLoadingStatuses: [],
  loadingTotalStages: undefined,
  loadingIsIncremental: false,
  requestKind: 'default',
  loadingVariant: 'hero',
  loadingPinnedLabel: null,
  generationKind: null,
});

export type LoadingStoreAction =
  | { type: 'set_is_loading'; value: boolean }
  | { type: 'set_failure_count'; value: number | ((prev: number) => number) }
  | { type: 'set_request_kind'; value: RequestKind }
  | { type: 'set_loading_variant'; value: LoadingVariant | undefined }
  | { type: 'set_loading_pinned_label'; value: string | null }
  | { type: 'set_generation_kind'; value: GenerationKind }
  | {
      type: 'commit_progress';
      patch: { stage: string; completedStages: string[]; totalStages?: number };
    }
  | { type: 'set_incremental'; value: boolean };

export function loadingStoreReducer(state: LoadingStoreState, action: LoadingStoreAction): LoadingStoreState {
  switch (action.type) {
    case 'set_is_loading':
      return { ...state, isLoading: action.value };
    case 'set_failure_count': {
      const next = typeof action.value === 'function' ? action.value(state.failureCount) : action.value;
      return { ...state, failureCount: next };
    }
    case 'set_request_kind':
      return { ...state, requestKind: action.value };
    case 'set_loading_variant':
      return { ...state, loadingVariant: action.value };
    case 'set_loading_pinned_label':
      return { ...state, loadingPinnedLabel: action.value };
    case 'set_generation_kind':
      return { ...state, generationKind: action.value };
    case 'set_incremental':
      return { ...state, loadingIsIncremental: action.value };
    case 'commit_progress':
      return {
        ...state,
        loadingStatus: action.patch.stage,
        completedLoadingStatuses: action.patch.completedStages,
        loadingTotalStages: action.patch.totalStages,
      };
    default:
      return state;
  }
}
