import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { scoutDiag } from '../../utils/diagnosticLog';

export interface ExistingDossier {
  id: string;
  title: string;
  empresaAlvo: string;
  createdAt: string;
  scoreOportunidade: number | null;
  operatorId: string;
}

function mapDossierRow(row: Record<string, unknown>): ExistingDossier {
  return {
    id: row.id as string,
    title: row.title as string,
    empresaAlvo: row.empresa_alvo as string,
    createdAt: row.created_at as string,
    scoreOportunidade: (row.score_oportunidade as number) ?? null,
    operatorId: row.operator_id as string,
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
      .select('id, title, empresa_alvo, created_at, score_oportunidade, operator_id')
      .eq('cnpj', cnpjDigits)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      scoutDiag.warn('dossierDuplicate', 'Erro Supabase na busca por CNPJ', {
        cnpj: cnpjDigits,
        error: error.message,
      });
    } else if (data) {
      return mapDossierRow(data as Record<string, unknown>);
    }
  }

  if (empresaAlvo?.trim()) {
    const { data, error } = await supabase!
      .from('dossies')
      .select('id, title, empresa_alvo, created_at, score_oportunidade, operator_id')
      .eq('empresa_alvo', empresaAlvo.trim())
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      scoutDiag.warn('dossierDuplicate', 'Erro Supabase na busca por empresa_alvo', {
        empresaAlvo: empresaAlvo.trim(),
        error: error.message,
      });
    } else if (data) {
      return mapDossierRow(data as Record<string, unknown>);
    }
  }

  return null;
}
