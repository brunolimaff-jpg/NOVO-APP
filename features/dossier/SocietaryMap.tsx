import React, { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { fetchCompanyByCnpj } from '../../services/brasilApiService';
import {
  buildSocietaryGraph,
  buildSocietaryMermaid,
  type SocietaryCompany,
  type SocietaryCompanyInput,
  type SocietaryPartnerInput,
} from './societaryGraph';

interface SocietaryMapProps {
  cnpj?: string | null;
  empresaAlvo?: string | null;
  isDarkMode: boolean;
}

interface SocioSearchResponse {
  companies?: SocietaryCompanyInput[];
  degraded?: boolean;
  cached?: boolean;
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

const SocietaryMap: React.FC<SocietaryMapProps> = ({ cnpj, empresaAlvo, isDarkMode }) => {
  const [state, setState] = useState<LoadState>('idle');
  const [rootData, setRootData] = useState<RootData | null>(null);
  const [companiesByPartner, setCompaniesByPartner] = useState<Record<string, SocietaryCompanyInput[]>>({});
  const [loadingPartnerKey, setLoadingPartnerKey] = useState<string | null>(null);
  const [selectedPartnerName, setSelectedPartnerName] = useState<string | undefined>();
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

      try {
        const company = await fetchCompanyByCnpj(lookupCnpj, controller.signal);
        const partners: SocietaryPartnerInput[] = (company.qsa || [])
          .filter(partner => partner.name?.trim())
          .map(partner => ({
            name: partner.name || '',
            role: partner.role,
            document: partner.document,
            sourceTitle: partner.source,
            confidence: partner.confidence,
          }));

        if (partners.length === 0) {
          if (!cancelled) {
            setRootData(null);
            setCompaniesByPartner({});
            searchedPartnerKeysRef.current = {};
            loadingPartnerKeysRef.current = {};
            setSelectedPartnerName(undefined);
            setLoadingPartnerKey(null);
            setState('empty');
            setNotice('QSA ainda nao disponivel para este CNPJ.');
          }
          return;
        }

        if (!cancelled) {
          setRootData({
            cnpj: company.cnpj,
            name: company.companyName || empresaAlvo || 'Empresa analisada',
            partners,
          });
          setCompaniesByPartner({});
          searchedPartnerKeysRef.current = {};
          loadingPartnerKeysRef.current = {};
          setSelectedPartnerName(partners[0]?.name);
          setLoadingPartnerKey(null);
          setState('ready');
        }
      } catch (error) {
        if (!cancelled) {
          setRootData(null);
          setCompaniesByPartner({});
          searchedPartnerKeysRef.current = {};
          loadingPartnerKeysRef.current = {};
          setSelectedPartnerName(undefined);
          setLoadingPartnerKey(null);
          setState('error');
          setNotice('Nao foi possivel montar a teia societaria agora. Mantendo o dossie textual como fallback.');
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cnpj, empresaAlvo]);

  useEffect(() => {
    if (!rootData || !selectedPartnerName) return;
    const selected = rootData.partners.find(partner => partner.name === selectedPartnerName);
    if (!selected) return;

    const partnerKey = normalizePartnerKey(selected.name);
    if (searchedPartnerKeysRef.current[partnerKey] || loadingPartnerKeysRef.current[partnerKey]) return;
    loadingPartnerKeysRef.current[partnerKey] = true;
    const partnerName = selected.name;
    const rootName = rootData.name;
    const rootCnpj = rootData.cnpj;

    let cancelled = false;
    const controller = new AbortController();

    async function loadPartnerCompanies() {
      setLoadingPartnerKey(partnerKey);

      try {
        const response = await fetch('/api/socio-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            socioName: partnerName,
            rootCompanyName: rootName,
            rootCnpj,
          }),
          signal: controller.signal,
        });
        const payload = response.ok ? (await response.json()) as SocioSearchResponse : { companies: [], degraded: true };

        if (!cancelled) {
          setCompaniesByPartner(prev => ({ ...prev, [partnerKey]: payload.companies || [] }));
          searchedPartnerKeysRef.current[partnerKey] = true;
          setNotice(payload.degraded ? 'Busca societaria degradada; mapa usa dados parciais.' : null);
        }
      } catch (error) {
        if (!cancelled) {
          searchedPartnerKeysRef.current[partnerKey] = true;
          setNotice('Nao foi possivel montar a teia societaria agora. Mantendo o dossie textual como fallback.');
        }
      } finally {
        delete loadingPartnerKeysRef.current[partnerKey];
        if (!cancelled) {
          setLoadingPartnerKey(current => (current === partnerKey ? null : current));
        }
      }
    }

    void loadPartnerCompanies();

    return () => {
      cancelled = true;
      controller.abort();
      delete loadingPartnerKeysRef.current[partnerKey];
    };
  }, [rootData, selectedPartnerName]);

  const graph = useMemo(() => {
    if (!rootData) return null;
    return buildSocietaryGraph({
      root: {
        cnpj: rootData.cnpj,
        name: rootData.name,
      },
      partners: rootData.partners,
      companies: collectPartnerCompanies(companiesByPartner),
    });
  }, [rootData, companiesByPartner]);

  const selectedPartner = useMemo(() => {
    if (!graph) return undefined;
    return graph.partners.find(partner => partner.name === selectedPartnerName) || graph.partners[0];
  }, [graph, selectedPartnerName]);

  const selectedCompanies = useMemo<SocietaryCompany[]>(() => {
    if (!graph || !selectedPartner) return [];
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
          <p className="mt-1 text-xs text-slate-500">CLASSIFICAÇÃO ESTIMADA</p>
        </div>
        {graph?.partners.length ? (
          <div className="flex flex-wrap gap-1.5">
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

      {selectedCompanies.length > 0 ? (
        <div className="mt-3 space-y-2" data-testid="societary-evidence-list">
          {selectedCompanies.map(company => (
            <article key={company.id} className="rounded-lg border border-slate-200/70 p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-slate-700">{company.name}</span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                  {company.confidence}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                  {company.evidenceType}
                </span>
              </div>
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
    </section>
  );
};

export default SocietaryMap;
