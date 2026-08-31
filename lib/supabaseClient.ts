import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Variaveis de ambiente ausentes. Storage remoto desativado.');
}

/**
 * Lock de sessão em memória (single-tab).
 *
 * O supabase-js usa o LockManager do navegador (navigator.locks) para
 * sincronizar refresh de token entre abas. No runtime real foi observado
 * deadlock: `navigator.locks.request('lock:sb-<ref>-auth-token')` nunca
 * entra no callback → `getSession()` pendura → o `fetchWithAuth` do
 * `create_or_get_dossier_run` nunca dispara → o run fica preso sem criar
 * registro no Supabase (evidência 2026-08-14: runs Scheffer travados após
 * `processMessage:waterfall:start`; correção validada localmente e o RPC
 * voltou a ser emitido). Este lock executa a função diretamente, sem
 * exclusão entre abas — comportamento anterior do supabase-js.
 */
export const supabaseMemoryLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => fn();

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          lock: supabaseMemoryLock,
        },
      })
    : null;

export function isSupabaseAvailable(): boolean {
  return supabase !== null;
}
