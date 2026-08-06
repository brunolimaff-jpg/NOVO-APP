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

  // P0: com o RLS isolado, os SELECTs acima só enxergam dossiês PRÓPRIOS. Para
  // preservar o comportamento aprovado da BRU-11 (#478) — informar que existe um
  // dossiê de OUTRO operador e exigir ação explícita — consultamos a RPC segura
  // que retorna APENAS a existência (booleano), sem id, content, score,
  // proprietário ou metadados. O resultado vira um sinal sintético que dispara o
  // modal fail-closed; nenhum dado estrangeiro trafega para o cliente.
  if (cnpjDigits.length >= 11) {
    const { data: exists, error: rpcError } = await supabase!
      .rpc('check_existing_dossier_for_cnpj', { p_cnpj: cnpjDigits });

    if (rpcError) {
      scoutDiag.warn('dossierDuplicate', 'Falha na descoberta segura de duplicidade', {
        cnpj: cnpjDigits,
        error: rpcError.message,
      });
    } else if (exists === true) {
      return {
        id: 'foreign-duplicate-signal',
        title: empresaAlvo?.trim() || 'Dossiê existente',
        empresaAlvo: empresaAlvo?.trim() || '',
        createdAt: '',
        scoreOportunidade: null,
        operatorId: '__foreign_operator__',
      };
    }
  }

  return null;
}
