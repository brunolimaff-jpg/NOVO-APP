import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { extractHtml, isValidPublicUrl, performWebSearch } from '../utils/documentExtractor.js';
import { sanitizeSensitivePersonalData } from '../utils/privacy.js';
import { isValidCnpj, normalizeCnpj } from '../utils/cnpj.js';
import { scoutDiag } from '../utils/diagnosticLog.js';
import { lookupCnpj } from '../lib/cnpjLookup.js';
import { setSecurityHeaders } from './_security-headers.js';

type SocioSearchConfidence = 'strong' | 'medium' | 'weak';
type SocioSearchEvidenceType = 'qsa' | 'registry' | 'web' | 'trade' | 'institutional';
type SocioSearchSourceDepth = 'search_result' | 'page_extract' | 'cnpj_lookup';
type SocioSearchCacheSource = 'none' | 'memory' | 'persistent';
type SocioSearchRelationshipScope = 'group_link' | 'partner_other_cnpj' | 'unconfirmed';

interface SocioSearchCompany {
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
}

interface RejectedSocioSearchResult {
  sourceTitle?: string;
  sourceUrl?: string;
  snippet?: string;
  reason: string;
}

interface CacheEntry {
  expiresAt: number;
  payload: SocioSearchResponse;
}

interface SocioSearchDiagnostics {
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

interface SocioSearchResponse {
  companies: SocioSearchCompany[];
  rejected: RejectedSocioSearchResult[];
  degraded: boolean;
  cached: boolean;
  diagnostics?: SocioSearchDiagnostics;
}

type PersistentCacheRead =
  | { status: 'hit'; payload: SocioSearchResponse }
  | { status: 'miss' }
  | { status: 'unavailable' };

const RequestSchema = z.object({
  socioName: z.string().min(3).max(160),
  rootCompanyName: z.string().min(2).max(180),
  rootCnpj: z.string().optional().default(''),
});

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 250;
const PAGE_FETCH_LIMIT = 4;
const PAGE_EXTRACT_LIMIT = 6000;
const SEARCH_DEADLINE_MS = 45_000;
const CNPJ_LOOKUP_TIMEOUT_MS = 3_500;
const MAX_CNPJ_LOOKUPS = 5;
const MAX_COMPANIES = 60;
const SUPABASE_CACHE_OPERATOR_ID = 'server:socio-search';
const CACHE_KEY_VERSION = 'v6-pending-cnpj-diagnostics';
const cache = new Map<string, CacheEntry>();

function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildCacheKey(rootCnpj: string, rootCompanyName: string, socioName: string): string {
  const cnpj = normalizeCnpj(rootCnpj);
  return `${CACHE_KEY_VERSION}::${cnpj || normalizeText(rootCompanyName)}::${normalizeText(socioName)}`;
}

function buildPersistentCacheId(key: string): string {
  return `socio-search:${key}`;
}

function getSupabaseCacheConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;
  return { url: url.replace(/\/+$/g, ''), key };
}

function requiresPersistentCache(): boolean {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

function isSocioSearchResponse(value: unknown): value is SocioSearchResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SocioSearchResponse>;
  return Array.isArray(candidate.companies)
    && Array.isArray(candidate.rejected)
    && typeof candidate.degraded === 'boolean';
}

function getMemoryCached(key: string): SocioSearchResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return {
    ...entry.payload,
    cached: true,
    diagnostics: {
      ...entry.payload.diagnostics,
      queriesRun: entry.payload.diagnostics?.queriesRun || [],
      pagesFetched: entry.payload.diagnostics?.pagesFetched || 0,
      rejectedCount: entry.payload.diagnostics?.rejectedCount || entry.payload.rejected.length,
      cacheSource: 'memory',
    },
  };
}

