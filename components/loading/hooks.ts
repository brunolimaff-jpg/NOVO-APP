// components/loading/hooks.ts
// Hooks extraídos de LoadingSmart.tsx para reduzir tamanho do componente principal.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  buildLoadingSmartViewModel,
  getLoadingStageIdentity,
  LOADING_STAGE_ORDER_BY_KEY,
} from '../../utils/loadingSmartViewModel';
import { stripInternalMarkers } from '../../utils/textCleaners';
import { generateLoadingCuriosities } from '../../services/geminiService';
import { buildLoadingCuriositiesFallback } from '../../utils/loadingCuriosities';

const STEP_REVEAL_DELAY_MS = 1200;
const STEP_REVEAL_MIN_MS = 800;

/** Formata milissegundos em string legível: 45s | 1m 5s */
export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Hook 1: Timer ────────────────────────────────────────────────────────

export function useElapsedTimer(isActive: boolean) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setElapsedTime(0);
      return;
    }
    const startTime = Date.now();
    const interval = setInterval(() => setElapsedTime(Date.now() - startTime), 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  return elapsedTime;
}

// ── Hook 2: Stage reveal queue ────────────────────────────────────────────

interface StageRevealOptions {
  isLoading: boolean;
  processingKey: string;
  processingStage?: string;
  completedStages?: string[];
  failureCount?: number;
}

export function useStageRevealQueue(options: StageRevealOptions) {
  const { isLoading, processingKey, processingStage, completedStages = [], failureCount = 0 } = options;

  const [displayedCompleted, setDisplayedCompleted] = useState<string[]>([]);
  const [displayedCurrent, setDisplayedCurrent] = useState('Preparando análise...');
  const queueRef = useRef<string[]>([]);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRevealTimeRef = useRef(0);
  const displayedStageKeysRef = useRef(new Set<string>());
  const queuedStageKeysRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isLoading) {
      setDisplayedCompleted([]);
      setDisplayedCurrent('Preparando análise...');
      queueRef.current = [];
      displayedStageKeysRef.current = new Set();
      queuedStageKeysRef.current = new Set();
      lastRevealTimeRef.current = 0;
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      return;
    }

    const realCompleted = completedStages.map(s => stripInternalMarkers(s).trim()).filter(Boolean);
    const realCurrent =
      stripInternalMarkers(processingStage || 'Preparando análise...').trim() || 'Preparando análise...';

    const newStages: Array<{ label: string; key: string }> = [];
    for (const stage of realCompleted) {
      const stageKey = getLoadingStageIdentity(stage);
      if (!stageKey || displayedStageKeysRef.current.has(stageKey) || queuedStageKeysRef.current.has(stageKey)) {
        continue;
      }
      newStages.push({ label: stage, key: stageKey });
    }

    if (newStages.length > 0) {
      newStages.sort((a, b) => {
        const aIndex = LOADING_STAGE_ORDER_BY_KEY.get(a.key) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = LOADING_STAGE_ORDER_BY_KEY.get(b.key) ?? Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex;
      });
      queueRef.current = [...queueRef.current, ...newStages.map(s => s.label)];
      newStages.forEach(s => queuedStageKeysRef.current.add(s.key));
    }

    const getBackoffMessage = (count: number) => {
      if (count === 1) return 'Refinando sinais para alta precisão...';
      if (count === 2) return 'Ajustando filtros de profundidade executiva...';
      if (count >= 3) return 'Finalizando orquestração de dados complexos...';
      return null;
    };

    const backoffMsg = getBackoffMessage(failureCount);
    setDisplayedCurrent(backoffMsg || realCurrent);

    const revealNext = () => {
      if (queueRef.current.length === 0) return;
      const now = Date.now();
      const delay = Math.max(0, STEP_REVEAL_MIN_MS - (now - lastRevealTimeRef.current));
      revealTimerRef.current = setTimeout(() => {
        const next = queueRef.current.shift();
        if (next) {
          const nextKey = getLoadingStageIdentity(next);
          if (nextKey) {
            queuedStageKeysRef.current.delete(nextKey);
          }
          lastRevealTimeRef.current = Date.now();
          setDisplayedCompleted(prev => {
            if (!nextKey) return prev;
            if (displayedStageKeysRef.current.has(nextKey)) return prev;
            displayedStageKeysRef.current.add(nextKey);
            return [...prev, next];
          });
          if (queueRef.current.length > 0) revealTimerRef.current = setTimeout(revealNext, STEP_REVEAL_DELAY_MS);
          else revealTimerRef.current = null;
        } else {
          revealTimerRef.current = null;
        }
      }, delay);
    };

    if (queueRef.current.length > 0 && !revealTimerRef.current) revealNext();
  }, [isLoading, processingKey]);

  useEffect(
    () => () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    },
    [],
  );

  return { displayedCompleted, displayedCurrent, queueRef };
}

// ── Hook 3: Stage duration tracking ───────────────────────────────────────

