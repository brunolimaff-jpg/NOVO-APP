// components/RadarCardHome.tsx
// Extraído de EmptyStateHome.tsx — card de alerta do Radar Competitivo.

import React from 'react';
import type { RadarAlert } from '../types';
import { RADAR_CATEGORY_ICONS } from '../types';

const IMPACTO_BADGE: Record<string, { label: string; cls: string }> = {
  oportunidade: { label: 'OPORTUNIDADE', cls: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300' },
  ameaca: { label: 'AMEAÇA', cls: 'bg-red-500/20 text-red-700 dark:text-red-300' },
  vulnerabilidade: { label: 'VULNERABILIDADE', cls: 'bg-amber-500/20 text-amber-700 dark:text-amber-300' },
  neutro: { label: 'NEUTRO', cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-400' },
};

const RELEVANCE_BARS: Record<string, { label: string; bars: number; cls: string }> = {
  alta: { label: 'ALTA', bars: 3, cls: 'text-red-500 dark:text-red-400' },
  media: { label: 'MÉDIA', bars: 2, cls: 'text-amber-500 dark:text-amber-400' },
  baixa: { label: 'BAIXA', bars: 1, cls: 'text-slate-500 dark:text-slate-400' },
};

const ACTION_LABEL: Record<string, string> = {
  oportunidade: 'Ver Dossiê',
  ameaca: 'Monitorar',
  vulnerabilidade: 'Mitigar',
  neutro: 'Ver mais',
};

export function timeAgoHome(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `HÁ ${mins} MIN`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `HÁ ${hours} HORA${hours > 1 ? 'S' : ''}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ONTEM';
  return `HÁ ${days} DIAS`;
}

interface RadarCardProps {
  alert: RadarAlert;
  isDarkMode: boolean;
  onOpenRadar?: () => void;
}

export const RadarCard: React.FC<RadarCardProps> = ({ alert, isDarkMode, onOpenRadar }) => {
  const impacto = alert.impacto ?? 'neutro';
  const badge = IMPACTO_BADGE[impacto] ?? IMPACTO_BADGE.neutro;
  const rel = RELEVANCE_BARS[alert.relevance] ?? RELEVANCE_BARS.baixa;
  const catIcon = RADAR_CATEGORY_ICONS[alert.category] ?? '📡';
  const actionLabel =
    alert.sourceUrl && alert.sourceUrl !== '#' ? 'LER NOTÍCIA' : (ACTION_LABEL[impacto] ?? 'Ver mais');

  const cardBg = isDarkMode
    ? 'bg-slate-900/80 border-slate-700/60 hover:border-emerald-500/50'
    : 'bg-white border-slate-200 hover:border-emerald-500/50';
  const textTitle = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const textBody = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const textMeta = isDarkMode ? 'text-slate-500' : 'text-slate-500';

  const cleanSummaryRaw = (alert.summary || '')
    .replace(/&lt;[^&]*&gt;/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;[a-z0-9#]+;/gi, '')
    .trim();

  const sourceName = alert.sourceName || '';
  const cleanSummary =
    cleanSummaryRaw && sourceName
      ? cleanSummaryRaw.replace(new RegExp(`${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '').trim()
      : cleanSummaryRaw;

  const handleCardClick = () => {
    if (alert.sourceUrl && alert.sourceUrl !== '#') {
      window.open(alert.sourceUrl, '_blank', 'noopener,noreferrer');
    } else if (onOpenRadar) {
      onOpenRadar();
    }
  };

  return (
    <div
      className={`flex flex-col rounded-xl border ${cardBg} overflow-hidden transition-all hover:shadow-lg cursor-pointer group`}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.cls}`}>
          {badge.label}
        </span>
        <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${rel.cls}`}>
          {rel.label}
          <span aria-hidden className="font-mono tracking-tighter">
            {'|'.repeat(rel.bars)}
          </span>
        </span>
      </div>

      <div className="flex-1 px-4 pb-3">
        <div className="flex items-start justify-between gap-1">
          <p
            className={`text-sm font-semibold leading-snug group-hover:text-emerald-500 transition-colors ${textTitle}`}
          >
            {alert.title}
          </p>
          <span className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs">↗</span>
        </div>
        <p className={`mt-1.5 text-xs leading-relaxed line-clamp-3 ${textBody}`}>{cleanSummary}</p>
      </div>

      <div
        className={`flex items-center justify-between gap-2 border-t px-4 py-3 ${isDarkMode ? 'border-slate-700/60' : 'border-slate-100'}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-[11px]">{catIcon}</span>
          <span
            className={`truncate text-[10px] font-bold uppercase tracking-wide ${isDarkMode ? 'text-slate-300' : 'text-slate-900'}`}
          >
            {sourceName}
          </span>
          <span className={`text-[10px] ${textMeta}`}>·</span>
          <span className={`shrink-0 text-[10px] font-semibold ${textMeta}`}>{timeAgoHome(alert.publishedAt)}</span>
        </div>
        <button
          type="button"
          className={`shrink-0 rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
            isDarkMode
              ? 'bg-slate-800 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white'
              : 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white'
          }`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
};
