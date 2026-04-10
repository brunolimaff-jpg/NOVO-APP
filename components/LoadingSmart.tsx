import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ChatMode } from '../constants';
import { generateLoadingCuriosities } from '../services/geminiService';
import { buildLoadingCuriositiesFallback } from '../utils/loadingCuriosities';
import { toRichStatus, isPhaseTimelineStatus, statusKey, type RichLoadingStatus } from '../utils/loadingStatus';
import { sanitizeLoadingContextText, stripInternalMarkers } from '../utils/textCleaners';
import { MODULAR_DOSSIER_STAGES } from '../constants/loadingStages';

const FADE_DURATION = 400;
const INSIGHT_CYCLE_MS = 12000;
const STEP_REVEAL_DELAY_MS = 1200;
const STEP_REVEAL_MIN_MS = 800;
const SOURCE_LINKS: Record<string, string> = {
  ibge:    'https://www.ibge.gov.br/',
  conab:   'https://www.conab.gov.br/',
  embrapa: 'https://www.embrapa.br/',
  senior:  'https://www.senior.com.br/',
  gatec:   'https://www.gatec.com.br/',
};

// MODULAR_DOSSIER_STAGES removido daqui — importado de ../constants/loadingStages

const INVESTIGATION_TIMELINE_STAGES = [
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
];

// EXPECTED_STAGES removido — o fallback dinâmico (realTotalCompleted + 2) é sempre mais preciso
// do que qualquer hardcode por modo. declaredTotalStages tem precedência quando disponível.

/** Formata milissegundos em string legível: 45s | 1m 5s */
function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

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

