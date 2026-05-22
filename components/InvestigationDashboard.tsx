import { useState, useEffect, useMemo } from "react";
import {
  getInvestigations,
  subscribe,
  type Investigation,
} from '../services/investigationStore';
import { useDebounce } from '../hooks/useDebounce';

// Re-exporta para não quebrar imports externos que usam o path do componente.
export type { Investigation };

export type ScoreFilter = "todos" | "quentes" | "mornas" | "frias";
export type ClienteFilter = "todos" | "clientes" | "prospects";

// ================================================================
// HELPERS
// ================================================================
function scoreColor(s: number): string {
  if (s >= 80) return "text-green-400";
  if (s >= 60) return "text-yellow-400";
  if (s >= 40) return "text-orange-400";
  return "text-red-400";
}

function scoreBadge(s: number): { label: string; bg: string; text: string } {
  if (s >= 80) return { label: "Quente", bg: "bg-green-900/20", text: "text-green-400" };
  if (s >= 60) return { label: "Morna", bg: "bg-yellow-900/20", text: "text-yellow-400" };
  if (s >= 40) return { label: "Tibia", bg: "bg-orange-900/20", text: "text-orange-400" };
  return { label: "Fria", bg: "bg-red-900/20", text: "text-red-400" };
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

// ================================================================
// SUB-COMPONENTES
// ================================================================

function KPICard({
  value,
  label,
  valueClass,
  bgClass,
}: {
  value: number | string;
  label: string;
  valueClass: string;
  bgClass: string;
}) {
  return (
    <div className={`${bgClass} rounded-xl p-3 md:p-4 flex flex-col items-center justify-center gap-1`}>
      <span className={`text-xl md:text-2xl font-bold tabular-nums ${valueClass}`}>{value}</span>
      <span className="text-xs text-gray-400 font-medium">{label}</span>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const w = Math.max(2, Math.min(100, score));
  const color =
    score >= 80 ? "bg-green-500" :
    score >= 60 ? "bg-yellow-500" :
    score >= 40 ? "bg-orange-500" :
    "bg-red-500";
  return (
    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mt-1">
      <div
        className={`h-1.5 rounded-full transition-all ${color}`}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

function FamiliasTags({ familias }: { familias: string[] }) {
  if (!familias.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {(familias || []).slice(0, 4).map((f) => (
        <span
          key={f}
          className="text-xs bg-gray-700 text-gray-300 rounded-full px-2.5 py-0.5"
        >
          {f}
        </span>
      ))}
      {familias.length > 4 && (
        <span className="text-xs text-gray-500">+{familias.length - 4}</span>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="text-5xl opacity-30">🔍</div>
      <p className="text-gray-400 text-sm font-medium">Nenhuma investigacao ainda</p>
      <p className="text-gray-500 text-xs max-w-xs">
        Pesquise uma empresa pelo chat para gerar seu primeiro Dossie.
      </p>
    </div>
  );
}

// ================================================================
// COMPONENTE PRINCIPAL
// ================================================================
export default function InvestigationDashboard({
  onClose,
  onSelectEmpresa,
}: {
  onClose: () => void;
  onSelectEmpresa: (nome: string) => void;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebounce(searchText, 300);
  const [sortBy, setSortBy] = useState<"data" | "score">("data");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("todos");
  const [clienteFilter, setClienteFilter] = useState<ClienteFilter>("todos");

  const all = useMemo(() => getInvestigations(), [tick]);

  const stats = useMemo(() => {
    const avgScore =
      all.length > 0
        ? Math.round(all.reduce((acc, i) => acc + i.score, 0) / all.length)
        : 0;
    return {
      total: all.length,
      quentes: all.filter((i) => i.score >= 80).length,
      mornas: all.filter((i) => i.score >= 60 && i.score < 80).length,
      frias: all.filter((i) => i.score < 60).length,
      clientes: all.filter((i) => i.isCliente).length,
      prospects: all.filter((i) => !i.isCliente).length,
      avgScore,
    };
  }, [all]);

  const filtered = useMemo(() => {
    let items = getInvestigations();

    if (debouncedSearchText.trim()) {
      const q = debouncedSearchText.toUpperCase().trim();
      items = items.filter(
        (i) =>
          i.empresa.toUpperCase().includes(q) ||
          i.familias.some((f) => f.toUpperCase().includes(q)) ||
          (i.resumo ?? "").toUpperCase().includes(q)
      );
    }

    if (scoreFilter === "quentes") items = items.filter((i) => i.score >= 80);
    else if (scoreFilter === "mornas") items = items.filter((i) => i.score >= 60 && i.score < 80);
    else if (scoreFilter === "frias") items = items.filter((i) => i.score < 60);

    if (clienteFilter === "clientes") items = items.filter((i) => i.isCliente);
    else if (clienteFilter === "prospects") items = items.filter((i) => !i.isCliente);

    if (sortBy === "score") items.sort((a, b) => b.score - a.score);

    return items;
  }, [tick, debouncedSearchText, scoreFilter, clienteFilter, sortBy]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center md:p-4">
      <div className="bg-gray-900 border-t md:border border-gray-700 rounded-t-2xl md:rounded-2xl w-full md:max-w-4xl h-[92dvh] md:max-h-[90vh] overflow-hidden flex flex-col">

        {/* DRAG HANDLE — mobile only */}
        <div className="flex justify-center pt-3 pb-1 md:hidden flex-shrink-0">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* HEADER */}
        <div className="p-4 md:p-5 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white leading-tight">
                Meu Painel
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Empresas investigadas nesta sessao
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl leading-none transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-800"
              aria-label="Fechar painel"
            >
              &times;
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mb-4">
            <KPICard value={stats.total} label="Total" valueClass="text-white" bgClass="bg-gray-800" />
            <KPICard value={stats.quentes} label="Quentes" valueClass="text-green-400" bgClass="bg-green-900/20 border border-green-900" />
            <KPICard value={stats.mornas} label="Mornas" valueClass="text-yellow-400" bgClass="bg-yellow-900/20 border border-yellow-900" />
            <KPICard value={stats.frias} label="Frias" valueClass="text-red-400" bgClass="bg-red-900/20 border border-red-900" />
            <KPICard value={stats.clientes} label="Clientes" valueClass="text-blue-400" bgClass="bg-blue-900/20 border border-blue-900" />
            <KPICard value={stats.avgScore} label="Avg Score" valueClass={scoreColor(stats.avgScore)} bgClass="bg-gray-800" />
          </div>

          {/* FILTROS */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Buscar empresa, familia ou resumo..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:border-green-500 text-white placeholder:text-gray-500"
                aria-label="Buscar empresa"
              />
              <button
                onClick={() => setSortBy(sortBy === "data" ? "score" : "data")}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm hover:border-gray-500 text-white transition-colors whitespace-nowrap min-h-[44px]"
                aria-label="Alternar ordenacao"
              >
                {sortBy === "data" ? "Recentes" : "Por Score"}
              </button>
            </div>

            <div className="flex gap-2 flex-wrap">
              {(["todos", "quentes", "mornas", "frias"] as ScoreFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setScoreFilter(f)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors min-h-[36px] ${
                    scoreFilter === f
                      ? "bg-green-500/20 border-green-500 text-green-300"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
                  }`}
                >
                  {{ todos: "Todas", quentes: "Quentes", mornas: "Mornas", frias: "Frias" }[f]}
                </button>
              ))}

              <div className="w-px bg-gray-700" />

              {(["todos", "clientes", "prospects"] as ClienteFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setClienteFilter(f)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors min-h-[36px] ${
                    clienteFilter === f
                      ? "bg-blue-500/20 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
                  }`}
                >
                  {{ todos: "Todos", clientes: "Clientes", prospects: "Prospects" }[f]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* LISTA */}
        <div className="overflow-y-auto flex-1 p-4 md:p-5 space-y-2.5" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
          {filtered.length === 0 && (searchText || scoreFilter !== "todos" || clienteFilter !== "todos") && (
            <p className="text-center text-gray-500 text-sm py-12">
              Nenhuma empresa encontrada para os filtros selecionados.
            </p>
          )}

          {filtered.length === 0 && !searchText && scoreFilter === "todos" && clienteFilter === "todos" && (
            <EmptyState />
          )}

          {(filtered || []).map((inv) => {
            const badge = scoreBadge(inv.score);
            return (
              <div
                key={inv.id}
                onClick={() => { onSelectEmpresa(inv.empresa); onClose(); }}
                className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-500 cursor-pointer transition-colors group active:bg-gray-750"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Score block */}
                    <div className="flex-shrink-0 w-12">
                      <span className={`text-xl font-bold tabular-nums leading-none ${scoreColor(inv.score)}`}>
                        {inv.score}
                      </span>
                      <ScoreBar score={inv.score} />
                    </div>

                    {/* Info */}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm text-white truncate group-hover:text-green-300 transition-colors">
                        {inv.empresa}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(inv.data)}
                        {inv.modo && <span> &middot; {inv.modo}</span>}
                      </p>
                    </div>
                  </div>

                  {/* Badges direita */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.isCliente ? "bg-blue-900/30 text-blue-400" : "bg-gray-700 text-gray-400"}`}>
                      {inv.isCliente ? "Cliente" : "Prospect"}
                    </span>
                    {inv.gaps.length > 0 && (
                      <span className="text-xs text-yellow-500/80 font-medium">
                        {inv.gaps.length} gaps
                      </span>
                    )}
                  </div>
                </div>

                {/* Tags familias */}
                {inv.familias.length > 0 && (
                  <div className="mt-3">
                    <FamiliasTags familias={inv.familias} />
                  </div>
                )}

                {/* Resumo */}
                {inv.resumo && (
                  <p className="text-gray-400 text-xs mt-2 line-clamp-2 leading-relaxed">
                    {inv.resumo}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* FOOTER */}
        {filtered.length > 0 && (
          <div className="px-4 md:px-5 py-3 border-t border-gray-800 flex-shrink-0 flex justify-between items-center" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <span className="text-xs text-gray-500">
              {filtered.length} de {stats.total} empresas
            </span>
            <span className="text-xs text-gray-600">
              Clique em uma empresa para reabrir o Dossie
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
