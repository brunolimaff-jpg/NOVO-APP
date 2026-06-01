// services/storage/extractCache.ts
import { get, set } from 'idb-keyval';
import { supabase, isSupabaseAvailable } from '../../lib/supabaseClient';
import { getOperatorId } from './_shared';

const IDB_KEYS = {
  EXTRACT_CACHE_PREFIX: 'ext-cache-',
} as const;

export const extractCache = {
  async getExtractCache(cacheKey: string): Promise<{ result: unknown; timestamp: number } | null> {
    try {
      const result = await get<{ result: unknown; timestamp: number }>(IDB_KEYS.EXTRACT_CACHE_PREFIX + cacheKey);
      return result ?? null;
    } catch {
      return null;
    }
  },

  async saveExtractCache(cacheKey: string, result: unknown): Promise<void> {
    const entry = { result, timestamp: Date.now() };
    await set(IDB_KEYS.EXTRACT_CACHE_PREFIX + cacheKey, entry);

    if (isSupabaseAvailable()) {
      const operatorId = getOperatorId();
      if (!operatorId) return;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      void supabase!.from('extract_cache').upsert({
        id: cacheKey,
        result,
        expires_at: expiresAt.toISOString(),
        operator_id: operatorId,
      });
    }
  },
};
