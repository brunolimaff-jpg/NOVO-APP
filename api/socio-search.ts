import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { performWebSearch } from '../utils/documentExtractor.js';
import { sanitizeSensitivePersonalData } from '../utils/privacy.js';
import { normalizeCnpj } from '../utils/cnpj.js';
import { scoutDiag } from '../utils/diagnosticLog.js';
import { setSecurityHeaders } from './_security-headers.js';

type SocioSearchConfidence = 'strong' | 'medium' | 'weak';
type SocioSearchEvidenceType = 'registry' | 'web' | 'trade' | 'institutional';

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

interface SocioSearchResponse {
  companies: SocioSearchCompany[];
  rejected: RejectedSocioSearchResult[];
  degraded: boolean;
  cached: boolean;
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
const PERSISTENT_CACHE_PROBE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 250;
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
  return { ...entry.payload, cached: true };
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

    return { status: 'hit', payload: { ...payload, cached: true } };
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

async function probePersistentCacheWrite(key: string): Promise<boolean> {
  return writePersistentCacheRecord(`socio-search-probe:${key}`, {
    companies: [],
    rejected: [],
    degraded: true,
    cached: false,
  }, PERSISTENT_CACHE_PROBE_TTL_MS);
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
  if (/veritrade|importa|exporta|comercio exterior|comércio exterior/.test(haystack)) return 'trade';
  if (/cnpj|qsa|societ|socio|sócio|receita|empresa/.test(haystack)) return 'registry';
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
  const negativeConnection = /sem conexao|sem conexão|nao conectado|não conectado|homonimo|homônimo/.test(haystack);
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
  let degraded = false;

  for (const query of buildQueries(params.socioName, params.rootCompanyName)) {
    const content = await performWebSearch(query);
    if (!content || /Nenhum resultado encontrado/i.test(content)) {
      degraded = true;
      continue;
    }

    for (const block of splitSearchBlocks(content)) {
      const evidence = scoreEvidence({
        title: block.title,
        snippet: block.snippet,
        url: block.url,
        socioName: params.socioName,
        rootCompanyName: params.rootCompanyName,
        rootCnpj: params.rootCnpj,
      });

      if (evidence.confidence === 'weak') {
        rejected.push({
          sourceTitle: block.title,
          sourceUrl: block.url,
          snippet: block.snippet,
          reason: evidence.rejectReason || 'Evidencia fraca.',
        });
        continue;
      }

      const name = inferCompanyName(block.title, block.snippet);
      const key = normalizeText(name || block.url);
      if (!name || seen.has(key)) continue;
      seen.add(key);

      companies.push({
        name,
        country: isInternational(block.title, block.snippet, block.url) ? 'CO' : undefined,
        partnerName: params.socioName,
        sourceTitle: block.title,
        sourceUrl: block.url,
        snippet: block.snippet,
        confidence: evidence.confidence,
        evidenceType: inferEvidenceType(block.title, block.snippet, block.url),
        rootContext: evidence.rootContext,
        rootCompanyName: params.rootCompanyName,
        rootCnpj: normalizeCnpj(params.rootCnpj) || undefined,
      });
    }

    if (companies.length > 0) break;
  }

  return { companies, rejected, degraded: degraded && companies.length === 0, cached: false };
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
  if (!getSupabaseCacheConfig() && requiresPersistentCache()) {
    scoutDiag.warn('SocioSearch', 'cache persistente obrigatorio nao configurado; busca societaria degradada', {
      socioName: parsed.data.socioName,
      rootCompanyName: parsed.data.rootCompanyName,
    });
    return res.status(200).json({
      companies: [],
      rejected: [],
      degraded: true,
      cached: false,
      detail: 'Cache persistente societario nao configurado.',
    });
  }

  const persistentCacheRequired = requiresPersistentCache();
  if (!persistentCacheRequired) {
    const cached = getMemoryCached(cacheKey);
    if (cached) return res.status(200).json(cached);
  }
  const persistentCached = await getPersistentCached(cacheKey);
  if (persistentCached.status === 'hit') {
    setMemoryCached(cacheKey, persistentCached.payload);
    return res.status(200).json(persistentCached.payload);
  }
  if (persistentCached.status === 'unavailable' && persistentCacheRequired) {
    return res.status(200).json({
      companies: [],
      rejected: [],
      degraded: true,
      cached: false,
      detail: 'Cache persistente societario indisponivel.',
    });
  }
  if (persistentCacheRequired) {
    const cacheWritable = await probePersistentCacheWrite(cacheKey);
    if (!cacheWritable) {
      return res.status(200).json({
        companies: [],
        rejected: [],
        degraded: true,
        cached: false,
        detail: 'Cache persistente societario indisponivel para gravacao.',
      });
    }
  }

  try {
    const payload = await runSearch(parsed.data);
    const persisted = await setPersistentCached(cacheKey, payload);
    if (!persisted && persistentCacheRequired) {
      return res.status(200).json({
        companies: [],
        rejected: payload.rejected,
        degraded: true,
        cached: false,
        detail: 'Resultado societario nao retornado porque o cache persistente falhou.',
      });
    }
    setMemoryCached(cacheKey, payload);
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
