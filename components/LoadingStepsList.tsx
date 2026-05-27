import React from 'react';
import { StepCheckIcon, StepSpinner, StepPending } from './LoadingShared';

interface LoadingStepsListProps {
  isDarkMode: boolean;
  visiblePlannedStages: Array<{ label: string }>;
  completedStageKeys: Set<string>;
  currentStageKey: string;
  currentRichLabel: string;
  shouldAppendCurrentStage: boolean;
  stageDurationsMs: Record<string, number>;
  stageStartedAtMs: Record<string, number>;
  elapsedTimeMs: number;
  getStageKey: (label: string) => string;
  formatElapsed: (ms: number) => string;
}

function getStageElapsedMs(
  stepKey: string,
  isCompleted: boolean,
  isCurrent: boolean,
  stageDurationsMs: Record<string, number>,
  stageStartedAtMs: Record<string, number>,
  elapsedTimeMs: number,
): number | null {
  if (isCompleted) {
    const duration = stageDurationsMs[stepKey];
    return duration !== undefined ? duration : null;
  }
  if (isCurrent) {
    const startedAt = stageStartedAtMs[stepKey];
    return startedAt !== undefined ? Math.max(0, elapsedTimeMs - startedAt) : 0;
  }
  return 0;
}

const StepTimer: React.FC<{
  isDarkMode: boolean;
  isCurrent: boolean;
  elapsedMs: number | null;
  formatElapsed: (ms: number) => string;
}> = ({ isDarkMode, isCurrent, elapsedMs, formatElapsed }) => {
  if (elapsedMs === null) return null;
  return (
    <span
      className={`text-xs font-mono flex-shrink-0 tabular-nums ${
        isCurrent
          ? (isDarkMode ? 'text-emerald-400/90' : 'text-emerald-600')
          : (isDarkMode ? 'text-slate-600' : 'text-slate-400')
      }`}
    >
      {formatElapsed(elapsedMs)}
    </span>
  );
};

export const LoadingStepsList: React.FC<LoadingStepsListProps> = React.memo(({
  isDarkMode, visiblePlannedStages, completedStageKeys, currentStageKey,
  currentRichLabel, shouldAppendCurrentStage, stageDurationsMs, stageStartedAtMs,
  elapsedTimeMs, getStageKey, formatElapsed,
}) => (
  <div className="flex min-w-0 flex-col">
    <h2 className={`text-xs md:text-sm font-bold uppercase tracking-wider mb-3 ${
      isDarkMode ? 'text-slate-400' : 'text-slate-500'
    }`}>Etapas da análise</h2>

    <div className="flex flex-col gap-2.5 pr-0 md:gap-3 md:pr-2">
      {visiblePlannedStages.map((step, i) => {
        const stepKey = getStageKey(step.label);
        const isCompleted = completedStageKeys.has(stepKey);
        const isCurrent = !isCompleted && stepKey === currentStageKey;
        const stepElapsedMs = getStageElapsedMs(
          stepKey,
          isCompleted,
          isCurrent,
          stageDurationsMs,
          stageStartedAtMs,
          elapsedTimeMs,
        );

        return (
          <div key={`${stepKey || 'step'}-${i}`} className={`flex items-center gap-3 ${isCompleted ? 'animate-fade-in' : ''}`}>
            {isCompleted ? (
              <StepCheckIcon isDarkMode={isDarkMode} />
            ) : isCurrent ? (
              <StepSpinner isDarkMode={isDarkMode} />
            ) : (
              <StepPending isDarkMode={isDarkMode} />
            )}
            <span className={`text-sm flex-1 min-w-0 break-words ${
              isCompleted
                ? (isDarkMode ? 'text-slate-500' : 'text-slate-400')
                : isCurrent
                  ? (isDarkMode ? 'text-slate-200 font-medium' : 'text-slate-700 font-medium')
                  : (isDarkMode ? 'text-slate-500' : 'text-slate-500')
            }`}>
              {step.label}
            </span>
            <StepTimer
              isDarkMode={isDarkMode}
              isCurrent={isCurrent}
              elapsedMs={stepElapsedMs}
              formatElapsed={formatElapsed}
            />
          </div>
        );
      })}

      {shouldAppendCurrentStage ? (
        <div className="flex items-center gap-3">
          <StepSpinner isDarkMode={isDarkMode} />
          <span className={`text-sm flex-1 min-w-0 font-medium ${
            isDarkMode ? 'text-slate-200' : 'text-slate-700'
          }`}>
            {currentRichLabel}
          </span>
          <StepTimer
            isDarkMode={isDarkMode}
            isCurrent
            elapsedMs={getStageElapsedMs(
              currentStageKey,
              false,
              true,
              stageDurationsMs,
              stageStartedAtMs,
              elapsedTimeMs,
            )}
            formatElapsed={formatElapsed}
          />
        </div>
      ) : null}
    </div>
  </div>
));