/* ── SVG Icons ───────────────────────────────────────────────────────── */

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
    </svg>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function StepCheckIcon({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
      isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
    }`}>
      <svg className={`w-4 h-4 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

function StepSpinner({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center relative">
      <div className={`absolute inset-0 rounded-full ${isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-100/60'} animate-ping`} style={{ animationDuration: '2s' }} />
      <div className={`w-5 h-5 border-2 ${isDarkMode ? 'border-emerald-400' : 'border-emerald-600'} border-t-transparent rounded-full animate-spin`} />
    </div>
  );
}

function StepPending({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className={`flex-shrink-0 w-7 h-7 rounded-full border-2 ${
      isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-300 bg-slate-100'
    }`} />
  );
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
        style={{ boxShadow: isDarkMode ? '0 0 40px rgba(52,211,153,0.08), inset 0 0 30px rgba(52,211,153,0.05)' : '0 0 30px rgba(5,150,105,0.06)' }}
      >
        {[0.33, 0.66, 1].map((scale, i) => (
          <div key={i} className={`absolute border ${ringColor} rounded-full`}
            style={{ width: `${scale * 100}%`, height: `${scale * 100}%`, top: `${(1 - scale) * 50}%`, left: `${(1 - scale) * 50}%` }} />
        ))}
        <div className={`absolute top-0 bottom-0 left-1/2 w-px ${lineColor}`} />
        <div className={`absolute left-0 right-0 top-1/2 h-px ${lineColor}`} />
        <div className="absolute inset-0 animate-radar-sweep" style={{
          background: isDarkMode
            ? 'conic-gradient(from 0deg, transparent 0deg, rgba(52,211,153,0.25) 0deg, rgba(52,211,153,0.08) 40deg, transparent 60deg)'
            : 'conic-gradient(from 0deg, transparent 0deg, rgba(5,150,105,0.2) 0deg, rgba(5,150,105,0.05) 40deg, transparent 60deg)',
          borderRadius: '50%',
        }} />
        <div className="absolute inset-[15%] animate-radar-ring">
          <div className={`w-full h-full rounded-full border ${isDarkMode ? 'border-emerald-400/20' : 'border-emerald-500/15'}`} />
        </div>
        {blips.map((pos, i) => (
          <div key={i} className={`absolute w-2 h-2 rounded-full animate-radar-blip ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`}
            style={{ top: pos.top, left: pos.left, animationDelay: pos.delay }} />
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
  const label = percent < 5 ? 'Preparando análise...' : `${percent}%`;
  return (
    <div className={`rounded-xl px-4 py-3 ${
      isDarkMode ? 'bg-slate-800/80 border border-emerald-500/15' : 'bg-emerald-50 border border-emerald-200'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Andamento</span>
        <span className={`text-sm font-bold tabular-nums transition-all duration-500 ${
          percent < 5 ? (isDarkMode ? 'text-slate-500' : 'text-slate-400') : (isDarkMode ? 'text-emerald-400' : 'text-emerald-600')
        }`}>{label}</span>
      </div>
      <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-emerald-100'}`}>
        <div className={`h-full rounded-full transition-all duration-700 ease-out ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-600'}`}
          style={{ width: `${visualWidth}%` }} />
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────── */

const LoadingSmart: React.FC<LoadingSmartProps> = ({
  isLoading, mode, isDarkMode, loadingVariant = 'hero', fixedStatusLine, onStop, processing, searchQuery, empresaAlvo,
}) => {
  const [currentInsight, setCurrentInsight] = useState<string>(
    'Empresas com disciplina operacional tendem a transformar dados em vantagem competitiva mais rápido.',
  );
  const [activeInsightIndex, setActiveInsightIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [confirmStop, setConfirmStop] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curiositiesRef = useRef<string[]>([]);
  const [displayedCompleted, setDisplayedCompleted] = useState<string[]>([]);
  const [displayedCurrent, setDisplayedCurrent] = useState<string>('Preparando análise...');
  const queueRef = useRef<string[]>([]);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRevealTimeRef = useRef<number>(0);
  const stepTimestampsRef = useRef<Record<string, number>>({});
  const displayedStageKeysRef = useRef<Set<string>>(new Set());
  const queuedStageKeysRef = useRef<Set<string>>(new Set());
  const plannedOrderByKeyRef = useRef<Map<string, number>>(new Map());

  if (plannedOrderByKeyRef.current.size === 0) {
    const mergedPlan = [...MODULAR_DOSSIER_STAGES, ...INVESTIGATION_TIMELINE_STAGES];
    mergedPlan.forEach((stage, index) => {
      const key = statusKey(stripInternalMarkers(stage).trim());
      if (key && !plannedOrderByKeyRef.current.has(key)) {
        plannedOrderByKeyRef.current.set(key, index);
      }
    });
  }

  const extractCompanyFromQuery = useCallback((query?: string): string => {
    if (!query) return '';
    const cleanQuery = query.trim().replace(/[.]{2,}$/g, '').replace(/\s+/g, ' ');
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
  const safeSearchQuery = useMemo(() => sanitizeLoadingContextText(searchQuery || '', companyFocus), [searchQuery, companyFocus]);
  const loadingContext = (safeContext || safeSearchQuery).trim();
  const sanitizedQueryForCuriosities = useMemo(() => sanitizeLoadingContextText(searchQuery || '', companyFocus), [searchQuery, companyFocus]);

  const normalizeSourceLabel = useCallback((label: string): string =>
    label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim(), []);

  const renderInsight = useCallback((insight: string): React.ReactNode => {
    const sourceMatch = insight.match(/^(.*?)(?:\s+[—-]\s*Fonte:\s*)(.+)$/i);
    if (!sourceMatch) return insight;
    const prefix = sourceMatch[1].trim();
    const sourceLabel = sourceMatch[2].trim().replace(/[.)]+$/, '');
    const sourceUrl = SOURCE_LINKS[normalizeSourceLabel(sourceLabel)];
    if (!sourceUrl) return insight;
    return (<>{prefix}{' — '}Fonte:{' '}<a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity">{sourceLabel}</a></>);
  }, [normalizeSourceLabel]);

  const buildFallbackCuriosities = useCallback((context: string): string[] => buildLoadingCuriositiesFallback(context), []);

  // ── 1. Timer ──
  useEffect(() => {
    if (!isLoading) { setElapsedTime(0); return; }
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
      lastRevealTimeRef.current = 0;
      stepTimestampsRef.current = {};
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      return;
    }
    const realCompleted = (processing?.completedStages || [])
      .map(s => stripInternalMarkers(s).trim())
      .filter(Boolean);
    const realCurrent = stripInternalMarkers(processing?.stage || 'Preparando análise...').trim() || 'Preparando análise...';
    const newStages: Array<{ label: string; key: string }> = [];
    for (const stage of realCompleted) {
      const stageKey = statusKey(stage);
      if (
        !stageKey ||
        displayedStageKeysRef.current.has(stageKey) ||
        queuedStageKeysRef.current.has(stageKey)
      ) {
        continue;
      }
      newStages.push({ label: stage, key: stageKey });
    }
    if (newStages.length > 0) {
      newStages.sort((a, b) => {
        const aIndex = plannedOrderByKeyRef.current.get(a.key) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = plannedOrderByKeyRef.current.get(b.key) ?? Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex;
      });
      queueRef.current = [...queueRef.current, ...newStages.map(stage => stage.label)];
      newStages.forEach(stage => queuedStageKeysRef.current.add(stage.key));
    }
    const getBackoffMessage = (count: number) => {
      if (count === 1) return 'Refinando sinais para alta precisão...';
      if (count === 2) return 'Ajustando filtros de profundidade executiva...';
      if (count >= 3) return 'Finalizando orquestração de dados complexos...';
      return null;
    };
    const backoffMsg = getBackoffMessage(processing?.failureCount || 0);
    setDisplayedCurrent(backoffMsg || realCurrent);
    const revealNext = () => {
      if (queueRef.current.length === 0) return;
      const now = Date.now();
      const delay = Math.max(0, STEP_REVEAL_MIN_MS - (now - lastRevealTimeRef.current));
      revealTimerRef.current = setTimeout(() => {
        const next = queueRef.current.shift();
        if (next) {
          const nextKey = statusKey(next);
          if (nextKey) {
            queuedStageKeysRef.current.delete(nextKey);
          }
          lastRevealTimeRef.current = Date.now();
          setDisplayedCompleted(prev => {
            if (!nextKey) return prev;
            if (displayedStageKeysRef.current.has(nextKey)) return prev;
            displayedStageKeysRef.current.add(nextKey);
            stepTimestampsRef.current[next] = elapsedTime;
            return [...prev, next];
          });
          if (queueRef.current.length > 0) revealTimerRef.current = setTimeout(revealNext, STEP_REVEAL_DELAY_MS);
          else revealTimerRef.current = null;
        } else { revealTimerRef.current = null; }
      }, delay);
    };
    if (queueRef.current.length > 0 && !revealTimerRef.current) revealNext();
    return () => { /* intentionally not clearing */ };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, processing?.completedStages, processing?.stage]);

  useEffect(() => () => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  // ── 2. Curiosidades ──
  useEffect(() => {
    if (!isLoading) return;
    setActiveInsightIndex(0);
    curiositiesRef.current = [];
    setCurrentInsight(
      companyFocus
        ? `Mapeando sinais operacionais e footprint de mercado da ${companyFocus} — isso leva alguns instantes.`
        : 'Empresas com disciplina operacional tendem a transformar dados em vantagem competitiva mais rápido.',
    );
    if (!loadingContext || loadingContext.length < 2) {
      curiositiesRef.current = buildFallbackCuriosities('');
      setCurrentInsight(curiositiesRef.current[0]);
      return;
    }
    generateLoadingCuriosities(loadingContext, sanitizedQueryForCuriosities)
      .then(facts => {
        if (facts && facts.length > 0) {
          curiositiesRef.current = facts.map(f => stripInternalMarkers(f)).filter(Boolean);
          setCurrentInsight(curiositiesRef.current[0] || buildFallbackCuriosities(loadingContext)[0]);
        } else {
          curiositiesRef.current = buildFallbackCuriosities(loadingContext);
          setCurrentInsight(curiositiesRef.current[0]);
        }
      })
      .catch(() => {
        curiositiesRef.current = buildFallbackCuriosities(loadingContext);
        setCurrentInsight(curiositiesRef.current[0]);
      });
  }, [isLoading, companyFocus, loadingContext, sanitizedQueryForCuriosities, buildFallbackCuriosities]);

  // ── 3. Auto-cycle curiosities ──
  const goToInsight = useCallback((index: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsFadingOut(true);
    timerRef.current = setTimeout(() => {
      const total = curiositiesRef.current.length || 1;
      const safeIndex = ((index % total) + total) % total;
      setActiveInsightIndex(safeIndex);
      setCurrentInsight(curiositiesRef.current[safeIndex] ?? 'Curiosidade: empresas que monitoram rotina operacional com consistência aceleram decisões comerciais.');
      setIsFadingOut(false);
      timerRef.current = setTimeout(() => goToInsight(safeIndex + 1), INSIGHT_CYCLE_MS);
    }, FADE_DURATION);
  }, []);

  // ── 4. Visibility control ──
  useEffect(() => {
    if (isLoading) {
      setIsVisible(true); setIsFadingOut(false); setConfirmStop(false);
      timerRef.current = setTimeout(() => goToInsight(1), INSIGHT_CYCLE_MS);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsFadingOut(true);
      setTimeout(() => setIsVisible(false), FADE_DURATION);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isLoading, goToInsight]);

  if (!isVisible) return null;

  // ── Stage normalization ──
  const enrichStage = (raw: string): RichLoadingStatus => {
    const rich = toRichStatus(stripInternalMarkers(raw));
    if (rich) return rich;
    const label = stripInternalMarkers(raw) || 'Investigação em andamento...';
    return { label, icon: isPhaseTimelineStatus(label) ? '📌' : '', category: 'unknown' };
  };

  const getStageIdentity = (raw: string): string => {
    const label = stripInternalMarkers(raw).trim();
    return label ? statusKey(label) : '';
  };

  const completedRich: RichLoadingStatus[] = displayedCompleted.map(enrichStage);
  const currentRich: RichLoadingStatus = enrichStage(displayedCurrent);
  const completedCount = completedRich.length;
  const pendingInQueue = queueRef.current.length;
  const realTotalCompleted = (processing?.completedStages || []).length;
  const realCompletedStageKeys = new Set((processing?.completedStages || []).map(getStageIdentity).filter(Boolean));
  const declaredTotalStages =
    typeof processing?.totalStages === 'number' && Number.isFinite(processing.totalStages) && processing.totalStages > 0
      ? processing.totalStages : null;
  const isIncremental = Boolean(processing?.isIncremental);
  const observedLabels = [...displayedCompleted, displayedCurrent]
    .map(step => stripInternalMarkers(step).trim())
    .filter(Boolean);
  const observedKeys = new Set(observedLabels.map(getStageIdentity).filter(Boolean));
  const matchesPlan = (candidate: string[]) =>
    candidate.some(stage => observedKeys.has(getStageIdentity(stage)));
  const plannedStageLabels =
    declaredTotalStages === MODULAR_DOSSIER_STAGES.length || matchesPlan(MODULAR_DOSSIER_STAGES as unknown as string[])
      ? MODULAR_DOSSIER_STAGES as unknown as string[]
      : matchesPlan(INVESTIGATION_TIMELINE_STAGES)
        ? INVESTIGATION_TIMELINE_STAGES
        : observedLabels;
  const plannedRich = plannedStageLabels.map(enrichStage);
  const plannedStageKeys = new Set(plannedStageLabels.map(getStageIdentity).filter(Boolean));
  const completedStageKeys = new Set<string>();

  if (plannedRich.length > 0) {
    for (const stage of plannedRich) {
      const stepKey = getStageIdentity(stage.label);
      if (!stepKey) continue;
      if (!realCompletedStageKeys.has(stepKey)) break;
      completedStageKeys.add(stepKey);
    }
  } else {
    realCompletedStageKeys.forEach((key) => completedStageKeys.add(key));
  }

  const currentStageKey = getStageIdentity(displayedCurrent);
  const currentPlannedIndex = plannedRich.findIndex(step => getStageIdentity(step.label) === currentStageKey);
  const shouldAppendCurrentStage = Boolean(currentStageKey) && !plannedStageKeys.has(currentStageKey);
  const visiblePlannedIndices = new Set<number>();

  // Estratégia "Full Roadmap": Se um plano foi identificado, mostramos todas as etapas
  // marcando retrocesso ou progresso conforme necessário.
  const isUsingPlannedStages = plannedStageLabels === (MODULAR_DOSSIER_STAGES as unknown as string[]) || plannedStageLabels === INVESTIGATION_TIMELINE_STAGES;

  if (isUsingPlannedStages) {
    plannedRich.forEach((_, index) => visiblePlannedIndices.add(index));
  } else {
    // Fallback para quando não há plano fixo: comportamento incremental clássico
    plannedRich.forEach((step, index) => {
      if (completedStageKeys.has(getStageIdentity(step.label))) {
        visiblePlannedIndices.add(index);
      }
    });

    if (currentPlannedIndex >= 0) {
      visiblePlannedIndices.add(currentPlannedIndex);
      const nextPlannedIndex = plannedRich.findIndex(
        (step, index) =>
          index > currentPlannedIndex &&
          !completedStageKeys.has(getStageIdentity(step.label)),
      );
      if (nextPlannedIndex >= 0) {
        visiblePlannedIndices.add(nextPlannedIndex);
      }
    } else {
      const nextPendingIndex = plannedRich.findIndex(step => !completedStageKeys.has(getStageIdentity(step.label)));
      if (nextPendingIndex >= 0) {
        visiblePlannedIndices.add(nextPendingIndex);
      }
    }
  }

  const visiblePlannedStages = plannedRich.filter((_, index) => visiblePlannedIndices.has(index));
  // Fallback dinâmico: sem hardcode por modo — autoajusta conforme etapas reais chegam
  const expectedTotal = declaredTotalStages
    ?? (plannedRich.length > 0 ? plannedRich.length : (isIncremental ? Math.max(6, realTotalCompleted + 1) : Math.max(12, realTotalCompleted + 2)));
  const displayedPercent = Math.min(Math.round((completedCount / expectedTotal) * 100), 95);
  const realPercent = Math.min(Math.round((realTotalCompleted / expectedTotal) * 100), 95);
  const percent = pendingInQueue > 0
    ? Math.min(displayedPercent + Math.round((realPercent - displayedPercent) * 0.3), 95)
    : displayedPercent;

  const elapsed = formatElapsed(elapsedTime);
  const totalCuriosities = curiositiesRef.current.length || 1;

  // ── Inline placeholder ──
  const inlinePlaceholder = (
    <div className={`flex flex-col gap-2 rounded-xl p-3 ${
      isDarkMode ? 'bg-slate-800/60 border border-emerald-500/10' : 'bg-emerald-50/50 border border-emerald-100'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
          <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Investigação em andamento...</span>
        </div>
        <span className={`flex items-center gap-1 text-xs font-mono ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
          <ClockIcon className="w-3.5 h-3.5" />{elapsed}
        </span>
      </div>
      {fixedStatusLine ? (
        <p className={`text-xs font-semibold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
          {fixedStatusLine}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-emerald-100'}`}>
          <div className={`h-full rounded-full transition-all duration-700 ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-600'}`}
            style={{ width: `${Math.max(percent, 3)}%` }} />
        </div>
        <span className={`text-xs font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{percent}%</span>
        <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>{completedCount} etapa{completedCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );

  // ── Fullscreen overlay ──
  const overlay = (
    <div
      className={`fixed inset-0 z-[100] flex flex-col overflow-y-auto overscroll-contain animate-overlay-enter ${
        isDarkMode ? 'bg-slate-950/95 text-slate-100' : 'bg-white/95 text-slate-800'
      } ${isFadingOut && !isLoading ? 'opacity-0 transition-opacity duration-400' : ''}`}
      style={{ backdropFilter: 'blur(8px)' }}
    >
      {/* ── Header ── */}
      <div className={`flex-shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 md:px-8 py-3 md:py-4 border-b ${
        isDarkMode ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <div className="flex w-full min-w-0 items-center gap-2 md:w-auto md:gap-3">
          <div className={`w-3 h-3 flex-shrink-0 rounded-full animate-pulse ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
          <h1 className={`text-sm md:text-base font-bold tracking-tight truncate ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>Senior Scout 360</h1>
          {companyFocus && (
            <span className={`hidden sm:inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${
              isDarkMode ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
            }`}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              {companyFocus}
            </span>
          )}
        </div>
        <div className="ml-0 flex w-full flex-wrap items-center justify-end gap-2 md:ml-2 md:w-auto md:gap-3">
          <span className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-lg ${
            isDarkMode ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          }`}>
            <ClockIcon className="w-3.5 h-3.5" />{elapsed}
          </span>
          {onStop && (
            confirmStop ? (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Interromper?</span>
                <button onClick={() => { setConfirmStop(false); onStop(); }}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-full transition-all text-xs font-bold">Sim</button>
                <button onClick={() => setConfirmStop(false)}
                  className={`px-3 py-1.5 rounded-full transition-all text-xs font-bold border ${
                    isDarkMode ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-300 text-slate-500 hover:bg-slate-100'
                  }`}>Não</button>
              </div>
            ) : (
              <button onClick={() => setConfirmStop(true)}
                className="bg-red-500/10 hover:bg-red-500 border border-red-500/30 text-red-500 hover:text-white px-3 md:px-4 py-1.5 rounded-full transition-all text-xs font-bold">
                Interromper
              </button>
            )
          )}
        </div>
      </div>

      {/* ── Centralized Progress Control ── */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center px-4 md:px-8 py-3 md:py-6">
        <div className={`flex flex-col items-center gap-2 mb-3 w-full ${isIncremental ? 'max-w-xl' : 'max-w-2xl'}`}>
          <StepSpinner isDarkMode={isDarkMode} />
          <h2 className={`${isIncremental ? 'text-base md:text-xl' : 'text-base sm:text-lg md:text-3xl'} font-black tracking-tight text-center line-clamp-2 ${
            isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
          }`}>{currentRich.label}</h2>
          <p className={`${isIncremental ? 'text-[11px] md:text-xs' : 'text-xs md:text-sm'} font-bold uppercase tracking-widest text-center ${
            isDarkMode ? 'text-slate-500' : 'text-slate-400'
          }`}>Análise em execução</p>
        </div>
        <div className={`w-full ${isIncremental ? 'max-w-xl' : 'max-w-2xl'}`}>
          <ProgressBar percent={percent} isDarkMode={isDarkMode} />
        </div>
      </div>

      {/* ── Two-column: Steps + Radar ── */}
      <div className="flex-1 px-4 pb-3 md:px-8 md:pb-4">
        <div className={`mx-auto grid grid-cols-1 items-start gap-4 md:gap-10 ${isIncremental ? 'max-w-3xl md:grid-cols-1' : 'max-w-5xl md:grid-cols-2'}`}>

          {/* Steps column */}
          <div className="flex min-w-0 flex-col">
            <h2 className={`text-xs md:text-sm font-bold uppercase tracking-wider mb-3 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}>Etapas da análise</h2>

            <div className="flex flex-col gap-2.5 pr-0 md:gap-3 md:pr-2">
              {visiblePlannedStages.map((step, i) => {
                const stepKey = getStageIdentity(step.label);
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
                    {isCompleted && stepTimestampsRef.current[step.label] !== undefined ? (
                      <span className={`text-xs font-mono flex-shrink-0 tabular-nums ${
                        isDarkMode ? 'text-slate-600' : 'text-slate-300'
                      }`}>
                        +{formatElapsed(stepTimestampsRef.current[step.label])}
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
                    {currentRich.label}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {!isIncremental && (
            <div className="hidden lg:flex items-center justify-center">
              <RadarAnimation isDarkMode={isDarkMode} />
            </div>
          )}
        </div>
      </div>

      {/* ── Insight carousel ── */}
      <div className={`flex-shrink-0 px-4 py-3 md:px-8 md:py-4 border-t ${
        isDarkMode ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <div className={`mx-auto w-full max-w-3xl rounded-xl px-4 py-3 md:px-5 ${
          isDarkMode ? 'bg-slate-900/80 border border-emerald-500/15' : 'bg-emerald-50/50 border border-emerald-200'
        }`}>
          <div className="flex items-start gap-3 mb-2">
            <span className="text-base flex-shrink-0">💡</span>
            <div className={`flex-1 min-w-0 transition-opacity duration-300 ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}>
              <p className={`text-xs font-black uppercase tracking-widest mb-1 ${
                isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
              }`}>Contexto estratégico</p>
              <div className="max-h-none">
                <p className={`text-sm font-medium leading-relaxed ${isDarkMode ? 'text-slate-100' : 'text-slate-700'}`}>
                  {renderInsight(currentInsight)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => goToInsight(activeInsightIndex - 1)}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                isDarkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-emerald-100 text-slate-400 hover:text-slate-600'
              }`} aria-label="Insight anterior">‹</button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.min(totalCuriosities, 6) }).map((_, i) => (
                <button key={i} onClick={() => goToInsight(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === activeInsightIndex
                      ? (isDarkMode ? 'bg-emerald-400 w-3' : 'bg-emerald-500 w-3')
                      : (isDarkMode ? 'bg-slate-600' : 'bg-slate-300')
                  }`} aria-label={`Insight ${i + 1}`} />
              ))}
            </div>
            <button onClick={() => goToInsight(activeInsightIndex + 1)}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                isDarkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-emerald-100 text-slate-400 hover:text-slate-600'
              }`} aria-label="Próximo insight">›</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (loadingVariant === 'inline') return inlinePlaceholder;

  return (
    <>
      {inlinePlaceholder}
      {ReactDOM.createPortal(overlay, document.body)}
    </>
  );
};

export default LoadingSmart;
