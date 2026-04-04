import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ChatMode } from '../constants';
import { generateLoadingCuriosities } from '../services/geminiService';
import { buildLoadingCuriositiesFallback } from '../utils/loadingCuriosities';
import { toRichStatus, isPhaseTimelineStatus, type RichLoadingStatus } from '../utils/loadingStatus';
import { sanitizeLoadingContextText, stripInternalMarkers } from '../utils/textCleaners';

const FADE_DURATION = 400;
const INSIGHT_CYCLE_MS = 12000;
const STEP_REVEAL_DELAY_MS = 1200;  // min delay between revealing each step
const STEP_REVEAL_MIN_MS = 800;     // absolute minimum even for fast bursts
const SOURCE_LINKS: Record<string, string> = {
  ibge:    'https://www.ibge.gov.br/',
  conab:   'https://www.conab.gov.br/',
  embrapa: 'https://www.embrapa.br/',
  senior:  'https://www.senior.com.br/',
  gatec:   'https://www.gatec.com.br/',
};

const EXPECTED_STAGES: Record<string, number> = {
  investigacao: 8,
};

interface LoadingSmartProps {
  isLoading: boolean;
  mode: ChatMode;
  isDarkMode: boolean;
  onStop?: () => void;
  processing?: { stage?: string; completedStages?: string[]; failureCount?: number; totalStages?: number };
  searchQuery?: string;
  empresaAlvo?: string | null;
}