export function useStageDurations(
  isLoading: boolean,
  elapsedTime: number,
  processingKey: string,
  processingStage?: string,
  completedStages?: string[],
) {
  const stageStartedAtRef = useRef<Record<string, number>>({});
  const stageDurationsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isLoading) return;

    const realCurrent =
      stripInternalMarkers(processingStage || 'Preparando análise...').trim() || 'Preparando análise...';
    const currentKey = getLoadingStageIdentity(realCurrent);
    if (currentKey && stageStartedAtRef.current[currentKey] === undefined) {
      stageStartedAtRef.current[currentKey] = elapsedTime;
    }

    for (const stage of completedStages || []) {
      const stageKey = getLoadingStageIdentity(stripInternalMarkers(stage).trim());
      if (!stageKey || stageDurationsRef.current[stageKey] !== undefined) continue;

      const startedAt = stageStartedAtRef.current[stageKey] ?? 0;
      stageStartedAtRef.current[stageKey] = startedAt;
      stageDurationsRef.current[stageKey] = Math.max(0, elapsedTime - startedAt);
    }
  }, [elapsedTime, isLoading, processingKey]);

  return { stageStartedAtRef, stageDurationsRef };
}

// ── Hook 4: Insight carousel ──────────────────────────────────────────────

const INSIGHT_CYCLE_MS = 12000;
const FADE_DURATION = 400;

interface InsightCarouselOptions {
  isLoading: boolean;
  companyFocus: string;
  loadingContext: string;
  loadingContextKey: string;
  searchQueryForCuriosities: string;
}

export function useInsightCarousel(options: InsightCarouselOptions) {
  const { isLoading, companyFocus, loadingContext, loadingContextKey, searchQueryForCuriosities } = options;

  const [currentInsight, setCurrentInsight] = useState(
    'Empresas com disciplina operacional tendem a transformar dados em vantagem competitiva mais rápido.',
  );
  const [activeInsightIndex, setActiveInsightIndex] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curiositiesRef = useRef<string[]>([]);
  const insightRequestIdRef = useRef(0);

  const clearInsightTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const buildFallbackCuriosities = useCallback(
    (context: string): string[] => buildLoadingCuriositiesFallback(context),
    [],
  );

  const goToInsight = useCallback(
    (index: number) => {
      clearInsightTimer();
      setIsFadingOut(true);
      timerRef.current = setTimeout(() => {
        const total = curiositiesRef.current.length || 1;
        const safeIndex = ((index % total) + total) % total;
        setActiveInsightIndex(safeIndex);
        setCurrentInsight(
          curiositiesRef.current[safeIndex] ??
            'Curiosidade: empresas que monitoram rotina operacional com consistência aceleram decisões comerciais.',
        );
        setIsFadingOut(false);
        timerRef.current = setTimeout(() => goToInsight(safeIndex + 1), INSIGHT_CYCLE_MS);
      }, FADE_DURATION);
    },
    [clearInsightTimer],
  );

  // Reset on context change
  useEffect(() => {
    insightRequestIdRef.current += 1;
    clearInsightTimer();
    setActiveInsightIndex(0);
    curiositiesRef.current = [];

    if (!isLoading) {
      setCurrentInsight(
        'Empresas com disciplina operacional tendem a transformar dados em vantagem competitiva mais rápido.',
      );
      return;
    }

    setCurrentInsight(
      companyFocus
        ? `Prévia do dossiê da ${companyFocus}: organizando sinais seguros, hipóteses comerciais e pontos de validação.`
        : 'Prévia do dossiê: organizando sinais seguros, hipóteses comerciais e pontos de validação.',
    );
  }, [clearInsightTimer, companyFocus, isLoading, loadingContextKey]);

  // Fetch curiosities
  useEffect(() => {
    if (!isLoading) return;
    const requestId = insightRequestIdRef.current;

    const applyCuriosities = (nextCuriosities: string[]) => {
      if (requestId !== insightRequestIdRef.current) return;
      curiositiesRef.current = nextCuriosities;
      setCurrentInsight(
        nextCuriosities[0] ||
          buildFallbackCuriosities(loadingContext)[0] ||
          'Empresas com disciplina operacional tendem a transformar dados em vantagem competitiva mais rápido.',
      );
    };

    if (!loadingContext || loadingContext.length < 2) {
      applyCuriosities(buildFallbackCuriosities(''));
      return;
    }

    let cancelled = false;
    generateLoadingCuriosities(loadingContext, searchQueryForCuriosities)
      .then(facts => {
        if (cancelled) return;
        if (facts && facts.length > 0) {
          applyCuriosities(facts.map(f => stripInternalMarkers(f)).filter(Boolean));
        } else {
          applyCuriosities(buildFallbackCuriosities(loadingContext));
        }
      })
      .catch(() => {
        if (cancelled) return;
        applyCuriosities(buildFallbackCuriosities(loadingContext));
      });

    return () => {
      cancelled = true;
    };
  }, [buildFallbackCuriosities, isLoading, loadingContext, searchQueryForCuriosities]);

  // Visibility control
  useEffect(() => {
    if (isLoading) {
      timerRef.current = setTimeout(() => goToInsight(1), INSIGHT_CYCLE_MS);
    } else {
      clearInsightTimer();
    }
    return () => {
      clearInsightTimer();
    };
  }, [clearInsightTimer, goToInsight, isLoading, loadingContextKey]);

  return {
    currentInsight,
    activeInsightIndex,
    isFadingOut,
    curiositiesRef,
    goToInsight,
    setIsFadingOut,
  };
}