function setMemoryCached(key: string, payload: SocioSearchResponse): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { payload: { ...payload, cached: false }, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function getPersistentCached(key: string): Promise<PersistentCacheRead> {
  const config = getSupabaseCacheConfig();
  if (!config) return { status: 'unavailable' };

  try {
    const url = new URL(`${config.url}/rest/v1/extract_cache`);
    url.searchParams.set('select', 'result,expires_at');
    url.searchParams.set('id', `eq.${buildPersistentCacheId(key)}`);
    url.searchParams.set('expires_at', `gt.${new Date().toISOString()}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
    });

    if (!response.ok) {
      scoutDiag.warn('SocioSearch', 'cache persistente indisponivel para leitura', { status: response.status });
      return { status: 'unavailable' };
    }

    const rows = await response.json() as Array<{ result?: unknown }>;
    const payload = rows[0]?.result;
    if (!payload) return { status: 'miss' };
    if (!isSocioSearchResponse(payload)) return { status: 'unavailable' };
    if (payload.degraded && payload.companies.length === 0 && payload.rejected.length === 0) {
      return { status: 'miss' };
    }

    return {
      status: 'hit',
      payload: {
        ...payload,
        cached: true,
        diagnostics: {
          ...payload.diagnostics,
          queriesRun: payload.diagnostics?.queriesRun || [],
          pagesFetched: payload.diagnostics?.pagesFetched || 0,
          rejectedCount: payload.diagnostics?.rejectedCount || payload.rejected.length,
          cacheSource: 'persistent',
        },
      },
    };
  } catch (error) {
    scoutDiag.warn('SocioSearch', 'falha ao ler cache persistente', {
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: 'unavailable' };
  }
}

async function writePersistentCacheRecord(recordId: string, payload: SocioSearchResponse, ttlMs: number): Promise<boolean> {
  const config = getSupabaseCacheConfig();
  if (!config) {
    if (process.env.NODE_ENV !== 'test') {
      scoutDiag.warn('SocioSearch', 'cache persistente nao configurado; usando cache local volatil');
    }
    return false;
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/extract_cache`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: recordId,
        operator_id: SUPABASE_CACHE_OPERATOR_ID,
        result: { ...payload, cached: false },
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
        synced_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      scoutDiag.warn('SocioSearch', 'cache persistente indisponivel para gravacao', { status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    scoutDiag.warn('SocioSearch', 'falha ao gravar cache persistente', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function setPersistentCached(key: string, payload: SocioSearchResponse): Promise<boolean> {
  return writePersistentCacheRecord(buildPersistentCacheId(key), payload, CACHE_TTL_MS);
}


function splitSearchBlocks(content: string): Array<{ title: string; url: string; snippet: string }> {
  return (content || '')
    .split(/\n---\n?/)
    .map(block => {
      const title = block.match(/Título:\s*([^\n]+)/i)?.[1]?.trim() || '';
      const url = block.match(/URL:\s*(https?:\/\/[^\s\n]+)/i)?.[1]?.trim().replace(/[),.;]+$/g, '') || '';
      const snippet = block.match(/Resumo:\s*([\s\S]+)/i)?.[1]?.trim() || '';
      return { title, url, snippet: sanitizeSensitivePersonalData(snippet) };
    })
    .filter(block => block.title && /^https?:\/\//i.test(block.url));
}

function extractCnpjMatches(text: string): Array<{ raw: string; cnpj: string; index: number }> {
  const matches: Array<{ raw: string; cnpj: string; index: number }> = [];
  const cnpjPattern = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
  for (const match of text.matchAll(cnpjPattern)) {
    const raw = match[0];
    const cnpj = normalizeCnpj(raw);
    if (!isValidCnpj(cnpj)) continue;
    matches.push({ raw, cnpj, index: match.index || 0 });
  }
  return matches;
}

function extractCnpjs(text: string): string[] {
  return [...new Set(extractCnpjMatches(text).map(match => match.cnpj))];
}

function formatCnpjLabel(cnpj: string): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function buildPendingCompanyForCnpj(params: {
  cnpj: string;
  title: string;
  snippet: string;
  url: string;
  socioName: string;
  rootCompanyName: string;
  rootCnpj: string;
  sourceDepth: SocioSearchSourceDepth;
}): SocioSearchCompany {
  const cnpj = normalizeCnpj(params.cnpj);
  return {
    name: inferCompanyNameForCnpj(cnpj, params.title, params.snippet),
    cnpj,
    rawCnpjLabel: `${formatCnpjLabel(cnpj)}*`,
    partnerName: params.socioName,
    sourceTitle: params.title,
    sourceUrl: params.url,
    snippet: params.snippet,
    confidence: 'weak',
    evidenceType: 'web',
    relationshipScope: 'unconfirmed',
    validationStatus: 'pending',
    rootContext: false,
    rootCompanyName: params.rootCompanyName,
    rootCnpj: normalizeCnpj(params.rootCnpj) || undefined,
    sourceDepth: params.sourceDepth,
  };
}

function cleanInferredCompanyName(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  const tokens = compact.split(/\s+/).filter(Boolean);
  const legalSuffixIndex = tokens.findIndex(token => /^(LTDA|Ltda|S\/A|S\.A\.|S\.A\.S\.|EIRELI|ME)$/i.test(token));
  if (legalSuffixIndex > 1) {
    for (let index = legalSuffixIndex - 1; index >= 1; index--) {
      const token = tokens[index];
      const previous = tokens[index - 1];
      if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9]/.test(token) && /^[a-zà-ÿ]/.test(previous)) {
        return tokens.slice(index).join(' ');
      }
    }
  }
  return compact;
}

function hasMeaningfulInferredCompanyName(value: string): boolean {
  const legalOnly = new Set(['cia', 'companhia', 'ltda', 'sa', 's', 'a', 'sas', 'me', 'eireli']);
  return normalizeText(value)
    .split(/\s+/)
    .some(token => token.length >= 3 && !legalOnly.has(token));
}

function inferredNameOrCnpjFallback(value: string, cnpj: string): string {
  const cleaned = cleanInferredCompanyName(value);
  return hasMeaningfulInferredCompanyName(cleaned) ? cleaned : `Empresa CNPJ ${formatCnpjLabel(cnpj)}`;
}

function inferCompanyNameForCnpj(cnpj: string, title: string, snippet: string): string {
  const text = `${title} ${snippet}`.replace(/\s+/g, ' ');
  const matches = extractCnpjMatches(text);
  const matchIndex = matches.findIndex(item => item.cnpj === cnpj);
  const match = matches[matchIndex];
  if (!match) return inferredNameOrCnpjFallback(inferCompanyName(title, snippet), cnpj);

  const before = text.slice(Math.max(0, match.index - 260), match.index).trim();
  const previousMatch = matchIndex > 0 ? matches[matchIndex - 1] : null;
  const localBefore = text.slice(previousMatch ? previousMatch.index + previousMatch.raw.length : 0, match.index).trim();
  const localNameMatches = [...localBefore.matchAll(/([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç0-9&.\s-]{2,100}?(?:LTDA|Ltda|S\/A|S\.A\.|S\.A\.S\.|EIRELI|ME))/gi)];
  const localName = localNameMatches.at(-1)?.[1];
  if (localName) return inferredNameOrCnpjFallback(localName, cnpj);

  const reasonName = before.match(/raz[aã]o social\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9&.\s-]{2,100}?(?:LTDA|S\/A|S\.A\.|S\.A\.S\.|EIRELI|ME))/i)?.[1];
  if (reasonName) return inferredNameOrCnpjFallback(reasonName, cnpj);

  const companyBeforeCnpj = before.match(/([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç0-9&.\s-]{2,100}?(?:LTDA|Ltda|S\/A|S\.A\.|S\.A\.S\.|EIRELI|ME))\s*(?:ativa|inativa|opera|com|,|;|-)?$/i)?.[1];
  if (companyBeforeCnpj) return inferredNameOrCnpjFallback(companyBeforeCnpj, cnpj);

  const listedName = before.match(/empresas? em que [^:]{0,80}:\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç0-9&.\s-]{2,100})$/i)?.[1];
  if (listedName) return inferredNameOrCnpjFallback(listedName, cnpj);

  return inferredNameOrCnpjFallback(inferCompanyName(title, snippet), cnpj);
}

async function fetchCandidatePage(url: string): Promise<string> {
  if (!isValidPublicUrl(url)) return '';

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return '';

    const contentType = response.headers?.get?.('content-type')?.toLowerCase() || '';
    if (contentType && !contentType.includes('text/html') && !contentType.includes('text/plain')) return '';

    const body = await response.text();
    const extracted = contentType.includes('text/plain')
      ? body
      : await extractHtml(body, PAGE_EXTRACT_LIMIT);
    return sanitizeSensitivePersonalData(extracted).slice(0, PAGE_EXTRACT_LIMIT);
  } catch (error) {
    scoutDiag.warn('SocioSearch', 'falha ao abrir pagina candidata', {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
    return '';
  }
}

function inferCompanyName(title: string, snippet: string): string {
  const text = `${title} ${snippet}`;
  if (/scheffer\s+colombia\s+s\.?a\.?s\.?/i.test(text)) return 'Scheffer Colombia S.A.S.';

  const sas = text.match(/\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç&.\s-]{2,80}\b(?:S\.?A\.?S\.?|S\/A|LTDA|Ltda|S\.A\.))\b/);
  if (sas?.[1]) return sas[1].replace(/\s+/g, ' ').trim();

  return title
    .replace(/\s*[-|].*$/g, '')
    .replace(/\b(importa[cç][oõ]es|exporta[cç][oõ]es|participa[cç][oõ]es|dados|empresa)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferEvidenceType(title: string, snippet: string, url: string): SocioSearchEvidenceType {
  const haystack = normalizeText(`${title} ${snippet} ${url}`);
  if (/cnpj|qsa|societ|socio|receita|empresa/.test(haystack)) return 'registry';
  if (/site oficial|institucional|forbes|emis|portafolio/.test(haystack)) return 'institutional';
  return 'web';
}

function isInternational(title: string, snippet: string, url: string): boolean {
  return /colombia|colômbia|sas|nit|\/COLOMBIA\//i.test(`${title} ${snippet} ${url}`);
}

function scoreEvidence(params: {
  title: string;
  snippet: string;
  url: string;
  socioName: string;
  rootCompanyName: string;
  rootCnpj: string;
  cnpjs?: string[];
}): {
  confidence: SocioSearchConfidence;
  relationshipScope: SocioSearchRelationshipScope;
  rootContext: boolean;
  socioContext: boolean;
  rejectReason?: string;
} {
  const haystack = normalizeText(`${params.title} ${params.snippet} ${params.url}`);
  const digitHaystack = `${params.title} ${params.snippet} ${params.url}`.replace(/\D/g, '');
  const socioParts = normalizeText(params.socioName).split(/\s+/).filter(part => part.length > 2);
  const socioPartSet = new Set(socioParts);
  const normalizedRootName = normalizeText(params.rootCompanyName);
  const rootParts = normalizedRootName
    .split(/\s+/)
    .filter(part => part.length > 2 && !socioPartSet.has(part) && !['ltda', 'cia', 'sa', 's/a', 'saa', 'agro', 'agricola'].includes(part));
  const rootCnpj = normalizeCnpj(params.rootCnpj);

  const socioHitCount = socioParts.filter(part => haystack.includes(part)).length;
  const socioHit = socioHitCount >= Math.min(2, socioParts.length);
  const rootPhraseHit = normalizedRootName.length > 0 && haystack.includes(normalizedRootName);
  const rootHit = rootPhraseHit || (rootParts.length > 0 && rootParts.some(part => haystack.includes(part)));
  const cnpjHit = isValidCnpj(rootCnpj) && digitHaystack.includes(rootCnpj);
  const internationalHit = isInternational(params.title, params.snippet, params.url);
  const strongDomain = /consultasocio|cnpj|veritrade|emis|portafolio|scheffer\.agr/i.test(params.url);
  const negativeConnection = /sem conexao|nao conectado|homonimo/.test(haystack);
  const groupContextHit = rootHit || cnpjHit;
  const hasValidCnpj = (params.cnpjs || []).some(cnpj => isValidCnpj(cnpj));
  const registryContext = /consultasocio|cnpj|qsa|societ|socio|sócio|administrador|quadro/.test(haystack)
    || /consultasocio|cnpj|receita/i.test(params.url);

  if (negativeConnection) {
    return {
      confidence: 'weak',
      relationshipScope: 'unconfirmed',
      rootContext: false,
      socioContext: false,
      rejectReason: 'Possivel homonimo sem contexto suficiente do socio.',
    };
  }
  if (socioHit && groupContextHit && (cnpjHit || internationalHit || strongDomain)) {
    return { confidence: 'strong', relationshipScope: 'group_link', rootContext: true, socioContext: true };
  }
  if (socioHit && groupContextHit) {
    return { confidence: 'medium', relationshipScope: 'group_link', rootContext: true, socioContext: true };
  }
  if (socioHit && hasValidCnpj && (strongDomain || registryContext)) {
    return {
      confidence: 'strong',
      relationshipScope: 'partner_other_cnpj',
      rootContext: false,
      socioContext: true,
    };
  }

  return {
    confidence: 'weak',
    relationshipScope: 'unconfirmed',
    rootContext: false,
    socioContext: socioHit,
    rejectReason: 'Possivel homonimo sem CNPJ valido ou fonte societaria suficiente.',
  };
}

function sourceLooksSocioCentric(title: string, snippet: string, url: string, socioName: string): boolean {
  const haystack = normalizeText(`${title} ${snippet} ${url}`);
  const socioParts = normalizeText(socioName).split(/\s+/).filter(part => part.length > 2);
  const socioHitCount = socioParts.filter(part => haystack.includes(part)).length;
  const socioHit = socioHitCount >= Math.min(2, socioParts.length);
  return /consultasocio\.com\/q\/sa/i.test(url)
    || /econodata\.com\.br\/consulta-empresa|econodata\.com\.br\/consulta-socio/i.test(url)
    || (socioHit && /empresas em que|socio administrador|sócio administrador|quadro societario|quadro societário|consta como socio|consta como sócio/.test(haystack));
}

function scopeForEnrichedCnpj(params: {
  cnpj: string;
  evidence: ReturnType<typeof scoreEvidence>;
  title: string;
  snippet: string;
  url: string;
  socioName: string;
  rootCnpj: string;
}): Pick<SocioSearchCompany, 'relationshipScope' | 'rootContext'> {
  const cnpj = normalizeCnpj(params.cnpj);
  const rootCnpj = normalizeCnpj(params.rootCnpj);
  if (isValidCnpj(cnpj) && isValidCnpj(rootCnpj) && cnpj.slice(0, 8) === rootCnpj.slice(0, 8)) {
    return { relationshipScope: 'group_link', rootContext: true };
  }

  if (
    params.evidence.relationshipScope === 'group_link'
    && sourceLooksSocioCentric(params.title, params.snippet, params.url, params.socioName)
  ) {
    return { relationshipScope: 'partner_other_cnpj', rootContext: false };
  }

  return {
    relationshipScope: params.evidence.relationshipScope,
    rootContext: params.evidence.rootContext,
  };
}

function buildQueries(socioName: string, rootCompanyName: string): string[] {
  return [
    `site:consultasocio.com/q/sa "${socioName}" "${rootCompanyName}"`,
    `"${socioName}" "${rootCompanyName}" ("sócio" OR "QSA" OR "participações" OR "holding")`,
    `"${socioName}" "${rootCompanyName}" ("Colombia" OR "Colômbia" OR "S.A.S." OR "NIT")`,
    `"${socioName}" "CNPJ"`,
    `site:consultasocio.com/q/sa "${socioName}"`,
    `"${socioName}" ("quadro societário" OR "sócio" OR "administrador")`,
  ];
}

function tokenizeName(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function nameTokensMatchStrictly(candidateName: string, socioName: string): boolean {
  const socioTokens = tokenizeName(socioName);
  const candidateTokens = tokenizeName(candidateName);
  if (socioTokens.length === 0 || candidateTokens.length === 0) return false;
  if (candidateTokens.join(' ') === socioTokens.join(' ')) return true;

  const socioSignificantTokens = socioTokens.filter(part => part.length > 2);
  const socioInitials = new Set(socioTokens.filter(part => part.length === 1));
  if (socioSignificantTokens.length === 0) return false;

  let cursor = -1;
  const matchedIndexes: number[] = [];
  for (const token of socioSignificantTokens) {
    const nextIndex = candidateTokens.findIndex((candidateToken, index) => index > cursor && candidateToken === token);
    if (nextIndex === -1) return false;
    matchedIndexes.push(nextIndex);
    cursor = nextIndex;
  }

  if (socioSignificantTokens.length <= 2) {
    const firstIndex = matchedIndexes[0];
    const lastIndex = matchedIndexes[matchedIndexes.length - 1];
    const middleTokens = candidateTokens.slice(firstIndex + 1, lastIndex)
      .filter(token => !socioSignificantTokens.includes(token));
    return middleTokens.every(token => socioInitials.has(token.charAt(0)));
  }

  return true;
}

function officialQsaIncludesSocio(qsa: Array<{ name?: string }> | undefined, socioName: string): boolean | null {
  if (!qsa || qsa.length === 0) return null;
  return qsa.some(partner => nameTokensMatchStrictly(partner.name || '', socioName));
}

async function runSearch(params: z.infer<typeof RequestSchema>): Promise<SocioSearchResponse> {
  const companies: SocioSearchCompany[] = [];
  const rejected: RejectedSocioSearchResult[] = [];
  const seen = new Set<string>();
  const queries = buildQueries(params.socioName, params.rootCompanyName);
  const queriesRun: string[] = [];
  const startedAt = Date.now();
  let degraded = false;
  let truncated = false;
  let truncatedReason: SocioSearchDiagnostics['truncatedReason'];
  let pagesFetched = 0;
  let cnpjsEnriched = 0;
  let cnpjLookupAttempts = 0;
  let searchNoResultCount = 0;
  let searchFailureCount = 0;
  const cnpjsFound = new Set<string>();

  const hasSearchBudget = () => Date.now() - startedAt < SEARCH_DEADLINE_MS;
  const remainingSearchBudget = () => Math.max(0, SEARCH_DEADLINE_MS - (Date.now() - startedAt));
  const markTruncated = (reason: SocioSearchDiagnostics['truncatedReason']) => {
    truncated = true;
    truncatedReason = truncatedReason || reason;
    degraded = true;
  };

  const addCompany = (company: SocioSearchCompany) => {
    const cnpj = normalizeCnpj(company.cnpj || '');
    const key = isValidCnpj(cnpj) ? `cnpj:${cnpj}` : `name:${normalizeText(company.name)}:${company.country || 'BR'}`;
    if (!company.name || seen.has(key)) return;
    seen.add(key);
    companies.push(company);
  };

  for (const query of queries) {
    if (!hasSearchBudget() || companies.length >= MAX_COMPANIES) {
      if (companies.length >= MAX_COMPANIES) markTruncated('company_limit');
      else if (companies.length > 0) markTruncated('deadline');
      else degraded = true;
      break;
    }
    queriesRun.push(query);
    const content = await performWebSearch(query, { count: 10 });
    if (!content) {
      searchFailureCount += 1;
      degraded = true;
      continue;
    }
    if (/Nenhum resultado encontrado/i.test(content)) {
      searchNoResultCount += 1;
      degraded = true;
      continue;
    }

    for (const block of splitSearchBlocks(content)) {
      if (!hasSearchBudget() || companies.length >= MAX_COMPANIES) {
        if (companies.length >= MAX_COMPANIES) markTruncated('company_limit');
        else if (companies.length > 0) markTruncated('deadline');
        else degraded = true;
        break;
      }
      let snippet = block.snippet;
      let sourceDepth: SocioSearchSourceDepth = 'search_result';
      let blockCnpjs = extractCnpjs(`${block.title} ${snippet}`);
      const initialEvidence = scoreEvidence({
        title: block.title,
        snippet,
        url: block.url,
        socioName: params.socioName,
        rootCompanyName: params.rootCompanyName,
        rootCnpj: params.rootCnpj,
        cnpjs: blockCnpjs,
      });

      const shouldFetchPage = pagesFetched < PAGE_FETCH_LIMIT
        && hasSearchBudget()
        && (
          blockCnpjs.length === 0
          || sourceLooksSocioCentric(block.title, snippet, block.url, params.socioName)
        )
        && (
          initialEvidence.confidence !== 'strong'
          || /cnpj|qsa|societ|s[oó]cio|participa|holding|quadro/i.test(`${block.title} ${snippet} ${block.url}`)
        );

      if (shouldFetchPage) {
        pagesFetched += 1;
        const pageText = await fetchCandidatePage(block.url);
        if (pageText) {
          snippet = sanitizeSensitivePersonalData([snippet, pageText].filter(Boolean).join('\n'));
          blockCnpjs = extractCnpjs(`${block.title} ${snippet}`);
          sourceDepth = 'page_extract';
        }
      }

      const evidence = scoreEvidence({
        title: block.title,
        snippet,
        url: block.url,
        socioName: params.socioName,
        rootCompanyName: params.rootCompanyName,
        rootCnpj: params.rootCnpj,
        cnpjs: blockCnpjs,
      });

      if (evidence.confidence === 'weak') {
        rejected.push({
          sourceTitle: block.title,
          sourceUrl: block.url,
          snippet,
          reason: evidence.rejectReason || 'Evidencia fraca.',
        });
        continue;
      }

      const rootCnpj = normalizeCnpj(params.rootCnpj);
      const relatedCnpjs = blockCnpjs.filter(cnpj => cnpj !== rootCnpj);
      for (const cnpj of relatedCnpjs) cnpjsFound.add(cnpj);
      const unseenRelatedCnpjs = relatedCnpjs.filter(cnpj => !seen.has(`cnpj:${cnpj}`));
      if (relatedCnpjs.length > 0 && unseenRelatedCnpjs.length === 0) continue;
      let enrichedAnyCnpj = false;

      for (const cnpj of unseenRelatedCnpjs) {
        if (companies.length >= MAX_COMPANIES) {
          markTruncated('company_limit');
          break;
        }
        const scopedRelationship = scopeForEnrichedCnpj({
          cnpj,
          evidence,
          title: block.title,
          snippet,
          url: block.url,
          socioName: params.socioName,
          rootCnpj: params.rootCnpj,
        });
        const remainingMs = remainingSearchBudget();
        const canTryOfficialLookup = cnpjLookupAttempts < MAX_CNPJ_LOOKUPS && remainingMs >= 1_000;
        if (canTryOfficialLookup) try {
          cnpjLookupAttempts += 1;
          const official = await lookupCnpj(cnpj, {
            timeoutMs: Math.min(CNPJ_LOOKUP_TIMEOUT_MS, Math.max(1_000, remainingMs - 500)),
            maxSources: 1,
          });
          cnpjsEnriched += 1;
          const qsaConfirmsSocio = officialQsaIncludesSocio(official.qsa, params.socioName);
          if (qsaConfirmsSocio === false) {
            enrichedAnyCnpj = true;
            rejected.push({
              sourceTitle: block.title,
              sourceUrl: block.url,
              snippet,
              reason: `QSA oficial nao confirma o socio ${params.socioName} neste CNPJ.`,
            });
            continue;
          }
          enrichedAnyCnpj = true;
          const inferredName = inferCompanyNameForCnpj(cnpj, block.title, snippet);
          const officialName = official.companyName?.trim() || '';
          addCompany({
            name: hasMeaningfulInferredCompanyName(officialName) ? officialName : inferredName,
            cnpj,
            partnerName: params.socioName,
            sourceTitle: block.title,
            sourceUrl: block.url,
            snippet,
            confidence: qsaConfirmsSocio === true ? 'strong' : 'medium',
            evidenceType: qsaConfirmsSocio === true ? 'qsa' : 'registry',
            relationshipScope: scopedRelationship.relationshipScope,
            rootContext: scopedRelationship.rootContext,
            rootCompanyName: params.rootCompanyName,
            rootCnpj: rootCnpj || undefined,
            role: official.cnaeDescricao || official.cnae,
            sourceDepth: 'cnpj_lookup',
          });
          continue;
        } catch (error) {
          scoutDiag.warn('SocioSearch', 'falha ao enriquecer CNPJ encontrado', {
            cnpj,
            url: block.url,
            message: error instanceof Error ? error.message : String(error),
          });
        }

        enrichedAnyCnpj = true;
        addCompany({
          ...buildPendingCompanyForCnpj({
            cnpj,
            title: block.title,
            snippet,
            url: block.url,
            socioName: params.socioName,
            rootCompanyName: params.rootCompanyName,
            rootCnpj: params.rootCnpj,
            sourceDepth,
          }),
          rootCompanyName: params.rootCompanyName,
          rootCnpj: rootCnpj || undefined,
        });
      }

      if (enrichedAnyCnpj) continue;

      const name = inferCompanyName(block.title, snippet);
      addCompany({
        name,
        country: isInternational(block.title, block.snippet, block.url) ? 'CO' : undefined,
        partnerName: params.socioName,
        sourceTitle: block.title,
        sourceUrl: block.url,
        snippet,
        confidence: evidence.confidence,
        evidenceType: inferEvidenceType(block.title, block.snippet, block.url),
        relationshipScope: evidence.relationshipScope,
        rootContext: evidence.rootContext,
        rootCompanyName: params.rootCompanyName,
        rootCnpj: normalizeCnpj(params.rootCnpj) || undefined,
        sourceDepth,
      });
    }
  }

  return {
    companies,
    rejected,
    degraded: companies.length === 0 ? degraded : truncated,
    cached: false,
    diagnostics: {
      queriesRun,
      pagesFetched,
      cacheSource: 'none',
      rejectedCount: rejected.length,
      cnpjsEnriched: cnpjsEnriched || undefined,
      totalCnpjsFound: cnpjsFound.size || undefined,
      searchNoResultCount: searchNoResultCount || undefined,
      searchFailureCount: searchFailureCount || undefined,
      truncated: truncated || undefined,
      truncatedReason,
    },
  };
}

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setSecurityHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const cacheKey = buildCacheKey(parsed.data.rootCnpj, parsed.data.rootCompanyName, parsed.data.socioName);
  const persistentCacheRequired = requiresPersistentCache();
  const hasPersistentConfig = Boolean(getSupabaseCacheConfig());

  if (!persistentCacheRequired && !hasPersistentConfig) {
    const cached = getMemoryCached(cacheKey);
    if (cached) return res.status(200).json(cached);
  } else {
    const persistentCached = await getPersistentCached(cacheKey);
    if (persistentCached.status === 'hit') {
      setMemoryCached(cacheKey, persistentCached.payload);
      return res.status(200).json(persistentCached.payload);
    }
    if (persistentCacheRequired && !hasPersistentConfig) {
      scoutDiag.warn('SocioSearch', 'cache persistente nao configurado; usando cache volatil', {
        socioName: parsed.data.socioName,
        rootCompanyName: parsed.data.rootCompanyName,
      });
    }
    const memoryCached = getMemoryCached(cacheKey);
    if (memoryCached) return res.status(200).json(memoryCached);
  }

  try {
    const payload = await runSearch(parsed.data);
    setMemoryCached(cacheKey, payload);

    if (hasPersistentConfig) {
      const persisted = await setPersistentCached(cacheKey, payload);
      if (!persisted) {
        scoutDiag.warn('SocioSearch', 'cache persistente indisponivel para gravacao; resultado servido via cache volatil', {
          socioName: parsed.data.socioName,
          rootCompanyName: parsed.data.rootCompanyName,
        });
      }
    }

    return res.status(200).json(payload);
  } catch (error) {
    scoutDiag.warn('SocioSearch', 'falha no drill-down de socio', {
      socioName: parsed.data.socioName,
      rootCompanyName: parsed.data.rootCompanyName,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(200).json({
      companies: [],
      rejected: [],
      degraded: true,
      cached: false,
      detail: 'Busca societaria indisponivel no momento.',
    });
  }
}
