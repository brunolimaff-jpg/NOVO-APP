import React from 'react';

interface LoadingInsightCarouselProps {
  isDarkMode: boolean;
  isFadingOut: boolean;
  currentInsight: string;
  activeInsightIndex: number;
  totalCuriosities: number;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (index: number) => void;
  renderInsight: (insight: string) => React.ReactNode;
}

const MAX_DOTS = 6;

export const LoadingInsightCarousel: React.FC<LoadingInsightCarouselProps> = React.memo(({
  isDarkMode, isFadingOut, currentInsight, activeInsightIndex, totalCuriosities,
  onPrev, onNext, onGoTo, renderInsight,
}) => {
  const dotCount = Math.min(totalCuriosities, MAX_DOTS);
  const dotStart = totalCuriosities <= MAX_DOTS
    ? 0
    : Math.max(0, Math.min(activeInsightIndex - 2, totalCuriosities - MAX_DOTS));

  return (
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
        <button onClick={onPrev}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
            isDarkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-emerald-100 text-slate-400 hover:text-slate-600'
          }`} aria-label="Insight anterior">‹</button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: dotCount }).map((_, i) => {
            const realIndex = dotStart + i;
            return (
            <button key={realIndex} onClick={() => onGoTo(realIndex)}
              className={`w-2 h-2 rounded-full transition-all ${
                realIndex === activeInsightIndex
                  ? (isDarkMode ? 'bg-emerald-400 w-3' : 'bg-emerald-500 w-3')
                  : (isDarkMode ? 'bg-slate-600' : 'bg-slate-300')
              }`} aria-label={`Insight ${realIndex + 1}`} />
          )})}
        </div>
        <button onClick={onNext}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
            isDarkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-emerald-100 text-slate-400 hover:text-slate-600'
          }`} aria-label="Próximo insight">›</button>
      </div>
    </div>
  </div>
)});
