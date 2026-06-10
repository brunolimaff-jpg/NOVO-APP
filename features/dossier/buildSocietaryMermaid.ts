import { isValidCnpj, normalizeCnpj } from '../../utils/cnpj';
import type {
  BuildSocietaryMermaidOptions,
  SocietaryCompany,
  SocietaryGraph,
  SocietaryPartner,
} from './societaryGraph.types';

// ── Constantes ───────────────────────────────────────────

const SOCIETARY_LABEL_SOCIO_ADMIN = 'Sócio admin';
const PARTNER_EDGE_COLORS = ['#7c3aed', '#0891b2', '#dc2626', '#ca8a04', '#16a34a', '#db2777', '#4f46e5', '#ea580c'];
export const SOCIETARY_MERMAID_COMPANIES_PER_ROW = 2;
const SOCIETARY_MERMAID_VERTICAL_THRESHOLD = 6;

// ── Utilitários compartilhados (duplicados para evitar circular com societaryGraph.ts) ──

function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isHeadquartersCnpj(cnpj?: string): boolean {
  return Boolean(cnpj && cnpj.slice(8, 12) === '0001');
}

function formatSocietaryCnpj(value?: string | null): string {
  const cnpj = normalizeCnpj(value || '');
  if (cnpj.length !== 14) return value || '';
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function countPartnerCompanies(graph: SocietaryGraph, partnerId: string): number {
  return graph.companies.filter(c => c.partnerIds.includes(partnerId)).length;
}

// ── Helpers de renderização Mermaid ──────────────────────

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [Array.from(items)];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function escapeMermaidLabel(value: string): string {
  return (value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  name = name.replace(/\bAgropecuaria\b/gi, 'Agropecuária').replace(/\bLtda\b/g, 'LTDA');
  return name;
}

function firstGivenName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || fullName.trim();
  return titleCaseName(first);
}

// ── Labels Mermaid ───────────────────────────────────────

function partnerLabel(partner: SocietaryPartner, cnpjCount?: number): string {
  const countLine = cnpjCount != null && cnpjCount > 0 ? `${cnpjCount} ${cnpjCount === 1 ? 'CNPJ' : 'CNPJs'}` : '';
  return [
    `<b>${escapeMermaidLabel(firstGivenName(partner.name))}</b>`,
    partner.role ? escapeMermaidLabel(partner.role) : '',
    countLine,
  ]
    .filter(Boolean)
    .join('<br/>');
}

function companyLabelCompact(company: SocietaryCompany): string {
  const displayName = formatCompanyDisplayName(company.name);
  const shortName = displayName.length > 42 ? `${displayName.slice(0, 39).trimEnd()}…` : displayName;
  const cnpjLine = company.rawCnpjLabel
    ? `CNPJ ${escapeMermaidLabel(company.rawCnpjLabel)}`
    : company.cnpj
      ? `CNPJ ${formatSocietaryCnpj(company.cnpj)}`
      : company.country
        ? `País ${escapeMermaidLabel(company.country)}`
        : '';
  return [`<b>${escapeMermaidLabel(shortName)}</b>`, cnpjLine].filter(Boolean).join('<br/>');
}

function partnerAdminRoleLabel(company: SocietaryCompany): string {
  const role = normalizeText(company.role || '');
  if (role.includes('administrador')) return 'Sócio-Administrador';
  if (role.includes('socio')) return 'Sócio';
  return SOCIETARY_LABEL_SOCIO_ADMIN;
}

// ── Função pública: describeSocietaryCompanyType ──────────

export function describeSocietaryCompanyType(company: SocietaryCompany): string {
  if (company.relationshipScope === 'unconfirmed' || company.validationStatus === 'pending')
    return 'Validação pendente';
  if (company.relationshipScope === 'partner_other_cnpj') return partnerAdminRoleLabel(company);
  const role = normalizeText(`${company.role || ''} ${company.name}`);
  const country = (company.country || 'BR').toUpperCase();
  if ((company.branchCount || 0) > 1) {
    return isHeadquartersCnpj(company.cnpj)
      ? `Matriz + ${(company.branchCount || 1) - 1} filiais`
      : `${company.branchCount} filiais consolidadas`;
  }
  if (country && country !== 'BR') return 'Empresa internacional';
  if (
    role.includes('holding') ||
    role.includes('holdings') ||
    role.includes('participa') ||
    role.includes('invest') ||
    role.includes('6462') ||
    role.includes('64 62')
  )
    return 'Holding';
  if (role.includes('cultivo') || role.includes('soja') || role.includes('algodao') || role.includes('milho'))
    return 'Produção agrícola';
  if (role.includes('semente')) return 'Sementes';
  if (role.includes('armaz') || role.includes('armazen')) return 'Armazenagem';
  if (role.includes('trading') || role.includes('trade') || role.includes('exporta') || role.includes('importa'))
    return 'Trading';
  if (role.includes('logistica') || role.includes('transp')) return 'Logistica';
  if (role.includes('bio') || role.includes('industrial')) return 'Industrial';
  if (company.cnpj && !isHeadquartersCnpj(company.cnpj)) return 'Filial operacional';
  if (role.includes('filial')) return 'Filial operacional';
  return 'Empresa relacionada';
}

// ── Labels de arestas Mermaid ────────────────────────────

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
  const cnpjLine = company.rawCnpjLabel
    ? `CNPJ ${escapeMermaidLabel(company.rawCnpjLabel)}`
    : company.cnpj
      ? `CNPJ ${formatSocietaryCnpj(company.cnpj)}`
      : company.country
        ? `País ${escapeMermaidLabel(company.country)}`
        : '';
  return [
    `<b>${escapeMermaidLabel(formatCompanyDisplayName(company.name))}</b>`,
    cnpjLine,
    ownerLine ? escapeMermaidLabel(ownerLine) : '',
    escapeMermaidLabel(describeSocietaryCompanyType(company)),
  ]
    .filter(Boolean)
    .join('<br/>');
}

