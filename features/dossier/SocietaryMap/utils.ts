// features/dossier/SocietaryMap/utils.ts
// Funções utilitárias e tipos extraídos de SocietaryMap.tsx.

import {
  SOCIETARY_LABEL_SOCIO_ADMIN,
  type SocietaryCompany,
  type SocietaryCompanyInput,
  type SocietaryGraph,
  type SocietaryPartner,
  type SocietaryPartnerInput,
} from '../societaryGraph';

export type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

// Batch de consultas por lote e timeout por cliente de busca societária.
// Consumidos por features/dossier/waterfall-socio-search.ts (valores canônicos
// históricos preservados — removidos acidentalmente no merge limpo 6b0987ec).
export const SOCIO_SEARCH_BATCH_SIZE = 2;
export const SOCIO_SEARCH_CLIENT_TIMEOUT_MS = 52_000;

export interface SocioSearchResponse {
  companies?: SocietaryCompanyInput[];
  rejected?: RejectedSocioSearchResult[];
  degraded?: boolean;
  cached?: boolean;
  diagnostics?: {
    truncated?: boolean;
    totalCnpjsFound?: number;
    truncatedReason?: string;
    [key: string]: unknown;
  };
  trace?: Record<string, unknown>;
}

export interface RejectedSocioSearchResult {
  sourceTitle?: string;
  sourceUrl?: string;
  snippet?: string;
  reason: string;
}

export interface RootData {
  cnpj?: string;
  name: string;
  partners: SocietaryPartnerInput[];
}

export function normalizePartnerKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function firstGivenName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || fullName.trim();
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function collectPartnerCompanies(
  companiesByPartner: Record<string, SocietaryCompanyInput[]>,
): SocietaryCompanyInput[] {
  return Object.values(companiesByPartner).flat();
}

export function countCompaniesByScope(companies: SocietaryCompany[]): Record<string, number> {
  return companies.reduce<Record<string, number>>((acc, company) => {
    const scope = company.relationshipScope || 'group_link';
    acc[scope] = (acc[scope] || 0) + 1;
    return acc;
  }, {});
}

export function describeEvidencePartner(
  company: SocietaryCompany,
  partnersById: Map<string, SocietaryPartner>,
): string {
  const partners = company.partnerIds
    .map(partnerId => partnersById.get(partnerId))
    .filter((partner): partner is SocietaryPartner => Boolean(partner));

  if (partners.length === 0) return 'Sem sócio identificado';

  return partners.map(partner => [partner.name, partner.role].filter(Boolean).join(' - ')).join(' / ');
}

export function describeRelationshipScope(company: SocietaryCompany): string {
  if (company.relationshipScope === 'partner_other_cnpj') return SOCIETARY_LABEL_SOCIO_ADMIN;
  if (company.relationshipScope === 'unconfirmed' || company.validationStatus === 'pending')
    return 'Validação pendente';
  return 'Empresa do grupo';
}
