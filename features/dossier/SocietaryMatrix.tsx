import React, { useMemo, useState } from 'react';
import {
  type SocietaryCompany,
  type SocietaryGraph,
  formatSocietaryCnpj,
} from './societaryGraph';

const PARTNER_MATRIX_COLORS = [
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#ca8a04',
  '#16a34a',
  '#db2777',
  '#4f46e5',
  '#ea580c',
];

function firstGivenName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || fullName.trim();
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

type CompanyCategory = 'strategic' | 'operation' | 'own' | 'lateral';

function classifyCompany(company: SocietaryCompany, _totalPartners: number): CompanyCategory {
  if (company.relationshipScope === 'unconfirmed' || company.validationStatus === 'pending') return 'lateral';
  if (company.relationshipScope === 'partner_other_cnpj') return 'lateral';
  if (company.partnerIds.length >= 3) return 'strategic';
  if (company.partnerIds.length >= 2) return 'operation';
  return 'own';
}

function isSideBusiness(company: SocietaryCompany): boolean {
  return company.relationshipScope === 'partner_other_cnpj';
}

const CATEGORY_LABELS: Record<CompanyCategory, string> = {
  strategic: 'Estratégico',
  operation: 'Operações',
  own: 'Próprias',
  lateral: 'CNPJs laterais',
};

const CATEGORY_ORDER: Record<CompanyCategory, number> = {
  strategic: 0,
  operation: 1,
  own: 2,
  lateral: 3,
};