function edgeLabel(value: string): string {
  return escapeMermaidLabel(value).replace(/\|/g, '/');
}

function rootToPartnerEdgeLabel(partner: SocietaryPartner): string | null {
  if (partner.confidence === 'official') return null;
  return 'Sócio';
}

function rootToCompanyEdgeLabel(company: SocietaryCompany, root: SocietaryGraph['root']): string {
  const companyCnpj = normalizeCnpj(company.cnpj || '');
  const rootCnpj = normalizeCnpj(root.cnpj || '');
  if ((company.branchCount || 0) > 1) return 'Mesmo radical CNPJ';
  if (companyCnpj && rootCnpj && companyCnpj.slice(0, 8) === rootCnpj.slice(0, 8)) return 'Mesmo radical CNPJ';
  if (company.evidenceType === 'qsa' || company.evidenceType === 'registry') return 'Empresa do grupo';
  if (company.cnpj) return 'CNPJ relacionado';
  return 'Vínculo ao grupo';
}

function partnerToCompanyEdgeLabel(company: SocietaryCompany, partner?: SocietaryPartner): string | null {
  if (company.relationshipScope === 'unconfirmed' || company.validationStatus === 'pending') return 'Validar CNPJ';
  if (company.relationshipScope === 'partner_other_cnpj') return null;
  const role = partner?.role || company.role || '';
  const normalizedRole = normalizeText(role);
  if (normalizedRole.includes('administrador')) return null;
  if (/socio|socia/.test(normalizedRole)) return 'Sócio no CNPJ';
  if (company.evidenceType === 'qsa') return null;
  return describeSocietaryCompanyType(company);
}

// ── buildSocietaryMermaid ────────────────────────────────

