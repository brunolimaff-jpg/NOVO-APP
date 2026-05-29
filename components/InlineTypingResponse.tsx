import React, { memo, useMemo } from 'react';
import { normalizeLoadingStatus } from '../utils/loadingStatus';

interface InlineTypingResponseProps {
  isDarkMode: boolean;
  stage?: string;
}

function toMicroStatus(stage?: string): string {
  const safeStage = normalizeLoadingStatus(stage)?.toLowerCase() || '';

  if (
    safeStage.includes('referências') ||
    safeStage.includes('referencias') ||
    safeStage.includes('benchmark') ||
    safeStage.includes('concorrente')
  ) {
    return 'Cruzando fontes...';
  }

  if (
    safeStage.includes('sintetizando') ||
    safeStage.includes('materializando') ||
    safeStage.includes('recomendações') ||
    safeStage.includes('resposta')
  ) {
    return 'Redigindo resposta...';
  }

  if (
    safeStage.includes('consultando') ||
    safeStage.includes('inteligência') ||
    safeStage.includes('inteligencia') ||
    safeStage.includes('contexto')
  ) {
    return 'Analisando contexto...';
  }

  return 'Analisando...';
}

const InlineTypingResponse = memo(({ isDarkMode, stage }: InlineTypingResponseProps) => {
  const microStatus = useMemo(() => toMicroStatus(stage), [stage]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl px-3 py-2 ${
        isDarkMode ? 'bg-slate-900/45 border border-slate-700/40' : 'bg-slate-50/90 border border-slate-200/80'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-sm leading-none font-mono motion-safe:animate-pulse ${
            isDarkMode ? 'text-slate-400/80' : 'text-slate-500/80'
          }`}
          aria-hidden="true"
        >
          ▍
        </span>
        <span className={`text-[11px] ${isDarkMode ? 'text-slate-400/85' : 'text-slate-500/85'}`}>{microStatus}</span>
      </div>

      <div className="space-y-1.5" aria-hidden="true">
        <div
          className={`h-1.5 rounded-full w-4/5 motion-safe:animate-pulse ${isDarkMode ? 'bg-slate-700/45' : 'bg-slate-200/80'}`}
        />
        <div
          className={`h-1.5 rounded-full w-2/3 motion-safe:animate-pulse ${isDarkMode ? 'bg-slate-700/35' : 'bg-slate-200/70'}`}
        />
      </div>
    </div>
  );
});

InlineTypingResponse.displayName = 'InlineTypingResponse';

export default InlineTypingResponse;
