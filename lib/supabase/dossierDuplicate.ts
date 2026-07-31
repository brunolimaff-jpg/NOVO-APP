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

export type DossierDiscoveryResult =
  | { status: 'FOUND'; dossier: ExistingDossier }
  | { status: 'NOT_FOUND' }
  | { status: 'UNAVAILABLE' }
  | { status: 'ACCESS_DENIED' };

interface SupabaseRpcError {
  code?: string;
  message?: string;
}

function normalizeRpcError(error: unknown): SupabaseRpcError {
  if (!error || typeof error !== 'object') {
    return { message: String(error) };
  }
  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : String(error),
  };
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
): Promise<DossierDiscoveryResult> {
  if (!isSupabaseAvailable() || !operatorId) return { status: 'UNAVAILABLE' };

  let response;
  try {
    response = await supabase!.rpc('find_reusable_dossier', {
      p_cnpj: cnpj ?? null,
      p_empresa_alvo: empresaAlvo ?? null,
    });
  } catch (caught) {
    const rpcError = normalizeRpcError(caught);
    scoutDiag.warn('dossierDuplicate', 'Falha de transporte na descoberta segura de dossiê', {
      code: rpcError.code,
      error: rpcError.message,
    });
    return { status: 'UNAVAILABLE' };
  }
  const { data, error } = response;

  if (error) {
    scoutDiag.warn('dossierDuplicate', 'Erro na descoberta segura de dossiê reutilizável', {
      code: error.code,
      error: error.message,
    });
    return error.code === '42501' ? { status: 'ACCESS_DENIED' } : { status: 'UNAVAILABLE' };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row
    ? { status: 'FOUND', dossier: mapDossierRow(row as Record<string, unknown>) }
    : { status: 'NOT_FOUND' };
}

export async function reuseDossierForCurrentOperator(sourceDossierId: string): Promise<ReusedDossier> {
  if (!isSupabaseAvailable()) {
    throw new Error('Não foi possível abrir o dossiê. Tente novamente.');
  }

  let response;
  try {
    response = await supabase!.rpc('reuse_dossier_for_current_operator', {
      p_source_dossier_id: sourceDossierId,
    });
  } catch (caught) {
    const rpcError = normalizeRpcError(caught);
    scoutDiag.warn('dossierDuplicate', 'Falha de transporte ao reutilizar dossiê', {
      code: rpcError.code,
      error: rpcError.message,
    });
    throw new Error('Não foi possível abrir o dossiê. Tente novamente.', { cause: caught });
  }
  const { data, error } = response;

  if (error) {
    const rpcError = error as SupabaseRpcError;
    scoutDiag.warn('dossierDuplicate', 'Erro ao reutilizar dossiê', {
      code: rpcError.code,
      error: rpcError.message,
    });
    if (rpcError.code === '42501') {
      throw new Error('Seu acesso corporativo não foi autorizado.');
    }
    if (rpcError.code === 'P0002') {
      throw new Error('O dossiê não está mais disponível.');
    }
    throw new Error('Não foi possível abrir o dossiê. Tente novamente.');
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
