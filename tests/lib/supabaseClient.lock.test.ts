/**
 * P0-RUNTIME (2026-08-14) — lock de sessão do supabase-js.
 *
 * O supabase-js usa o LockManager do navegador (navigator.locks) por
 * padrão. No runtime real foi observado deadlock: o request do lock
 * `lock:sb-<ref>-auth-token` nunca entra no callback → `getSession()`
 * pendura → `fetchWithAuth` nunca dispara o fetch do
 * `create_or_get_dossier_run` → o run fica preso sem criar registro
 * (runs Scheffer travados após `processMessage:waterfall:start`).
 *
 * A correção passa um lock em memória (single-tab) ao createClient.
 * Este teste fixa o CONTRATO do lock que o supabase-js espera:
 * a função fornecida é executada e o resultado/rejeição propagados.
 */
import { describe, expect, it, vi } from 'vitest';
import { supabaseMemoryLock } from '../../lib/supabaseClient';

describe('supabaseMemoryLock — contrato do lock do supabase-js', () => {
  it('executa a função fornecida e propaga o resultado', async () => {
    const fn = vi.fn(async () => 'resultado');
    const result = await supabaseMemoryLock('lock:teste', 10_000, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('resultado');
  });

  it('propaga rejeição da função (sem engolir erro)', async () => {
    const fn = vi.fn(async () => {
      throw new Error('falha interna');
    });
    await expect(supabaseMemoryLock('lock:teste', 10_000, fn)).rejects.toThrow('falha interna');
  });

  it('não depende do LockManager do navegador (navigator.locks ausente em jsdom)', async () => {
    // jsdom não implementa navigator.locks — o lock em memória não deve
    // tocar em navigator nem em nenhuma API de sincronização entre abas.
    const fn = vi.fn(async () => 42);
    await expect(supabaseMemoryLock('lock:sb-x-auth-token', 10_000, fn)).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
