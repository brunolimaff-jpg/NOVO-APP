import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors-headers.js';
import { scoutDiag } from '../utils/diagnosticLog.js';
import {
  type SocioSearchResponse,
  type SocioSearchTraceDiagnostics,
  type SocioSearchCacheSource,
  RequestSchema,
  buildCacheKey,
  stripTrace,
  withTraceCache,
  getSupabaseCacheConfig,
  requiresPersistentCache,
  getMemoryCached,
  setMemoryCached,
  getPersistentCached,
  setPersistentCached,
  runSearch,
} from '../services/socio-search/index.js';

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

/** Margem abaixo de maxDuration — garante resposta JSON mesmo se runSearch estourar. */
const HANDLER_DEADLINE_MS = 52_000;

async function withHandlerDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} deadline after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const cacheKey = buildCacheKey(
    parsed.data.rootCnpj,
    parsed.data.rootCompanyName,
    parsed.data.socioName,
    parsed.data.operatorId,
  );
  const persistentCacheRequired = requiresPersistentCache();
  const hasPersistentConfig = Boolean(getSupabaseCacheConfig());
  const wantsTrace = parsed.data.trace;
  let cacheTraceStatus: NonNullable<SocioSearchTraceDiagnostics['cache']>['status'] = 'miss';
  let cacheTraceSource: SocioSearchCacheSource = 'none';

  if (!persistentCacheRequired && !hasPersistentConfig) {
    const cached = getMemoryCached(cacheKey);
    if (cached) {
      const payload = wantsTrace
        ? withTraceCache(cached, {
            required: persistentCacheRequired,
            configured: hasPersistentConfig,
            status: 'hit',
            source: 'memory',
          })
        : cached;
      return res.status(200).json(payload);
    }
  } else {
    const persistentCached = await getPersistentCached(cacheKey);
    if (persistentCached.status === 'hit') {
      setMemoryCached(cacheKey, persistentCached.payload);
      const payload = wantsTrace
        ? withTraceCache(persistentCached.payload, {
            required: persistentCacheRequired,
            configured: hasPersistentConfig,
            status: 'hit',
            source: 'persistent',
          })
        : persistentCached.payload;
      return res.status(200).json(payload);
    }
    cacheTraceStatus = persistentCached.status === 'unavailable' ? 'unavailable' : 'miss';
    if (persistentCacheRequired && !hasPersistentConfig) {
      cacheTraceStatus = 'unavailable';
      scoutDiag.warn('SocioSearch', 'cache persistente nao configurado; usando cache volatil', {
        socioName: parsed.data.socioName,
        rootCompanyName: parsed.data.rootCompanyName,
      });
    }
    const memoryCached = getMemoryCached(cacheKey);
    if (memoryCached) {
      const payload = wantsTrace
        ? withTraceCache(memoryCached, {
            required: persistentCacheRequired,
            configured: hasPersistentConfig,
            status: 'hit',
            source: 'memory',
          })
        : memoryCached;
      return res.status(200).json(payload);
    }
    cacheTraceSource = persistentCached.status === 'unavailable' ? 'none' : cacheTraceSource;
  }

  try {
    const payload = await withHandlerDeadline(runSearch(parsed.data, wantsTrace), HANDLER_DEADLINE_MS, 'socio-search');
    setMemoryCached(cacheKey, payload);

    if (hasPersistentConfig) {
      const persisted = await setPersistentCached(cacheKey, payload);
      if (!persisted) {
        scoutDiag.warn(
          'SocioSearch',
          'cache persistente indisponivel para gravacao; resultado servido via cache volatil',
          {
            socioName: parsed.data.socioName,
            rootCompanyName: parsed.data.rootCompanyName,
          },
        );
      }
    }

    const responsePayload = wantsTrace
      ? withTraceCache(payload, {
          required: persistentCacheRequired,
          configured: hasPersistentConfig,
          status: cacheTraceStatus,
          source: cacheTraceSource,
        })
      : stripTrace(payload);

    return res.status(200).json(responsePayload);
  } catch (error) {
    const timedOut = error instanceof Error && /deadline after/i.test(error.message);
    scoutDiag.warn('SocioSearch', timedOut ? 'deadline no drill-down de socio' : 'falha no drill-down de socio', {
      socioName: parsed.data.socioName,
      rootCompanyName: parsed.data.rootCompanyName,
      timedOut,
      message: error instanceof Error ? error.message : String(error),
    });
    const fallbackPayload: SocioSearchResponse & { detail: string } = {
      companies: [],
      rejected: [],
      degraded: true,
      cached: false,
      diagnostics: {
        queriesRun: [],
        pagesFetched: 0,
        cacheSource: 'none',
        rejectedCount: 0,
        searchFailureCount: 1,
      },
      detail: 'Busca societaria indisponivel no momento.',
    };
    return res.status(200).json(
      wantsTrace
        ? withTraceCache(fallbackPayload, {
            required: persistentCacheRequired,
            configured: hasPersistentConfig,
            status: cacheTraceStatus,
            source: cacheTraceSource,
          })
        : fallbackPayload,
    );
  }
}
