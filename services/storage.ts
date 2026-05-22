// services/storage.ts
// Unified storage interface that wraps Supabase + IDB for offline support

import { get, set } from 'idb-keyval';
import { supabase, isSupabaseAvailable } from '../lib/supabaseClient';
import { syncQueue } from './syncQueue';
import type { ChatSession } from '../types';

// ===================================================================
// IDB KEYS (same as existing to preserve data)
// ===================================================================

const IDB_KEYS = {
  SESSIONS: 'scout360_sessions_v2',
  RADAR_ALERTS: 'scout360_radar_alerts',
  RADAR_CONFIG: 'scout360_radar_config',
  RADAR_LAST_SCAN: 'scout360_radar_last_scan',
  RADAR_META_INSIGHT: 'scout360_radar_meta_insight',
  EXTRACT_CACHE_PREFIX: 'ext-cache-',
} as const;

// ===================================================================
// HELPERS
// ===================================================================

function getOperatorId(): string | null {
  return localStorage.getItem('scout360:operator_id');
}

async function getLocalSessions(): Promise<ChatSession[]> {
  try {
    return (await get<ChatSession[]>(IDB_KEYS.SESSIONS)) || [];
  } catch {
    return [];
  }
}

async function setLocalSessions(sessions: ChatSession[]): Promise<void> {
  await set(IDB_KEYS.SESSIONS, sessions);
}

// ===================================================================
// STORAGE INTERFACE
// ===================================================================

