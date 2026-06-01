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

    try {
      await supabase!.from('user_context').upsert(payload, { onConflict: 'operator_id' });
    } catch (error) {
      console.warn('storage.saveUserContext: erro remoto', error);
    }
  },

  async touchUserContext(operatorId: string): Promise<void> {
    if (!operatorId || !isSupabaseAvailable()) return;

    const now = Date.now();
    if (now - lastTouchTs < 60_000) return;
    lastTouchTs = now;

    try {
      await supabase!
        .from('user_context')
        .update({ last_seen: new Date().toISOString() })
        .eq('operator_id', operatorId);
    } catch (error) {
      console.warn('storage.touchUserContext: erro remoto', error);
    }
  },

  async findUserByEmail(email: string): Promise<{ operatorId: string; displayName: string } | null> {
    if (!isSupabaseAvailable()) return null;

    const emailNormalized = email?.toLowerCase().trim() || '';
    if (!emailNormalized) return null;

    const { data, error } = await supabase!
      .from('user_context')
      .select('operator_id, display_name')
      .eq('email_normalized', emailNormalized)
      .maybeSingle();

    if (error || !data) return null;

    return {
      operatorId: data.operator_id,
      displayName: data.display_name || '',
    };
  },
};
