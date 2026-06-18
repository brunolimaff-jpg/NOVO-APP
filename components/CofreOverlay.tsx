import React from 'react';
import { formatCnpj } from '../utils/cnpj';
import { formatElapsed } from './loading/hooks';

// ── Types ─────────────────────────────────────────────────────────────────

export type CofrePhase = 'hidden' | 'entering' | 'visible' | 'dissolving';

export interface CofreStage {
  label: string;
  completed: boolean;
  elapsedMs: number;
}

export interface CofreOverlayProps {
  /** Current lifecycle phase — controlled by the parent (MessageTimeline / App) */
  phase: CofrePhase;
  isDarkMode: boolean;
  empresaAlvo: string | null;
  cnpj: string | null;
  completedStageCount: number;
  totalStageCount: number;
  /** Ordered list of all stages (completed + running + pending) with their timing */
  stages: CofreStage[];
  /** Milliseconds since the dossier generation started */
  elapsedTimeMs: number;
  /** Emergency exit — visible through the blur */
  onStop?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Skeleton card labels — represent the sections being generated in the dossier */
const DOSSIER_SECTIONS = ['Perfil e Score Comercial', 'Mercado e Concorrência', 'Riscos e Recomendações'];

// ── Sub-components ────────────────────────────────────────────────────────

/** Premium glowing vault icon at the top of the overlay */
function VaultGem({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="relative mb-5" aria-hidden="true">
      {/* Outer glow aura */}
      <div
        className={`absolute inset-0 rounded-full blur-2xl transition-opacity ${
          isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-500/12'
        }`}
        style={{ transform: 'scale(1.8)' }}
      />
      {/* Inner gem container */}
      <div
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors ${
          isDarkMode
            ? 'bg-slate-900/70 border-emerald-500/25 shadow-[0_0_24px_-4px_rgba(52,211,153,0.15)]'
            : 'bg-white/70 border-emerald-500/20 shadow-[0_0_20px_-4px_rgba(5,150,105,0.1)]'
        }`}
      >
        {/* Lock / vault icon */}
        <svg
          className={`w-7 h-7 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
    </div>
  );
}

/** Glassmorphism chip showing the target company name + CNPJ */
function CompanyBadge({
  isDarkMode,
  empresaAlvo,
  cnpj,
}: {
  isDarkMode: boolean;
  empresaAlvo: string | null;
  cnpj: string | null;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full border backdrop-blur-sm transition-colors ${
        isDarkMode
          ? 'bg-slate-800/40 border-slate-700/40 text-slate-100'
          : 'bg-white/50 border-slate-200/50 text-slate-800'
      }`}
    >
      {/* Magnifying glass */}
      <svg
        className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1111 5a6 6 0 017 6z" />
      </svg>
      <span className="text-sm font-bold tracking-tight truncate max-w-[200px]">{empresaAlvo || 'Empresa'}</span>
      {cnpj && (
        <>
          <span className={`w-px h-4 ${isDarkMode ? 'bg-slate-700' : 'bg-slate-300'}`} aria-hidden="true" />
          <span className={`text-xs font-mono tabular-nums ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {formatCnpj(cnpj)}
          </span>
        </>
      )}
    </div>
  );
}

