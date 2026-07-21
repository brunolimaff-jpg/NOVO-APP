import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ChatMode } from '../constants';
import { buildLoadingCuriositiesFallback } from '../utils/loadingCuriosities';
import {
  buildLoadingSmartViewModel,
  getLoadingStageIdentity,
  LOADING_STAGE_ORDER_BY_KEY,
} from '../utils/loadingSmartViewModel';
import { sanitizeLoadingContextText, stripInternalMarkers } from '../utils/textCleaners';
import { ClockIcon, StepSpinner } from './LoadingShared';
import { formatElapsed } from './loading/hooks';
import { getLoadingBackoffMessage, resolveActiveLoadingStageLabel } from '../utils/loadingBackoff';
import { LoadingOverlayHeader } from './LoadingOverlayHeader';
import { LoadingStepsList } from './LoadingStepsList';
import { LoadingInsightCarousel } from './LoadingInsightCarousel';
import { scoutDiag } from '../utils/diagnosticLog';

const FADE_DURATION = 400;
const INSIGHT_CYCLE_MS = 12000;
const STEP_REVEAL_DELAY_MS = 1200;
const STEP_REVEAL_MIN_MS = 800;
const OVERLAY_STUCK_SAFETY_MS = 5_000;
const MAX_LOADING_DURATION_MS = 180_000;
const SOURCE_LINKS: Record<string, string> = {
  ibge: 'https://www.ibge.gov.br/',
  conab: 'https://www.conab.gov.br/',
  embrapa: 'https://www.embrapa.br/',
  senior: 'https://www.senior.com.br/',
  gatec: 'https://www.gatec.com.br/',
};

interface LoadingSmartProps {
  isLoading: boolean;
  mode: ChatMode;
  isDarkMode: boolean;
  loadingVariant?: 'hero' | 'inline';
  fixedStatusLine?: string;
  onStop?: () => void;
  processing?: {
    stage?: string;
    completedStages?: string[];
    failureCount?: number;
    totalStages?: number;
    isIncremental?: boolean;
  };
  searchQuery?: string;
  empresaAlvo?: string | null;
}

