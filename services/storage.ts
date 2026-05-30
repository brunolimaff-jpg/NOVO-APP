// services/storage.ts
// Storage interface — acesso direto ao Supabase.
// IDB mantido APENAS para extract cache (TTL 7 dias).

import { get, set } from 'idb-keyval';
import { supabase, isSupabaseAvailable } from '../lib/supabaseClient';
import { trackOperatorEvent } from './operatorTracking';
import type { ChatSession } from '../types';

// ===================================================================
// IDB KEYS (mantido apenas extract cache)
// ===================================================================

const IDB_KEYS = {
  EXTRACT_CACHE_PREFIX: 'ext-cache-',
} as const;

function getOperatorId(): string | null {
  return localStorage.getItem('scout360:operator_id');
}

// ===================================================================
// STORAGE INTERFACE
// ===================================================================

export const storage = {
  // ===================================================================
  // DOSSIERS
  // ===================================================================

  async getDossiers(): Promise<ChatSession[]> {
    if (!isSupabaseAvailable()) return [];

    const operatorId = getOperatorId();
    if (!operatorId) return [];

    const { data, error } = await supabase!
      .from('dossies')
      .select('content')
      .eq('operator_id', operatorId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[Storage] getDossiers failed:', error);
      return [];
    }
    if (!data) return [];

    return data.map((row: { content: ChatSession | null }) => row.content).filter((s): s is ChatSession => s !== null);
  },

  async getDossier(id: string): Promise<ChatSession | null> {
    if (!isSupabaseAvailable()) return null;

    const { data, error } = await supabase!
      .from('dossies')
      .select('content')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      console.error('[Storage] getDossier failed:', id, error);
      return null;
    }
    if (!data?.content) return null;
    return data.content as ChatSession;
  },

  async saveDossier(session: ChatSession): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!.from('dossies').upsert({
      id: session.id,
      operator_id: operatorId,
      operator_email: localStorage.getItem('scout360:operator_email') || null,
      title: session.title,
      empresa_alvo: session.empresaAlvo,
      cnpj: session.cnpj,
      modo_principal: session.modoPrincipal,
      score_oportunidade: session.scoreOportunidade,
      resumo_dossie: session.resumoDossie,
      content: session as unknown as Record<string, unknown>,
      updated_at: session.updatedAt || new Date().toISOString(),
    });

    if (error) {
      console.error('[Storage] saveDossier failed:', session.id, error);
    }
  },

  async saveAllDossiers(sessions: ChatSession[]): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const results = await Promise.allSettled(
      sessions.map(session =>
        supabase!.from('dossies').upsert({
          id: session.id,
          operator_id: operatorId,
          operator_email: localStorage.getItem('scout360:operator_email') || null,
          title: session.title,
          empresa_alvo: session.empresaAlvo,
          cnpj: session.cnpj,
          modo_principal: session.modoPrincipal,
          score_oportunidade: session.scoreOportunidade,
          resumo_dossie: session.resumoDossie,
          content: session as unknown as Record<string, unknown>,
          updated_at: session.updatedAt || new Date().toISOString(),
        }),
      ),
    );

    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`[Storage] saveAllDossiers: ${failures.length}/${sessions.length} upserts failed`);
    }
  },

  async deleteDossier(id: string): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!
      .from('dossies')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[Storage] deleteDossier failed:', id, error);
    }
  },

  // ===================================================================
  // EXTRACT CACHE (mantido IDB — TTL 7 dias, consultado frequentemente)
  // ===================================================================

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

    // Também salva no Supabase para cross-device (fire-and-forget)
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

  // ===================================================================
  // USER CONTEXT
  // ===================================================================

  async saveUserContext(data: { operatorId: string; name: string; email: string }): Promise<void> {
    if (!isSupabaseAvailable() || !data.operatorId) return;

    const emailNormalized = data.email?.toLowerCase().trim() || '';
    const payload = {
      operator_id: data.operatorId,
      display_name: data.name,
      email: data.email,
      email_normalized: emailNormalized,
      last_seen: new Date().toISOString(),
    };

    try {
      await supabase!.from('user_context').upsert(payload, { onConflict: 'operator_id' });
    } catch (error) {
      console.warn('storage.saveUserContext: erro remoto', error);
    }
  },

  async touchUserContext(operatorId: string): Promise<void> {
    if (!operatorId || !isSupabaseAvailable()) return;

    try {
      await supabase!
        .from('user_context')
        .update({ last_seen: new Date().toISOString() })
        .eq('operator_id', operatorId);
    } catch (error) {
      console.warn('storage.touchUserContext: erro remoto', error);
    }
  },

  async findUserByEmail(email: string): Promise<{ operatorId: string; displayName: string } | null> {
    if (!isSupabaseAvailable()) return null;

    const emailNormalized = email?.toLowerCase().trim() || '';
    if (!emailNormalized) return null;

    const { data, error } = await supabase!
      .from('user_context')
      .select('operator_id, display_name')
      .eq('email_normalized', emailNormalized)
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
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!isSupabaseAvailable()) return;

    const operatorId = getOperatorId();
    if (!operatorId) return;

    void supabase!.from('audit_log').insert({
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
      operator_id: operatorId,
      created_at: new Date().toISOString(),
    });
  },

  // ===================================================================
  // FAVORITES
  // ===================================================================

  async getFavorites(): Promise<unknown[]> {
    if (!isSupabaseAvailable()) return [];

    const operatorId = getOperatorId();
    if (!operatorId) return [];

    const { data } = await supabase!.from('favorites').select('*').eq('operator_id', operatorId);

    return data || [];
  },

  async addFavorite(cnpj: string, companyName: string, reason?: string, dossierId?: string): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    void supabase!.from('favorites').upsert(
      {
        operator_id: operatorId,
        cnpj,
        company_name: companyName,
        reason,
        dossier_id: dossierId,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'operator_id,cnpj' },
    );

    await this.logAudit('favorite_added', 'dossier', dossierId, {
      cnpj,
      company_name: companyName,
      reason,
    });
  },

  async removeFavorite(cnpj: string): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    void supabase!.from('favorites').delete().eq('operator_id', operatorId).eq('cnpj', cnpj);
    await this.logAudit('favorite_removed', 'dossier', undefined, { cnpj });
  },

  // ===================================================================
  // RADAR (alerts + config via Supabase, lastScan/metaInsight removidos)
  // ===================================================================

  async getRadarAlerts(): Promise<unknown[]> {
    if (!isSupabaseAvailable()) return [];
    const operatorId = getOperatorId();
    if (!operatorId) return [];

    const { data, error } = await supabase!
      .from('radar_alerts')
      .select('alert_data')
      .eq('operator_id', operatorId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Storage] getRadarAlerts failed:', error);
      return [];
    }
    return (data?.alert_data as unknown[]) || [];
  },

  async saveRadarAlerts(alerts: unknown[]): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!
      .from('radar_alerts')
      .upsert({ alert_data: alerts, operator_id: operatorId }, { onConflict: 'operator_id' });

    if (error) console.error('[Storage] saveRadarAlerts failed:', error);
  },

  async getRadarConfig(): Promise<unknown | null> {
    if (!isSupabaseAvailable()) return null;
    const operatorId = getOperatorId();
    if (!operatorId) return null;

    const { data, error } = await supabase!
      .from('radar_configs')
      .select('config')
      .eq('operator_id', operatorId)
      .maybeSingle();

    if (error) {
      console.error('[Storage] getRadarConfig failed:', error);
      return null;
    }
    return data?.config ?? null;
  },

  async saveRadarConfig(config: unknown): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!
      .from('radar_configs')
      .upsert({ config, operator_id: operatorId }, { onConflict: 'operator_id' });

    if (error) console.error('[Storage] saveRadarConfig failed:', error);
  },

  // ===================================================================
  // SHARED DOSSIERS
  // ===================================================================

  async shareDossier(dossierId: string): Promise<string | null> {
    if (!isSupabaseAvailable()) return null;

    const operatorId = getOperatorId();
    if (!operatorId) return null;

    const token = crypto.randomUUID();
    const dossier = await this.getDossier(dossierId);
    if (!dossier) return null;

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

    trackOperatorEvent('dossier_shared', {
      operatorId,
      email: localStorage.getItem('scout360:operator_email') || undefined,
      entityType: 'shared_dossier',
      entityId: dossierId,
      companyCnpj: dossier.cnpj || undefined,
      companyName: dossier.empresaAlvo || undefined,
      shareChannel: 'link',
    });

    return token;
  },

  async getSharedDossier(accessToken: string): Promise<ChatSession | null> {
    if (!isSupabaseAvailable()) return null;

    const { data: shareData, error: shareError } = await supabase!
      .from('shared_dossiers')
      .select('dossier_id')
      .eq('access_token', accessToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (shareError || !shareData) return null;

    const { data: dossierData, error: dossierError } = await supabase!
      .from('dossies')
      .select('content')
      .eq('id', shareData.dossier_id)
      .is('deleted_at', null)
      .single();

    if (dossierError || !dossierData) return null;

    return dossierData.content as ChatSession;
  },
};
