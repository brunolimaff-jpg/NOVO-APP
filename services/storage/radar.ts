// services/storage/radar.ts
import { supabase, isSupabaseAvailable } from '../../lib/supabaseClient';
import { getOperatorId } from './_shared';

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
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!
      .from('radar_alerts')
      .upsert({ alert_data: alerts, operator_id: operatorId }, { onConflict: 'operator_id' });

    if (error) warnRadar('[Storage] saveRadarAlerts skipped', error);
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
      warnRadar('[Storage] getRadarConfig skipped', error);
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

    if (error) warnRadar('[Storage] saveRadarConfig skipped', error);
  },
};
