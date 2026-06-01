import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { fetchCompanyByCnpj } from '../../services/brasilApiService';
import { normalizeCnpj } from '../../utils/cnpj';
import {
  buildSocietaryGraph,
  buildSocietaryMermaid,
  describeSocietaryCompanyType,
  formatSocietaryCnpj,
  type SocietaryCompany,
  type SocietaryCompanyInput,
  type SocietaryPartnerInput,
} from './societaryGraph';
import { lookupCnpj, type CnpjResult } from '../../lib/cnpjLookup';
import {
  LoadState,
  SocioSearchResponse,
  RejectedSocioSearchResult,
  RootData,
  normalizePartnerKey,
  firstGivenName,
  collectPartnerCompanies,
  countCompaniesByScope,
  describeEvidencePartner,
  describeRelationshipScope,
} from './SocietaryMap/utils';
import { isValidCnpj } from '../../utils/cnpj';
import SocietaryMatrix from './SocietaryMatrix';
import { createScoutTraceId, isScoutTraceEnabled, scoutDiag } from '../../utils/diagnosticLog';

interface SocietaryMapProps {
  cnpj?: string | null;
  empresaAlvo?: string | null;
  isDarkMode: boolean;
  geminiCnpjs?: SocietaryCompanyInput[];
  traceId?: string;
  traceEnabled?: boolean;
}

const filterButtonBaseClass = 'rounded-md border px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition';
const filterButtonActiveClass =
  'border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300';
const filterButtonIdleClass =
  'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400';