function RadarAnimation({ isDarkMode }: { isDarkMode: boolean }) {
  const bgOuter = isDarkMode ? 'bg-slate-950' : 'bg-slate-100';
  const ringColor = isDarkMode ? 'border-emerald-500/15' : 'border-emerald-600/15';
  const lineColor = isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-600/10';
  const orbGlow = isDarkMode
    ? 'bg-emerald-400 shadow-[0_0_24px_8px_rgba(52,211,153,0.4)]'
    : 'bg-emerald-500 shadow-[0_0_20px_6px_rgba(5,150,105,0.3)]';
  const blips = [
    { top: '22%', left: '65%', delay: '0s' },
    { top: '58%', left: '28%', delay: '1.2s' },
    { top: '38%', left: '78%', delay: '2.4s' },
    { top: '72%', left: '55%', delay: '0.6s' },
  ];
  return (
    <div className="flex items-center justify-center">
      <div
        className={`relative h-40 w-40 rounded-full sm:h-48 sm:w-48 md:h-56 md:w-56 lg:h-64 lg:w-64 ${bgOuter} overflow-hidden`}
        style={{
          boxShadow: isDarkMode
            ? '0 0 40px rgba(52,211,153,0.08), inset 0 0 30px rgba(52,211,153,0.05)'
            : '0 0 30px rgba(5,150,105,0.06)',
        }}
      >
        {[0.33, 0.66, 1].map((scale, i) => (
          <div
            key={i}
            className={`absolute border ${ringColor} rounded-full`}
            style={{
              width: `${scale * 100}%`,
              height: `${scale * 100}%`,
              top: `${(1 - scale) * 50}%`,
              left: `${(1 - scale) * 50}%`,
            }}
          />
        ))}
        <div className={`absolute top-0 bottom-0 left-1/2 w-px ${lineColor}`} />
        <div className={`absolute left-0 right-0 top-1/2 h-px ${lineColor}`} />
        <div
          className="absolute inset-0 animate-radar-sweep"
          style={{
            background: isDarkMode
              ? 'conic-gradient(from 0deg, transparent 0deg, rgba(52,211,153,0.25) 0deg, rgba(52,211,153,0.08) 40deg, transparent 60deg)'
              : 'conic-gradient(from 0deg, transparent 0deg, rgba(5,150,105,0.2) 0deg, rgba(5,150,105,0.05) 40deg, transparent 60deg)',
            borderRadius: '50%',
          }}
        />
        <div className="absolute inset-[15%] animate-radar-ring">
          <div
            className={`w-full h-full rounded-full border ${isDarkMode ? 'border-emerald-400/20' : 'border-emerald-500/15'}`}
          />
        </div>
        {blips.map((pos, i) => (
          <div
            key={i}
            className={`absolute w-2 h-2 rounded-full animate-radar-blip ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`}
            style={{ top: pos.top, left: pos.left, animationDelay: pos.delay }}
          />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`w-5 h-5 rounded-full animate-radar-pulse ${orbGlow}`} />
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ percent, isDarkMode }: { percent: number; isDarkMode: boolean }) {
  const visualWidth = Math.max(percent, 3);
  const label = `${percent}%`;
  return (
    <div
      className={`rounded-xl px-4 py-3 ${
        isDarkMode ? 'bg-slate-800/80 border border-emerald-500/15' : 'bg-emerald-50 border border-emerald-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}
        >
          Andamento
        </span>
        <span
          className={`text-sm font-bold tabular-nums transition-all duration-500 ${
            isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
          }`}
        >
          {label}
        </span>
      </div>
      <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-emerald-100'}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-600'}`}
          style={{ width: `${visualWidth}%` }}
        />
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */

const LoadingSmart: React.FC<LoadingSmartProps> = /*#__PURE__*/ React.memo(function LoadingSmart({
  isLoading,
  mode: _mode,
  isDarkMode,
  loadingVariant = 'hero',
  fixedStatusLine,
  onStop,
  processing,
  searchQuery,
  empresaAlvo,
}) {
  const [currentInsight, setCurrentInsight] = useState<string>(
    'Empresas com disciplina operacional tendem a transformar dados em vantagem competitiva mais rápido.',
  );
  const [activeInsightIndex, setActiveInsightIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [confirmStop, setConfirmStop] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curiositiesRef = useRef<string[]>([]);
  const [displayedCompleted, setDisplayedCompleted] = useState<string[]>([]);
  const [displayedCurrent, setDisplayedCurrent] = useState<string>('Preparando análise...');
  const queueRef = useRef<string[]>([]);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRevealTimeRef = useRef<number>(0);
  const stageStartedAtRef = useRef<Record<string, number>>({});
  const stageDurationsRef = useRef<Record<string, number>>({});
  const displayedStageKeysRef = useRef<Set<string>>(new Set());
  const queuedStageKeysRef = useRef<Set<string>>(new Set());
  const loggedStageStartsRef = useRef<Set<string>>(new Set());
  const loggedStageCompletionsRef = useRef<Set<string>>(new Set());

  const extractCompanyFromQuery = useCallback((query?: string): string => {
    if (!query) return '';
    const cleanQuery = query
      .trim()
      .replace(/[.]{2,}$/g, '')
      .replace(/\s+/g, ' ');
    const deepDiveMatch = cleanQuery.match(/Dossi[eê]\s+completo\s+de\s+\[([^\]]+)\]/i);
    if (deepDiveMatch?.[1]) return deepDiveMatch[1].trim();
    const cadastroMatch = cleanQuery.match(/Contexto\s+cadastral\s+obrigat[oó]rio:\s*Empresa=([^;]+);/i);
    if (cadastroMatch?.[1]) return cadastroMatch[1].trim();
    const patterns = [
      /\b(?:do|da|de)\s+((?:grupo|empresa|fazenda|usina)?\s*[a-z0-9À-ÿ][a-z0-9À-ÿ&.\- ]{2,60})$/i,
      /\b(?:sobre|empresa|grupo)\s+((?:grupo|empresa)?\s*[a-z0-9À-ÿ][a-z0-9À-ÿ&.\- ]{2,60})$/i,
    ];
    for (const pattern of patterns) {
      const match = cleanQuery.match(pattern);
      if (match?.[1]) return match[1].trim().replace(/[.,;:!?]+$/g, '');
    }
    return '';
  }, []);

  const companyFocus = (empresaAlvo || extractCompanyFromQuery(searchQuery)).trim();
  const safeContext = companyFocus.trim();
  const safeSearchQuery = useMemo(
    () => sanitizeLoadingContextText(searchQuery || '', companyFocus),
    [searchQuery, companyFocus],
  );
  const loadingContext = (safeContext || safeSearchQuery).trim();
  const loadingContextKey = useMemo(
    () => `${isLoading ? 'loading' : 'idle'}::${(empresaAlvo || '').trim()}::${(searchQuery || '').trim()}`,
    [empresaAlvo, isLoading, searchQuery],
  );

  /** Chave estável para dependências de useEffect que recebem arrays mutáveis de props */
  const processingKey = `${processing?.stage || ''}::${(processing?.completedStages || []).join(',')}::${processing?.failureCount ?? 0}`;

  const normalizeSourceLabel = useCallback(
    (label: string): string =>
      label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, '')
        .trim(),
    [],
  );

  const clearInsightTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const logStageTimerStart = useCallback((stageKey: string, label: string, source: string, elapsedMs: number) => {
    if (!stageKey || loggedStageStartsRef.current.has(stageKey)) return;
    loggedStageStartsRef.current.add(stageKey);
    scoutDiag.info('LoadingStageTimer', 'stage-start', {
      stageKey,
      label,
      source,
      elapsedMs,
    });
  }, []);

  const logStageTimerComplete = useCallback(
    (stageKey: string, label: string, startedAtMs: number, durationMs: number) => {
      if (!stageKey || loggedStageCompletionsRef.current.has(stageKey)) return;
      loggedStageCompletionsRef.current.add(stageKey);
      scoutDiag.info('LoadingStageTimer', 'stage-complete', {
        stageKey,
        label,
        startedAtMs,
        durationMs,
      });
    },
    [],
  );

  const renderInsight = useCallback(
    (insight: string): React.ReactNode => {
      const sourceMatch = insight.match(/^(.*?)(?:\s+[—-]\s*Fonte:\s*)(.+)$/i);
      if (!sourceMatch) return insight;
      const prefix = sourceMatch[1].trim();
      const sourceLabel = sourceMatch[2].trim().replace(/[.)]+$/, '');
      const sourceUrl = SOURCE_LINKS[normalizeSourceLabel(sourceLabel)];
      if (!sourceUrl) return insight;
      return (
        <>
          {prefix}
          {' — '}Fonte:{' '}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-80 transition-opacity"
          >
            {sourceLabel}
          </a>
        </>
      );
    },
    [normalizeSourceLabel],
  );

  const buildFallbackCuriosities = useCallback(
    (context: string): string[] => buildLoadingCuriositiesFallback(context),
    [],
  );

  // ── 1. Timer ──
  useEffect(() => {
    if (!isLoading) {
      setElapsedTime(0);
      return;
    }
    const startTime = Date.now();
    const interval = setInterval(() => setElapsedTime(Date.now() - startTime), 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  // ── 1b. Visual queue ──
  useEffect(() => {
    if (!isLoading) {
      setDisplayedCompleted([]);
      setDisplayedCurrent('Preparando análise...');
      queueRef.current = [];
      displayedStageKeysRef.current = new Set();
      queuedStageKeysRef.current = new Set();
      loggedStageStartsRef.current = new Set();
      loggedStageCompletionsRef.current = new Set();
      lastRevealTimeRef.current = 0;
      stageStartedAtRef.current = {};
      stageDurationsRef.current = {};
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      return;
    }
    const realCompleted = (processing?.completedStages || []).map(s => stripInternalMarkers(s).trim()).filter(Boolean);
    const realCurrent =
      stripInternalMarkers(processing?.stage || 'Preparando análise...').trim() || 'Preparando análise...';
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
      queueRef.current = [...queueRef.current, ...newStages.map(stage => stage.label)];
      newStages.forEach(stage => queuedStageKeysRef.current.add(stage.key));
    }
    const backoffMsg = getLoadingBackoffMessage(processing?.failureCount || 0);
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
            const startedAt = stageStartedAtRef.current[nextKey];
            if (startedAt !== undefined && stageDurationsRef.current[nextKey] === undefined) {
              const duration = Math.max(0, elapsedTime - startedAt);
              stageDurationsRef.current[nextKey] = duration;
              logStageTimerComplete(nextKey, next, startedAt, duration);
            }
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
    return () => {
      /* intentionally not clearing */
    };
  }, [isLoading, processingKey]);

  // ── 1c. Cronômetro por etapa (início, duração final, tick na etapa ativa) ──
  useEffect(() => {
    if (!isLoading) return;

    const realCurrent =
      stripInternalMarkers(processing?.stage || 'Preparando análise...').trim() || 'Preparando análise...';
    const activeLabel = resolveActiveLoadingStageLabel(realCurrent, processing?.failureCount || 0);
    const activeKey = getLoadingStageIdentity(activeLabel);
    if (activeKey && stageStartedAtRef.current[activeKey] === undefined) {
      stageStartedAtRef.current[activeKey] = elapsedTime;
      logStageTimerStart(activeKey, activeLabel, 'active-stage', elapsedTime);
    }

    const backendKey = getLoadingStageIdentity(realCurrent);
    if (backendKey && backendKey !== activeKey && stageStartedAtRef.current[backendKey] === undefined) {
      stageStartedAtRef.current[backendKey] = elapsedTime;
      logStageTimerStart(backendKey, realCurrent, 'backend-stage', elapsedTime);
    }

    for (const stage of processing?.completedStages || []) {
      const stageKey = getLoadingStageIdentity(stripInternalMarkers(stage).trim());
      if (!stageKey || stageDurationsRef.current[stageKey] !== undefined) continue;

      const startedAt = stageStartedAtRef.current[stageKey] ?? 0;
      stageStartedAtRef.current[stageKey] = startedAt;
      const duration = Math.max(0, elapsedTime - startedAt);
      stageDurationsRef.current[stageKey] = duration;
      logStageTimerComplete(stageKey, stripInternalMarkers(stage).trim(), startedAt, duration);
    }
  }, [elapsedTime, isLoading, logStageTimerComplete, logStageTimerStart, processingKey]);

  useEffect(
    () => () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
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

  // ── 2. Curiosidades locais ──
  useEffect(() => {
    if (!isLoading) return;
    const curiosities = buildFallbackCuriosities(loadingContext);
    curiositiesRef.current = curiosities;
    setCurrentInsight(
      curiosities[0] || 'Empresas com disciplina operacional tendem a transformar dados em vantagem competitiva mais rápido.',
    );
  }, [buildFallbackCuriosities, isLoading, loadingContext]);

  // ── 3. Auto-cycle curiosities ──
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

  // ── 4. Visibility control ──
  useEffect(() => {
    if (isLoading) {
      setIsVisible(true);
      setIsFadingOut(false);
      setConfirmStop(false);
      timerRef.current = setTimeout(() => goToInsight(1), INSIGHT_CYCLE_MS);

      maxLoadingTimerRef.current = setTimeout(() => {
        setIsVisible(false);
        setIsFadingOut(false);
      }, MAX_LOADING_DURATION_MS);
    } else {
      clearInsightTimer();
      if (maxLoadingTimerRef.current) {
        clearTimeout(maxLoadingTimerRef.current);
        maxLoadingTimerRef.current = null;
      }
      setIsFadingOut(true);
      setTimeout(() => setIsVisible(false), FADE_DURATION);
    }
    return () => {
      clearInsightTimer();
      if (maxLoadingTimerRef.current) {
        clearTimeout(maxLoadingTimerRef.current);
        maxLoadingTimerRef.current = null;
      }
    };
  }, [clearInsightTimer, goToInsight, isLoading, loadingContextKey]);

  // ── 4b. Safety: force-remove overlay if still visible after isLoading=false ──
  useEffect(() => {
    if (isLoading || !isVisible) return;
    const stuckTimer = setTimeout(() => {
      setIsVisible(false);
      setIsFadingOut(false);
    }, OVERLAY_STUCK_SAFETY_MS);
    return () => clearTimeout(stuckTimer);
  }, [isLoading, isVisible]);

  const handleRequestStop = useCallback(() => setConfirmStop(true), []);
  const handleCancelStop = useCallback(() => setConfirmStop(false), []);
  const handlePrev = useCallback(() => goToInsight(activeInsightIndex - 1), [goToInsight, activeInsightIndex]);
  const handleNext = useCallback(() => goToInsight(activeInsightIndex + 1), [goToInsight, activeInsightIndex]);

  if (!isVisible) return null;

  const {
    completedCount,
    currentRich,
    completedStageKeys,
    currentStageKey,
    visiblePlannedStages,
    shouldAppendCurrentStage,
    percent,
    isIncremental,
  } = buildLoadingSmartViewModel({
    displayedCompleted,
    displayedCurrent,
    pendingInQueue: queueRef.current.length,
    processing,
  });

  const elapsed = formatElapsed(elapsedTime);
  const totalCuriosities = curiositiesRef.current.length || 1;

  // ── Inline placeholder ──
  const inlinePlaceholder = (
    <div
      className={`flex flex-col gap-2 rounded-xl p-3 ${
        isDarkMode ? 'bg-slate-800/60 border border-emerald-500/10' : 'bg-emerald-50/50 border border-emerald-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
          <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            Investigação em andamento...
          </span>
        </div>
        <span
          className={`flex items-center gap-1 text-xs font-mono ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
        >
          <ClockIcon className="w-3.5 h-3.5" />
          {elapsed}
        </span>
      </div>
      {fixedStatusLine ? (
        <p className={`text-xs font-semibold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
          {fixedStatusLine}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-emerald-100'}`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-600'}`}
            style={{ width: `${Math.max(percent, 3)}%` }}
          />
        </div>
        <span className={`text-xs font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
          {percent}%
        </span>
        <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
          {completedCount} etapa{completedCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );

  // ── Fullscreen overlay ──
  const overlay = (
    <div
      data-testid="loading-smart-overlay"
      data-loading-variant={loadingVariant}
      data-visible={isVisible}
      data-fading-out={isFadingOut}
      data-loading-context-key={loadingContextKey}
      className={`fixed inset-0 z-[100] flex flex-col overflow-y-auto overscroll-contain animate-overlay-enter ${
        isDarkMode ? 'bg-slate-950/95 text-slate-100' : 'bg-white/95 text-slate-800'
      } ${isFadingOut && !isLoading ? 'opacity-0 transition-opacity duration-400' : ''}`}
      style={{ backdropFilter: 'blur(8px)' }}
    >
      <LoadingOverlayHeader
        isDarkMode={isDarkMode}
        companyFocus={companyFocus}
        elapsed={elapsed}
        confirmStop={confirmStop}
        onStop={onStop}
        onRequestStop={handleRequestStop}
        onCancelStop={handleCancelStop}
      />

      {/* ── Centralized Progress Control ── */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center px-4 md:px-8 py-3 md:py-6">
        <div className={`flex flex-col items-center gap-2 mb-3 w-full ${isIncremental ? 'max-w-xl' : 'max-w-2xl'}`}>
          <StepSpinner isDarkMode={isDarkMode} />
          <h2
            className={`${isIncremental ? 'text-base md:text-xl' : 'text-base sm:text-lg md:text-3xl'} font-black tracking-tight text-center line-clamp-2 ${
              isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
            }`}
          >
            {currentRich.label}
          </h2>
          <p
            className={`${isIncremental ? 'text-[11px] md:text-xs' : 'text-xs md:text-sm'} font-bold uppercase tracking-widest text-center ${
              isDarkMode ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            Análise em execução
          </p>
        </div>
        <div className={`w-full ${isIncremental ? 'max-w-xl' : 'max-w-2xl'}`}>
          <ProgressBar percent={percent} isDarkMode={isDarkMode} />
        </div>
      </div>

      {/* ── Two-column: Steps + Radar ── */}
      <div className="flex-1 px-4 pb-3 md:px-8 md:pb-4">
        <div
          className={`mx-auto grid grid-cols-1 items-start gap-4 md:gap-10 ${isIncremental ? 'max-w-3xl md:grid-cols-1' : 'max-w-5xl md:grid-cols-2'}`}
        >
          <LoadingStepsList
            isDarkMode={isDarkMode}
            visiblePlannedStages={visiblePlannedStages}
            completedStageKeys={completedStageKeys}
            currentStageKey={currentStageKey}
            currentRichLabel={currentRich.label}
            shouldAppendCurrentStage={shouldAppendCurrentStage}
            stageDurationsMs={stageDurationsRef.current}
            stageStartedAtMs={stageStartedAtRef.current}
            elapsedTimeMs={elapsedTime}
            getStageKey={getLoadingStageIdentity}
            formatElapsed={formatElapsed}
          />

          {!isIncremental && (
            <div className="hidden lg:flex items-center justify-center">
              <RadarAnimation isDarkMode={isDarkMode} />
            </div>
          )}
        </div>
      </div>

      <LoadingInsightCarousel
        isDarkMode={isDarkMode}
        isFadingOut={isFadingOut}
        currentInsight={currentInsight}
        activeInsightIndex={activeInsightIndex}
        totalCuriosities={totalCuriosities}
        onPrev={handlePrev}
        onNext={handleNext}
        onGoTo={goToInsight}
        renderInsight={renderInsight}
      />
    </div>
  );

  if (loadingVariant === 'inline') return inlinePlaceholder;

  return (
    <>
      {inlinePlaceholder}
      {ReactDOM.createPortal(overlay, document.body)}
    </>
  );
});

export default LoadingSmart;
