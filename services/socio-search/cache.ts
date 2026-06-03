import { scoutDiag } from '../../utils/diagnosticLog.js';
import {
  type SocioSearchResponse,
  type SocioSearchCacheSource,
  type SocioSearchDiagnostics,
  type PersistentCacheRead,
  type CacheEntry,
  cache,
  CACHE_MAX,
  CACHE_TTL_MS,
  SUPABASE_CACHE_OPERATOR_ID,
  buildPersistentCacheId,
  stripTrace,
} from './types.js';

// ============================================================
// Configuracao do cache
// ============================================================

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
  return (
    Array.isArray(candidate.companies) && Array.isArray(candidate.rejected) && typeof candidate.degraded === 'boolean'
  );
}

// ============================================================
// Cache em memoria
// ============================================================

function getMemoryCached(key: string): SocioSearchResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  const payload = stripTrace(entry.payload);
  return {
    ...payload,
    cached: true,
    diagnostics: {
      ...payload.diagnostics,
      queriesRun: payload.diagnostics?.queriesRun || [],
      pagesFetched: payload.diagnostics?.pagesFetched || 0,
      rejectedCount: payload.diagnostics?.rejectedCount || payload.rejected.length,
      cacheSource: 'memory' as SocioSearchCacheSource,
    },
  };
}

function setMemoryCached(key: string, payload: SocioSearchResponse): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { payload: { ...stripTrace(payload), cached: false }, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================
// Cache persistente (Supabase)
// ============================================================

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

    const raw = await response.json();
    const rows = Array.isArray(raw) ? (raw as Array<{ result?: unknown }>) : [];
    const payload = rows[0]?.result;
    if (!payload) return { status: 'miss' };
    if (!isSocioSearchResponse(payload)) return { status: 'unavailable' };
    if (payload.degraded && payload.companies.length === 0 && payload.rejected.length === 0) {
      return { status: 'miss' };
    }

    const cleanPayload = stripTrace(payload);
    return {
      status: 'hit',
      payload: {
        ...cleanPayload,
        cached: true,
        diagnostics: {
          ...cleanPayload.diagnostics,
          queriesRun: cleanPayload.diagnostics?.queriesRun || [],
          pagesFetched: cleanPayload.diagnostics?.pagesFetched || 0,
          rejectedCount: cleanPayload.diagnostics?.rejectedCount || cleanPayload.rejected.length,
          cacheSource: 'persistent' as SocioSearchCacheSource,
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

async function writePersistentCacheRecord(
  recordId: string,
  payload: SocioSearchResponse,
  ttlMs: number,
): Promise<boolean> {
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
        result: { ...stripTrace(payload), cached: false },
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

export {
  getSupabaseCacheConfig,
  requiresPersistentCache,
  getMemoryCached,
  setMemoryCached,
  getPersistentCached,
  setPersistentCached,
};
