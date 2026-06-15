import React, { useEffect, useState, useMemo } from 'react';

/* ── Tipos ──────────────────────────────────── */

interface OperatorRanking {
  email: string;
  total_eventos: number;
  total_sessoes: number;
  dias_ativos: number;
  primeiro_acesso: string;
  ultimo_acesso: string;
  pesquisas_iniciadas: number;
  pesquisas_concluidas: number;
  compartilhamentos: number;
}

interface DailyUsage {
  data: string;
  total_eventos: number;
  usuarios_unicos: number;
  sessoes_unicas: number;
  pesquisas_iniciadas: number;
  pesquisas_concluidas: number;
  pesquisas_falhas: number;
  app_aberturas: number;
  novos_registros: number;
}

interface CompanyRanking {
  cnpj: string;
  nome_empresa: string;
  total_pesquisas: number;
  usuarios_unicos: number;
  primeira_pesquisa: string;
  ultima_pesquisa: string;
}

type MetricsView = 'ranking' | 'daily' | 'companies';

interface MetricsDashboardProps {
  isDarkMode: boolean;
  onClose: () => void;
}

/* ── Helpers ─────────────────────────────────── */

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatDateLong(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

async function fetchView<T>(view: MetricsView): Promise<T[]> {
  const res = await fetch(`/api/metrics?view=${view}`);
  if (!res.ok) throw new Error(`Erro ao carregar ${view}`);
  const json = await res.json();
  return (json.data ?? []) as T[];
}

/* ── KPI Card ────────────────────────────────── */

function KPICard({ value, label, valueClass }: { value: number | string; label: string; valueClass?: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-0.5">
      <span className={`text-2xl font-bold tabular-nums ${valueClass ?? 'text-white'}`}>{value}</span>
      <span className="text-xs text-gray-400 font-medium">{label}</span>
    </div>
  );
}

/* ── Tabela genérica ─────────────────────────── */

function TableCard<T extends Record<string, unknown>>({
  title,
  columns,
  data,
  maxRows,
}: {
  title: string;
  columns: { key: keyof T; label: string; render?: (val: unknown, row: T) => React.ReactNode }[];
  data: T[];
  maxRows?: number;
}) {
  const rows = useMemo(() => (maxRows ? data.slice(0, maxRows) : data), [data, maxRows]);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <h3 className="text-sm font-semibold text-white px-4 py-3 border-b border-gray-700">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
              {columns.map(col => (
                <th key={String(col.key)} className="text-left px-4 py-2.5 font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-gray-800 last:border-0 hover:bg-gray-750 transition-colors">
                {columns.map(col => (
                  <td key={String(col.key)} className="px-4 py-2.5 text-gray-300">
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Nenhum dado disponivel.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Bar Chart ───────────────────────────────── */

function DailyBarChart({ data }: { data: DailyUsage[] }) {
  const maxValue = useMemo(() => Math.max(...data.map(d => d.total_eventos), 1), [data]);
  const sliced = useMemo(() => data.slice(-14), [data]);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">Uso diario (ultimos 14 dias)</h3>
      <div className="flex items-end gap-1.5 h-32">
        {sliced.map((day, idx) => {
          const heightPct = Math.max(3, (day.total_eventos / maxValue) * 100);
          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                className="w-full bg-emerald-500/60 rounded-t hover:bg-emerald-400/80 transition-colors min-h-[4px]"
                style={{ height: `${heightPct}%` }}
                title={`${formatDate(day.data)}: ${day.total_eventos} eventos, ${day.usuarios_unicos} usuarios`}
              />
              <span className="text-[10px] text-gray-500 rotate-45 origin-left whitespace-nowrap translate-y-1">
                {formatDate(day.data)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-2 px-1">
        <span>Eventos: {maxValue}</span>
        <span>Usuarios: {Math.max(...sliced.map(d => d.usuarios_unicos), 0)}</span>
      </div>
    </div>
  );
}

/* ── Loading / Error ─────────────────────────── */

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Carregando metricas...</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <p className="text-sm text-red-400">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors min-h-[44px]"
      >
        Tentar novamente
      </button>
    </div>
  );
}

/* ── Componente Principal ────────────────────── */

const MetricsDashboard = React.memo(function MetricsDashboard({ isDarkMode, onClose }: MetricsDashboardProps) {
  const [ranking, setRanking] = useState<OperatorRanking[]>([]);
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [companies, setCompanies] = useState<CompanyRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetchView<OperatorRanking>('ranking'),
      fetchView<DailyUsage>('daily'),
      fetchView<CompanyRanking>('companies'),
    ])
      .then(([rankingData, dailyData, companiesData]) => {
        setRanking(rankingData);
        setDaily(dailyData);
        setCompanies(companiesData);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar metricas');
        console.error('[MetricsDashboard] Erro:', err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  /* Computa KPIs a partir dos dados crus */
  const kpis = useMemo(() => {
    const totalUsuarios = new Set(ranking.map(r => r.email)).size;
    const activeToday = daily.length > 0 ? daily[daily.length - 1].usuarios_unicos : 0;
    const totalSearches = ranking.reduce((acc, r) => acc + (r.pesquisas_iniciadas || 0), 0);
    const totalCompleted = ranking.reduce((acc, r) => acc + (r.pesquisas_concluidas || 0), 0);
    const completionRate = totalSearches > 0 ? Math.round((totalCompleted / totalSearches) * 100) : 0;
    return { totalUsuarios, activeToday, totalSearches, completionRate };
  }, [ranking, daily]);

  const columnsRanking = useMemo(
    () => [
      { key: 'email' as const, label: 'Email' },
      { key: 'total_eventos' as const, label: 'Eventos' },
      { key: 'pesquisas_iniciadas' as const, label: 'Pesquisas' },
      { key: 'pesquisas_concluidas' as const, label: 'Concluidas' },
      { key: 'compartilhamentos' as const, label: 'Compart.' },
      { key: 'ultimo_acesso' as const, label: 'Ultimo acesso', render: (v: unknown) => formatDateLong(v as string) },
    ],
    [],
  );

  const columnsCompanies = useMemo(
    () => [
      { key: 'nome_empresa' as const, label: 'Empresa' },
      { key: 'total_pesquisas' as const, label: 'Pesquisas' },
      { key: 'usuarios_unicos' as const, label: 'Usuarios' },
      {
        key: 'ultima_pesquisa' as const,
        label: 'Ultima pesquisa',
        render: (v: unknown) => formatDateLong(v as string),
      },
    ],
    [],
  );

  const isDark = isDarkMode;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center md:p-4">
      <div
        className={`${isDark ? 'bg-gray-900' : 'bg-white'} border-t md:border ${
          isDark ? 'border-gray-700' : 'border-gray-200'
        } rounded-t-2xl md:rounded-2xl w-full md:max-w-5xl h-[92dvh] md:max-h-[90vh] overflow-hidden flex flex-col`}
      >
        {/* DRAG HANDLE — mobile */}
        <div className="flex justify-center pt-3 pb-1 md:hidden flex-shrink-0">
          <div className={`w-10 h-1 rounded-full ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
        </div>

        {/* HEADER */}
        <div className={`px-4 md:px-5 py-4 border-b flex-shrink-0 ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-lg md:text-xl font-bold leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Metricas
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Painel de uso da plataforma</p>
            </div>
            <button
              onClick={onClose}
              className={`text-gray-400 hover:text-white text-2xl leading-none transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-800`}
              aria-label="Fechar painel"
            >
              &times;
            </button>
          </div>

          {/* KPIs */}
          {!loading && !error && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mt-4">
              <KPICard value={kpis.totalUsuarios} label="Usuarios totais" />
              <KPICard value={kpis.activeToday} label="Ativos hoje (DAU)" />
              <KPICard value={kpis.totalSearches} label="Total de pesquisas" />
              <KPICard value={`${kpis.completionRate}%`} label="Taxa de conclusao" valueClass="text-emerald-400" />
            </div>
          )}
        </div>

        {/* CONTEUDO ROLAVEL */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
          {loading && <LoadingState />}
          {error && <ErrorState message={error} onRetry={loadData} />}

          {!loading && !error && (
            <>
              {/* Grafico de uso diario */}
              <DailyBarChart data={daily} />

              {/* Top 10 usuarios */}
              <TableCard title="Top 10 usuarios" columns={columnsRanking} data={ranking} maxRows={10} />

              {/* Top 10 empresas */}
              <TableCard
                title="Top 10 empresas mais pesquisadas"
                columns={columnsCompanies}
                data={companies}
                maxRows={10}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default MetricsDashboard;