interface SocietaryMatrixProps {
  graph: SocietaryGraph;
  cnaeMap: Record<string, { cnae: string; cnaeDescricao: string }>;
  isDarkMode: boolean;
  rootName: string;
  selectedPartnerId?: string | null;
  onSelectPartner?: (partnerId: string | null) => void;
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
      className={`rounded-full border px-2.5 py-1 text-[0.72rem] font-bold cursor-pointer transition ${
        isActive
          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400'
      }`}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  isDarkMode,
}: {
  label: string;
  value: number;
  isDarkMode: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        isDarkMode
          ? 'border-slate-700 bg-slate-800/50'
          : 'border-slate-200 bg-slate-50'
      }`}
    >
      <strong className="block text-[1.15rem] text-slate-900 dark:text-slate-100">
        {value}
      </strong>
      <span className="text-[0.7rem] text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  );
}

const SocietaryMatrix: React.FC<SocietaryMatrixProps> = ({
  graph,
  cnaeMap,
  isDarkMode,
  rootName: _rootName,
  selectedPartnerId = null,
  onSelectPartner,
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | CompanyCategory>('all');

  // Classify each company
  const classified = useMemo<ClassifiedRow[]>(() => {
    const totalPartners = graph.partners.length;
    return graph.companies.map(company => ({
      company,
      category: classifyCompany(company, totalPartners),
      side: isSideBusiness(company),
    }));
  }, [graph.companies]);

  // Summary metrics
  const metrics = useMemo(() => {
    const total = classified.filter(c => c.category !== 'lateral').length;
    const strategic = classified.filter(c => c.category === 'strategic').length;
    const operation = classified.filter(c => c.category === 'operation').length;
    const own = classified.filter(c => c.category === 'own').length;
    const lateral = classified.filter(c => c.category === 'lateral').length;
    return { total, strategic, operation, own, lateral };
  }, [classified]);

  // Filtered + sorted rows (category + partner AND logic)
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

  // Partner index-based color map
  const partnerColors = useMemo(() => {
    const map = new Map<string, string>();
    graph.partners.forEach((p, i) =>
      map.set(p.id, PARTNER_MATRIX_COLORS[i % PARTNER_MATRIX_COLORS.length]),
    );
    return map;
  }, [graph.partners]);

  // CNAE lookup with fallback keys
  function getCnaeLabel(company: SocietaryCompany): string {
    const candidates: string[] = [];
    if (company.cnpj) candidates.push(company.cnpj);
    candidates.push(formatSocietaryCnpj(company.cnpj));
    candidates.push(company.id);
    for (const key of candidates) {
      const entry = cnaeMap[key];
      if (entry) {
        return `${entry.cnae} — ${entry.cnaeDescricao}`;
      }
    }
    return '—';
  }

  // Filter handlers
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

  // Shell style
  const shellClass = isDarkMode
    ? 'border-slate-700 bg-slate-900/60 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  // Partner columns
  const partnerColumns = graph.partners;

  return (
    <section className={`rounded-xl border p-5 shadow-sm ${shellClass}`}>
      {/* ============ Summary row ============ */}
      <div className="grid grid-cols-4 gap-3 mb-3.5">
        <SummaryCard label="empresas do grupo" value={metrics.total} isDarkMode={isDarkMode} />
        {metrics.strategic > 0 && <SummaryCard label="frentes estratégicas" value={metrics.strategic} isDarkMode={isDarkMode} />}
        {metrics.operation > 0 && <SummaryCard label="operações compartilhadas" value={metrics.operation} isDarkMode={isDarkMode} />}
        {metrics.own > 0 && <SummaryCard label="empresas próprias" value={metrics.own} isDarkMode={isDarkMode} />}
        {metrics.lateral > 0 && <SummaryCard label="CNPJs laterais" value={metrics.lateral} isDarkMode={isDarkMode} />}
      </div>

      {/* ============ Filter toolbar ============ */}
      <div className="flex flex-wrap items-center gap-2 mb-3.5" aria-label="Filtros da tabela societária">
        <FilterButton isActive={isAllActive} onClick={handleClearFilters}>
          Todos
        </FilterButton>
        {(['strategic', 'operation', 'own', 'lateral'] as const).filter(cat => metrics[cat] > 0).map(cat => (
          <FilterButton
            key={cat}
            isActive={activeCategory === cat}
            onClick={() => handleCategoryClick(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </FilterButton>
        ))}
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
        <table className="w-full min-w-[940px] border-collapse text-[0.78rem]">
          <thead>
            <tr className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 text-[0.68rem] font-bold uppercase tracking-[0.04em] text-slate-500 dark:text-slate-400">
              <th className="text-left px-2.5 py-2 min-w-[180px]">Empresa</th>
              <th className="text-left px-2.5 py-2 w-[130px]">Relação</th>
              <th className="px-2.5 py-2">CNPJ</th>
              <th className="text-left px-2.5 py-2">CNAE</th>
              {partnerColumns.map(partner => (
                <th key={partner.id} className="px-2.5 py-2">
                  {firstGivenName(partner.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={4 + partnerColumns.length}
                  className="py-8 text-center text-slate-400 dark:text-slate-500"
                >
                  Nenhuma empresa encontrada para os filtros ativos.
                </td>
              </tr>
            ) : (
              visibleRows.map(row => (
                <tr
                  key={row.company.id}
                  className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  {/* Company name */}
                  <td className="text-left font-bold text-slate-900 dark:text-slate-100 px-2.5 py-2.5">
                    {row.company.name}
                  </td>

                  {/* Category pill */}
                  <td className="text-left px-2.5 py-2.5">
                    <span
                      className={`inline-flex items-center h-5.5 rounded-full px-2 text-[0.68rem] font-extrabold ${
                        row.category === 'strategic'
                          ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300'
                          : row.category === 'operation'
                            ? 'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                            : row.category === 'lateral'
                              ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {row.category === 'lateral' ? 'CNPJ lateral do sócio' : CATEGORY_LABELS[row.category]}
                    </span>
                  </td>

                  {/* CNPJ */}
                  <td className="font-mono text-[0.7rem] text-slate-600 dark:text-slate-400 whitespace-nowrap px-2.5 py-2.5">
                    {row.company.cnpj ? formatSocietaryCnpj(row.company.cnpj) : '—'}
                  </td>

                  {/* CNAE */}
                  <td className="text-[0.7rem] text-slate-500 dark:text-slate-400 text-left max-w-[200px] px-2.5 py-2.5">
                    {getCnaeLabel(row.company)}
                  </td>

                  {/* Partner dots */}
                  {partnerColumns.map(partner => {
                    const isConnected = row.company.partnerIds.includes(partner.id);
                    if (!isConnected) {
                      return (
                        <td key={partner.id} className="px-2.5 py-2.5">
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
                        <td key={partner.id} className="px-2.5 py-2.5">
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
                      <td key={partner.id} className="px-2.5 py-2.5">
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ============ Legend ============ */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 text-[0.75rem] text-slate-500 dark:text-slate-400">
        {graph.partners.map(partner => {
          const color = partnerColors.get(partner.id) ?? '#94a3b8';
          return (
            <span key={partner.id}>
              <span
                className="inline-block w-2.5 h-2.5 rounded-full mr-1 align-middle"
                style={{ backgroundColor: color }}
              />
              {partner.name}
            </span>
          );
        })}
        <span>
          <span
            className="inline-block w-3.5 mr-1 align-middle"
            style={{ borderTop: '2px dashed #94a3b8' }}
          />
          Vínculo do sócio; grupo não confirmado
        </span>
      </div>
    </section>
  );
};

export default SocietaryMatrix;
