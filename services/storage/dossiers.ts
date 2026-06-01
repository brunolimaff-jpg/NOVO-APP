// services/storage/dossiers.ts
import { supabase, isSupabaseAvailable } from '../../lib/supabaseClient';
import { getOperatorId } from './_shared';
import { storageGet } from '../../utils/localStorage';
import type { ChatSession } from './types';

function stripTransientState(session: ChatSession): ChatSession {
  return {
    ...session,
    messages: (session.messages || []).map(msg => ({
      ...msg,
      isThinking: false,
    })),
  };
}

export const dossiers = {
  async getDossiers(): Promise<ChatSession[]> {
    if (!isSupabaseAvailable()) return [];

    const operatorId = getOperatorId();
    if (!operatorId) return [];

    const { data, error } = await supabase!
      .from('dossies')
      .select('content')
      .eq('operator_id', operatorId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[Storage] getDossiers failed:', error);
      return [];
    }
    if (!data) return [];

    return data
      .map((row: { content: ChatSession | null }) => row.content)
      .filter((s): s is ChatSession => s != null)
      .map(session => ({
        ...session,
        messages: (session.messages || []).map(msg => ({
          ...msg,
          isThinking: false,
        })),
      }));
  },

  async getDossier(id: string): Promise<ChatSession | null> {
    if (!isSupabaseAvailable()) return null;

    const operatorId = getOperatorId();
    if (!operatorId) return null;

    const { data, error } = await supabase!
      .from('dossies')
      .select('content')
      .eq('id', id)
      .eq('operator_id', operatorId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      console.error('[Storage] getDossier failed:', id, error);
      return null;
    }
    if (!data?.content) return null;
    const session = data.content as ChatSession;
    return {
      ...session,
      messages: (session.messages || []).map(msg => ({ ...msg, isThinking: false })),
    };
  },

  async saveDossier(session: ChatSession): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const cleanSession = stripTransientState(session);

    const { error } = await supabase!.from('dossies').upsert({
      id: cleanSession.id,
      operator_id: operatorId,
      operator_email: storageGet('operator_email') ?? null,
      title: cleanSession.title,
      empresa_alvo: cleanSession.empresaAlvo,
      cnpj: cleanSession.cnpj,
      modo_principal: cleanSession.modoPrincipal,
      score_oportunidade: cleanSession.scoreOportunidade,
      resumo_dossie: cleanSession.resumoDossie,
      content: cleanSession as unknown as Record<string, unknown>,
      updated_at: cleanSession.updatedAt || new Date().toISOString(),
    });

    if (error) {
      console.error('[Storage] saveDossier failed:', session.id, error);
      throw new Error(error.message);
    }
  },

  async saveAllDossiers(sessions: ChatSession[]): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId || sessions.length === 0) return;

    const payloads = sessions.map(session => {
      const clean = stripTransientState(session);
      return {
        id: clean.id,
        operator_id: operatorId,
        operator_email: storageGet('operator_email') ?? null,
        title: clean.title,
        empresa_alvo: clean.empresaAlvo,
        cnpj: clean.cnpj,
        modo_principal: clean.modoPrincipal,
        score_oportunidade: clean.scoreOportunidade,
        resumo_dossie: clean.resumoDossie,
        content: clean as unknown as Record<string, unknown>,
        updated_at: clean.updatedAt || new Date().toISOString(),
      };
    });

    const { error } = await supabase!.from('dossies').upsert(payloads);
    if (error) {
      console.error('[Storage] saveAllDossiers failed:', error);
    }
  },

  async deleteDossier(id: string): Promise<void> {
    const operatorId = getOperatorId();
    if (!isSupabaseAvailable() || !operatorId) return;

    const { error } = await supabase!
      .from('dossies')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('operator_id', operatorId);

    if (error) {
      console.error('[Storage] deleteDossier failed:', id, error);
    }
  },
};
