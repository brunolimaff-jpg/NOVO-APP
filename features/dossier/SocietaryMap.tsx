import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  type SocietaryGraph,
  type SocietaryPartnerInput,
} from './societaryGraph';

interface SocietaryMapProps {
  cnpj?: string | null;
  empresaAlvo?: string | null;
  isDarkMode: boolean;
  geminiCnpjs?: SocietaryCompanyInput[];
}

interface SocioSearchResponse {
  companies?: SocietaryCompanyInput[];
  degraded?: boolean;
  cached?: boolean;
  diagnostics?: {
    truncated?: boolean;
    totalCnpjsFound?: number;
    truncatedReason?: string;
  };
}

type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface RootData {
  cnpj?: string;
  name: string;
  partners: SocietaryPartnerInput[];
}

function normalizePartnerKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function collectPartnerCompanies(companiesByPartner: Record<string, SocietaryCompanyInput[]>): SocietaryCompanyInput[] {
  return Object.values(companiesByPartner).flat();
}

function describeEvidencePartner(company: SocietaryCompany, graph: SocietaryGraph): string {
  const partners = company.partnerIds
    .map(partnerId => graph.partners.find(partner => partner.id === partnerId))
    .filter((partner): partner is typeof graph.partners[number] => Boolean(partner));

  if (partners.length === 0) return 'Sem sócio identificado';

  return partners
    .map(partner => [partner.name, partner.role].filter(Boolean).join(' - '))
    .join(' / ');
}

function describeRelationshipScope(company: SocietaryCompany): string {
  if (company.relationshipScope === 'partner_other_cnpj') return 'Outro CNPJ do sócio';
  if (company.relationshipScope === 'unconfirmed' || company.validationStatus === 'pending') return 'Validação pendente';
  return 'Empresa do grupo';
}

