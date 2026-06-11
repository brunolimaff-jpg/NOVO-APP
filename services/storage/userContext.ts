// services/storage/userContext.ts
import { supabase, isSupabaseAvailable } from '../../lib/supabaseClient';

let lastTouchTs = 0;

export const userContext = {
  async saveUserContext(data: { operatorId: string; name: string; email: string }): Promise<void> {
    if (!isSupabaseAvailable() || !data.operatorId) return;

    const emailNormalized = data.email?.toLowerCase().trim() || '';
    const payload = {
      operator_id: data.operatorId,
      display_name: data.name,
      email: data.email,
      email_normalized: emailNormalized,
      last_seen: new Date().toISOString(),
    };

    const { error } = await supabase!.from('user_context').upsert(payload, { onConflict: 'operator_id' });
    if (error) {
      console.warn('storage.saveUserContext: erro remoto', error.message);
    }
  },

  async touchUserContext(operatorId: string): Promise<void> {
    if (!operatorId || !isSupabaseAvailable()) return;

    const now = Date.now();
    if (now - lastTouchTs < 60_000) return;
    lastTouchTs = now;

    const { error } = await supabase!
      .from('user_context')
      .update({ last_seen: new Date().toISOString() })
      .eq('operator_id', operatorId);
    if (error) {
      console.warn('storage.touchUserContext: erro remoto', error.message);
    }
  },

  async findUserByEmail(email: string): Promise<{ operatorId: string; displayName: string } | null> {
    if (!isSupabaseAvailable()) return null;

    const emailNormalized = email?.toLowerCase().trim() || '';
    if (!emailNormalized) return null;

    // .limit(1) + .order() em vez de .maybeSingle() porque o banco real
    // tem duplicados por email_normalized (ate 288 linhas). maybeSingle()
    // retorna erro 406 com >1 linha, tratado como "nao encontrado".
    // Pegamos o registro mais antigo como canonico.
    const { data, error } = await supabase!
      .from('user_context')
      .select('operator_id, display_name, created_at')
      .eq('email_normalized', emailNormalized)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    return {
      operatorId: data[0].operator_id,
      displayName: data[0].display_name || '',
    };
  },
};
