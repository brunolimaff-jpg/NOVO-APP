import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { scoutDiag } from '../../utils/diagnosticLog';
import type { ChatSession } from '../../types';

export interface ExistingDossier {
  id: string;
  title: string;
  empresaAlvo: string;
  createdAt: string;
  scoreOportunidade: number | null;
  isOwner: boolean;
}

export interface ReusedDossier {
  dossierId: string;
  content: ChatSession;
  wasCloned: boolean;
}

function mapDossierRow(row: Record<string, unknown>): ExistingDossier {
  return {
    id: row.dossier_id as string,
    title: row.title as string,
    empresaAlvo: row.empresa_alvo as string,
    createdAt: row.created_at as string,
    scoreOportunidade: (row.score_oportunidade as number) ?? null,
    isOwner: Boolean(row.is_owner),
  };
}

export async function findExistingDossier(
  cnpj: string | null | undefined,
  empresaAlvo: string | null | undefined,
  operatorId: string,
): Promise<ExistingDossier | null> {
  if (!isSupabaseAvailable() || !operatorId) return null;

  const { data, error } = await supabase!.rpc('find_reusable_dossier', {
    p_cnpj: cnpj ?? null,
    p_empresa_alvo: empresaAlvo ?? null,
  });

  if (error) {
    scoutDiag.warn('dossierDuplicate', 'Erro na descoberta segura de dossiê reutilizável', {
      error: error.message,
    });
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapDossierRow(row as Record<string, unknown>) : null;
}

export async function reuseDossierForCurrentOperator(sourceDossierId: string): Promise<ReusedDossier> {
  if (!isSupabaseAvailable()) {
    throw new Error('Supabase indisponível para abrir o dossiê');
  }

  const { data, error } = await supabase!.rpc('reuse_dossier_for_current_operator', {
    p_source_dossier_id: sourceDossierId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new Error('A reutilização não retornou uma sessão válida');
  }

  const record = row as Record<string, unknown>;
  const dossierId = record.dossier_id as string;
  const content = record.content as ChatSession | null;
  if (!dossierId || !content || content.id !== dossierId) {
    throw new Error('A cópia retornada está inconsistente');
  }

  return {
    dossierId,
    content,
    wasCloned: Boolean(record.was_cloned),
  };
}
