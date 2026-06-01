// services/storage/sharedDossiers.ts
import { supabase, isSupabaseAvailable } from '../../lib/supabaseClient';
import { getOperatorId } from './_shared';
import { dossiers } from './dossiers';
import { trackOperatorEvent } from '../operatorTracking';
import type { ChatSession } from './types';

export const sharedDossiers = {
  async shareDossier(dossierId: string): Promise<string | null> {
    if (!isSupabaseAvailable()) return null;

    const operatorId = getOperatorId();
    if (!operatorId) return null;

    const token = crypto.randomUUID();
    const dossier = await dossiers.getDossier(dossierId);
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
      email: localStorage.getItem('scout360:operator_email') ?? undefined,
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
