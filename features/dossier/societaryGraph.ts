import { normalizeCnpj } from '../../utils/cnpj';

export type SocietaryConfidence = 'official' | 'strong' | 'medium' | 'weak';
export type SocietaryEvidenceType = 'qsa' | 'registry' | 'web' | 'trade' | 'institutional';
export type SocietaryBadge =
  | 'empresa em comum'
  | 'holding'
  | 'oficial'
  | 'internacional'
  | 'estimado'
  | 'validar';

export interface SocietaryRootInput {
  cnpj?: string | null;
  name: string;
}

export interface SocietaryPartnerInput {
  id?: string;
  name: string;
  role?: string;
  document?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  snippet?: string;
  confidence?: SocietaryConfidence;
}

export interface SocietaryCompanyInput {
  name: string;
  cnpj?: string | null;
  country?: string | null;
  partnerName: string;
  role?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  snippet?: string;
  confidence?: SocietaryConfidence;
  evidenceType?: SocietaryEvidenceType;
  rootContext?: boolean;
  rootCompanyName?: string;
  rootCnpj?: string | null;
}

export interface SocietaryPartner {
  id: string;
  name: string;
  role?: string;
  document?: string;
  sourceTitle?: string;
  confidence: SocietaryConfidence;
}

export interface SocietaryCompany {
  id: string;
  name: string;
  cnpj?: string;
  branchCount?: number;
  branchCnpjs?: string[];
  country?: string;
  role?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  snippet?: string;
  confidence: SocietaryConfidence;
  evidenceType: SocietaryEvidenceType;
  rootContext: boolean;
  rootCompanyName?: string;
  rootCnpj?: string;
  partnerIds: string[];
  rootLinked?: boolean;
  badges: SocietaryBadge[];
}

export interface RejectedSocietaryCompany {
  input: SocietaryCompanyInput;
  reason: string;
}

export interface SocietaryGraph {
  root: {
    id: 'root';
    name: string;
    cnpj?: string;
  };
  partners: SocietaryPartner[];
  companies: SocietaryCompany[];
  rejectedCompanies: RejectedSocietaryCompany[];
}

export interface BuildSocietaryGraphInput {
  root: SocietaryRootInput;
  partners: SocietaryPartnerInput[];
  companies?: SocietaryCompanyInput[];
}

export interface BuildSocietaryMermaidOptions {
  selectedPartnerId?: string | null;
}

const PARTNER_EDGE_COLORS = [
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#ca8a04',
  '#16a34a',
  '#db2777',
  '#4f46e5',
  '#ea580c',
];

function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toId(prefix: string, value: string): string {
  const slug = normalizeText(value).replace(/\s+/g, '_').slice(0, 42);
  return `${prefix}_${slug || 'item'}`;
}

