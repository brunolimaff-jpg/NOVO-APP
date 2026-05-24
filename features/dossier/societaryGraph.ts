import { normalizeCnpj } from '../../utils/cnpj';

export type SocietaryConfidence = 'official' | 'strong' | 'medium' | 'weak';
export type SocietaryEvidenceType = 'qsa' | 'registry' | 'web' | 'trade' | 'institutional';
export type SocietaryRelationshipScope = 'group_link' | 'partner_other_cnpj' | 'unconfirmed';
export type SocietaryBadge =
  | 'empresa em comum'
  | 'holding'
  | 'oficial'
  | 'internacional'
  | 'estimado'
  | 'validar'
  | 'outro CNPJ do sócio'
  | 'validar grupo';

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
  relationshipScope?: SocietaryRelationshipScope;
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
  relationshipScope: SocietaryRelationshipScope;
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

function titleCaseName(value: string): string {
  const acronyms = new Set(['LTDA', 'S/A', 'S.A.', 'S.A.S.', 'SAS']);
  const particles = new Set(['e', 'de', 'da', 'do', 'das', 'dos']);
  return value
    .toLowerCase()
    .split(/(\s+|&|\/|-)/)
    .map(part => {
      const upper = part.toUpperCase();
      if (acronyms.has(upper)) return upper;
      if (particles.has(part)) return part;
      if (!/[a-zà-ÿ]/i.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

function formatCompanyDisplayName(value: string): string {
  let name = value.trim();
  if (name === name.toUpperCase()) name = titleCaseName(name);
  name = name
    .replace(/\bAgropecuaria\b/gi, 'Agropecuária')
    .replace(/\bLtda\b/g, 'LTDA');
  return name;
}

function firstGivenName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || fullName.trim();
  return titleCaseName(first);
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

function confidenceRank(confidence?: SocietaryConfidence): number {
  switch (confidence) {
    case 'official':
      return 4;
    case 'strong':
      return 3;
    case 'medium':
      return 2;
    case 'weak':
    default:
      return 1;
  }
}

function evidenceTypeRank(evidenceType?: SocietaryEvidenceType): number {
  switch (evidenceType) {
    case 'qsa':
      return 5;
    case 'registry':
      return 4;
    case 'institutional':
      return 3;
    case 'trade':
      return 2;
    case 'web':
    default:
      return 1;
  }
}

function relationshipScopeRank(scope?: SocietaryRelationshipScope): number {
  switch (scope) {
    case 'group_link':
      return 3;
    case 'partner_other_cnpj':
      return 2;
    case 'unconfirmed':
    default:
      return 1;
  }
}

function companyEvidenceRank(company: Pick<SocietaryCompanyInput, 'confidence' | 'evidenceType' | 'relationshipScope' | 'rootContext'>): number {
  return confidenceRank(company.confidence) * 1000
    + evidenceTypeRank(company.evidenceType) * 100
    + relationshipScopeRank(company.relationshipScope) * 10
    + (company.rootContext ? 1 : 0);
}

function shouldPromoteEvidence(existing: SocietaryCompany, incoming: SocietaryCompanyInput): boolean {
  return companyEvidenceRank(incoming) > companyEvidenceRank(existing);
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
  const relationshipScope = company.relationshipScope || 'group_link';

  if (relationshipScope === 'partner_other_cnpj') {
    return hasCnpj && hasSource && confidence !== 'weak';
  }
  if (!hasGroupContext(company, root)) return false;
  if (hasCnpj && hasSource) return true;
  if (confidence === 'official' || confidence === 'strong') return hasSource;
  if (evidenceType === 'institutional' && company.sourceUrl && company.snippet) {
    return true;
  }

  return false;
}

function buildBadges(company: SocietaryCompany): SocietaryBadge[] {
  const badges = new Set<SocietaryBadge>(['estimado']);
  const role = normalizeText(company.role || company.name);
  const country = (company.country || 'BR').toUpperCase();

  if (company.partnerIds.length > 1) badges.add('empresa em comum');
  if (company.relationshipScope === 'partner_other_cnpj') {
    badges.add('outro CNPJ do sócio');
    badges.add('validar grupo');
  }
  if (country && country !== 'BR') badges.add('internacional');
  if (/colombia|colômbia/i.test(company.name)) badges.add('internacional');
  if (role.includes('holding') || role.includes('participa') || role.includes('invest')) badges.add('holding');
  if (
    (company.evidenceType === 'registry' || company.evidenceType === 'qsa')
    && (
      company.relationshipScope !== 'partner_other_cnpj'
      || (company.confidence === 'strong' && company.evidenceType === 'qsa')
    )
  ) badges.add('oficial');
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
    const normalizedPartnerName = normalizeText(company.partnerName);
    const partner = partnerByName.get(normalizedPartnerName);
    if (!partner && normalizedPartnerName) {
      rejectedCompanies.push({ input: company, reason: 'Socio nao encontrado para conectar empresa.' });
      continue;
    }

    const relationshipScope = company.relationshipScope || 'group_link';

    if (relationshipScope !== 'partner_other_cnpj' && !hasGroupContext(company, input.root)) {
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
      if (partner && !existing.partnerIds.includes(partner.id)) existing.partnerIds.push(partner.id);
      if (!partner) existing.rootLinked = true;
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
      relationshipScope,
      rootContext: hasGroupContext(company, input.root),
      rootCompanyName: company.rootCompanyName?.trim() || undefined,
      rootCnpj: normalizeCnpj(company.rootCnpj || '') || undefined,
      partnerIds: partner ? [partner.id] : [],
      rootLinked: !partner,
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
          if (shouldPromoteEvidence(existing, geminiCompany)) {
            existing.confidence = geminiCompany.confidence || existing.confidence;
            existing.evidenceType = geminiCompany.evidenceType || existing.evidenceType;
            existing.relationshipScope = geminiCompany.relationshipScope || existing.relationshipScope;
            existing.rootContext = geminiCompany.rootContext ?? existing.rootContext;
          }
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
          confidence: geminiCompany.confidence || (hasValidCnpj ? 'strong' : 'weak'),
          evidenceType: geminiCompany.evidenceType || (hasValidCnpj ? 'qsa' : 'web'),
          relationshipScope: geminiCompany.relationshipScope || 'group_link',
          rootContext: geminiCompany.rootContext ?? true,
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
  if (
    role.includes('holding')
    || role.includes('holdings')
    || role.includes('participa')
    || role.includes('invest')
    || role.includes('6462')
    || role.includes('64 62')
  ) return 'Holding';
  if (role.includes('cultivo') || role.includes('soja') || role.includes('algodao') || role.includes('milho')) return 'Produção agrícola';
  if (role.includes('semente')) return 'Sementes';
  if (role.includes('armaz') || role.includes('armazen')) return 'Armazenagem';
  if (role.includes('trading') || role.includes('trade') || role.includes('exporta') || role.includes('importa')) return 'Trading';
  if (role.includes('filial')) return 'Filial operacional';
  if (role.includes('logistica') || role.includes('transp')) return 'Logistica';
  if (role.includes('bio') || role.includes('industrial')) return 'Industrial';
  return 'Empresa relacionada';
}

function partnerSummary(company: SocietaryCompany, partnersById: Map<string, SocietaryPartner>): string {
  const partners = company.partnerIds
    .map(partnerId => partnersById.get(partnerId))
    .filter((partner): partner is SocietaryPartner => Boolean(partner));
  if (partners.length === 0) return '';
  const visiblePartners = [...partners]
    .sort((a, b) => firstGivenName(a.name).localeCompare(firstGivenName(b.name), 'pt-BR'))
    .slice(0, 2);
  const role = visiblePartners.find(partner => partner.role)?.role || 'Sócio';
  return `${role} ${visiblePartners.map(partner => firstGivenName(partner.name)).join('/')}`;
}

function companyLabel(company: SocietaryCompany, partnersById: Map<string, SocietaryPartner>): string {
  const ownerLine = partnerSummary(company, partnersById);
  return [
    `<b>${escapeMermaidLabel(formatCompanyDisplayName(company.name))}</b>`,
    company.cnpj ? `CNPJ ${formatSocietaryCnpj(company.cnpj)}` : company.country ? `País ${escapeMermaidLabel(company.country)}` : '',
    ownerLine ? escapeMermaidLabel(ownerLine) : '',
    escapeMermaidLabel(describeSocietaryCompanyType(company)),
  ].filter(Boolean).join('<br/>');
}

function edgeLabel(value: string): string {
  return escapeMermaidLabel(value).replace(/\|/g, '/');
}

function rootToPartnerEdgeLabel(partner: SocietaryPartner): string {
  if (partner.confidence === 'official') return 'QSA da matriz';
  if (partner.sourceTitle) return 'QSA da empresa raiz';
  return 'Sócio';
}

function rootToCompanyEdgeLabel(company: SocietaryCompany, root: SocietaryGraph['root']): string {
  const companyCnpj = normalizeCnpj(company.cnpj || '');
  const rootCnpj = normalizeCnpj(root.cnpj || '');
  if ((company.branchCount || 0) > 1) return 'Mesmo radical CNPJ';
  if (companyCnpj && rootCnpj && companyCnpj.slice(0, 8) === rootCnpj.slice(0, 8)) return 'Mesmo radical CNPJ';
  if (company.evidenceType === 'qsa' || company.evidenceType === 'registry') return 'Empresa no QSA';
  if (company.cnpj) return 'CNPJ relacionado';
  return 'Vínculo ao grupo';
}

function partnerToCompanyEdgeLabel(company: SocietaryCompany, partner?: SocietaryPartner): string {
  if (company.relationshipScope === 'partner_other_cnpj') return 'Outro CNPJ do sócio';
  const role = partner?.role || company.role || '';
  const normalizedRole = normalizeText(role);
  if (normalizedRole.includes('administrador')) return 'Administra CNPJ';
  if (normalizedRole.includes('socio')) return 'Sócio no CNPJ';
  if (company.evidenceType === 'qsa') return 'QSA do CNPJ';
  return describeSocietaryCompanyType(company);
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
  const visibleCompanies = graph.companies.filter(company => {
    if (!selectedPartner) return company.rootLinked || company.partnerIds.some(partnerId => visiblePartnerIds.has(partnerId));
    return company.partnerIds.some(partnerId => visiblePartnerIds.has(partnerId));
  });
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

  const addEdge = (from: string, to: string, label: string, color?: string) => {
    lines.push(`  ${from} -- ${edgeLabel(label)} --> ${to}`);
    edgeStyles.push(color ? `  linkStyle ${edgeIndex} stroke:${color},stroke-width:2.5px;` : '');
    edgeIndex += 1;
  };

  for (const partner of partners) {
    lines.push(`  ${partner.id}["${partnerLabel(partner)}"]`);
    addEdge('Root', partner.id, rootToPartnerEdgeLabel(partner), partnerColorById.get(partner.id));
  }

  for (const company of visibleCompanies) {
    lines.push(`  ${company.id}["${companyLabel(company, partnersById)}"]`);
    if (company.rootLinked) addEdge('Root', company.id, rootToCompanyEdgeLabel(company, graph.root), '#64748b');
    for (const partnerId of company.partnerIds) {
      if (visiblePartnerIds.has(partnerId)) {
        addEdge(
          partnerId,
          company.id,
          partnerToCompanyEdgeLabel(company, partnersById.get(partnerId)),
          partnerColorById.get(partnerId),
        );
      }
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
