import { MODULAR_DOSSIER_STAGES } from '../constants/loadingStages';
import { isPhaseTimelineStatus, statusKey, toRichStatus, type RichLoadingStatus } from './loadingStatus';
import { stripInternalMarkers } from './textCleaners';

const MAX_PROGRESS_PERCENT = 95;
const QUEUED_PROGRESS_SMOOTHING_FACTOR = 0.3;
const MIN_INCREMENTAL_STAGE_TOTAL = 6;
const MIN_STANDARD_STAGE_TOTAL = 12;

export const INVESTIGATION_TIMELINE_STAGES = [
  'Consolidando perímetro da conta alvo...',
  'Recuperando inteligência de conversas anteriores...',
  'Enriquecendo sinais e contexto comercial estratégico...',
  'Orquestrando protocolo de investigação forense...',
  'Consultando inteligência Senior...',
  'Infiltrando em fontes externas e sinais digitais...',
  'Entendendo a operação e tecnologia...',
  'Verificando sinais de risco e conformidade...',
  'Identificando estrutura, liderança e decisores...',
  'Calibrando Score PORTA contra o setor...',
  'Sintetizando narrativa executiva de alto impacto...',
  'Materializando recomendações práticas...',
] as const;

export const LOADING_STAGE_ORDER_BY_KEY: ReadonlyMap<string, number> = new Map(
  [...MODULAR_DOSSIER_STAGES, ...INVESTIGATION_TIMELINE_STAGES].reduce<Array<[string, number]>>(
    (entries, stage, index) => {
      const key = getLoadingStageIdentity(stage);
      if (key && !entries.some(([existingKey]) => existingKey === key)) {
        entries.push([key, index]);
      }
      return entries;
    },
    [],
  ),
);

export interface LoadingSmartProcessingState {
  stage?: string;
  completedStages?: string[];
  failureCount?: number;
  totalStages?: number;
  isIncremental?: boolean;
}

export interface LoadingSmartViewModelInput {
  displayedCompleted: string[];
  displayedCurrent: string;
  pendingInQueue: number;
  processing?: LoadingSmartProcessingState;
}

export interface LoadingSmartViewModel {
  completedRich: RichLoadingStatus[];
  currentRich: RichLoadingStatus;
  completedCount: number;
  completedStageKeys: Set<string>;
  currentStageKey: string;
  visiblePlannedStages: RichLoadingStatus[];
  shouldAppendCurrentStage: boolean;
  percent: number;
  isIncremental: boolean;
}

export function enrichLoadingStage(raw: string): RichLoadingStatus {
  const rich = toRichStatus(stripInternalMarkers(raw));
  if (rich) return rich;

  const label = stripInternalMarkers(raw) || 'Investigação em andamento...';
  return { label, icon: isPhaseTimelineStatus(label) ? '📌' : '', category: 'unknown' };
}

export function getLoadingStageIdentity(raw: string): string {
  const label = stripInternalMarkers(raw).trim();
  return label ? statusKey(label) : '';
}

function hasObservedStage(candidate: readonly string[], observedKeys: Set<string>): boolean {
  return candidate.some(stage => observedKeys.has(getLoadingStageIdentity(stage)));
}

function getDeclaredTotalStages(totalStages?: number): number | null {
  return typeof totalStages === 'number' && Number.isFinite(totalStages) && totalStages > 0
    ? totalStages
    : null;
}

