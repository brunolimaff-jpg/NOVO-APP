// services/storage/radar.ts
//
// POLÍTICA DE IDENTIDADE (PR #456 — validação v3):
// Leituras permanecem best-effort. Escritas, porém, lançam erro explícito em
// 'resolving'/'error' para nunca sinalizar sucesso quando nada foi persistido.
import { supabase, isSupabaseAvailable } from '../../lib/supabaseClient';
import {
  canUseProtectedRemoteStorage,
  getIdentityState,
  getOperatorId,
  getOperatorIdForWrite,
} from './_shared';
import { scoutDiag } from '../../utils/diagnosticLog';

function warnRadar(message: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(message, error);
    return;
  }

  console.warn(message);
}

export const radar = {
  async getRadarAlerts(): Promise<unknown[]> {
    if (!isSupabaseAvailable()) return [];
    if (!canUseProtectedRemoteStorage()) return [];
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
      warnRadar('[Storage] getRadarAlerts skipped', error);
      return [];
    }
    return (data?.alert_data as unknown[]) || [];
  },

  async saveRadarAlerts(alerts: unknown[]): Promise<void> {
    if (getIdentityState() === 'guest') {
      scoutDiag.info('StorageRadar', 'guest_local_only', { resource: 'alerts' });
      return;
    }
    const operatorId = getOperatorIdForWrite();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!
      .from('radar_alerts')
      .upsert({ alert_data: alerts, operator_id: operatorId }, { onConflict: 'operator_id' });

    if (error) warnRadar('[Storage] saveRadarAlerts skipped', error);
  },

  async getRadarConfig(): Promise<unknown | null> {
    if (!isSupabaseAvailable()) return null;
    if (!canUseProtectedRemoteStorage()) return null;
    const operatorId = getOperatorId();
    if (!operatorId) return null;

    const { data, error } = await supabase!
      .from('radar_configs')
      .select('config')
      .eq('operator_id', operatorId)
      .maybeSingle();

    if (error) {
      warnRadar('[Storage] getRadarConfig skipped', error);
      return null;
    }
    return data?.config ?? null;
  },

  async saveRadarConfig(config: unknown): Promise<void> {
    if (getIdentityState() === 'guest') {
      scoutDiag.info('StorageRadar', 'guest_local_only', { resource: 'config' });
      return;
    }
    const operatorId = getOperatorIdForWrite();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!
      .from('radar_configs')
      .upsert({ config, operator_id: operatorId }, { onConflict: 'operator_id' });

    if (error) warnRadar('[Storage] saveRadarConfig skipped', error);
  },
};
