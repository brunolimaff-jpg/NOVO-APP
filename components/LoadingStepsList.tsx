import React from 'react';
import { StepCheckIcon, StepSpinner, StepPending } from './LoadingShared';

interface LoadingStepsListProps {
  isDarkMode: boolean;
  visiblePlannedStages: Array<{ label: string }>;
  completedStageKeys: Set<string>;
  currentStageKey: string;
  currentRichLabel: string;
  shouldAppendCurrentStage: boolean;
  stepTimestamps: Record<string, number>;
  getStageKey: (label: string) => string;
  formatElapsed: (ms: number) => string;
}

export const LoadingStepsList: React.FC<LoadingStepsListProps> = ({
  isDarkMode, visiblePlannedStages, completedStageKeys, currentStageKey,
  currentRichLabel, shouldAppendCurrentStage, stepTimestamps, getStageKey,
  formatElapsed,
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
            {isCompleted && stepTimestamps[step.label] !== undefined ? (
              <span className={`text-xs font-mono flex-shrink-0 tabular-nums ${
                isDarkMode ? 'text-slate-600' : 'text-slate-300'
              }`}>
                +{formatElapsed(stepTimestamps[step.label])}
              </span>
            ) : null}
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
        </div>
      ) : null}
    </div>
  </div>
);
