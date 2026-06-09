import React, { useState } from 'react';
import { useElapsedTimer, formatElapsed } from './loading/hooks';
import { ClockIcon, StepSpinner, StepPending, StepCheckIcon } from './LoadingShared';
import {
  buildLoadingSmartViewModel,
  getLoadingStageIdentity,
  LOADING_STAGE_ORDER_BY_KEY,
} from '../utils/loadingSmartViewModel';
import { stripInternalMarkers } from '../utils/textCleaners';
import { getLoadingBackoffMessage, resolveActiveLoadingStageLabel } from '../utils/loadingBackoff';
import { scoutDiag } from '../utils/diagnosticLog';

interface InlineLoadingBubbleProps {
  isDarkMode: boolean;
  processing?: {
    stage?: string;
    completedStages?: string[];
    failureCount?: number;
    totalStages?: number;
    isIncremental?: boolean;
  };
  empresaAlvo?: string | null;
  lastUserQuery?: string;
  onStop?: () => void;
}

function getStageElapsedMs(
  stageKey: string,
  isCompleted: boolean,
  isCurrent: boolean,
  stageDurations: Record<string, number>,
  stageStartedAt: Record<string, number>,
  elapsedTime: number,
): number | null {
  if (isCompleted) return stageDurations[stageKey] ?? null;
  if (isCurrent) {
    const startedAt = stageStartedAt[stageKey];
    return startedAt !== undefined ? Math.max(0, elapsedTime - startedAt) : 0;
  }
  return null;
}