const SocietaryMap: React.FC<SocietaryMapProps> = ({
  cnpj,
  empresaAlvo,
  isDarkMode,
  geminiCnpjs,
  traceId,
  traceEnabled,
}) => {
  const [state, setState] = useState<LoadState>('idle');
  const [rootData, setRootData] = useState<RootData | null>(null);
  const [companiesByPartner, setCompaniesByPartner] = useState<Record<string, SocietaryCompanyInput[]>>({});
  const [rejectedReferences, setRejectedReferences] = useState<RejectedSocioSearchResult[]>([]);
  const [loadingPartnerKey, setLoadingPartnerKey] = useState<string | null>(null);
  const [selectedPartnerName, setSelectedPartnerName] = useState<string | undefined>();
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const searchedPartnerKeysRef = useRef<Record<string, boolean>>({});
  const loadingPartnerKeysRef = useRef<Record<string, boolean>>({});
  const [cnaeMap, setCnaeMap] = useState<Record<string, { cnae: string; cnaeDescricao: string }>>({});
  const failedCnaeRef = useRef<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'matrix' | 'mermaid'>('matrix');
  const [debouncedMermaid, setDebouncedMermaid] = useState<string>('');
  const [drillProgress, setDrillProgress] = useState<{ done: number; total: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const mermaidDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const traceIdRef = useRef(traceId || createScoutTraceId('teia'));
  const traceActive = traceEnabled ?? isScoutTraceEnabled('teia');

  const trace = useCallback(
    (message: string, details?: Record<string, unknown>): void => {
      if (!traceActive) return;
      scoutDiag.trace('teia', 'SocietaryMap', message, {
        traceId: traceIdRef.current,
        ...details,
      });
    },
    [traceActive],
  );

  useEffect(() => {
    if (!cnpj) {
      trace('sem CNPJ para montar teia', { empresaAlvo });
      setState('empty');
      setRootData(null);
      setCompaniesByPartner({});
      setRejectedReferences([]);
      searchedPartnerKeysRef.current = {};
      loadingPartnerKeysRef.current = {};
      setSelectedPartnerName(undefined);
      setIsEvidenceOpen(false);
      setLoadingPartnerKey(null);
      setNotice('CNPJ nao disponivel para montar a teia societaria.');
      return;
    }

    const lookupCnpj = cnpj;
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setState('loading');
      setNotice(null);

      let partners: SocietaryPartnerInput[] = [];
      let companyName = empresaAlvo || 'Empresa analisada';
      let companyCnpj = '';

      try {
        const company = await fetchCompanyByCnpj(lookupCnpj, controller.signal);
        companyName = company.companyName || companyName;
        companyCnpj = company.cnpj || '';
        partners = (company.qsa || [])
          .filter(partner => partner.name?.trim())
          .map(partner => ({
            name: partner.name || '',
            role: partner.role,
            document: partner.document,
            sourceTitle: partner.source,
            confidence: partner.confidence,
          }));
        trace('QSA recebido da empresa raiz', {
          rootCnpj: normalizeCnpj(companyCnpj || lookupCnpj),
          companyName,
          partnersCount: partners.length,
          partners: partners.map(partner => ({
            name: partner.name,
            normalizedKey: normalizePartnerKey(partner.name),
            role: partner.role,
            confidence: partner.confidence,
          })),
        });
      } catch (error) {
        trace('lookup da empresa raiz falhou; avaliando fallback Gemini', {
          cnpj: lookupCnpj,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (partners.length === 0 && geminiCnpjs && geminiCnpjs.length > 0) {
        const geminiPartners = new Map<string, SocietaryPartnerInput>();
        for (const c of geminiCnpjs) {
          if (c.partnerName && !geminiPartners.has(c.partnerName)) {
            geminiPartners.set(c.partnerName, {
              name: c.partnerName,
              role: c.role,
              sourceTitle: c.sourceTitle,
              confidence: c.confidence,
            });
          }
        }
        if (geminiPartners.size > 0) {
          partners = [...geminiPartners.values()];
          trace('fallback Gemini gerou socios para a teia', {
            partnersCount: partners.length,
            geminiCompaniesCount: geminiCnpjs.length,
          });
          if (!cancelled) setNotice('Dados do Gemini utilizados para montar o mapa societario.');
        } else {
          partners = [
            {
              name: 'Grupo Econômico (Gemini)',
              sourceTitle: 'Gemini — Teia Societária',
              confidence: 'weak',
            },
          ];
          trace('fallback Gemini sem socios explicitos; usando socio sintetico', {
            geminiCompaniesCount: geminiCnpjs.length,
          });
          if (!cancelled) setNotice('Mapa montado com dados do Gemini. Validacao via QSA pendente.');
        }
      }

      if (partners.length === 0) {
        trace('teia sem socios apos lookup e fallback', {
          cnpj: lookupCnpj,
          geminiCompaniesCount: geminiCnpjs?.length || 0,
        });
        if (!cancelled) {
          setRootData(null);
          setCompaniesByPartner({});
          setRejectedReferences([]);
          searchedPartnerKeysRef.current = {};
          loadingPartnerKeysRef.current = {};
          setSelectedPartnerName(undefined);
          setIsEvidenceOpen(false);
          setLoadingPartnerKey(null);
          setState('empty');
          setNotice('QSA ainda nao disponivel para este CNPJ.');
        }
        return;
      }

      if (!cancelled) {
        trace('raiz pronta para drill-down de socios', {
          rootCnpj: normalizeCnpj(companyCnpj || ''),
          companyName,
          partnersCount: partners.length,
        });
        setRootData({
          cnpj: normalizeCnpj(companyCnpj || ''),
          name: companyName,
          partners,
        });
        setCompaniesByPartner({});
        setRejectedReferences([]);
        searchedPartnerKeysRef.current = {};
        loadingPartnerKeysRef.current = {};
        setSelectedPartnerName(undefined);
        setIsEvidenceOpen(false);
        setLoadingPartnerKey(null);
        setState('ready');
      }
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cnpj, empresaAlvo, geminiCnpjs, trace]);

  useEffect(() => {
    setIsEvidenceOpen(false);
  }, [selectedPartnerName]);

  useEffect(() => {
    if (!rootData || rootData.partners.length === 0) return;

    const rootName = rootData.name;
    const rootCnpj = rootData.cnpj;
    let cancelled = false;
    const controller = new AbortController();

    async function loadAllPartners() {
      const collected: Record<string, SocietaryCompanyInput[]> = {};
      const rejected: RejectedSocioSearchResult[] = [];
      let truncatedNotice: string | null = null;
      let degradedNotice: string | null = null;
      const batchStartedAt = performance.now();
      const totalPartners = rootData!.partners.length;
      if (!cancelled) setDrillProgress({ done: 0, total: totalPartners });
      trace('drill-down de socios iniciado', {
        rootName,
        rootCnpj,
        partnersCount: totalPartners,
        partners: rootData!.partners.map(partner => partner.name),
        uiCommitStrategy: 'incremental_per_partner',
      });

      const BATCH_SIZE = 5;
      const allPartners = rootData!.partners;

      const processPartner = async (partner: RootData['partners'][number]) => {
        const partnerKey = normalizePartnerKey(partner.name);
        if (searchedPartnerKeysRef.current[partnerKey] || loadingPartnerKeysRef.current[partnerKey]) return;
        loadingPartnerKeysRef.current[partnerKey] = true;

        try {
          const startedAt = performance.now();
          trace('socio-search iniciado', {
            partnerName: partner.name,
            partnerKey,
            partnersTotal: allPartners.length,
          });
          const response = await fetch('/api/socio-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              socioName: partner.name,
              rootCompanyName: rootName,
              rootCnpj,
              trace: traceActive || undefined,
            }),
            signal: controller.signal,
          });
          const payload = response.ok
            ? ((await response.json()) as SocioSearchResponse)
            : { companies: [], degraded: true };
          const elapsedMs = Number((performance.now() - startedAt).toFixed(1));
          trace('socio-search payload recebido', {
            partnerName: partner.name,
            partnerKey,
            status: response.status,
            ok: response.ok,
            elapsedMs,
            batchElapsedMs: Number((performance.now() - batchStartedAt).toFixed(1)),
            uiCommitStrategy: 'incremental_per_partner',
            companiesCount: payload.companies?.length || 0,
            rejectedCount: payload.rejected?.length || 0,
            degraded: payload.degraded,
            cached: payload.cached,
            diagnostics: payload.diagnostics,
          });

          if (!cancelled) {
            const partnerCompanies = payload.companies || [];
            const partnerRejected = payload.rejected || [];
            collected[partnerKey] = partnerCompanies;
            rejected.push(...partnerRejected);
            searchedPartnerKeysRef.current[partnerKey] = true;
            const doneCount = Object.keys(collected).length;
            setDrillProgress({ done: doneCount, total: totalPartners });
            setCompaniesByPartner(previous => ({
              ...previous,
              [partnerKey]: partnerCompanies,
            }));
            if (partnerRejected.length > 0) {
              setRejectedReferences(previous => [...previous, ...partnerRejected]);
            }
            trace('resultado parcial aplicado na UI', {
              partnerName: partner.name,
              partnerKey,
              partnersCompleted: Object.keys(collected).length,
              partnersTotal: totalPartners,
              companiesCount: partnerCompanies.length,
              totalCompaniesSoFar: collectPartnerCompanies(collected).length,
              rejectedCount: partnerRejected.length,
              uiCommitStrategy: 'incremental_per_partner',
            });
            if (payload.diagnostics?.truncated) {
              truncatedNotice = 'Busca societaria retornou inventario parcial; valide fontes para CNPJs adicionais.';
            } else if (payload.degraded && payload.companies?.length === 0) {
              degradedNotice = 'Busca societaria degradada; mapa usa dados parciais.';
            }
          }
        } catch (error) {
          trace('socio-search falhou no frontend', {
            partnerName: partner.name,
            partnerKey,
            message: error instanceof Error ? error.message : String(error),
          });
          if (!cancelled) {
            searchedPartnerKeysRef.current[partnerKey] = true;
          }
        } finally {
          delete loadingPartnerKeysRef.current[partnerKey];
        }
      };

      for (let batchStart = 0; batchStart < allPartners.length; batchStart += BATCH_SIZE) {
        if (cancelled) return;
        const batch = allPartners.slice(batchStart, batchStart + BATCH_SIZE);
        await Promise.allSettled(batch.map(processPartner));
      }

      if (!cancelled) {
        setDrillProgress(null);
        setLoadingPartnerKey(null);
        trace('drill-down de socios consolidado', {
          totalElapsedMs: Number((performance.now() - batchStartedAt).toFixed(1)),
          uiCommitStrategy: 'incremental_per_partner',
          partnersSearched: Object.keys(collected).length,
          totalCompanies: collectPartnerCompanies(collected).length,
          companiesByPartner: Object.fromEntries(
            Object.entries(collected).map(([key, companies]) => [key, companies.length]),
          ),
          rejectedCount: rejected.length,
          rejectedReasons: rejected.reduce<Record<string, number>>((acc, item) => {
            acc[item.reason] = (acc[item.reason] || 0) + 1;
            return acc;
          }, {}),
        });
        setCompaniesByPartner(collected);
        setRejectedReferences(rejected);
        setLoadingPartnerKey(null);
        if (truncatedNotice) setNotice(truncatedNotice);
        else if (degradedNotice) setNotice(degradedNotice);
      }
    }

    void loadAllPartners();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [rootData, trace, traceActive]);

  const graph = useMemo(() => {
    if (!rootData) return null;
    const isSyntheticFallback =
      rootData.partners.length === 1 && rootData.partners[0].name === 'Grupo Econômico (Gemini)';
    const enrichedGemini =
      isSyntheticFallback && geminiCnpjs
        ? geminiCnpjs.map(c => (c.partnerName ? c : { ...c, partnerName: 'Grupo Econômico (Gemini)' }))
        : geminiCnpjs;
    return buildSocietaryGraph(
      {
        root: {
          cnpj: rootData.cnpj,
          name: rootData.name,
        },
        partners: rootData.partners,
        companies: collectPartnerCompanies(companiesByPartner),
      },
      enrichedGemini,
    );
  }, [rootData, companiesByPartner, geminiCnpjs]);

  const partnersById = useMemo(() => (graph ? new Map(graph.partners.map(p => [p.id, p])) : new Map()), [graph]);

  const handleSelectPartner = useCallback(
    (partnerId: string | null) => {
      if (!graph) return;
      if (partnerId) {
        const partner = partnersById.get(partnerId);
        setSelectedPartnerName(partner?.name);
      } else {
        setSelectedPartnerName(undefined);
      }
    },
    [graph],
  );

  useEffect(() => {
    if (!graph || !traceActive) return;
    trace('grafo consolidado', {
      partnersCount: graph.partners.length,
      renderedCompaniesCount: graph.companies.length,
      renderedByScope: countCompaniesByScope(graph.companies),
      rejectedCompaniesCount: graph.rejectedCompanies.length,
      rejectedCompaniesByReason: graph.rejectedCompanies.reduce<Record<string, number>>((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + 1;
        return acc;
      }, {}),
      companies: graph.companies.slice(0, 40).map(company => ({
        name: company.name,
        cnpj: company.cnpj || company.rawCnpjLabel || null,
        relationshipScope: company.relationshipScope,
        validationStatus: company.validationStatus,
        partnerIds: company.partnerIds,
        rootLinked: company.rootLinked,
      })),
    });
  }, [graph, trace, traceActive]);

  useEffect(() => {
    if (!graph) return;

    const companiesWithCnpj = graph.companies.filter(c => c.cnpj && isValidCnpj(c.cnpj));
    const uniqueCnpjs = [...new Set(companiesWithCnpj.map(c => c.cnpj!))];
    const pending = uniqueCnpjs.filter(cnpj => !cnaeMap[cnpj] && !failedCnaeRef.current.has(cnpj));

    if (pending.length === 0) return;

    let cancelled = false;

    async function enrich() {
      const batchSize = 5;
      const results: Record<string, { cnae: string; cnaeDescricao: string }> = {};

      for (let i = 0; i < pending.length; i += batchSize) {
        if (cancelled) return;
        const batch = pending.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(cnpj => lookupCnpj(cnpj, { timeoutMs: 3500, maxSources: 1 })),
        );
        for (let j = 0; j < batch.length; j++) {
          const result = batchResults[j];
          if (result.status === 'fulfilled' && result.value) {
            const cnpjData = result.value as CnpjResult;
            results[batch[j]] = {
              cnae: cnpjData.cnae || cnpjData.cnaeDescricao || '',
              cnaeDescricao: cnpjData.cnaeDescricao || cnpjData.cnae || '',
            };
          } else {
            failedCnaeRef.current.add(batch[j]);
          }
        }
      }

      if (!cancelled && Object.keys(results).length > 0) {
        setCnaeMap(prev => ({ ...prev, ...results }));
      }
    }

    enrich();
    return () => {
      cancelled = true;
    };
  }, [graph, cnaeMap]);

  const selectedPartner = useMemo(() => {
    if (!graph || !selectedPartnerName) return undefined;
    return graph.partners.find(partner => partner.name === selectedPartnerName) || graph.partners[0];
  }, [graph, selectedPartnerName]);

  const selectedCompanies = useMemo<SocietaryCompany[]>(() => {
    if (!graph) return [];
    if (!selectedPartner) return graph.companies;
    return graph.companies.filter(company => company.partnerIds.includes(selectedPartner.id));
  }, [graph, selectedPartner]);

  const inactiveReferences = useMemo(
    () => rejectedReferences.filter(item => /baixad|inativ/i.test(item.reason)),
    [rejectedReferences],
  );

  const mermaid = useMemo(() => {
    if (!graph) return '';
    return buildSocietaryMermaid(graph, { selectedPartnerId: selectedPartner?.id });
  }, [graph, selectedPartner]);

  // Debounce mermaid rebuild only during active drill-down to avoid SVG flicker from
  // rapid incremental API responses. Partner selection changes must update immediately.
  useEffect(() => {
    if (mermaidDebounceRef.current) clearTimeout(mermaidDebounceRef.current);
    if (drillProgress !== null) {
      mermaidDebounceRef.current = setTimeout(() => {
        setDebouncedMermaid(mermaid);
      }, 350);
      return () => {
        if (mermaidDebounceRef.current) clearTimeout(mermaidDebounceRef.current);
      };
    }
    setDebouncedMermaid(mermaid);
  }, [mermaid, drillProgress]);

  if (state === 'idle') return null;

  const shellClass = isDarkMode
    ? 'border-slate-800 bg-slate-950/40 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  return (
    <section className={`mb-4 rounded-xl border p-3 shadow-sm ${shellClass}`} data-testid="societary-map-shell">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Mapa de poder societario</p>
          <div className="mt-2 flex gap-1">
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                viewMode === 'matrix'
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
            >
              Tabela
            </button>
            <button
              type="button"
              onClick={() => setViewMode('mermaid')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                viewMode === 'mermaid'
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
            >
              Grafo
            </button>
          </div>
        </div>
        {viewMode === 'mermaid' && graph?.partners.length ? (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedPartnerName(undefined)}
              className={`${filterButtonBaseClass} ${
                !selectedPartner ? filterButtonActiveClass : filterButtonIdleClass
              }`}
            >
              Todos
            </button>
            {graph.partners.map(partner => (
              <button
                key={partner.id}
                type="button"
                onClick={() => setSelectedPartnerName(partner.name)}
                className={`${filterButtonBaseClass} ${
                  selectedPartner?.id === partner.id ? filterButtonActiveClass : filterButtonIdleClass
                }`}
              >
                {firstGivenName(partner.name)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {state === 'loading' ? <p className="text-xs text-slate-500">Montando teia societaria...</p> : null}

      {drillProgress && drillProgress.total > 0 ? (
        <div className="mb-3" aria-label={`Buscando sócios: ${drillProgress.done} de ${drillProgress.total}`}>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              {drillProgress.done}/{drillProgress.total} sócios
            </span>
            <div className="flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" style={{ height: 4 }}>
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.round((drillProgress.done / drillProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {notice ? <p className="mb-3 text-xs text-slate-500">{notice}</p> : null}

      {viewMode === 'matrix' && graph ? (
        <SocietaryMatrix
          graph={graph}
          cnaeMap={cnaeMap}
          isDarkMode={isDarkMode}
          rootName={rootData?.name || 'Empresa analisada'}
          selectedPartnerId={selectedPartner?.id || null}
          inactiveReferences={inactiveReferences}
          traceId={traceIdRef.current}
          traceEnabled={traceActive}
          onSelectPartner={handleSelectPartner}
        />
      ) : (
        <>
          {debouncedMermaid ? (
            <div
              className="relative max-h-[min(70vh,720px)] min-h-[360px] w-full overflow-auto rounded-lg border border-slate-200/80 bg-white p-3 select-text dark:border-slate-700 dark:bg-slate-900"
              data-testid="societary-mermaid-shell"
            >
              <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Diminuir zoom"
                  onClick={() => setZoomLevel(z => Math.max(0.4, z - 0.2))}
                  className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="Aumentar zoom"
                  onClick={() => setZoomLevel(z => Math.min(2.5, z + 0.2))}
                  className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  +
                </button>
                {zoomLevel !== 1 ? (
                  <button
                    type="button"
                    aria-label="Resetar zoom"
                    onClick={() => setZoomLevel(1)}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>
                ) : null}
              </div>
              <div style={{ zoom: zoomLevel }}>
                <MarkdownRenderer
                  content={`\`\`\`mermaid\n${debouncedMermaid}\n\`\`\``}
                  isDarkMode={isDarkMode}
                  variant="compact"
                />
              </div>
            </div>
          ) : null}
          {!selectedPartner && graph && graph.partners.length > 1 ? (
            <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
              Selecione um sócio para ver os CNPJs vinculados
            </p>
          ) : null}

          {selectedCompanies.length > 0 && graph ? (
            <div className="mt-3" data-testid="societary-evidence-panel">
              <button
                type="button"
                aria-expanded={isEvidenceOpen}
                onClick={() => setIsEvidenceOpen(open => !open)}
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                data-testid="societary-evidence-toggle"
              >
                {isEvidenceOpen ? 'Recolher evidências' : `Ver evidências (${selectedCompanies.length})`}
              </button>

              {isEvidenceOpen ? (
                <div className="mt-2 space-y-2" data-testid="societary-evidence-list">
                  {selectedCompanies.map(company => (
                    <article key={company.id} className="rounded-lg border border-slate-200/70 p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-700">{company.name}</span>
                        {company.rawCnpjLabel || company.cnpj ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                            CNPJ {company.rawCnpjLabel || formatSocietaryCnpj(company.cnpj || '')}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Sócio/admin: {describeEvidencePartner(company, partnersById)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">Escopo: {describeRelationshipScope(company)}</p>
                      <p className="mt-1 text-[11px] text-slate-600">Tipo: {describeSocietaryCompanyType(company)}</p>
                      {company.sourceUrl ? (
                        <a
                          className="mt-1 block text-[11px] font-semibold text-blue-600 underline-offset-2 hover:underline"
                          href={company.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {company.sourceTitle || company.sourceUrl}
                        </a>
                      ) : company.sourceTitle ? (
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">{company.sourceTitle}</p>
                      ) : null}
                      {company.snippet ? (
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{company.snippet}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};

export default React.memo(SocietaryMap);
