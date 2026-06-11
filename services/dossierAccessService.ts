// services/dossierAccessService.ts
// Fire-and-forget logging de acesso a dossies.
// NUNCA bloqueia UX — falhas sao silenciosas.

import { supabase, isSupabaseAvailable } from '../lib/supabaseClient';

export interface DossierAccessEntry {
  operatorId: string;
  displayName?: string;
  accessedAt: string;
}

export function logDossierAccess(dossierId: string, operatorId: string, cnpj?: string | null): void {
  if (!isSupabaseAvailable() || !dossierId || !operatorId) return;

  void (async () => {
    const { error } = await supabase!.from('dossier_accesses').insert({
      dossier_id: dossierId,
      operator_id: operatorId,
      cnpj: cnpj || null,
    });

    if (error) {
      console.warn('[dossierAccessService] logDossierAccess failed:', error.message);
    }
  })();
}

export async function getDossierAccessHistory(dossierId: string): Promise<DossierAccessEntry[]> {
  if (!isSupabaseAvailable() || !dossierId) return [];

  const { data, error } = await supabase!
    .from('dossier_accesses')
    .select('operator_id, accessed_at')
    .eq('dossier_id', dossierId)
    .order('accessed_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row: Record<string, unknown>) => ({
    operatorId: row.operator_id as string,
    accessedAt: row.accessed_at as string,
  }));
}

export async function getCompanyAccessCount(cnpj: string): Promise<number> {
  if (!isSupabaseAvailable() || !cnpj) return 0;

  const cnpjDigits = cnpj.replace(/\D/g, '');
  if (cnpjDigits.length < 11) return 0;

  const { count, error } = await supabase!
    .from('dossier_accesses')
    .select('*', { count: 'exact', head: true })
    .eq('cnpj', cnpjDigits);

  if (error || count === null) return 0;

  return count;
}
