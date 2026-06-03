import React, { useEffect, useMemo, useState } from 'react';
import {
  type SocietaryCompany,
  type SocietaryBadge,
  type SocietaryGraph,
  countCompanyFilials,
  formatBranchBadgeLabel,
  formatSocietaryCnpj,
  getDisplayBadges,
  hasCompanyFilials,
} from './societaryGraph';
import { type CompanyCategory, classifyCompany, getPFPartnerIds, isSideBusiness } from './societaryCategories';
import { scoutDiag } from '../../utils/diagnosticLog';

const PARTNER_MATRIX_COLORS = ['#7c3aed', '#0891b2', '#dc2626', '#ca8a04', '#16a34a', '#db2777', '#4f46e5', '#ea580c'];

function firstGivenName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || fullName.trim();
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

const CATEGORY_LABELS: Record<CompanyCategory, string> = {
  em_comum: 'Em comum',
  proprias: 'Próprias',
};

const CATEGORY_ORDER: Record<CompanyCategory, number> = {
  em_comum: 0,
  proprias: 1,
};

interface SocietaryMatrixProps {
  graph: SocietaryGraph;
  cnaeMap: Record<string, { cnae: string; cnaeDescricao: string }>;
  /** True while CNAE enrichment via /api/cnpj is in flight — shows skeleton in CNAE column */
  isEnrichingCnae?: boolean;
  isDarkMode: boolean;
  rootName: string;
  selectedPartnerId?: string | null;
  onSelectPartner?: (partnerId: string | null) => void;
  inactiveReferences?: Array<{
    sourceTitle?: string;
    sourceUrl?: string;
    snippet?: string;
    reason: string;
  }>;
  traceId?: string;
  traceEnabled?: boolean;
}

interface ClassifiedRow {
  company: SocietaryCompany;
  category: CompanyCategory;
  side: boolean;
}

function FilterButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition ${
        isActive
          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400'
      }`}
    >
      {children}
    </button>
  );
}

function SummaryMetric({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-2 py-1 text-center" data-testid={testId}>
      <strong className="text-[1.5rem] font-bold tabular-nums leading-none text-slate-900 dark:text-slate-100">
        {value}
      </strong>
      <span className="max-w-[8.5rem] text-[0.75rem] font-medium leading-snug text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  );
}

function countBranchEstablishments(companies: SocietaryCompany[]): number {
  return companies.reduce((sum, company) => sum + countCompanyFilials(company), 0);
}

function countTotalCnpjs(companies: SocietaryCompany[]): number {
  return companies.reduce((sum, company) => sum + (company.branchCount || 1), 0);
}

function badgeTone(badge: SocietaryBadge): string {
  if (badge === 'validar')
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  if (badge === 'internacional')
    return 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200';
  if (badge === 'holding')
    return 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-200';
  return 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400';
}

function BranchPremiumBadge({ company }: { company: SocietaryCompany }) {
  if (!hasCompanyFilials(company)) return null;
  const label = formatBranchBadgeLabel(company);
  if (!label) return null;

  return (
    <span
      data-testid="branch-premium-badge"
      className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[0.62rem] font-semibold tracking-[0.02em] text-sky-800 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
    >
      <svg className="h-3 w-3 shrink-0 opacity-70" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M8 1.5a.5.5 0 0 1 .354.146l6 6A.5.5 0 0 1 14 8h-1v5.5a.5.5 0 0 1-.5.5h-3v-3.5a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 0-.5.5V14h-3a.5.5 0 0 1-.5-.5V8H2a.5.5 0 0 1-.354-.854l6-6A.5.5 0 0 1 8 1.5z" />
      </svg>
      {label}
    </span>
  );
}

interface TableRowProps {
  row: ClassifiedRow;
  partnerColumns: SocietaryGraph['partners'];
  partnerColors: Map<string, string>;
  cnaeLabel: string;
}

const TableRow = React.memo(({ row, partnerColumns, partnerColors, cnaeLabel }: TableRowProps) => (
  <tr className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
    <td className="text-left font-bold leading-snug text-slate-900 dark:text-slate-100 px-3 py-4">
      {row.company.name}
      <div className="mt-1.5 flex flex-wrap gap-1">
        <BranchPremiumBadge company={row.company} />
        {getDisplayBadges(row.company).map(badge => (
          <span
            key={`${row.company.id}-${badge}`}
            className={`inline-flex rounded-full border px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em] shadow-sm ${badgeTone(badge)}`}
          >
            {badge}
          </span>
        ))}
      </div>
    </td>
    <td className="font-mono text-[0.72rem] text-slate-600 dark:text-slate-400 whitespace-nowrap px-3 py-4">
      {row.company.cnpj ? formatSocietaryCnpj(row.company.cnpj) : '—'}
    </td>
    <td className="text-[0.72rem] leading-relaxed text-slate-500 dark:text-slate-400 text-left max-w-[260px] px-3 py-4">
      {cnaeLabel}
    </td>
    {partnerColumns.map(partner => {
      const isConnected = row.company.partnerIds.includes(partner.id);
      if (!isConnected) {
        return (
          <td key={partner.id} className="px-3 py-4 text-center">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[0.65rem] font-black text-slate-300 dark:text-slate-600 border border-dashed border-slate-300 dark:border-slate-600">
              -
            </span>
          </td>
        );
      }
      const color = partnerColors.get(partner.id) ?? '#94a3b8';
      const initial = firstGivenName(partner.name).charAt(0).toUpperCase();
      if (row.side) {
        return (
          <td key={partner.id} className="px-3 py-4 text-center">
            <span
              style={{ borderColor: color, color }}
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[0.65rem] font-black bg-white dark:bg-slate-800 border-2 border-dashed"
            >
              {initial}
            </span>
          </td>
        );
      }
      return (
        <td key={partner.id} className="px-3 py-4 text-center">
          <span
            style={{ backgroundColor: color }}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[0.65rem] font-black text-white"
          >
            {initial}
          </span>
        </td>
      );
    })}
  </tr>
));

const SocietaryMatrix: React.FC<SocietaryMatrixProps> = ({
  graph,
  cnaeMap,
  isEnrichingCnae = false,
  isDarkMode,
  rootName: _rootName,
  selectedPartnerId = null,
  onSelectPartner,
  inactiveReferences = [],
  traceId,
  traceEnabled = false,
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | CompanyCategory>('all');

  const pfPartnerIds = useMemo(() => getPFPartnerIds(graph.partners), [graph.partners]);

  const classified = useMemo<ClassifiedRow[]>(() => {
    return graph.companies.map(company => ({
      company,
      category: classifyCompany(company, pfPartnerIds),
      side: isSideBusiness(company),
    }));
  }, [graph.companies, pfPartnerIds]);

  const visibleRows = useMemo<ClassifiedRow[]>(() => {
    let rows = classified;
    if (activeCategory !== 'all') {
      rows = rows.filter(r => r.category === activeCategory);
    }
    if (selectedPartnerId) {
      rows = rows.filter(r => r.company.partnerIds.includes(selectedPartnerId));
    }
    return [...rows].sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);
  }, [classified, activeCategory, selectedPartnerId]);

  const metrics = useMemo(() => {
    const companies = visibleRows.map(row => row.company);
    const rootBranches = graph.rootBranchCount ?? 0;
    const cnpjsTotais = countTotalCnpjs(companies) + rootBranches;
    const filiais = countBranchEstablishments(companies) + rootBranches;
    const emComum = visibleRows.filter(c => c.category === 'em_comum').length;
    const proprias = visibleRows.filter(c => c.category === 'proprias').length;
    return { cnpjsTotais, filiais, em_comum: emComum, proprias };
  }, [visibleRows, graph.rootBranchCount]);

  const partnerColors = useMemo(() => {
    const map = new Map<string, string>();
    graph.partners.forEach((p, i) => map.set(p.id, PARTNER_MATRIX_COLORS[i % PARTNER_MATRIX_COLORS.length]));
    return map;
  }, [graph.partners]);

  const cnaeLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of classified) {
      const company = row.company;
      const candidates: string[] = [];
      if (company.cnpj) candidates.push(company.cnpj);
      candidates.push(formatSocietaryCnpj(company.cnpj));
      candidates.push(company.id);
      let label = '—';
      for (const key of candidates) {
        const entry = cnaeMap[key];
        if (entry) {
          label = `${entry.cnae} — ${entry.cnaeDescricao}`;
          break;
        }
      }
      map.set(company.id, label);
    }
    return map;
  }, [classified, cnaeMap]);

  const isAllActive = activeCategory === 'all' && selectedPartnerId == null;

  function handleClearFilters() {
    setActiveCategory('all');
    if (selectedPartnerId != null) {
      onSelectPartner?.(null);
    }
  }

  function handleCategoryClick(category: CompanyCategory) {
    setActiveCategory(prev => (prev === category ? 'all' : category));
  }

  function handlePartnerClick(partnerId: string) {
    const newId = selectedPartnerId === partnerId ? null : partnerId;
    onSelectPartner?.(newId);
  }

  const shellClass = isDarkMode
    ? 'border-slate-700 bg-slate-900/60 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  const partnerColumns = graph.partners;

  useEffect(() => {
    if (!traceEnabled) return;
    scoutDiag.trace('teia', 'SocietaryMatrix', 'matriz renderizada', {
      traceId,
      activeCategory,
      selectedPartnerId,
      graphCompaniesCount: graph.companies.length,
      graphRejectedCompaniesCount: graph.rejectedCompanies.length,
      visibleRowsCount: visibleRows.length,
      metrics,
      inactiveReferencesCount: inactiveReferences.length,
      visibleRows: visibleRows.slice(0, 40).map(row => ({
        name: row.company.name,
        cnpj: row.company.cnpj || row.company.rawCnpjLabel || null,
        category: row.category,
        relationshipScope: row.company.relationshipScope,
        validationStatus: row.company.validationStatus,
        partnerIds: row.company.partnerIds,
      })),
    });
  }, [
    activeCategory,
    graph.companies.length,
    graph.rejectedCompanies.length,
    inactiveReferences.length,
    metrics,
    selectedPartnerId,
    traceEnabled,
    traceId,
    visibleRows,
  ]);

  return (
    <section className={`rounded-xl border p-6 shadow-sm ${shellClass}`}>
      {/* ============ Summary row ============ */}
      <div
        className="mb-5 grid grid-cols-2 gap-3 border-b border-slate-200 pb-5 sm:grid-cols-4 dark:border-slate-700"
        aria-label="Resumo da teia societária"
        data-testid="societary-summary-metrics"
      >
        <SummaryMetric value={visibleRows.length} label="Matrizes" testId="summary-metric-matrizes" />
        <SummaryMetric value={metrics.filiais} label="Filiais" testId="summary-metric-filiais" />
        <SummaryMetric value={metrics.em_comum} label="Em comum" testId="summary-metric-em-comum" />
        <SummaryMetric value={metrics.proprias} label="Próprias" testId="summary-metric-proprias" />
      </div>

      {/* ============ Filter toolbar ============ */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5" aria-label="Filtros da tabela societária">
        <FilterButton isActive={isAllActive} onClick={handleClearFilters}>
          Todos
        </FilterButton>
        {(['em_comum', 'proprias'] as const)
          .filter(cat => metrics[cat] > 0)
          .map(cat => (
            <FilterButton key={cat} isActive={activeCategory === cat} onClick={() => handleCategoryClick(cat)}>
              {CATEGORY_LABELS[cat]}
            </FilterButton>
          ))}

        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />

        {graph.partners.map(partner => (
          <FilterButton
            key={partner.id}
            isActive={selectedPartnerId === partner.id}
            onClick={() => handlePartnerClick(partner.id)}
          >
            {firstGivenName(partner.name)}
          </FilterButton>
        ))}
      </div>

      {/* ============ Matrix table ============ */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[880px] border-collapse text-[0.78rem]">
          <thead>
            <tr className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 text-[0.68rem] font-bold uppercase tracking-[0.04em] text-slate-500 dark:text-slate-400">
              <th className="text-left px-3 py-3 min-w-[240px]">Empresa</th>
              <th className="px-3 py-3">CNPJ</th>
              <th className="text-left px-3 py-3">CNAE{isEnrichingCnae && <span className="ml-1 inline-block h-1.5 w-6 animate-pulse rounded bg-slate-300 align-middle dark:bg-slate-600" aria-hidden="true" />}</th>
              {partnerColumns.map(partner => (
                <th key={partner.id} className="px-3 py-3 text-center">
                  {firstGivenName(partner.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + partnerColumns.length}
                  className="py-10 text-center text-slate-400 dark:text-slate-500"
                >
                  Nenhuma empresa encontrada para os filtros ativos.
                </td>
              </tr>
            ) : (
              visibleRows.map(row => (
                <TableRow
                  key={row.company.id}
                  row={row}
                  partnerColumns={partnerColumns}
                  partnerColors={partnerColors}
                  cnaeLabel={isEnrichingCnae && !cnaeLabels.get(row.company.id) ? '⏳' : (cnaeLabels.get(row.company.id) ?? '—')}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {inactiveReferences.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[0.76rem] leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>{inactiveReferences.length}</strong>{' '}
          {inactiveReferences.length === 1
            ? 'CNPJ baixado/inativo foi referenciado'
            : 'CNPJs baixados/inativos foram referenciados'}{' '}
          pelas fontes e excluído
          {inactiveReferences.length === 1 ? '' : 's'} do inventário principal.
        </div>
      ) : null}
    </section>
  );
};

export default React.memo(SocietaryMatrix);
