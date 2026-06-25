import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Variaveis de ambiente ausentes. Storage remoto desativado.');
}

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export function isSupabaseAvailable(): boolean {
  return supabase !== null;
}

export async function getSupabaseAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) {
      console.warn('[Supabase] getSession error:', error.message);
      return {};
    }
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch (err) {
    console.warn('[Supabase] getSession failed:', err instanceof Error ? err.message : String(err));
    return {};
  }
}

export async function refreshSupabaseAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.refreshSession();
    if (error) {
      console.warn('[Supabase] refreshSession error:', error.message);
      return {};
    }
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch (err) {
    console.warn('[Supabase] refreshSession failed:', err instanceof Error ? err.message : String(err));
    return {};
  }
}
