// services/storage.ts
// Unified storage interface that wraps Supabase + IDB for offline support

import { get, set } from 'idb-keyval';
import { supabase, isSupabaseAvailable } from '../lib/supabaseClient';
import { syncQueue } from './syncQueue';
import type { SyncOperation } from './syncQueue';
import type { ChatSession } from '../types';

interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

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

const USER_CONTEXT_TOUCH_DEBOUNCE_MS = 60_000;
const DOSSIER_AUTO_SYNC_DEBOUNCE_MS = 750;
const userContextTouchTimestamps = new Map<string, number>();
let backgroundSyncInFlight = false;
let dossierAutoSyncInFlight = false;
let dossierAutoSyncNeedsRerun = false;
let dossierAutoSyncShouldPull = false;
let dossierAutoSyncTimer: ReturnType<typeof setTimeout> | null = null;

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

function isDossierOperation(op: SyncOperation): boolean {
  return op.table === 'dossies';
}

function emitSyncComplete(detail: SyncResult): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('scout:sync-complete', { detail }));
}

function requestDossierSyncRerun(options: { pull?: boolean } = {}): void {
  dossierAutoSyncNeedsRerun = true;
  dossierAutoSyncShouldPull = dossierAutoSyncShouldPull || Boolean(options.pull);
}

