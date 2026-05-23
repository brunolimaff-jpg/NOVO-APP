import { normalizeCnpj } from '../../utils/cnpj';

export type SocietaryConfidence = 'official' | 'strong' | 'medium' | 'weak';
export type SocietaryEvidenceType = 'qsa' | 'registry' | 'web' | 'trade' | 'institutional';
export type SocietaryBadge =
  | 'empresa em comum'
  | 'holding'
  | 'operação'
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
  selectedPartnerId?: string;
}

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

function buildCompanyKey(company: SocietaryCompanyInput): string {
  const cnpj = normalizeCnpj(company.cnpj || '');
  if (cnpj.length === 14) return `cnpj:${cnpj}`;
  return `name:${normalizeText(company.name)}:${(company.country || 'BR').trim().toUpperCase()}`;
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
  if (company.evidenceType === 'registry' || company.evidenceType === 'qsa') badges.add('operação');
  if (company.confidence === 'weak' || company.confidence === 'medium') badges.add('validar');

  return Array.from(badges);
}

export function buildSocietaryGraph(input: BuildSocietaryGraphInput): SocietaryGraph {
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
      existing.badges = buildBadges(existing);
      continue;
    }

    const normalizedCnpj = normalizeCnpj(company.cnpj || '');
    const created: SocietaryCompany = {
      id: toId('company', normalizedCnpj || `${company.name}-${company.country || 'BR'}`),
      name: company.name.trim(),
      cnpj: normalizedCnpj.length === 14 ? normalizedCnpj : undefined,
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

function companyLabel(company: SocietaryCompany): string {
  const badges = company.badges.length > 0 ? company.badges.join(' · ') : 'CLASSIFICAÇÃO ESTIMADA';
  return [
    `<b>${escapeMermaidLabel(company.name)}</b>`,
    company.cnpj ? `CNPJ ${company.cnpj}` : company.country ? `País ${escapeMermaidLabel(company.country)}` : '',
    escapeMermaidLabel(badges),
  ].filter(Boolean).join('<br/>');
}

export function buildSocietaryMermaid(graph: SocietaryGraph, options: BuildSocietaryMermaidOptions = {}): string {
  const selectedPartner = graph.partners.find(partner => partner.id === options.selectedPartnerId);
  const partners = selectedPartner ? [selectedPartner] : graph.partners;
  const visiblePartnerIds = new Set(partners.map(partner => partner.id));
  const visibleCompanies = graph.companies.filter(company =>
    company.partnerIds.some(partnerId => visiblePartnerIds.has(partnerId)),
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
    `  Root["<b>${escapeMermaidLabel(graph.root.name)}</b>${graph.root.cnpj ? `<br/>CNPJ ${graph.root.cnpj}` : ''}<br/>CLASSIFICAÇÃO ESTIMADA"]`,
  ];

  for (const partner of partners) {
    lines.push(`  ${partner.id}["${partnerLabel(partner)}"]`);
    lines.push(`  Root --> ${partner.id}`);
  }

  for (const company of visibleCompanies) {
    lines.push(`  ${company.id}["${companyLabel(company)}"]`);
    for (const partnerId of company.partnerIds) {
      if (visiblePartnerIds.has(partnerId)) lines.push(`  ${partnerId} --> ${company.id}`);
    }
  }

  lines.push('', '  class Root root;');
  for (const partner of partners) {
    lines.push(`  class ${partner.id} ${selectedPartner && partner.id === selectedPartner.id ? 'selected' : 'partner'};`);
  }
  for (const company of visibleCompanies) {
    lines.push(`  class ${company.id} ${company.badges.includes('internacional') ? 'international' : 'company'};`);
  }

  return lines.join('\n');
}