const SocietaryMap: React.FC<SocietaryMapProps> = ({ cnpj, empresaAlvo, isDarkMode, geminiCnpjs }) => {
  const [state, setState] = useState<LoadState>('idle');
  const [rootData, setRootData] = useState<RootData | null>(null);
  const [companiesByPartner, setCompaniesByPartner] = useState<Record<string, SocietaryCompanyInput[]>>({});
  const [loadingPartnerKey, setLoadingPartnerKey] = useState<string | null>(null);
  const [selectedPartnerName, setSelectedPartnerName] = useState<string | undefined>();
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const searchedPartnerKeysRef = useRef<Record<string, boolean>>({});
  const loadingPartnerKeysRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!cnpj) {
      setState('empty');
      setRootData(null);
      setCompaniesByPartner({});
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
      } catch {
        // BrasilAPI falhou — tenta usar dados do Gemini
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
          if (!cancelled) setNotice('Dados do Gemini utilizados para montar o mapa societario.');
        } else {
          partners = [{
            name: 'Grupo Econômico (Gemini)',
            sourceTitle: 'Gemini — Teia Societária',
            confidence: 'weak',
          }];
          if (!cancelled) setNotice('Mapa montado com dados do Gemini. Validacao via QSA pendente.');
        }
      }

      if (partners.length === 0) {
        if (!cancelled) {
          setRootData(null);
          setCompaniesByPartner({});
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
        setRootData({
          cnpj: normalizeCnpj(companyCnpj || ''),
          name: companyName,
          partners,
        });
        setCompaniesByPartner({});
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
  }, [cnpj, empresaAlvo, geminiCnpjs]);

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
      let truncatedNotice: string | null = null;
      let degradedNotice: string | null = null;

      for (const partner of rootData!.partners) {
        if (cancelled) return;
        const partnerKey = normalizePartnerKey(partner.name);
        if (searchedPartnerKeysRef.current[partnerKey] || loadingPartnerKeysRef.current[partnerKey]) continue;

        loadingPartnerKeysRef.current[partnerKey] = true;

        try {
          const response = await fetch('/api/socio-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              socioName: partner.name,
              rootCompanyName: rootName,
              rootCnpj,
            }),
            signal: controller.signal,
          });
          const payload = response.ok ? (await response.json()) as SocioSearchResponse : { companies: [], degraded: true };

          if (!cancelled) {
            collected[partnerKey] = payload.companies || [];
            searchedPartnerKeysRef.current[partnerKey] = true;
            if (payload.diagnostics?.truncated) {
              truncatedNotice = 'Busca societaria retornou inventario parcial; valide fontes para CNPJs adicionais.';
            } else if (payload.degraded && payload.companies?.length === 0) {
              degradedNotice = 'Busca societaria degradada; mapa usa dados parciais.';
            }
          }
        } catch {
          if (!cancelled) {
            searchedPartnerKeysRef.current[partnerKey] = true;
          }
        } finally {
          delete loadingPartnerKeysRef.current[partnerKey];
        }
      }

      if (!cancelled) {
        setCompaniesByPartner(collected);
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
  }, [rootData]);

  const graph = useMemo(() => {
    if (!rootData) return null;
    const isSyntheticFallback = rootData.partners.length === 1
      && rootData.partners[0].name === 'Grupo Econômico (Gemini)';
    const enrichedGemini = isSyntheticFallback && geminiCnpjs
      ? geminiCnpjs.map(c => c.partnerName ? c : { ...c, partnerName: 'Grupo Econômico (Gemini)' })
      : geminiCnpjs;
    return buildSocietaryGraph({
      root: {
        cnpj: rootData.cnpj,
        name: rootData.name,
      },
      partners: rootData.partners,
      companies: collectPartnerCompanies(companiesByPartner),
    }, enrichedGemini);
  }, [rootData, companiesByPartner, geminiCnpjs]);

  const selectedPartner = useMemo(() => {
    if (!graph || !selectedPartnerName) return undefined;
    return graph.partners.find(partner => partner.name === selectedPartnerName) || graph.partners[0];
  }, [graph, selectedPartnerName]);

  const selectedCompanies = useMemo<SocietaryCompany[]>(() => {
    if (!graph) return [];
    if (!selectedPartner) return graph.companies;
    return graph.companies.filter(company => company.partnerIds.includes(selectedPartner.id));
  }, [graph, selectedPartner]);

  const mermaid = useMemo(() => {
    if (!graph) return '';
    return buildSocietaryMermaid(graph, { selectedPartnerId: selectedPartner?.id });
  }, [graph, selectedPartner]);

  if (state === 'idle') return null;

  const shellClass = isDarkMode
    ? 'border-slate-800 bg-slate-950/40 text-slate-100'
    : 'border-slate-200 bg-white text-slate-900';

  return (
    <section className={`mb-4 rounded-xl border p-3 shadow-sm ${shellClass}`} data-testid="societary-map-shell">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Mapa de poder societario</p>
          <p className="mt-1 text-xs text-slate-500">Conexões por sócio</p>
        </div>
        {graph?.partners.length ? (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedPartnerName(undefined)}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                !selectedPartner
                  ? 'border-violet-500 bg-violet-50 text-violet-800'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              Todos
            </button>
            {graph.partners.map(partner => (
              <button
                key={partner.id}
                type="button"
                onClick={() => setSelectedPartnerName(partner.name)}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  selectedPartner?.id === partner.id
                    ? 'border-violet-500 bg-violet-50 text-violet-800'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {partner.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {state === 'loading' ? (
        <p className="text-xs text-slate-500">Montando teia societaria...</p>
      ) : null}

      {loadingPartnerKey ? (
        <p className="mb-3 text-xs text-slate-500">Buscando conexoes do socio selecionado...</p>
      ) : null}

      {notice ? <p className="mb-3 text-xs text-slate-500">{notice}</p> : null}

      {mermaid ? <MarkdownRenderer content={`\`\`\`mermaid\n${mermaid}\n\`\`\``} isDarkMode={isDarkMode} /> : null}

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
                    Sócio/admin: {describeEvidencePartner(company, graph)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Escopo: {describeRelationshipScope(company)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Tipo: {describeSocietaryCompanyType(company)}
                  </p>
                  {company.sourceUrl ? (
                    <a className="mt-1 block text-[11px] font-semibold text-blue-600 underline-offset-2 hover:underline" href={company.sourceUrl} target="_blank" rel="noreferrer">
                      {company.sourceTitle || company.sourceUrl}
                    </a>
                  ) : company.sourceTitle ? (
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{company.sourceTitle}</p>
                  ) : null}
                  {company.snippet ? <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{company.snippet}</p> : null}
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default SocietaryMap;