function escapeMermaidLabel(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatSocietaryCnpj(value?: string | null): string {
  const cnpj = normalizeCnpj(value || '');
  if (cnpj.length !== 14) return value || '';
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function buildCompanyKey(company: SocietaryCompanyInput): string {
  const cnpj = normalizeCnpj(company.cnpj || '');
  if (cnpj.length === 14) return `cnpj-root:${cnpj.slice(0, 8)}`;
  return `name:${normalizeText(company.name)}:${(company.country || 'BR').trim().toUpperCase()}`;
}

function isHeadquartersCnpj(cnpj?: string): boolean {
  return Boolean(cnpj && cnpj.slice(8, 12) === '0001');
}

function mergeBranchData(existing: SocietaryCompany, incoming: SocietaryCompanyInput): void {
  const normalizedCnpj = normalizeCnpj(incoming.cnpj || '');
  if (normalizedCnpj.length !== 14) return;

  const cnpjs = new Set(existing.branchCnpjs || (existing.cnpj ? [existing.cnpj] : []));
  cnpjs.add(normalizedCnpj);
  existing.branchCnpjs = Array.from(cnpjs).sort((a, b) => {
    if (isHeadquartersCnpj(a)) return -1;
    if (isHeadquartersCnpj(b)) return 1;
    return a.localeCompare(b);
  });
  existing.branchCount = existing.branchCnpjs.length;

  if (!existing.cnpj || (!isHeadquartersCnpj(existing.cnpj) && isHeadquartersCnpj(normalizedCnpj))) {
    existing.id = toId('company', normalizedCnpj);
    existing.cnpj = normalizedCnpj;
    existing.name = incoming.name.trim() || existing.name;
    existing.role = incoming.role?.trim() || existing.role;
    existing.sourceTitle = incoming.sourceTitle?.trim() || existing.sourceTitle;
    existing.sourceUrl = incoming.sourceUrl?.trim() || existing.sourceUrl;
    existing.snippet = incoming.snippet?.trim() || existing.snippet;
  }
}

function hasGroupContext(company: SocietaryCompanyInput, root: SocietaryRootInput): boolean {
  const rootCnpj = normalizeCnpj(root.cnpj || '');
  const companyRootCnpj = normalizeCnpj(company.rootCnpj || '');
  const rootName = normalizeText(root.name);
  const companyRootName = normalizeText(company.rootCompanyName || '');
  const metadataMatchesRoot = (rootCnpj.length === 14 && companyRootCnpj === rootCnpj)
    || Boolean(rootName && companyRootName && companyRootName === rootName);

  return company.rootContext === true && metadataMatchesRoot;
}

function hasEnoughEvidence(company: SocietaryCompanyInput, root: SocietaryRootInput): boolean {
  const confidence = company.confidence || 'weak';
  const hasSource = Boolean(company.sourceUrl || company.sourceTitle || company.snippet);
  const hasCnpj = normalizeCnpj(company.cnpj || '').length === 14;
  const evidenceType = company.evidenceType || 'web';

  if (!hasGroupContext(company, root)) return false;
  if (hasCnpj && hasSource) return true;
  if (confidence === 'official' || confidence === 'strong') return hasSource;
  if ((evidenceType === 'trade' || evidenceType === 'institutional') && company.sourceUrl && company.snippet) {
    return true;
  }

  return false;
}

function buildBadges(company: SocietaryCompany): SocietaryBadge[] {
  const badges = new Set<SocietaryBadge>(['estimado']);
  const role = normalizeText(company.role || company.name);
  const country = (company.country || 'BR').toUpperCase();

  if (company.partnerIds.length > 1) badges.add('empresa em comum');
  if (country && country !== 'BR') badges.add('internacional');
  if (/colombia|colômbia/i.test(company.name)) badges.add('internacional');
  if (role.includes('holding') || role.includes('participa') || role.includes('invest')) badges.add('holding');
  if (company.evidenceType === 'registry' || company.evidenceType === 'qsa') badges.add('oficial');
  if (company.confidence === 'weak' || company.confidence === 'medium') badges.add('validar');

  return Array.from(badges);
}

export function buildSocietaryGraph(input: BuildSocietaryGraphInput, geminiCnpjs?: SocietaryCompanyInput[]): SocietaryGraph {
  const partners: SocietaryPartner[] = input.partners
    .filter(partner => partner.name.trim())
    .map(partner => ({
      id: partner.id || toId('partner', partner.name),
      name: partner.name.trim(),
      role: partner.role?.trim() || undefined,
      document: partner.document?.trim() || undefined,
      sourceTitle: partner.sourceTitle?.trim() || undefined,
      confidence: partner.confidence || 'official',
    }));

  const partnerByName = new Map<string, SocietaryPartner>();
  for (const partner of partners) {
    partnerByName.set(normalizeText(partner.name), partner);
  }

  const rejectedCompanies: RejectedSocietaryCompany[] = [];
  const companiesByKey = new Map<string, SocietaryCompany>();

  for (const company of input.companies || []) {
    const partner = partnerByName.get(normalizeText(company.partnerName));
    if (!partner) {
      rejectedCompanies.push({ input: company, reason: 'Socio nao encontrado para conectar empresa.' });
      continue;
    }

    if (!hasGroupContext(company, input.root)) {
      rejectedCompanies.push({ input: company, reason: 'Possivel homonimo sem contexto suficiente do grupo.' });
      continue;
    }

    if (!hasEnoughEvidence(company, input.root)) {
      rejectedCompanies.push({ input: company, reason: 'Possivel homonimo sem fonte suficiente.' });
      continue;
    }

    const key = buildCompanyKey(company);
    const existing = companiesByKey.get(key);
    if (existing) {
      if (!existing.partnerIds.includes(partner.id)) existing.partnerIds.push(partner.id);
      mergeBranchData(existing, company);
      existing.badges = buildBadges(existing);
      continue;
    }

    const normalizedCnpj = normalizeCnpj(company.cnpj || '');
    const created: SocietaryCompany = {
      id: toId('company', normalizedCnpj || `${company.name}-${company.country || 'BR'}`),
      name: company.name.trim(),
      cnpj: normalizedCnpj.length === 14 ? normalizedCnpj : undefined,
      branchCount: normalizedCnpj.length === 14 ? 1 : undefined,
      branchCnpjs: normalizedCnpj.length === 14 ? [normalizedCnpj] : undefined,
      country: company.country?.trim().toUpperCase() || undefined,
      role: company.role?.trim() || undefined,
      sourceTitle: company.sourceTitle?.trim() || undefined,
      sourceUrl: company.sourceUrl?.trim() || undefined,
      snippet: company.snippet?.trim() || undefined,
      confidence: company.confidence || 'weak',
      evidenceType: company.evidenceType || 'web',
      rootContext: hasGroupContext(company, input.root),
      rootCompanyName: company.rootCompanyName?.trim() || undefined,
      rootCnpj: normalizeCnpj(company.rootCnpj || '') || undefined,
      partnerIds: [partner.id],
      badges: [],
    };
    created.badges = buildBadges(created);
    companiesByKey.set(key, created);
  }

  if (geminiCnpjs) {
    for (const geminiCompany of geminiCnpjs) {
      if (!geminiCompany.name.trim()) continue;

      const normalizedCnpj = normalizeCnpj(geminiCompany.cnpj || '');
      const hasValidCnpj = normalizedCnpj.length === 14;
      const partner = partnerByName.get(normalizeText(geminiCompany.partnerName || ''));

      let merged = false;
      if (hasValidCnpj) {
        const existingKey = buildCompanyKey(geminiCompany);
        const existing = companiesByKey.get(existingKey);
        if (existing) {
          if (!isHeadquartersCnpj(existing.cnpj) || isHeadquartersCnpj(normalizedCnpj)) {
            existing.name = geminiCompany.name.trim();
          }
          existing.role = geminiCompany.role || existing.role;
          existing.sourceTitle = geminiCompany.sourceTitle || existing.sourceTitle;
          existing.confidence = 'strong';
          existing.evidenceType = 'qsa';
          mergeBranchData(existing, geminiCompany);
          if (partner && !existing.partnerIds.includes(partner.id)) existing.partnerIds.push(partner.id);
          if (!partner && !existing.partnerIds.length) existing.rootLinked = true;
          existing.badges = buildBadges(existing);
          merged = true;
        }
      }

      if (!merged) {
        const partnerIds: string[] = partner ? [partner.id] : [];
        const created: SocietaryCompany = {
          id: toId('company', hasValidCnpj ? normalizedCnpj : geminiCompany.name),
          name: geminiCompany.name.trim(),
          cnpj: hasValidCnpj ? normalizedCnpj : undefined,
          branchCount: hasValidCnpj ? 1 : undefined,
          branchCnpjs: hasValidCnpj ? [normalizedCnpj] : undefined,
          country: geminiCompany.country?.trim().toUpperCase() || undefined,
          role: geminiCompany.role?.trim() || undefined,
          sourceTitle: geminiCompany.sourceTitle?.trim() || undefined,
          sourceUrl: geminiCompany.sourceUrl?.trim() || undefined,
          snippet: geminiCompany.snippet?.trim() || undefined,
          confidence: hasValidCnpj ? 'strong' : 'weak',
          evidenceType: hasValidCnpj ? 'qsa' : 'web',
          rootContext: true,
          partnerIds,
          rootLinked: partnerIds.length === 0,
          badges: [],
        };
        created.badges = buildBadges(created);
        companiesByKey.set(buildCompanyKey(geminiCompany), created);
      }
    }
  }

  const rootCnpj = normalizeCnpj(input.root.cnpj || '');
  return {
    root: {
      id: 'root',
      name: input.root.name.trim(),
      cnpj: rootCnpj.length === 14 ? rootCnpj : undefined,
    },
    partners,
    companies: Array.from(companiesByKey.values()),
    rejectedCompanies,
  };
}

function partnerLabel(partner: SocietaryPartner): string {
  return [
    `<b>${escapeMermaidLabel(partner.name)}</b>`,
    partner.role ? escapeMermaidLabel(partner.role) : '',
  ].filter(Boolean).join('<br/>');
}

export function describeSocietaryCompanyType(company: SocietaryCompany): string {
  const role = normalizeText(`${company.role || ''} ${company.name}`);
  const country = (company.country || 'BR').toUpperCase();
  if ((company.branchCount || 0) > 1) {
    return isHeadquartersCnpj(company.cnpj)
      ? `Matriz + ${(company.branchCount || 1) - 1} filiais`
      : `${company.branchCount} filiais consolidadas`;
  }
  if (company.cnpj && !isHeadquartersCnpj(company.cnpj)) return 'Filial operacional';
  if (country && country !== 'BR') return 'Empresa internacional';
  if (role.includes('holding') || role.includes('participa') || role.includes('invest')) return 'Holding / participacoes';
  if (role.includes('filial')) return 'Filial operacional';
  if (role.includes('logistica') || role.includes('transp')) return 'Logistica';
  if (role.includes('bio') || role.includes('industrial')) return 'Industrial';
  if (company.evidenceType === 'trade') return 'Comercio exterior';
  if (company.evidenceType === 'qsa' || company.evidenceType === 'registry') return 'Empresa vinculada no QSA';
  return 'Empresa relacionada';
}

function partnerSummary(company: SocietaryCompany, partnersById: Map<string, SocietaryPartner>): string {
  const partners = company.partnerIds
    .map(partnerId => partnersById.get(partnerId))
    .filter((partner): partner is SocietaryPartner => Boolean(partner));
  if (partners.length === 0) return company.rootLinked ? 'Ligada ao grupo raiz' : '';
  return partners
    .slice(0, 2)
    .map(partner => [partner.name, partner.role].filter(Boolean).join(' · '))
    .join(' / ');
}

function companyLabel(company: SocietaryCompany, partnersById: Map<string, SocietaryPartner>): string {
  const ownerLine = partnerSummary(company, partnersById);
  const branchLine = (company.branchCount || 0) > 1
    ? `CNPJs do mesmo radical: ${company.branchCount}`
    : '';
  return [
    `<b>${escapeMermaidLabel(company.name)}</b>`,
    company.cnpj ? `CNPJ ${formatSocietaryCnpj(company.cnpj)}` : company.country ? `País ${escapeMermaidLabel(company.country)}` : '',
    branchLine,
    ownerLine ? escapeMermaidLabel(ownerLine) : '',
    escapeMermaidLabel(describeSocietaryCompanyType(company)),
  ].filter(Boolean).join('<br/>');
}

export function buildSocietaryMermaid(graph: SocietaryGraph, options: BuildSocietaryMermaidOptions = {}): string {
  const selectedPartner = options.selectedPartnerId
    ? graph.partners.find(partner => partner.id === options.selectedPartnerId)
    : undefined;
  const partners = selectedPartner ? [selectedPartner] : graph.partners;
  const allPartnerIds = graph.partners.map(partner => partner.id);
  const partnerColorById = new Map(
    allPartnerIds.map((partnerId, index) => [partnerId, PARTNER_EDGE_COLORS[index % PARTNER_EDGE_COLORS.length]]),
  );
  const partnersById = new Map(graph.partners.map(partner => [partner.id, partner]));
  const visiblePartnerIds = new Set(partners.map(partner => partner.id));
  const visibleCompanies = graph.companies.filter(company =>
    company.rootLinked || company.partnerIds.some(partnerId => visiblePartnerIds.has(partnerId)),
  );
  const lines = [
    'graph LR',
    '  classDef root fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e3a8a;',
    '  classDef partner fill:#f5f3ff,stroke:#7c3aed,stroke-width:1.5px,color:#3b0764;',
    '  classDef selected fill:#ede9fe,stroke:#6d28d9,stroke-width:2.5px,color:#2e1065;',
    '  classDef company fill:#ecfdf5,stroke:#10b981,stroke-width:2px,color:#064e3b;',
    '  classDef international fill:#eef2ff,stroke:#4f46e5,stroke-width:2.5px,color:#312e81;',
    '  classDef evidence fill:#f8fafc,stroke:#94a3b8,stroke-dasharray:5 5,color:#475569;',
    '',
    `  Root["<b>${escapeMermaidLabel(graph.root.name)}</b>${graph.root.cnpj ? `<br/>CNPJ ${formatSocietaryCnpj(graph.root.cnpj)}` : ''}<br/>Empresa raiz"]`,
  ];
  const edgeStyles: string[] = [];
  let edgeIndex = 0;

  const addEdge = (line: string, color?: string) => {
    lines.push(line);
    edgeStyles.push(color ? `  linkStyle ${edgeIndex} stroke:${color},stroke-width:2.5px;` : '');
    edgeIndex += 1;
  };

  for (const partner of partners) {
    lines.push(`  ${partner.id}["${partnerLabel(partner)}"]`);
    addEdge(`  Root --> ${partner.id}`, partnerColorById.get(partner.id));
  }

  for (const company of visibleCompanies) {
    lines.push(`  ${company.id}["${companyLabel(company, partnersById)}"]`);
    if (company.rootLinked) addEdge(`  Root --> ${company.id}`, '#64748b');
    for (const partnerId of company.partnerIds) {
      if (visiblePartnerIds.has(partnerId)) addEdge(`  ${partnerId} --> ${company.id}`, partnerColorById.get(partnerId));
    }
  }

  lines.push('', '  class Root root;');
  for (const partner of partners) {
    lines.push(`  class ${partner.id} ${selectedPartner && partner.id === selectedPartner.id ? 'selected' : 'partner'};`);
  }
  for (const company of visibleCompanies) {
    lines.push(`  class ${company.id} ${company.badges.includes('internacional') ? 'international' : 'company'};`);
  }
  const nonEmptyEdgeStyles = edgeStyles.filter(Boolean);
  if (nonEmptyEdgeStyles.length > 0) {
    lines.push('', ...nonEmptyEdgeStyles);
  }

  return lines.join('\n');
}
