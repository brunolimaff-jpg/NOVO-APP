import { z } from 'zod';
import { normalizeCnpj } from '../../utils/cnpj.js';

// ============================================================
// Tipos
// ============================================================

export type SocioSearchConfidence = 'strong' | 'medium' | 'weak';
export type SocioSearchEvidenceType = 'qsa' | 'registry' | 'web' | 'trade' | 'institutional';
export type SocioSearchSourceDepth = 'search_result' | 'page_extract' | 'cnpj_lookup';
export type SocioSearchCacheSource = 'none' | 'memory' | 'persistent';
export type SocioSearchRelationshipScope = 'group_link' | 'partner_other_cnpj' | 'unconfirmed';
export type SocioSearchSourceProvider = 'cnpj_aberto' | 'consultasocio' | 'web_search';
export type SocioSearchClaimType = 'group_relationship' | 'socio_participation' | 'unconfirmed';
export type SocioSearchRootRelationStatus = 'supported' | 'not_supported' | 'pending';

export interface SocioSearchCompany {
  name: string;
  cnpj?: string;
  rawCnpjLabel?: string;
  country?: string;
  partnerName: string;
  sourceUrl: string;
  sourceTitle: string;
  snippet: string;
  confidence: SocioSearchConfidence;
  evidenceType: SocioSearchEvidenceType;
  relationshipScope: SocioSearchRelationshipScope;
  validationStatus?: 'official' | 'pending' | 'rejected';
  rootContext: boolean;
  rootCompanyName: string;
  rootCnpj?: string;
  role?: string;
  sourceDepth?: SocioSearchSourceDepth;
  sourceProvider?: SocioSearchSourceProvider;
  evidenceBasis?: string;
  claimType?: SocioSearchClaimType;
  rootRelationStatus?: SocioSearchRootRelationStatus;
  operationalThesisAllowed?: boolean;
}

export interface RejectedSocioSearchResult {
  sourceTitle?: string;
  sourceUrl?: string;
  snippet?: string;
  reason: string;
}

export interface CacheEntry {
  expiresAt: number;
  payload: SocioSearchResponse;
}

export interface SocioSearchDiagnostics {
  queriesRun: string[];
  pagesFetched: number;
  cacheSource: SocioSearchCacheSource;
  rejectedCount: number;
  cnpjsEnriched?: number;
  totalCnpjsFound?: number;
  searchNoResultCount?: number;
  searchFailureCount?: number;
  truncated?: boolean;
  truncatedReason?: 'company_limit' | 'deadline';
}

export interface SocioSearchTraceProvider {
  provider: SocioSearchSourceProvider;
  query?: string;
  attempted: boolean;
  returnedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  reason?: string;
}

export interface SocioSearchTraceDiagnostics {
  enabled: true;
  cache?: {
    required: boolean;
    configured: boolean;
    status: 'hit' | 'miss' | 'unavailable';
    source: SocioSearchCacheSource;
  };
  providers: SocioSearchTraceProvider[];
  totals: {
    companiesCount: number;
    rejectedCount: number;
    pagesFetched: number;
    cnpjsEnriched: number;
    cnpjsFound: string[];
    queriesRun: string[];
    degraded: boolean;
    truncated: boolean;
    truncatedReason?: SocioSearchDiagnostics['truncatedReason'];
    searchNoResultCount: number;
    searchFailureCount: number;
  };
  rejectedByReason: Record<string, number>;
}

export interface SocioSearchResponse {
  companies: SocioSearchCompany[];
  rejected: RejectedSocioSearchResult[];
  degraded: boolean;
  cached: boolean;
  diagnostics?: SocioSearchDiagnostics;
  trace?: SocioSearchTraceDiagnostics;
}

export type PersistentCacheRead =
  | { status: 'hit'; payload: SocioSearchResponse }
  | { status: 'miss' }
  | { status: 'unavailable' };

// ============================================================
// Constantes
// ============================================================

export const RequestSchema = z.object({
  socioName: z.string().min(3).max(160),
  rootCompanyName: z.string().min(2).max(180),
  rootCnpj: z.string().optional().default(''),
  trace: z.boolean().optional().default(false),
});

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CACHE_MAX = 250;
export const PAGE_FETCH_LIMIT = 4;
export const PAGE_EXTRACT_LIMIT = 6000;
export const SEARCH_DEADLINE_MS = 45_000;
export const CNPJ_LOOKUP_TIMEOUT_MS = 3_500;
export const MAX_CNPJ_LOOKUPS = 5;
export const MAX_COMPANIES = 60;
export const SUPABASE_CACHE_OPERATOR_ID = 'server:socio-search';
export const CACHE_KEY_VERSION = 'v7-structured-lateral-cnpj';

export const cache = new Map<string, CacheEntry>();

// ============================================================
// Funcoes auxiliares
// ============================================================

export function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildCacheKey(
  rootCnpj: string,
  rootCompanyName: string,
  socioName: string,
  operatorId?: string,
): string {
  const cnpj = normalizeCnpj(rootCnpj);
  const base = `${CACHE_KEY_VERSION}::${cnpj || normalizeText(rootCompanyName)}::${normalizeText(socioName)}`;
  const namespace = operatorId ? normalizeText(operatorId.replace(/-/g, ' ')) : 'anonymous';
  return `${base}::${namespace}::`;
}

export function buildPersistentCacheId(key: string): string {
  return `socio-search:${key}`;
}

export function stripTrace(payload: SocioSearchResponse): SocioSearchResponse {
  const { trace: _trace, ...rest } = payload;
  return rest;
}

export function countRejectedByReason(rejected: RejectedSocioSearchResult[]): Record<string, number> {
  return rejected.reduce<Record<string, number>>((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});
}

export function buildTraceTotals(payload: SocioSearchResponse): SocioSearchTraceDiagnostics['totals'] {
  return {
    companiesCount: payload.companies.length,
    rejectedCount: payload.rejected.length,
    pagesFetched: payload.diagnostics?.pagesFetched || 0,
    cnpjsEnriched: payload.diagnostics?.cnpjsEnriched || 0,
    cnpjsFound: [],
    queriesRun: payload.diagnostics?.queriesRun || [],
    degraded: payload.degraded,
    truncated: Boolean(payload.diagnostics?.truncated),
    truncatedReason: payload.diagnostics?.truncatedReason,
    searchNoResultCount: payload.diagnostics?.searchNoResultCount || 0,
    searchFailureCount: payload.diagnostics?.searchFailureCount || 0,
  };
}

export function withTraceCache(
  payload: SocioSearchResponse,
  cacheInfo: NonNullable<SocioSearchTraceDiagnostics['cache']>,
): SocioSearchResponse {
  const cleanPayload = stripTrace(payload);
  return {
    ...cleanPayload,
    trace: {
      enabled: true,
      cache: cacheInfo,
      providers: payload.trace?.providers || [],
      totals: payload.trace?.totals || buildTraceTotals(cleanPayload),
      rejectedByReason: payload.trace?.rejectedByReason || countRejectedByReason(cleanPayload.rejected),
    },
  };
}