const InlineLoadingBubble: React.FC<InlineLoadingBubbleProps> = ({
  isDarkMode,
  processing,
  empresaAlvo,
  lastUserQuery,
  onStop,
}) => {
  const isLoading = true;
  const elapsedTime = useElapsedTimer(isLoading);
  const elapsed = formatElapsed(elapsedTime);

  const stageStartedAtRef = React.useRef<Record<string, number>>({});
  const stageDurationsRef = React.useRef<Record<string, number>>({});
  const loggedStartsRef = React.useRef<Set<string>>(new Set());
  const loggedCompletionsRef = React.useRef<Set<string>>(new Set());

  const [stopClicked, setStopClicked] = useState(false);

  React.useEffect(() => {
    if (!stopClicked) return;
    const timer = setTimeout(() => setStopClicked(false), 10_000);
    return () => clearTimeout(timer);
  }, [stopClicked]);

  const companyFocus = (empresaAlvo || lastUserQuery || '').trim();

  const realCompleted = (processing?.completedStages || []).map(s => stripInternalMarkers(s).trim()).filter(Boolean);
  const realCurrent = stripInternalMarkers(processing?.stage || '').trim() || 'Preparando análise...';
  const backoffMsg = getLoadingBackoffMessage(processing?.failureCount || 0);
  const displayedCurrent = backoffMsg || realCurrent;

  // Cronômetros por etapa
  const activeLabel = resolveActiveLoadingStageLabel(realCurrent, processing?.failureCount || 0);
  const activeKey = getLoadingStageIdentity(activeLabel);
  const processingKey = `${processing?.stage || ''}::${(processing?.completedStages || []).join(',')}::${processing?.failureCount ?? 0}`;

  React.useEffect(() => {
    if (!activeKey || loggedStartsRef.current.has(activeKey)) return;
    loggedStartsRef.current.add(activeKey);
    stageStartedAtRef.current[activeKey] = elapsedTime;
    scoutDiag.info('InlineBubble', 'stage-start', { stageKey: activeKey, label: activeLabel, elapsedMs: elapsedTime });
  }, [activeKey, activeLabel, elapsedTime]);

  React.useEffect(() => {
    for (const stage of processing?.completedStages || []) {
      const key = getLoadingStageIdentity(stripInternalMarkers(stage).trim());
      if (!key || stageDurationsRef.current[key] !== undefined) continue;
      const startedAt = stageStartedAtRef.current[key] ?? 0;
      const duration = Math.max(0, elapsedTime - startedAt);
      stageDurationsRef.current[key] = duration;
      if (!loggedCompletionsRef.current.has(key)) {
        loggedCompletionsRef.current.add(key);
        scoutDiag.info('InlineBubble', 'stage-complete', {
          stageKey: key,
          label: stripInternalMarkers(stage).trim(),
          durationMs: duration,
        });
      }
    }
  }, [elapsedTime, processingKey]);

  const { percent, visiblePlannedStages, completedStageKeys, currentStageKey, shouldAppendCurrentStage } =
    buildLoadingSmartViewModel({
      displayedCompleted: realCompleted,
      displayedCurrent,
      pendingInQueue: 0,
      processing,
    });

  const totalStages = processing?.totalStages || 7;
  const completedCount = realCompleted.length;

  return (
    <div
      data-testid="inline-loading-bubble"
      className={`animate-fade-in rounded-2xl border w-full ${
        isDarkMode ? 'bg-slate-900 border-slate-700/30' : 'bg-white border-slate-200'
      }`}
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-4 md:px-5 pt-3 md:pt-4 pb-2">
        <div>
          <span className={`text-sm font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
            {companyFocus || 'Análise'}
          </span>
          <span className={`text-xs ml-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            · Dossiê em construção
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {completedCount}/{totalStages}
          </span>
          <span
            className={`flex items-center gap-1 text-xs font-mono font-semibold ${
              isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
            }`}
          >
            <ClockIcon className="w-3.5 h-3.5" />
            {elapsed}
          </span>
        </div>
      </div>

      {/* Etapa atual destacada */}
      <div
        className={`mx-4 md:mx-5 mb-3 p-3 rounded-xl border ${
          isDarkMode ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-emerald-50 border-emerald-100'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2 h-2 rounded-full animate-pulse ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
            }`}
          >
            Em foco agora
          </span>
        </div>
        <p className={`text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{activeLabel}</p>
        <span className={`text-xs font-mono ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
          {formatElapsed(
            getStageElapsedMs(
              activeKey,
              false,
              true,
              stageDurationsRef.current,
              stageStartedAtRef.current,
              elapsedTime,
            ) ?? 0,
          )}
        </span>
      </div>

      {/* Barra de progresso hairline */}
      <div className="mx-4 md:mx-5 mb-3">
        <div className={`h-[1.5px] rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isDarkMode ? 'bg-emerald-500' : 'bg-emerald-600'
            }`}
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        </div>
      </div>

      {/* Lista de etapas */}
      <div className="mx-4 md:mx-5 mb-3">
        <div className="flex flex-col gap-1.5">
          {visiblePlannedStages.map((step, i) => {
            const key = getLoadingStageIdentity(step.label);
            const done = completedStageKeys.has(key);
            const active = !done && key === currentStageKey;
            const stepMs = getStageElapsedMs(
              key,
              done,
              active,
              stageDurationsRef.current,
              stageStartedAtRef.current,
              elapsedTime,
            );
            return (
              <div key={`${key || 'step'}-${i}`} className="flex items-center gap-2.5 text-xs">
                {done ? (
                  <StepCheckIcon isDarkMode={isDarkMode} />
                ) : active ? (
                  <StepSpinner isDarkMode={isDarkMode} />
                ) : (
                  <StepPending isDarkMode={isDarkMode} />
                )}
                <span
                  className={`flex-1 ${
                    done
                      ? isDarkMode
                        ? 'text-slate-500'
                        : 'text-slate-400'
                      : active
                        ? isDarkMode
                          ? 'text-slate-200 font-medium'
                          : 'text-slate-700 font-medium'
                        : isDarkMode
                          ? 'text-slate-600'
                          : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
                <span
                  className={`font-mono text-[10px] ${
                    active
                      ? isDarkMode
                        ? 'text-emerald-400'
                        : 'text-emerald-600'
                      : isDarkMode
                        ? 'text-slate-600'
                        : 'text-slate-400'
                  }`}
                >
                  {stepMs !== null && stepMs > 0 ? formatElapsed(stepMs) : done ? formatElapsed(stepMs ?? 0) : '--'}
                </span>
              </div>
            );
          })}
          {shouldAppendCurrentStage && (
            <div className="flex items-center gap-2.5 text-xs">
              <StepSpinner isDarkMode={isDarkMode} />
              <span className={`flex-1 font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                {displayedCurrent}
              </span>
              <span className={`font-mono text-[10px] ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                {formatElapsed(
                  getStageElapsedMs(
                    currentStageKey,
                    false,
                    true,
                    stageDurationsRef.current,
                    stageStartedAtRef.current,
                    elapsedTime,
                  ) ?? 0,
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Botão Interromper */}
      <div className="mx-4 md:mx-5 mb-3">
        <button
          onClick={() => {
            setStopClicked(true);
            onStop?.();
          }}
          disabled={stopClicked}
          type="button"
          className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-bold
            bg-red-500/10 border border-red-500/30 text-red-500
            hover:bg-red-500 hover:text-white hover:border-red-500
            active:bg-red-600 active:scale-[0.97]
            focus-visible:ring-2 focus-visible:ring-red-500/30 focus-visible:outline-none
            disabled:opacity-40 disabled:cursor-not-allowed
            dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30
            dark:hover:bg-red-500 dark:hover:text-white
            transition-all duration-150"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Interromper
        </button>
      </div>
    </div>
  );
};

export default InlineLoadingBubble;
