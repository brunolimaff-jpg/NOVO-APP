import { describe, it, expect } from 'vitest';

describe('supabaseClient', () => {
  it('exporta supabase como objeto e isSupabaseAvailable como funcao', async () => {
    const mod = await import('../../lib/supabaseClient');
    expect(mod).toHaveProperty('supabase');
    expect(mod).toHaveProperty('isSupabaseAvailable');
    expect(typeof mod.isSupabaseAvailable).toBe('function');
  });

  it('isSupabaseAvailable retorna booleano (true se env vars presentes)', async () => {
    const { isSupabaseAvailable } = await import('../../lib/supabaseClient');
    expect(typeof isSupabaseAvailable()).toBe('boolean');
  });
});
