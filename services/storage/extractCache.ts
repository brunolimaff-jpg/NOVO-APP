// services/storage/extractCache.ts
//
// POLÍTICA DE IDENTIDADE (PR #456 — validação v3):
// A replicação para o Supabase (extract_cache) só ocorre em sessão autenticada
// resolvida. Em 'resolving'/'error', a operação lança erro explícito antes de
// escrever para não comunicar sucesso parcial ou omitir a réplica remota.
import { get, set } from 'idb-keyval';
import { supabase, isSupabaseAvailable } from '../../lib/supabaseClient';
import {
  canUseProtectedRemoteStorage,
  getIdentityState,
  getOperatorIdForWrite,
} from './_shared';
import { scoutDiag } from '../../utils/diagnosticLog';

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
    // IDB local não depende de operator_id — sempre grava.
    await set(IDB_KEYS.EXTRACT_CACHE_PREFIX + cacheKey, entry);

    if (!isSupabaseAvailable()) return;

    if (getIdentityState() === 'guest') {
      scoutDiag.info('StorageExtractCache', 'guest_local_only', { cacheKey });
      return;
    }

    // Consultar a identidade somente no limite da réplica remota. Assim, em
    // resolving/error o cache local permanece salvo e a falha remota é visível.
    const operatorId = getOperatorIdForWrite();
    if (!canUseProtectedRemoteStorage() || !operatorId) return;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error } = await supabase!.from('extract_cache').upsert({
      id: cacheKey,
      result,
      expires_at: expiresAt.toISOString(),
      operator_id: operatorId,
    });
    if (error) throw new Error(error.message);
  },
};
