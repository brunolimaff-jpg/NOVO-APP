import React, { useMemo } from 'react';
import { ChatSession } from '../types';
import { useAdminMetrics } from '../hooks/useAdminMetrics';

interface AdminDashProps {
  sessions: ChatSession[];
  isDarkMode: boolean;
  onClose: () => void;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? 'bg-emerald-500/20 text-emerald-400'
      : score >= 40
      ? 'bg-amber-500/20 text-amber-400'
      : 'bg-slate-500/20 text-slate-400';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {score > 0 ? score : '—'}
    </span>
  );
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 tabular-nums w-6 text-right">{value}</span>
    </div>
  );
}

function ActivitySparkline({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...(data || []).map(d => d.count), 1);
  return (
    <div className="flex items-end gap-0.5 h-10">
      {(data || []).map((d, i) => (
        <div
          key={i}
          title={`${d.date}: ${d.count} sessões`}
          className="flex-1 rounded-sm bg-emerald-500/70 hover:bg-emerald-400 transition-colors cursor-default"
          style={{ height: `${Math.max(4, (d.count / max) * 40)}px` }}
        />
      ))}
      {data.length === 0 && (
        <p className="text-xs text-slate-500 italic">Sem dados de atividade</p>
      )}
    </div>
  );
}

export const AdminDash: React.FC<AdminDashProps> = ({ sessions, isDarkMode, onClose }) => {
  const metrics = useAdminMetrics(sessions);

  const scoreDist = metrics.scoreDistribution;
  const maxDist = Math.max(...(scoreDist || []).map(d => d.count), 1);

  const kpis = [
    {
      label: 'Sessões totais',
      value: metrics.totalSessions,
      icon: '📋',
      sub: 'investigações abertas',
    },
    {
      label: 'Empresas prospectadas',
      value: metrics.totalCompanies,
      icon: '🏭',
      sub: 'alvo únicas identificadas',
    },
    {
      label: 'Score PORTA médio',
      value: metrics.avgScore > 0 ? metrics.avgScore : '—',
      icon: '🎯',
      sub: 'qualificação preditiva',
    },
    {
      label: 'Vendedores ativos',
      value: metrics.topVendors.length,
      icon: '👤',
      sub: 'com sessões registradas',
    },
  ];

  const surface = isDarkMode ? 'bg-slate-900' : 'bg-white';
  const card = isDarkMode
    ? 'bg-slate-800/60 border border-slate-700/50'
    : 'bg-slate-50 border border-slate-200';
  const text = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const divider = isDarkMode ? 'border-slate-700/50' : 'border-slate-200';

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col ${surface} overflow-hidden`}
      role="dialog"
      aria-label="Dashboard Admin"
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-5 py-3 border-b ${divider} shrink-0`}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🦅</span>
          <span className={`font-bold tracking-tight ${text}`}>Senior Scout 360</span>
          <span className={`text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium`}>
            Admin Dashboard
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar dashboard"
          className={`rounded-lg p-1.5 hover:bg-slate-700/40 transition-colors ${muted}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">

        {/* KPIs */}
        <section>
          <h2 className={`text-xs font-semibold uppercase tracking-widest mb-3 ${muted}`}>
            Visão Geral
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(kpis || []).map(k => (
              <div key={k.label} className={`rounded-xl p-4 ${card}`}>
                <div className="text-xl mb-1">{k.icon}</div>
                <div className={`text-2xl font-bold tabular-nums ${text}`}>{k.value}</div>
                <div className={`text-xs mt-0.5 ${muted}`}>{k.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Atividade recente */}
        {metrics.recentActivity.length > 0 && (
          <section>
            <h2 className={`text-xs font-semibold uppercase tracking-widest mb-3 ${muted}`}>
              Atividade — últimos 14 dias
            </h2>
            <div className={`rounded-xl p-4 ${card}`}>
              <ActivitySparkline data={metrics.recentActivity} />
              <div className={`flex justify-between text-xs mt-2 ${muted}`}>
                <span>{metrics.recentActivity[0]?.date ?? ''}</span>
                <span>{metrics.recentActivity[metrics.recentActivity.length - 1]?.date ?? ''}</span>
              </div>
            </div>
          </section>
        )}

        {/* Score PORTA — distribuição */}
        <section>
          <h2 className={`text-xs font-semibold uppercase tracking-widest mb-3 ${muted}`}>
            Distribuição Score PORTA
          </h2>
          <div className={`rounded-xl p-4 ${card} space-y-2`}>
            {(scoreDist || []).map(d => (
              <div key={d.label} className="flex items-center gap-3">
                <span className={`text-xs w-14 tabular-nums ${muted}`}>{d.label}</span>
                <MiniBar value={d.count} max={maxDist} />
              </div>
            ))}
            {scoreDist.every(d => d.count === 0) && (
              <p className={`text-xs italic ${muted}`}>Nenhuma sessão com score PORTA registrado ainda.</p>
            )}
          </div>
        </section>

        {/* Modo de uso */}
        {metrics.modeBreakdown.length > 0 && (
          <section>
            <h2 className={`text-xs font-semibold uppercase tracking-widest mb-3 ${muted}`}>
              Modos utilizados
            </h2>
            <div className={`rounded-xl p-4 ${card} space-y-2`}>
              {(metrics.modeBreakdown || []).map(m => (
                <div key={m.mode} className="flex items-center gap-3">
                  <span className={`text-xs w-20 capitalize ${muted}`}>{m.mode}</span>
                  <MiniBar
                    value={m.count}
                    max={Math.max(...(metrics.modeBreakdown || []).map(x => x.count), 1)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ranking vendedores */}
        <section>
          <h2 className={`text-xs font-semibold uppercase tracking-widest mb-3 ${muted}`}>
            Ranking de Vendedores
          </h2>
          {metrics.topVendors.length === 0 ? (
            <div className={`rounded-xl p-6 text-center ${card}`}>
              <p className={`text-sm ${muted}`}>Nenhuma sessão com vendedor identificado ainda.</p>
            </div>
          ) : (
            <div className={`rounded-xl overflow-hidden border ${divider}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <th className={`px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide ${muted}`}>
                      #
                    </th>
                    <th className={`px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide ${muted}`}>
                      Vendedor
                    </th>
                    <th className={`px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide ${muted}`}>
                      Sessões
                    </th>
                    <th className={`px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide ${muted}`}>
                      Empresas
                    </th>
                    <th className={`px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide ${muted}`}>
                      Score
                    </th>
                    <th className={`px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide ${muted} hidden sm:table-cell`}>
                      Última ativ.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics.topVendors || []).map((v, i) => (
                    <tr
                      key={v.name}
                      className={`border-t ${divider} ${
                        isDarkMode
                          ? 'hover:bg-slate-700/30'
                          : 'hover:bg-slate-50'
                      } transition-colors`}
                    >
                      <td className={`px-4 py-3 tabular-nums text-xs ${muted}`}>{i + 1}</td>
                      <td className={`px-4 py-3 font-medium ${text}`}>{v.name}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${text}`}>{v.sessions}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${text}`}>{v.companies.size}</td>
                      <td className="px-4 py-3 text-right">
                        <ScoreBadge score={v.avgScore} />
                      </td>
                      <td className={`px-4 py-3 text-right text-xs hidden sm:table-cell ${muted}`}>
                        {v.lastActive ? v.lastActive.slice(0, 10) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default AdminDash;