export const storage = {
  // ===================================================================
  // DOSSIERS
  // ===================================================================

  async getDossiers(): Promise<ChatSession[]> {
    // Read from IDB immediately
    const sessions = await getLocalSessions();

    // Trigger background Supabase refresh (stale-while-revalidate)
    if (isSupabaseAvailable()) {
      const operatorId = getOperatorId();
      if (operatorId) {
        const query = supabase!
          .from('dossies')
          .select('*')
          .eq('operator_id', operatorId)
          .is('deleted_at', null);

        // Fire and forget background refresh
        (async () => {
          try {
            const { data } = await query;
            if (data && data.length > 0) {
              const sessions = data.map(
                (row: { content: ChatSession }) => row.content
              );
              await setLocalSessions(sessions);
            }
          } catch {
            // Silently ignore errors in background refresh
          }
        })();
      }
    }

    return sessions;
  },

  async getDossier(id: string): Promise<ChatSession | null> {
    const sessions = await getLocalSessions();
    return sessions.find((s) => s.id === id) || null;
  },

  async saveDossier(session: ChatSession): Promise<void> {
    // Save to IDB immediately (instant)
    const sessions = await getLocalSessions();
    const existingIndex = sessions.findIndex((s) => s.id === session.id);
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.push(session);
    }
    await setLocalSessions(sessions);

    // Enqueue sync for background Supabase sync
    const operatorId = getOperatorId();
    if (!operatorId) return; // Local-only until registered

    syncQueue.enqueue({
      table: 'dossies',
      operation: 'upsert',
      data: {
        id: session.id,
        operator_id: operatorId,
        title: session.title,
        empresa_alvo: session.empresaAlvo,
        cnpj: session.cnpj,
        modo_principal: session.modoPrincipal,
        score_oportunidade: session.scoreOportunidade,
        resumo_dossie: session.resumoDossie,
        content: session as unknown as Record<string, unknown>,
        updated_at: session.updatedAt,
      },
      id: session.id,
    });
    scheduleSync();
  },

  async saveAllDossiers(sessions: ChatSession[]): Promise<void> {
    // Bulk save to IDB
    await setLocalSessions(sessions);

    // Enqueue sync for each session
    const operatorId = getOperatorId();
    if (!operatorId) return; // Local-only until registered

    for (const session of sessions) {
      syncQueue.enqueue({
        table: 'dossies',
        operation: 'upsert',
        data: {
          id: session.id,
          operator_id: operatorId,
          title: session.title,
          empresa_alvo: session.empresaAlvo,
          cnpj: session.cnpj,
          modo_principal: session.modoPrincipal,
          score_oportunidade: session.scoreOportunidade,
          resumo_dossie: session.resumoDossie,
          content: session as unknown as Record<string, unknown>,
          updated_at: session.updatedAt,
        },
        id: session.id,
      });
    }
    scheduleSync();
  },

  async deleteDossier(id: string): Promise<void> {
    // Remove from local sessions
    const sessions = await getLocalSessions();
    const filtered = sessions.filter((s) => s.id !== id);
    await setLocalSessions(filtered);

    // Enqueue soft delete via syncQueue
    const operatorId = getOperatorId();
    if (!operatorId) return; // Local-only until registered

    syncQueue.enqueue({
      table: 'dossies',
      operation: 'upsert',
      data: {
        id,
        operator_id: operatorId,
        deleted_at: new Date().toISOString(),
      },
      id,
    });
    scheduleSync();
  },

  // ===================================================================
  // RADAR
  // ===================================================================

  async getRadarAlerts(): Promise<unknown[]> {
    try {
      return (await get<unknown[]>(IDB_KEYS.RADAR_ALERTS)) || [];
    } catch {
      return [];
    }
  },

  async saveRadarAlerts(alerts: unknown[]): Promise<void> {
    await set(IDB_KEYS.RADAR_ALERTS, alerts);

    const operatorId = getOperatorId();
    if (!operatorId) return; // Local-only until registered

    syncQueue.enqueue({
      table: 'radar_alerts',
      operation: 'upsert',
      data: { alert_data: alerts, operator_id: operatorId },
      id: 'alerts', // Bulk operation
    });
    scheduleSync();
  },

  async getRadarConfig(): Promise<unknown | null> {
    try {
      return await get<unknown>(IDB_KEYS.RADAR_CONFIG);
    } catch {
      return null;
    }
  },

  async saveRadarConfig(config: unknown): Promise<void> {
    await set(IDB_KEYS.RADAR_CONFIG, config);

    const operatorId = getOperatorId();
    if (!operatorId) return; // Local-only until registered

    syncQueue.enqueue({
      table: 'radar_configs',
      operation: 'upsert',
      data: { config, operator_id: operatorId },
      id: 'config', // Single config per operator
    });
    scheduleSync();
  },

  async getRadarLastScan(): Promise<number | null> {
    try {
      const result = await get<number>(IDB_KEYS.RADAR_LAST_SCAN);
      return result ?? null;
    } catch {
      return null;
    }
  },

  async saveRadarLastScan(ts: number): Promise<void> {
    // IDB only (no Supabase sync needed, it's just a timestamp)
    await set(IDB_KEYS.RADAR_LAST_SCAN, ts);
  },

  async getRadarMetaInsight(): Promise<string | null> {
    try {
      const result = await get<string | null>(IDB_KEYS.RADAR_META_INSIGHT);
      return result ?? null;
    } catch {
      return null;
    }
  },

  async saveRadarMetaInsight(insight: string | null): Promise<void> {
    // IDB only (no Supabase sync needed)
    await set(IDB_KEYS.RADAR_META_INSIGHT, insight);
  },

  // ===================================================================
  // EXTRACT CACHE
  // ===================================================================

  async getExtractCache(cacheKey: string): Promise<{ result: unknown; timestamp: number } | null> {
    try {
      const result = await get<{ result: unknown; timestamp: number }>(
        IDB_KEYS.EXTRACT_CACHE_PREFIX + cacheKey
      );
      return result ?? null;
    } catch {
      return null;
    }
  },

  async saveExtractCache(cacheKey: string, result: unknown): Promise<void> {
    const entry = {
      result,
      timestamp: Date.now(),
    };
    await set(IDB_KEYS.EXTRACT_CACHE_PREFIX + cacheKey, entry);

    // Enqueue sync with expires_at (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const operatorId = getOperatorId();
    if (!operatorId) return; // Local-only until registered

    syncQueue.enqueue({
      table: 'extract_cache',
      operation: 'upsert',
      data: {
        id: cacheKey,
        result,
        expires_at: expiresAt.toISOString(),
        operator_id: operatorId,
      },
      id: cacheKey,
    });
    scheduleSync();
  },

  // ===================================================================
  // USER CONTEXT
  // ===================================================================

  async saveUserContext(data: { operatorId: string; name: string; email: string }): Promise<void> {
    // SyncQueue only (no local IDB, just goes to Supabase)
    const operatorId = data.operatorId;
    if (!operatorId) return; // Local-only until registered

    syncQueue.enqueue({
      table: 'user_context',
      operation: 'upsert',
      data: {
        operator_id: data.operatorId,
        display_name: data.name,
        email: data.email,
        last_seen: new Date().toISOString(),
      },
      id: data.operatorId,
    });
    scheduleSync();
  },

  // ===================================================================
  // AUDIT LOG
  // ===================================================================

  async logAudit(
    action: string,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Direct Supabase insert (fire and forget, no queue)
    if (isSupabaseAvailable()) {
      const operatorId = getOperatorId();
      if (!operatorId) return; // Local-only until registered

      void supabase!
        .from('audit_log')
        .insert({
          action,
          target_type: targetType,
          target_id: targetId,
          metadata,
          operator_id: operatorId,
          created_at: new Date().toISOString(),
        });
    }
  },

  // ===================================================================
  // FAVORITES
  // ===================================================================

  async getFavorites(): Promise<unknown[]> {
    // Direct Supabase read
    if (!isSupabaseAvailable()) {
      return [];
    }

    const operatorId = getOperatorId();
    if (!operatorId) {
      return [];
    }

    const { data } = await supabase!
      .from('favorites')
      .select('*')
      .eq('operator_id', operatorId);

    return data || [];
  },

  async addFavorite(
    cnpj: string,
    companyName: string,
    reason?: string,
    dossierId?: string
  ): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) {
      return;
    }

    // Supabase upsert with onConflict to prevent duplicates
    void supabase!
      .from('favorites')
      .upsert({
        operator_id: operatorId,
        cnpj,
        company_name: companyName,
        reason,
        dossier_id: dossierId,
        created_at: new Date().toISOString(),
      }, { onConflict: 'operator_id,cnpj' });

    // Log audit
    await this.logAudit('favorite_added', 'dossier', dossierId, {
      cnpj,
      company_name: companyName,
      reason,
    });
  },

  async removeFavorite(cnpj: string): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) {
      return;
    }

    void supabase!
      .from('favorites')
      .delete()
      .eq('operator_id', operatorId)
      .eq('cnpj', cnpj);

    // Log audit
    await this.logAudit('favorite_removed', 'dossier', undefined, { cnpj });
  },

  // ===================================================================
  // SHARED DOSSIERS
  // ===================================================================

  async shareDossier(dossierId: string): Promise<string | null> {
    if (!isSupabaseAvailable()) {
      return null;
    }

    const operatorId = getOperatorId();
    if (!operatorId) return null;

    // Generate UUID token
    const token = crypto.randomUUID();

    // Get dossier content
    const dossier = await this.getDossier(dossierId);
    if (!dossier) {
      return null;
    }

    // Insert to shared_dossiers — only stores the link, content lives in dossies
    const { error } = await supabase!
      .from('shared_dossiers')
      .insert({
        access_token: token,
        dossier_id: dossierId,
        operator_id: operatorId,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('access_token')
      .single();

    if (error) {
      console.error('[Storage] Failed to share dossier:', error);
      return null;
    }

    return token;
  },

  async getSharedDossier(accessToken: string): Promise<ChatSession | null> {
    if (!isSupabaseAvailable()) {
      return null;
    }

    // Find the share link, then fetch the actual dossier
    const { data: shareData, error: shareError } = await supabase!
      .from('shared_dossiers')
      .select('dossier_id')
      .eq('access_token', accessToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (shareError || !shareData) {
      return null;
    }

    // Fetch the actual dossier content from dossies table
    const { data: dossierData, error: dossierError } = await supabase!
      .from('dossies')
      .select('content')
      .eq('id', shareData.dossier_id)
      .is('deleted_at', null)
      .single();

    if (dossierError || !dossierData) {
      return null;
    }

    return dossierData.content as ChatSession;
  },

  // ===================================================================
  // SYNC
  // ===================================================================

  getSyncQueueSize(): number {
    return syncQueue.size();
  },

  getSyncQueueItems(): { table: string; operation: string }[] {
    return syncQueue.peek().map((op) => ({
      table: op.table,
      operation: op.operation,
    }));
  },

  async resetSyncQueue(): Promise<void> {
    syncQueue.clear();
    await syncQueue.persist();
  },

  async processSyncQueue(): Promise<void> {
    if (!isSupabaseAvailable()) {
      return;
    }

    // Load queue from IDB
    await syncQueue.load();

    if (syncQueue.size() === 0) {
      return;
    }

    // Tables with unique constraints on non-PK columns need explicit onConflict
    const conflictColumns: Record<string, string> = {
      user_context: 'operator_id',
      radar_configs: 'operator_id',
      favorites: 'operator_id,cnpj',
      radar_alerts: 'operator_id',
    };

    // Process all operations with Supabase executor
    await syncQueue.processAll(async (op) => {
      const { table, operation, data } = op;

      if (operation === 'upsert') {
        const onConflict = conflictColumns[table];
        const { error } = await supabase!.from(table).upsert(
          data,
          onConflict ? { onConflict } : undefined
        );
        if (error) throw new Error(error.message);
      } else if (operation === 'delete') {
        const id = op.id;
        if (id) {
          const { error } = await supabase!.from(table).delete().eq('id', id);
          if (error) throw new Error(error.message);
        }
      }
    });
  },
};

// ===================================================================
// SYNC SCHEDULER
// ===================================================================

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSync(): void {
  if (!isSupabaseAvailable()) return;
  if (syncTimer !== null) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    storage.processSyncQueue();
  }, 1000);
}