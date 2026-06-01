import { describe, it, expect } from 'vitest';

describe('supabaseClient', () => {
  it('exporta supabase como objeto e isSupabaseAvailable como funcao', async () => {
    const mod = await import('../../lib/supabaseClient');
    expect(mod).toHaveProperty('supabase');
    expect(mod).toHaveProperty('isSupabaseAvailable');
    expect(typeof mod.isSupabaseAvailable).toBe('function');
  });

  it('cria supabase client quando variaveis de ambiente estao presentes', async () => {
    const { supabase, isSupabaseAvailable } = await import('../../lib/supabaseClient');
    // Ambiente de teste tem VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY configuradas
    expect(supabase).not.toBeNull();
    expect(isSupabaseAvailable()).toBe(true);
  });
});