async function executeSupabaseOperation(op: SyncOperation): Promise<void> {
  const conflictColumns: Record<string, string> = {
    user_context: 'operator_id',
    radar_configs: 'operator_id',
    favorites: 'operator_id,cnpj',
    radar_alerts: 'operator_id',
  };

  const { table, operation, data } = op;

  if (operation === 'upsert') {
    const onConflict = conflictColumns[table];
    const { error } = await supabase!.from(table).upsert(
      data,
      onConflict ? { onConflict } : undefined
    );
    if (error) throw new Error(error.message);
    return;
  }

  if (operation === 'delete' && op.id) {
    const { error } = await supabase!.from(table).delete().eq('id', op.id);
    if (error) throw new Error(error.message);
  }
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

    this.scheduleDossierSync();
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

    this.scheduleDossierSync();
  },

  async deleteDossier(id: string): Promise<void> {
    // Remove from local sessions
    const sessions = await getLocalSessions();
    const deletedSession = sessions.find((s) => s.id === id);
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
        ...(deletedSession
          ? {
              title: deletedSession.title,
              empresa_alvo: deletedSession.empresaAlvo,
              cnpj: deletedSession.cnpj,
              modo_principal: deletedSession.modoPrincipal,
              score_oportunidade: deletedSession.scoreOportunidade,
              resumo_dossie: deletedSession.resumoDossie,
              content: deletedSession as unknown as Record<string, unknown>,
            }
          : {}),
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      id,
    });

    this.scheduleDossierSync();
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

  },

  // ===================================================================
  // USER CONTEXT
  // ===================================================================

  async saveUserContext(data: { operatorId: string; name: string; email: string }): Promise<void> {
    const operatorId = data.operatorId;
    if (!operatorId) return; // Local-only until registered

    const payload = {
      operator_id: data.operatorId,
      display_name: data.name,
      email: data.email,
      last_seen: new Date().toISOString(),
    };

    if (isSupabaseAvailable()) {
      try {
        const { error } = await supabase!
          .from('user_context')
          .upsert(payload, { onConflict: 'operator_id' });

        if (!error) {
          syncQueue.remove('user_context', operatorId);
          return;
        }

        console.warn('storage.saveUserContext: upsert remoto falhou, mantendo retry', error);
      } catch (error) {
        console.warn('storage.saveUserContext: erro remoto, mantendo retry', error);
      }
    }

    syncQueue.enqueue({
      table: 'user_context',
      operation: 'upsert',
      data: payload,
      id: data.operatorId,
    });

  },

  async touchUserContext(operatorId: string): Promise<void> {
    if (!operatorId || !isSupabaseAvailable()) return;

    const now = Date.now();
    const lastTouch = userContextTouchTimestamps.get(operatorId) ?? 0;
    if (now - lastTouch < USER_CONTEXT_TOUCH_DEBOUNCE_MS) {
      return;
    }

    userContextTouchTimestamps.set(operatorId, now);

    try {
      const { error: updateError } = await supabase!
        .from('user_context')
        .update({ last_seen: new Date().toISOString() })
        .eq('operator_id', operatorId);

      if (updateError) {
        console.warn('storage.touchUserContext: last_seen remoto falhou', updateError);
      }
    } catch (error) {
      console.warn('storage.touchUserContext: erro remoto ao atualizar last_seen', error);
    }
  },

  // ===================================================================
  // USER LOOKUP
  // ===================================================================

  async findUserByEmail(email: string): Promise<{ operatorId: string; displayName: string } | null> {
    if (!isSupabaseAvailable()) return null;

    const { data, error } = await supabase!
      .from('user_context')
      .select('operator_id, display_name')
      .eq('email', email)
      .maybeSingle();

    if (error || !data) return null;

    return {
      operatorId: data.operator_id,
      displayName: data.display_name || '',
    };
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

  scheduleDossierSync(options: { pull?: boolean } = {}): void {
    if (!isSupabaseAvailable() || !getOperatorId()) {
      return;
    }

    dossierAutoSyncShouldPull = dossierAutoSyncShouldPull || Boolean(options.pull);

    if (dossierAutoSyncTimer) {
      clearTimeout(dossierAutoSyncTimer);
    }

    dossierAutoSyncTimer = setTimeout(() => {
      dossierAutoSyncTimer = null;
      const shouldPull = dossierAutoSyncShouldPull;
      dossierAutoSyncShouldPull = false;

      void this.syncDossiers({ pull: shouldPull })
        .then((result: SyncResult) => {
          if (result.pushed > 0 || result.pulled > 0 || result.errors.length > 0) {
            emitSyncComplete(result);
          }
        })
        .catch((error: unknown) => {
          console.warn('storage.scheduleDossierSync: erro no sync de dossies', error);
        });
    }, DOSSIER_AUTO_SYNC_DEBOUNCE_MS);
  },

  async syncDossiers(options: { pull?: boolean } = {}): Promise<SyncResult> {
    const errors: string[] = [];
    let pushed = 0;
    let pulled = 0;

    if (dossierAutoSyncInFlight) {
      requestDossierSyncRerun(options);
      return { pushed, pulled, errors };
    }

    if (!isSupabaseAvailable()) {
      return { pushed, pulled, errors: ['Supabase indisponivel'] };
    }

    const operatorId = getOperatorId();
    if (!operatorId) {
      return { pushed, pulled, errors: ['Operador nao registrado'] };
    }

    dossierAutoSyncInFlight = true;
    dossierAutoSyncNeedsRerun = false;

    try {
      await syncQueue.load();
      const pendingBefore = syncQueue.peek().filter(isDossierOperation).length;
      let failedPushes = 0;

      if (pendingBefore > 0) {
        const didProcess = await syncQueue.processWhere(isDossierOperation, async (op) => {
          try {
            await executeSupabaseOperation(op);
            pushed += 1;
          } catch (error) {
            failedPushes += 1;
            throw error;
          }
        });

        if (!didProcess) {
          requestDossierSyncRerun(options);
          return { pushed, pulled, errors };
        }
      }

      const pendingAfter = syncQueue.peek().filter(isDossierOperation).length;

      if (failedPushes > 0) {
        errors.push(`${failedPushes} dossie(s) falharam no envio`);
      }

      if (options.pull && pendingAfter === 0) {
        try {
          const { data, error } = await supabase!
            .from('dossies')
            .select('content')
            .eq('operator_id', operatorId)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false });

          if (error) {
            errors.push('Erro ao baixar dossies');
          } else if (data) {
            const sessions = data.map((row: { content: ChatSession }) => row.content);
            await setLocalSessions(sessions);
            pulled = sessions.length;
          }
        } catch (e) {
          errors.push('Falha ao baixar dossies: ' + (e instanceof Error ? e.message : String(e)));
        }
      }
    } finally {
      dossierAutoSyncInFlight = false;
      if (dossierAutoSyncNeedsRerun) {
        this.scheduleDossierSync();
      }
    }

    return { pushed, pulled, errors };
  },

  scheduleBackgroundSync(): void {
    if (backgroundSyncInFlight || !isSupabaseAvailable()) {
      return;
    }

    backgroundSyncInFlight = true;
    void this.processSyncQueue()
      .then(() => this.syncDossiers({ pull: true }))
      .then((result: SyncResult) => {
        if (result.pushed > 0 || result.pulled > 0 || result.errors.length > 0) {
          emitSyncComplete(result);
        }
      })
      .catch((error: unknown) => {
        console.warn('storage.scheduleBackgroundSync: erro no sync em background', error);
      })
      .finally(() => {
        backgroundSyncInFlight = false;
      });
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

    // Process all operations with Supabase executor
    await syncQueue.processAll(executeSupabaseOperation);
  },

  // ===================================================================
  // MANUAL SYNC (push + pull)
  // ===================================================================

  async syncAll(): Promise<{ pushed: number; pulled: number; errors: string[] }> {
    const errors: string[] = [];
    // eslint-disable-next-line no-useless-assignment -- early returns use this value
    let pushed = 0;
     
    let pulled = 0;

    if (!isSupabaseAvailable()) {
      return { pushed: 0, pulled: 0, errors: ['Supabase indisponivel'] };
    }

    const operatorId = getOperatorId();
    if (!operatorId) {
      return { pushed: 0, pulled: 0, errors: ['Operador nao registrado'] };
    }

    // 1. Push: process pending queue
    const pendingBefore = syncQueue.size();
    await this.processSyncQueue();
    const pendingAfter = syncQueue.size();
    pushed = pendingBefore - pendingAfter;
    if (pendingAfter > 0) {
      errors.push(`${pendingAfter} itens falharam no envio`);
    }

    // 2. Pull: download dossiers from Supabase
    try {
      const { data, error } = await supabase!
        .from('dossies')
        .select('content')
        .eq('operator_id', operatorId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (error) {
        errors.push('Erro ao baixar dossies');
      } else if (data) {
        const sessions = data.map((row: { content: ChatSession }) => row.content);
        await setLocalSessions(sessions);
        pulled += sessions.length;
      }
    } catch (e) {
      errors.push('Falha ao baixar dossies: ' + (e instanceof Error ? e.message : String(e)));
    }

    // 3. Pull: download radar alerts
    try {
      const { data, error } = await supabase!
        .from('radar_alerts')
        .select('alert_data')
        .eq('operator_id', operatorId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data?.alert_data) {
        await set('scout360_radar_alerts', data.alert_data);
        pulled++;
      }
    } catch {
      // non-critical
    }

    return { pushed, pulled, errors };
  },
};
