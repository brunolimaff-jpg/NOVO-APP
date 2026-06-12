// services/dossierAccessService.ts
// Logging de acesso a dossies. Falhas sao silenciosas (nao bloqueiam UX).

import { supabase, isSupabaseAvailable } from '../lib/supabaseClient';
import { normalizeCnpj } from '../utils/cnpj';

export interface DossierAccessEntry {
  operatorId: string;
  displayName?: string;
  accessedAt: string;
}

function persistedCnpj(cnpj?: string | null): string | null {
  const digits = normalizeCnpj(cnpj);
  return digits.length === 14 ? digits : null;
}

export async function logDossierAccess(
  dossierId: string,
  operatorId: string,
  cnpj?: string | null,
): Promise<void> {
  if (!isSupabaseAvailable() || !dossierId || !operatorId) return;

  const { error } = await supabase!.from('dossier_accesses').insert({
    dossier_id: dossierId,
    operator_id: operatorId,
    cnpj: persistedCnpj(cnpj),
  });

  if (error) {
    console.warn('[dossierAccessService] logDossierAccess failed:', error.message);
  }
}

/** Requer leitura server-side (service_role); RLS bloqueia SELECT no client anon. */
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

/** Requer leitura server-side (service_role); RLS bloqueia SELECT no client anon. */
export async function getCompanyAccessCount(cnpj: string): Promise<number> {
  if (!isSupabaseAvailable() || !cnpj) return 0;

  const cnpjDigits = normalizeCnpj(cnpj);
  if (cnpjDigits.length !== 14) return 0;

  const { count, error } = await supabase!
    .from('dossier_accesses')
    .select('*', { count: 'exact', head: true })
    .eq('cnpj', cnpjDigits);

  if (error || count === null) return 0;

  return count;
}