export function buildLoadingSmartViewModel({
  displayedCompleted,
  displayedCurrent,
  pendingInQueue,
  processing,
}: LoadingSmartViewModelInput): LoadingSmartViewModel {
  const completedRich = displayedCompleted.map(enrichLoadingStage);
  const currentRich = enrichLoadingStage(displayedCurrent);
  const completedCount = completedRich.length;
  const realCompletedStages = processing?.completedStages || [];
  const realTotalCompleted = realCompletedStages.length;
  const realCompletedStageKeys = new Set(realCompletedStages.map(getLoadingStageIdentity).filter(Boolean));
  const declaredTotalStages = getDeclaredTotalStages(processing?.totalStages);
  const isIncremental = Boolean(processing?.isIncremental);
  const observedLabels = [...displayedCompleted, displayedCurrent]
    .map(step => stripInternalMarkers(step).trim())
    .filter(Boolean);
  const observedKeys = new Set(observedLabels.map(getLoadingStageIdentity).filter(Boolean));

  const plannedStageLabels =
    declaredTotalStages === MODULAR_DOSSIER_STAGES.length || hasObservedStage(MODULAR_DOSSIER_STAGES, observedKeys)
      ? MODULAR_DOSSIER_STAGES
      : hasObservedStage(INVESTIGATION_TIMELINE_STAGES, observedKeys)
        ? INVESTIGATION_TIMELINE_STAGES
        : observedLabels;
  const plannedRich = plannedStageLabels.map(enrichLoadingStage);
  const plannedStageKeys = new Set(plannedStageLabels.map(getLoadingStageIdentity).filter(Boolean));
  const completedStageKeys = new Set<string>();

  if (plannedRich.length > 0) {
    for (const stage of plannedRich) {
      const stepKey = getLoadingStageIdentity(stage.label);
      if (!stepKey) continue;
      if (!realCompletedStageKeys.has(stepKey)) break;
      completedStageKeys.add(stepKey);
    }
  } else {
    realCompletedStageKeys.forEach((key) => completedStageKeys.add(key));
  }

  const currentStageKey = getLoadingStageIdentity(displayedCurrent);
  const currentPlannedIndex = plannedRich.findIndex(step => getLoadingStageIdentity(step.label) === currentStageKey);
  const shouldAppendCurrentStage = Boolean(currentStageKey) && !plannedStageKeys.has(currentStageKey);
  const visiblePlannedIndices = new Set<number>();
  const isUsingPlannedStages =
    plannedStageLabels === MODULAR_DOSSIER_STAGES || plannedStageLabels === INVESTIGATION_TIMELINE_STAGES;

  if (isUsingPlannedStages) {
    plannedRich.forEach((_, index) => visiblePlannedIndices.add(index));
  } else {
    plannedRich.forEach((step, index) => {
      if (completedStageKeys.has(getLoadingStageIdentity(step.label))) {
        visiblePlannedIndices.add(index);
      }
    });

    if (currentPlannedIndex >= 0) {
      visiblePlannedIndices.add(currentPlannedIndex);
      const nextPlannedIndex = plannedRich.findIndex(
        (step, index) =>
          index > currentPlannedIndex &&
          !completedStageKeys.has(getLoadingStageIdentity(step.label)),
      );
      if (nextPlannedIndex >= 0) {
        visiblePlannedIndices.add(nextPlannedIndex);
      }
    } else {
      const nextPendingIndex = plannedRich.findIndex(step => !completedStageKeys.has(getLoadingStageIdentity(step.label)));
      if (nextPendingIndex >= 0) {
        visiblePlannedIndices.add(nextPendingIndex);
      }
    }
  }

  const visiblePlannedStages = plannedRich.filter((_, index) => visiblePlannedIndices.has(index));
  const expectedTotal = declaredTotalStages
    ?? (isUsingPlannedStages
      ? plannedRich.length
      : (isIncremental
        ? Math.max(MIN_INCREMENTAL_STAGE_TOTAL, realTotalCompleted + 1)
        : Math.max(MIN_STANDARD_STAGE_TOTAL, realTotalCompleted + 2)));
  const displayedPercent = Math.min(Math.round((completedCount / expectedTotal) * 100), MAX_PROGRESS_PERCENT);
  const realPercent = Math.min(Math.round((realTotalCompleted / expectedTotal) * 100), MAX_PROGRESS_PERCENT);
  const percent = pendingInQueue > 0
    ? Math.min(
      displayedPercent + Math.round((realPercent - displayedPercent) * QUEUED_PROGRESS_SMOOTHING_FACTOR),
      MAX_PROGRESS_PERCENT,
    )
    : displayedPercent;

  return {
    completedRich,
    currentRich,
    completedCount,
    completedStageKeys,
    currentStageKey,
    visiblePlannedStages,
    shouldAppendCurrentStage,
    percent,
    isIncremental,
  };
}