/** Progress header: "X de Y módulos concluídos" + a subtle hairline bar */
function ProgressHeader({
  isDarkMode,
  completedStageCount,
  totalStageCount,
}: {
  isDarkMode: boolean;
  completedStageCount: number;
  totalStageCount: number;
}) {
  const percent = totalStageCount > 0 ? Math.round((completedStageCount / totalStageCount) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-2 mb-5">
      <span
        className={`text-xs font-bold uppercase tracking-[0.15em] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
      >
        {completedStageCount} de {totalStageCount} modulos concluidos
      </span>
      {/* Hairline progress bar */}
      <div
        className={`w-32 sm:w-40 h-[2px] rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isDarkMode ? 'bg-emerald-500' : 'bg-emerald-600'
          }`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}

/** Compact 2-column stage list with checkmark / spinner / pending icons */
function StageList({ isDarkMode, stages }: { isDarkMode: boolean; stages: CofreStage[] }) {
  if (stages.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-6">
      {stages.map((stage, i) => {
        const icon = stage.completed ? (
          <div
            className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
              isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
            }`}
          >
            <svg
              className={`w-2.5 h-2.5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : stage.elapsedMs > 0 ? (
          <div className="flex-shrink-0 w-4 h-4 relative">
            <div
              className={`w-4 h-4 border-2 rounded-full animate-spin ${
                isDarkMode ? 'border-emerald-400/30 border-t-emerald-400' : 'border-emerald-600/30 border-t-emerald-600'
              }`}
            />
          </div>
        ) : (
          <div
            className={`flex-shrink-0 w-4 h-4 rounded-full border-2 ${
              isDarkMode ? 'border-slate-700' : 'border-slate-300'
            }`}
          />
        );

        return (
          <div key={`${stage.label}-${i}`} className="flex items-center gap-2 min-w-0">
            {icon}
            <span
              className={`text-xs truncate ${
                stage.completed
                  ? isDarkMode
                    ? 'text-slate-500'
                    : 'text-slate-400'
                  : stage.elapsedMs > 0
                    ? isDarkMode
                      ? 'text-slate-200 font-medium'
                      : 'text-slate-700 font-medium'
                    : isDarkMode
                      ? 'text-slate-600'
                      : 'text-slate-400'
              }`}
            >
              {stage.label}
            </span>
            {stage.elapsedMs > 0 && (
              <span
                className={`font-mono text-[10px] flex-shrink-0 ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}
              >
                {formatElapsed(stage.elapsedMs)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Skeleton card with shimmer overlay representing a dossier section being generated */
function SkeletonCard({ isDarkMode, title, index }: { isDarkMode: boolean; title: string; index: number }) {
  const bgLine = isDarkMode ? 'bg-slate-700/50' : 'bg-slate-200/60';
  const borderColor = isDarkMode ? 'border-slate-700/30' : 'border-slate-200/40';
  const bg = isDarkMode ? 'bg-slate-800/30' : 'bg-white/40';

  return (
    <div className={`rounded-2xl border overflow-hidden ${bg} ${borderColor}`} aria-hidden="true">
      {/* Card header */}
      <div className="px-5 pt-4 pb-1">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{title}</span>
        </div>
        <div className={`h-4 w-2/3 rounded-md ${bgLine} relative overflow-hidden`}>
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent animate-shimmer motion-reduce:animate-none"
            style={{ animationDelay: `${index * 0.15}s` }}
          />
        </div>
      </div>
      {/* Card body — shimmer lines */}
      <div className="px-5 pb-4 space-y-2.5">
        {[0, 1, 2].map(line => (
          <div
            key={line}
            className={`h-3 rounded ${bgLine} relative overflow-hidden ${
              line === 1 ? 'w-5/6' : line === 2 ? 'w-3/4' : 'w-full'
            }`}
          >
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent animate-shimmer motion-reduce:animate-none"
              style={{ animationDelay: `${index * 0.15 + 0.1 + line * 0.1}s` }}
            />
          </div>
        ))}
      </div>
      {/* Subtle accent bar — emerald gradient at bottom */}
      <div
        className={`h-[2px] w-full bg-gradient-to-r from-transparent ${
          isDarkMode ? 'via-emerald-500/20' : 'via-emerald-500/15'
        } to-transparent`}
      />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

/**
 * CofreOverlay — Premium glassmorphism vault overlay.
 *
 * Appears when the dossier waterfall completes but the DOM is not yet painted.
 * Shows company info, module progress, skeleton cards, and dissolves smoothly
 * when rendering is ready.
 *
 * Phases:
 *   - hidden:   not rendered
 *   - entering: fade-in + blur materializes (200ms)
 *   - visible:  fully shown, waiting for render
 *   - dissolving:  fade-out + blur dissolves (350ms)
 *
 * The overlay covers the entire app while the dossier is generated.
 */
const CofreOverlay: React.FC<CofreOverlayProps> = ({
  phase,
  isDarkMode,
  empresaAlvo,
  cnpj,
  completedStageCount,
  totalStageCount,
  stages,
  elapsedTimeMs,
  onStop,
}) => {
  if (phase === 'hidden') return null;

  const elapsed = formatElapsed(elapsedTimeMs);
  const isInteractive = phase === 'entering' || phase === 'visible' || phase === 'dissolving';
  const isFullyVisible = phase === 'entering' || phase === 'visible';

  return (
    <div
      className={`fixed inset-0 z-[60] overflow-hidden ${isInteractive ? 'pointer-events-auto' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Briefing estrategico sendo preparado"
      data-testid="cofre-overlay"
      data-cofre-phase={phase}
    >
      {/* ══ Glass backdrop layer ══ */}
      <div
        className={`absolute inset-0 transition-all ${
          isFullyVisible
            ? 'opacity-100 backdrop-blur-xl duration-200 ease-out'
            : 'opacity-0 backdrop-blur-none duration-300 ease-in'
        } ${isDarkMode ? 'bg-slate-950/60' : 'bg-white/60'}`}
        style={{ transitionProperty: 'opacity, backdrop-filter, -webkit-backdrop-filter' }}
      />

      {/* ══ Subtle radial glow (adds depth to the glass) ══ */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${isFullyVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{
          background: `radial-gradient(ellipse 55% 45% at 50% 38%,
            ${isDarkMode ? 'rgba(5,150,105,0.04)' : 'rgba(5,150,105,0.025)'} 0%,
            transparent 70%)`,
        }}
        aria-hidden="true"
      />

      {/* ══ Subtle grid pattern (vault / blueprint feel) ══ */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${isFullyVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{
          backgroundImage: `
            linear-gradient(${isDarkMode ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.015)'} 1px, transparent 1px),
            linear-gradient(90deg, ${isDarkMode ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.015)'} 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
        aria-hidden="true"
      />

      {/* ══ Content layer ══ */}
      <div
        className={`relative z-10 h-full flex flex-col items-center justify-center px-5 py-8 overflow-y-auto transition-opacity duration-200 ${
          isFullyVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Spacer to center content vertically */}
        <div className="flex-1 min-h-[20px]" />

        {/* Vault icon */}
        <VaultGem isDarkMode={isDarkMode} />

        {/* Company badge */}
        <CompanyBadge isDarkMode={isDarkMode} empresaAlvo={empresaAlvo} cnpj={cnpj} />

        {/* Title */}
        <h2
          className={`mt-4 mb-1 text-lg sm:text-xl font-bold tracking-tight text-center ${
            isDarkMode ? 'text-slate-100' : 'text-slate-800'
          }`}
        >
          Briefing estrategico
        </h2>
        <p className={`text-sm font-medium mb-5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          sendo preparado
        </p>

        {/* Progress: X/Y modules */}
        <ProgressHeader
          isDarkMode={isDarkMode}
          completedStageCount={completedStageCount}
          totalStageCount={totalStageCount}
        />

        {/* Stage list */}
        <StageList isDarkMode={isDarkMode} stages={stages} />

        {/* Skeleton cards */}
        <div className="w-full max-w-sm space-y-3 mb-6">
          {DOSSIER_SECTIONS.map((title, i) => (
            <SkeletonCard key={title} isDarkMode={isDarkMode} title={title} index={i} />
          ))}
        </div>

        {/* Bottom bar: timer + stop */}
        <div className={`flex items-center gap-4 text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          <span className="flex items-center gap-1.5 font-mono tabular-nums">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
            </svg>
            {elapsed}
          </span>

          {onStop && (
            <button
              type="button"
              autoFocus
              onClick={onStop}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-bold
                bg-red-500/10 border border-red-500/25 text-red-500
                hover:bg-red-500 hover:text-white hover:border-red-500
                active:bg-red-600 active:scale-[0.97]
                focus-visible:ring-2 focus-visible:ring-red-500/30 focus-visible:outline-none
                transition-all duration-150"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Interromper
            </button>
          )}
        </div>

        {/* Bottom spacer */}
        <div className="flex-1 min-h-[40px]" />
      </div>
    </div>
  );
};

export default CofreOverlay;
