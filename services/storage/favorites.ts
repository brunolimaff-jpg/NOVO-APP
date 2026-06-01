// services/storage/favorites.ts
import { supabase, isSupabaseAvailable } from '../../lib/supabaseClient';
import { getOperatorId } from './_shared';
import { audit } from './audit';

export const favorites = {
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

    supabase!.from('favorites').upsert(
      {
        operator_id: operatorId,
        cnpj,
        company_name: companyName,
        reason,
        dossier_id: dossierId,
      },
      { onConflict: 'operator_id,cnpj' },
    );

    await audit.logAudit('favorite_added', 'dossier', dossierId, {
      cnpj,
      company_name: companyName,
      reason,
    });
  },

  async removeFavorite(cnpj: string): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    void supabase!.from('favorites').delete().eq('operator_id', operatorId).eq('cnpj', cnpj);
    await audit.logAudit('favorite_removed', 'dossier', undefined, { cnpj });
  },
};