/* ── Sub-components ─────────────────────────────────────────────────── */

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
      <div className={`relative w-48 h-48 md:w-64 md:h-64 rounded-full ${bgOuter} overflow-hidden`}
        style={{ boxShadow: isDarkMode ? '0 0 40px rgba(52,211,153,0.08), inset 0 0 30px rgba(52,211,153,0.05)' : '0 0 30px rgba(5,150,105,0.06)' }}>

        {/* Concentric rings */}
        {[0.33, 0.66, 1].map((scale, i) => (
          <div key={i}
            className={`absolute border ${ringColor} rounded-full`}
            style={{
              width: `${scale * 100}%`, height: `${scale * 100}%`,
              top: `${(1 - scale) * 50}%`, left: `${(1 - scale) * 50}%`,
            }}
          />
        ))}

        {/* Cross-hair lines */}
        <div className={`absolute top-0 bottom-0 left-1/2 w-px ${lineColor}`} />
        <div className={`absolute left-0 right-0 top-1/2 h-px ${lineColor}`} />

        {/* Sweep beam */}
        <div className="absolute inset-0 animate-radar-sweep"
          style={{
            background: isDarkMode
              ? 'conic-gradient(from 0deg, transparent 0deg, rgba(52,211,153,0.25) 0deg, rgba(52,211,153,0.08) 40deg, transparent 60deg)'
              : 'conic-gradient(from 0deg, transparent 0deg, rgba(5,150,105,0.2) 0deg, rgba(5,150,105,0.05) 40deg, transparent 60deg)',
            borderRadius: '50%',
          }}
        />

        {/* Expanding ring */}
        <div className="absolute inset-[15%] animate-radar-ring">
          <div className={`w-full h-full rounded-full border ${isDarkMode ? 'border-emerald-400/20' : 'border-emerald-500/15'}`} />
        </div>

        {/* Blips */}
        {blips.map((pos, i) => (
          <div key={i}
            className={`absolute w-2 h-2 rounded-full animate-radar-blip ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`}
            style={{ top: pos.top, left: pos.left, animationDelay: pos.delay }}
          />
        ))}

        {/* Center orb */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`w-5 h-5 rounded-full animate-radar-pulse ${orbGlow}`} />
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ percent, isDarkMode }: { percent: number; isDarkMode: boolean }) {
  return (
    <div className={`rounded-xl px-5 py-3 ${
      isDarkMode ? 'bg-slate-800/80 border border-emerald-500/15' : 'bg-emerald-50 border border-emerald-200'
    }`}>
      <div className="flex items-center justify-center mb-2">
        <span className={`text-sm font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
          Progresso Geral: <span className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}>{percent}%</span>
        </span>
      </div>
      <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-emerald-100'}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-600'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

const LoadingSmart: React.FC<LoadingSmartProps> = ({
  isLoading,
  mode,
  isDarkMode,
  onStop,
  processing,
  searchQuery,
  empresaAlvo,
}) => {
  const [currentInsight, setCurrentInsight] = useState<string>(
    'Empresas com disciplina operacional tendem a transformar dados em vantagem competitiva mais rápido.',
  );
  const [activeInsightIndex, setActiveInsightIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const curiositiesRef = useRef<string[]>([]);

  // ── Visual queue: drip-feed stages instead of showing them all at once ──
  const [displayedCompleted, setDisplayedCompleted] = useState<string[]>([]);
  const [displayedCurrent, setDisplayedCurrent] = useState<string>('Preparando análise...');
  const queueRef = useRef<string[]>([]);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRevealTimeRef = useRef<number>(0);

  // ── Company extraction ──
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
  const safeSearchQuery = useMemo(
    () => sanitizeLoadingContextText(searchQuery || '', companyFocus),
    [searchQuery, companyFocus],
  );
  const loadingContext = (safeContext || safeSearchQuery).trim();
  const sanitizedQueryForCuriosities = useMemo(
    () => sanitizeLoadingContextText(searchQuery || '', companyFocus),
    [searchQuery, companyFocus],
  );

  const normalizeSourceLabel = useCallback((label: string): string => {
    return label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();
  }, []);

  const renderInsight = useCallback(
    (insight: string): React.ReactNode => {
      const sourceMatch = insight.match(/^(.*?)(?:\s+[—-]\s*Fonte:\s*)(.+)$/i);
      if (!sourceMatch) return insight;
      const prefix = sourceMatch[1].trim();
      const sourceLabel = sourceMatch[2].trim().replace(/[.)]+$/, '');
      const sourceKey = normalizeSourceLabel(sourceLabel);
      const sourceUrl = SOURCE_LINKS[sourceKey];
      if (!sourceUrl) return insight;
      return (
        <>
          {prefix}{' — '}Fonte:{' '}
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity">
            {sourceLabel}
          </a>
        </>
      );
    },
    [normalizeSourceLabel],
  );

  const buildFallbackCuriosities = useCallback((context: string): string[] => buildLoadingCuriositiesFallback(context), []);

  // ── 1. Timer ──
  useEffect(() => {
    if (!isLoading) { setElapsedTime(0); return; }
    const startTime = Date.now();
    const interval = setInterval(() => setElapsedTime(Date.now() - startTime), 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  // ── 1b. Visual queue — drip-feed stages one at a time ──
  useEffect(() => {
    if (!isLoading) {
      // Reset on stop
      setDisplayedCompleted([]);
      setDisplayedCurrent('Preparando análise...');
      queueRef.current = [];
      lastRevealTimeRef.current = 0;
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      return;
    }

    const realCompleted = (processing?.completedStages || []).map(s => stripInternalMarkers(s)).filter(Boolean);
    const realCurrent = processing?.stage || 'Preparando análise...';

    // Find new stages that haven't been queued or displayed yet
    const alreadyKnown = new Set([...displayedCompleted, ...queueRef.current]);
    const newStages: string[] = [];
    for (const stage of realCompleted) {
      if (!alreadyKnown.has(stage)) {
        newStages.push(stage);
      }
    }

    if (newStages.length > 0) {
      queueRef.current = [...queueRef.current, ...newStages];
    }

    const getBackoffMessage = (count: number) => {
      if (count === 1) return "Refinando sinais para alta precisão...";
      if (count === 2) return "Ajustando filtros de profundidade executiva...";
      if (count >= 3) return "Finalizando orquestração de dados complexos...";
      return null;
    };

    const backoffMsg = getBackoffMessage(processing?.failureCount || 0);
    // Always update the "real" current stage (what comes after displayed ones)
    setDisplayedCurrent(backoffMsg || stripInternalMarkers(realCurrent));

    // Process queue: reveal one item at a time with minimum delay
    const revealNext = () => {
      if (queueRef.current.length === 0) return;

      const now = Date.now();
      const timeSinceLast = now - lastRevealTimeRef.current;
      const delay = Math.max(0, STEP_REVEAL_MIN_MS - timeSinceLast);

      revealTimerRef.current = setTimeout(() => {
        const next = queueRef.current.shift();
        if (next) {
          lastRevealTimeRef.current = Date.now();
          setDisplayedCompleted(prev => [...prev, next]);
          // Schedule next reveal if there are more in queue
          if (queueRef.current.length > 0) {
            revealTimerRef.current = setTimeout(revealNext, STEP_REVEAL_DELAY_MS);
          }
        }
      }, delay);
    };

    // Start draining queue if not already draining
    if (queueRef.current.length > 0 && !revealTimerRef.current) {
      revealNext();
    } else if (queueRef.current.length > 0) {
      // Timer already running, it will pick up new items
    }

    return () => {
      // Don't clear the timer on every re-render — let it run
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, processing?.completedStages?.length, processing?.stage]);

  // ── 1c. Keep draining queue continuously ──
  useEffect(() => {
    if (!isLoading || queueRef.current.length === 0) return;

    const drain = () => {
      if (queueRef.current.length === 0) {
        revealTimerRef.current = null;
        return;
      }
      const next = queueRef.current.shift();
      if (next) {
        lastRevealTimeRef.current = Date.now();
        setDisplayedCompleted(prev => [...prev, next]);
      }
      if (queueRef.current.length > 0) {
        revealTimerRef.current = setTimeout(drain, STEP_REVEAL_DELAY_MS);
      } else {
        revealTimerRef.current = null;
      }
    };

    if (!revealTimerRef.current) {
      const timeSinceLast = Date.now() - lastRevealTimeRef.current;
      const initialDelay = Math.max(STEP_REVEAL_MIN_MS, STEP_REVEAL_DELAY_MS - timeSinceLast);
      revealTimerRef.current = setTimeout(drain, initialDelay);
    }

    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, displayedCompleted.length]);

  // ── 2. Curiosidades ──
  useEffect(() => {
    if (!isLoading) return;
    setActiveInsightIndex(0);
    curiositiesRef.current = [];
    setCurrentInsight(
      companyFocus
        ? `${companyFocus} ganha previsibilidade quando operação e gestão acompanham os mesmos indicadores críticos.`
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
      setCurrentInsight(
        curiositiesRef.current[safeIndex] ??
        'Curiosidade: empresas que monitoram rotina operacional com consistência aceleram decisões comerciais.',
      );
      setIsFadingOut(false);
      timerRef.current = setTimeout(() => goToInsight(safeIndex + 1), INSIGHT_CYCLE_MS);
    }, FADE_DURATION);
  }, []);

  // ── 4. Visibility control ──
  useEffect(() => {
    if (isLoading) {
      setIsVisible(true);
      setIsFadingOut(false);
      timerRef.current = setTimeout(() => goToInsight(1), INSIGHT_CYCLE_MS);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsFadingOut(true);
      setTimeout(() => setIsVisible(false), FADE_DURATION);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isLoading, goToInsight]);

  if (!isVisible) return null;

  // ── Stage normalization (uses visual queue, not raw props) ──
  const enrichStage = (raw: string): RichLoadingStatus => {
    const rich = toRichStatus(stripInternalMarkers(raw));
    if (rich) return rich;
    const label = stripInternalMarkers(raw) || 'Investigação em andamento...';
    const isPhase = isPhaseTimelineStatus(label);
    return { label, icon: isPhase ? '📌' : '⚡', category: 'unknown' };
  };

  const completedRich: RichLoadingStatus[] = displayedCompleted.map(enrichStage);
  const currentRich: RichLoadingStatus = enrichStage(displayedCurrent);
  const completedCount = completedRich.length;
  const pendingInQueue = queueRef.current.length;
  const realTotalCompleted = (processing?.completedStages || []).length;
  const declaredTotalStages =
    typeof processing?.totalStages === 'number' && Number.isFinite(processing.totalStages) && processing.totalStages > 0
      ? processing.totalStages
      : null;
  const expectedTotal = declaredTotalStages ?? Math.max(EXPECTED_STAGES[mode] ?? 12, realTotalCompleted + 2);
  // Smooth progress: interpolate between displayed and real
  const displayedPercent = Math.min(Math.round((completedCount / expectedTotal) * 100), 95);
  const realPercent = Math.min(Math.round((realTotalCompleted / expectedTotal) * 100), 95);
  // Show a value between displayed and real so bar feels alive even while queue drains
  const percent = pendingInQueue > 0
    ? Math.min(displayedPercent + Math.round((realPercent - displayedPercent) * 0.3), 95)
    : displayedPercent;

  const elapsed = (() => {
    const s = Math.floor(elapsedTime / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  })();

  const totalCuriosities = curiositiesRef.current.length || 1;

  // ── Inline placeholder (stays in chat bubble) ──
  const inlinePlaceholder = (
    <div className={`flex flex-col gap-2 rounded-xl p-3 ${
      isDarkMode ? 'bg-slate-800/60 border border-emerald-500/10' : 'bg-emerald-50/50 border border-emerald-100'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
          <span className={`text-sm font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            Investigação em andamento...
          </span>
        </div>
        <span className={`text-xs font-mono ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>⏱ {elapsed}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-emerald-100'}`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-600'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className={`text-xs font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{percent}%</span>
        <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
          {completedCount} etapa{completedCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );

  // ── Fullscreen overlay (portalled to body) ──
  const overlay = (
    <div
      className={`fixed inset-0 z-[100] flex flex-col animate-overlay-enter ${
        isDarkMode ? 'bg-slate-950/95 text-slate-100' : 'bg-white/95 text-slate-800'
      } ${isFadingOut && !isLoading ? 'opacity-0 transition-opacity duration-400' : ''}`}
      style={{ backdropFilter: 'blur(8px)' }}
    >
      {/* ── Header ── */}
      <div className={`flex items-center justify-between px-4 md:px-8 py-4 border-b ${
        isDarkMode ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full animate-pulse ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
          <h1 className={`text-base md:text-lg font-bold tracking-tight ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
            Senior Scout 360 — Investigação em Andamento
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono px-2.5 py-1 rounded-lg ${
            isDarkMode ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          }`}>
            ⏱ {elapsed}
          </span>
          {onStop && (
            <button
              onClick={onStop}
              className="bg-red-500/10 hover:bg-red-500 border border-red-500/30 text-red-500 hover:text-white px-4 py-1.5 rounded-full transition-all text-xs font-bold"
            >
              PARAR
            </button>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="px-4 md:px-8 py-4">
        <ProgressBar percent={percent} isDarkMode={isDarkMode} />
      </div>

      {/* ── Two-column: Steps + Radar ── */}
      <div className="flex-1 px-4 md:px-8 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 max-w-5xl mx-auto">
          {/* Steps column */}
          <div className="flex flex-col">
            <h2 className={`text-sm font-bold uppercase tracking-wider mb-4 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Etapas da Investigação
            </h2>
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[45vh] pr-2">
              {/* Completed steps */}
              {completedRich.map((step, i) => (
                <div key={`done-${i}`} className="flex items-center gap-3 animate-fade-in">
                  <StepCheckIcon isDarkMode={isDarkMode} />
                  <span className={`text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    <span className="mr-1.5">{step.icon}</span>
                    {step.label}
                  </span>
                </div>
              ))}

              {/* Current step */}
              <div className="flex items-center gap-3">
                <StepSpinner isDarkMode={isDarkMode} />
                <span className={`text-sm font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  <span className="mr-1.5">{currentRich.icon}</span>
                  {currentRich.label}
                </span>
              </div>

              {/* Pending placeholder steps (exclude queued items that will reveal soon) */}
              {Array.from({ length: Math.max(0, Math.min(3, expectedTotal - completedCount - pendingInQueue - 1)) }).map((_, i) => (
                <div key={`pending-${i}`} className="flex items-center gap-3 opacity-40">
                  <StepPending isDarkMode={isDarkMode} />
                  <span className={`text-sm italic ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    Próxima etapa...
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Radar column */}
          <div className="flex items-center justify-center order-first md:order-last">
            <RadarAnimation isDarkMode={isDarkMode} />
          </div>
        </div>
      </div>

      {/* ── Insight carousel ── */}
      <div className={`px-4 md:px-8 py-4 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className={`rounded-xl px-5 py-4 max-w-3xl mx-auto ${
          isDarkMode ? 'bg-slate-900/80 border border-emerald-500/15' : 'bg-emerald-50/50 border border-emerald-200'
        }`}>
          <div className="flex items-start gap-3 mb-3">
            <span className="text-lg flex-shrink-0">💡</span>
            <div className={`transition-opacity duration-300 ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}>
              <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
              }`}>
                Curiosidade / Insight
              </p>
              <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                {renderInsight(currentInsight)}
              </p>
            </div>
          </div>

          {/* Dots + arrows */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => goToInsight(activeInsightIndex - 1)}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                isDarkMode
                  ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                  : 'hover:bg-emerald-100 text-slate-400 hover:text-slate-600'
              }`}
              aria-label="Insight anterior"
            >
              ‹
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.min(totalCuriosities, 6) }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToInsight(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === activeInsightIndex
                      ? (isDarkMode ? 'bg-emerald-400 w-3' : 'bg-emerald-500 w-3')
                      : (isDarkMode ? 'bg-slate-600' : 'bg-slate-300')
                  }`}
                  aria-label={`Insight ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={() => goToInsight(activeInsightIndex + 1)}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                isDarkMode
                  ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                  : 'hover:bg-emerald-100 text-slate-400 hover:text-slate-600'
              }`}
              aria-label="Próximo insight"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {inlinePlaceholder}
      {ReactDOM.createPortal(overlay, document.body)}
    </>
  );
};

export default LoadingSmart;
