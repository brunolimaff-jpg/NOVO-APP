/**
 * QW-1 — Skeleton Loader do Dossiê
 * Exibido enquanto a IA processa. Imita a estrutura de um dossiê real:
 * título, parágrafo, score PORTA, seções com linhas variadas.
 * Usa shimmer animado respeitando prefers-reduced-motion.
 */
import React from 'react';

interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
}

const SkeletonLine: React.FC<SkeletonLineProps> = ({
  width = 'w-full',
  height = 'h-3',
  className = '',
}) => (
  <div
    className={`${height} ${width} rounded ${className} skeleton-shimmer`}
    aria-hidden="true"
  />
);

interface DossieSkeletonLoaderProps {
  isDarkMode: boolean;
}

const DossieSkeletonLoader: React.FC<DossieSkeletonLoaderProps> = ({ isDarkMode }) => {
  const base = isDarkMode ? 'bg-slate-700/60' : 'bg-slate-200/80';
  const shimmerFrom = isDarkMode ? '#334155' : '#e2e8f0';
  const shimmerTo = isDarkMode ? '#475569' : '#f1f5f9';

  return (
    <>
      <style>{`
        @keyframes scout-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            ${shimmerFrom} 25%,
            ${shimmerTo}   50%,
            ${shimmerFrom} 75%
          );
          background-size: 200% 100%;
          animation: scout-shimmer 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton-shimmer { animation: none; background: ${shimmerFrom}; }
        }
      `}</style>

      <div className="space-y-5 pb-2" role="status" aria-label="Gerando dossiê...">

        {/* Título da empresa */}
        <div className="space-y-1.5">
          <SkeletonLine width="w-2/3" height="h-5" className={base} />
          <SkeletonLine width="w-1/3" height="h-3" className={base} />
        </div>

        {/* Score PORTA simulado */}
        <div className={`rounded-xl p-3 border ${
          isDarkMode ? 'border-slate-700/40 bg-slate-800/40' : 'border-slate-200 bg-slate-50'
        } space-y-2`}>
          <SkeletonLine width="w-1/4" height="h-3" className={base} />
          <div className="flex gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`flex-1 h-6 rounded ${base} skeleton-shimmer`} />
            ))}
          </div>
        </div>

        {/* Seção 1 */}
        <div className="space-y-2">
          <SkeletonLine width="w-1/3" height="h-4" className={base} />
          <SkeletonLine width="w-full" className={base} />
          <SkeletonLine width="w-11/12" className={base} />
          <SkeletonLine width="w-4/5" className={base} />
        </div>

        {/* Seção 2 */}
        <div className="space-y-2">
          <SkeletonLine width="w-2/5" height="h-4" className={base} />
          <SkeletonLine width="w-full" className={base} />
          <SkeletonLine width="w-10/12" className={base} />
          <SkeletonLine width="w-3/4" className={base} />
          <SkeletonLine width="w-11/12" className={base} />
        </div>

        {/* Seção 3 (menor) */}
        <div className="space-y-2">
          <SkeletonLine width="w-1/4" height="h-4" className={base} />
          <SkeletonLine width="w-full" className={base} />
          <SkeletonLine width="w-5/6" className={base} />
        </div>
      </div>
    </>
  );
};

export default DossieSkeletonLoader;
