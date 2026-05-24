import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { extractHtml, isValidPublicUrl, performWebSearch } from '../utils/documentExtractor.js';
import { sanitizeSensitivePersonalData } from '../utils/privacy.js';
import { normalizeCnpj } from '../utils/cnpj.js';
import { scoutDiag } from '../utils/diagnosticLog.js';
import { lookupCnpj } from '../lib/cnpjLookup.js';
import { setSecurityHeaders } from './_security-headers.js';

type SocioSearchConfidence = 'strong' | 'medium' | 'weak';
type SocioSearchEvidenceType = 'qsa' | 'registry' | 'web' | 'trade' | 'institutional';
type SocioSearchSourceDepth = 'search_result' | 'page_extract' | 'cnpj_lookup';
type SocioSearchCacheSource = 'none' | 'memory' | 'persistent';

interface SocioSearchCompany {
  name: string;
  cnpj?: string;
  country?: string;
  partnerName: string;
  sourceUrl: string;
  sourceTitle: string;
  snippet: string;
  confidence: SocioSearchConfidence;
  evidenceType: SocioSearchEvidenceType;
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
const SUPABASE_CACHE_OPERATOR_ID = 'server:socio-search';
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
  return `${cnpj || normalizeText(rootCompanyName)}::${normalizeText(socioName)}`;
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

function extractCnpjs(text: string): string[] {
  const matches = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || [];
  return [...new Set(matches.map(match => normalizeCnpj(match)).filter(cnpj => cnpj.length === 14))];
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
}): { confidence: SocioSearchConfidence; rootContext: boolean; rejectReason?: string } {
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
  const cnpjHit = rootCnpj.length === 14 && digitHaystack.includes(rootCnpj);
  const internationalHit = isInternational(params.title, params.snippet, params.url);
  const strongDomain = /consultasocio|cnpj|veritrade|emis|portafolio|scheffer\.agr/i.test(params.url);
  const negativeConnection = /sem conexao|nao conectado|homonimo/.test(haystack);
  const groupContextHit = rootHit || cnpjHit;

  if (negativeConnection) {
    return { confidence: 'weak', rootContext: false, rejectReason: 'Possivel homonimo sem contexto suficiente do grupo.' };
  }
  if (socioHit && groupContextHit && (cnpjHit || internationalHit || strongDomain)) {
    return { confidence: 'strong', rootContext: true };
  }
  if (socioHit && groupContextHit) return { confidence: 'medium', rootContext: true };

  return { confidence: 'weak', rootContext: false, rejectReason: 'Possivel homonimo sem contexto suficiente do grupo.' };
}

function buildQueries(socioName: string, rootCompanyName: string): string[] {
  return [
    `site:consultasocio.com/q/sa "${socioName}" "${rootCompanyName}"`,
    `"${socioName}" "${rootCompanyName}" ("sócio" OR "QSA" OR "participações" OR "holding")`,
    `"${socioName}" "${rootCompanyName}" ("Colombia" OR "Colômbia" OR "S.A.S." OR "NIT")`,
  ];
}

async function runSearch(params: z.infer<typeof RequestSchema>): Promise<SocioSearchResponse> {
  const companies: SocioSearchCompany[] = [];
  const rejected: RejectedSocioSearchResult[] = [];
  const seen = new Set<string>();
  const queriesRun = buildQueries(params.socioName, params.rootCompanyName);
  let degraded = false;
  let pagesFetched = 0;
  let cnpjsEnriched = 0;

  const addCompany = (company: SocioSearchCompany) => {
    const cnpj = normalizeCnpj(company.cnpj || '');
    const key = cnpj.length === 14 ? `cnpj:${cnpj}` : `name:${normalizeText(company.name)}:${company.country || 'BR'}`;
    if (!company.name || seen.has(key)) return;
    seen.add(key);
    companies.push(company);
  };

  for (const query of queriesRun) {
    const content = await performWebSearch(query, { count: 10 });
    if (!content || /Nenhum resultado encontrado/i.test(content)) {
      degraded = true;
      continue;
    }

    for (const block of splitSearchBlocks(content)) {
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
      });

      const shouldFetchPage = pagesFetched < PAGE_FETCH_LIMIT
        && blockCnpjs.length === 0
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
      const unseenRelatedCnpjs = relatedCnpjs.filter(cnpj => !seen.has(`cnpj:${cnpj}`));
      if (relatedCnpjs.length > 0 && unseenRelatedCnpjs.length === 0) continue;
      let enrichedAnyCnpj = false;

      for (const cnpj of unseenRelatedCnpjs.slice(0, 3)) {
        try {
          const official = await lookupCnpj(cnpj);
          cnpjsEnriched += 1;
          enrichedAnyCnpj = true;
          addCompany({
            name: official.companyName || inferCompanyName(block.title, snippet),
            cnpj,
            partnerName: params.socioName,
            sourceTitle: block.title,
            sourceUrl: block.url,
            snippet,
            confidence: 'strong',
            evidenceType: 'qsa',
            rootContext: evidence.rootContext,
            rootCompanyName: params.rootCompanyName,
            rootCnpj: rootCnpj || undefined,
            role: official.cnaeDescricao || official.cnae,
            sourceDepth: 'cnpj_lookup',
          });
        } catch (error) {
          scoutDiag.warn('SocioSearch', 'falha ao enriquecer CNPJ encontrado', {
            cnpj,
            url: block.url,
            message: error instanceof Error ? error.message : String(error),
          });
        }
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
    degraded: degraded && companies.length === 0,
    cached: false,
    diagnostics: {
      queriesRun,
      pagesFetched,
      cacheSource: 'none',
      rejectedCount: rejected.length,
      cnpjsEnriched: cnpjsEnriched || undefined,
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
