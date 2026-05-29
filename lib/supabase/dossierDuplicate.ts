import { supabase, isSupabaseAvailable } from '../supabaseClient';

export interface ExistingDossier {
  id: string;
  title: string;
  empresaAlvo: string;
  createdAt: string;
  scoreOportunidade: number | null;
}

function mapDossierRow(row: Record<string, unknown>): ExistingDossier {
  return {
    id: row.id as string,
    title: row.title as string,
    empresaAlvo: row.empresa_alvo as string,
    createdAt: row.created_at as string,
    scoreOportunidade: (row.score_oportunidade as number) ?? null,
  };
}

export async function findExistingDossier(
  cnpj: string | null | undefined,
  empresaAlvo: string | null | undefined,
  operatorId: string,
): Promise<ExistingDossier | null> {
  if (!isSupabaseAvailable() || !operatorId) return null;

  const cnpjDigits = cnpj?.replace(/\D/g, '') || '';

  if (cnpjDigits.length >= 11) {
    const { data, error } = await supabase!
      .from('dossies')
      .select('id, title, empresa_alvo, created_at, score_oportunidade')
      .eq('operator_id', operatorId)
      .eq('cnpj', cnpjDigits)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return mapDossierRow(data as Record<string, unknown>);
    }
  }

  if (empresaAlvo?.trim()) {
    const { data, error } = await supabase!
      .from('dossies')
      .select('id, title, empresa_alvo, created_at, score_oportunidade')
      .eq('operator_id', operatorId)
      .eq('empresa_alvo', empresaAlvo.trim())
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return mapDossierRow(data as Record<string, unknown>);
    }
  }

  return null;
}