export function buildSocietaryMermaid(graph: SocietaryGraph, options: BuildSocietaryMermaidOptions = {}): string {
  const selectedPartner = options.selectedPartnerId
    ? graph.partners.find(partner => partner.id === options.selectedPartnerId)
    : undefined;
  const isOverview = options.overviewOnly ?? (!selectedPartner && graph.partners.length > 1);
  const partners = selectedPartner ? [selectedPartner] : graph.partners;
  const allPartnerIds = graph.partners.map(partner => partner.id);
  const partnerColorById = new Map(
    allPartnerIds.map((partnerId, index) => [partnerId, PARTNER_EDGE_COLORS[index % PARTNER_EDGE_COLORS.length]]),
  );
  const partnersById = new Map(graph.partners.map(partner => [partner.id, partner]));
  const visiblePartnerIds = new Set(partners.map(partner => partner.id));
  const visibleCompanies = isOverview
    ? []
    : graph.companies.filter(company => {
        if (!selectedPartner)
          return company.rootLinked || company.partnerIds.some(partnerId => visiblePartnerIds.has(partnerId));
        return company.partnerIds.some(partnerId => visiblePartnerIds.has(partnerId));
      });
  const useMultiRowLayout =
    !isOverview &&
    visibleCompanies.length > SOCIETARY_MERMAID_COMPANIES_PER_ROW &&
    visibleCompanies.length <= SOCIETARY_MERMAID_VERTICAL_THRESHOLD;
  const useVerticalLayout = !isOverview && visibleCompanies.length > SOCIETARY_MERMAID_VERTICAL_THRESHOLD;
  const graphDirection = isOverview || useMultiRowLayout || useVerticalLayout ? 'graph TD' : 'graph LR';
  const lines = [
    graphDirection,
    '  classDef root fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e3a8a;',
    '  classDef partner fill:#f5f3ff,stroke:#7c3aed,stroke-width:1.5px,color:#3b0764;',
    '  classDef selected fill:#ede9fe,stroke:#6d28d9,stroke-width:2.5px,color:#2e1065;',
    '  classDef company fill:#ecfdf5,stroke:#10b981,stroke-width:2px,color:#064e3b;',
    '  classDef socioAdmin fill:#fff7ed,stroke:#f59e0b,stroke-width:2px,stroke-dasharray:4 4,color:#7c2d12;',
    '  classDef international fill:#eef2ff,stroke:#4f46e5,stroke-width:2.5px,color:#312e81;',
    '  classDef evidence fill:#f8fafc,stroke:#94a3b8,stroke-dasharray:5 5,color:#475569;',
    '',
    `  Root["<b>${escapeMermaidLabel(graph.root.name)}</b>${graph.root.cnpj ? `<br/>CNPJ ${formatSocietaryCnpj(graph.root.cnpj)}` : ''}<br/>Empresa raiz"]`,
  ];
  const edgeStyles: string[] = [];
  let edgeIndex = 0;

  const addEdge = (from: string, to: string, label: string | null, color?: string) => {
    if (label) {
      lines.push(`  ${from} -- ${edgeLabel(label)} --> ${to}`);
    } else {
      lines.push(`  ${from} --> ${to}`);
    }
    edgeStyles.push(color ? `  linkStyle ${edgeIndex} stroke:${color},stroke-width:2.5px;` : '');
    edgeIndex += 1;
  };

  for (const partner of partners) {
    const cnpjCount = isOverview ? countPartnerCompanies(graph, partner.id) : undefined;
    lines.push(`  ${partner.id}["${partnerLabel(partner, cnpjCount)}"]`);
    addEdge('Root', partner.id, rootToPartnerEdgeLabel(partner), partnerColorById.get(partner.id));
  }

  const appendCompanyEdges = (company: SocietaryCompany) => {
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
  };

  if (useVerticalLayout) {
    for (const company of visibleCompanies) {
      const fullName = formatCompanyDisplayName(company.name);
      const cnpjText = company.cnpj ? ` (${formatSocietaryCnpj(company.cnpj)})` : '';
      lines.push(`  ${company.id}["${companyLabelCompact(company)}"]`);
      lines.push(`  %% title: ${fullName}${cnpjText}`);
      appendCompanyEdges(company);
    }
  } else if (useMultiRowLayout) {
    const rows = chunkArray(visibleCompanies, SOCIETARY_MERMAID_COMPANIES_PER_ROW);
    rows.forEach((rowCompanies, rowIndex) => {
      lines.push(`  subgraph sg_row_${rowIndex}[" "]`);
      lines.push('    direction LR');
      for (const company of rowCompanies) {
        lines.push(`    ${company.id}["${companyLabelCompact(company)}"]`);
      }
      lines.push('  end');
    });
    for (const company of visibleCompanies) {
      appendCompanyEdges(company);
    }
  } else {
    for (const company of visibleCompanies) {
      lines.push(`  ${company.id}["${companyLabelCompact(company)}"]`);
      appendCompanyEdges(company);
    }
  }

  lines.push('', '  class Root root;');
  for (const partner of partners) {
    lines.push(
      `  class ${partner.id} ${selectedPartner && partner.id === selectedPartner.id ? 'selected' : 'partner'};`,
    );
  }
  for (const company of visibleCompanies) {
    const className =
      company.relationshipScope === 'unconfirmed' || company.validationStatus === 'pending'
        ? 'evidence'
        : company.relationshipScope === 'partner_other_cnpj'
          ? 'socioAdmin'
          : company.badges.includes('internacional')
            ? 'international'
            : 'company';
    lines.push(`  class ${company.id} ${className};`);
  }
  const nonEmptyEdgeStyles = edgeStyles.filter(Boolean);
  if (nonEmptyEdgeStyles.length > 0) {
    lines.push('', ...nonEmptyEdgeStyles);
  }

  return lines.join('\n');
}
