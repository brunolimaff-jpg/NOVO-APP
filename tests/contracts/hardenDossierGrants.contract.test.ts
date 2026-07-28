import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('harden_dossier_grants contract', () => {
  const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
  const hardenFileName = fs.readdirSync(migrationsDir).find(f => f.includes('harden_dossier_grants.sql'));
  const migrationPath = path.join(migrationsDir, hardenFileName || '');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('deve revogar ALL de PUBLIC, anon e authenticated para dossier_runs, dossies e profiles', () => {
    expect(sql).toContain('REVOKE ALL ON TABLE public.dossier_runs FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('REVOKE ALL ON TABLE public.dossies FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;');
  });

  it('deve conceder somente SELECT a authenticated em dossier_runs e nao conceder REFERENCES', () => {
    expect(sql).toContain('GRANT SELECT ON TABLE public.dossier_runs TO authenticated;');
    expect(sql).not.toMatch(/GRANT.*REFERENCES.*ON.*dossier_runs/i);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL).*ON.*dossier_runs TO authenticated/i);
  });

  it('deve conceder SELECT, INSERT, UPDATE a authenticated em dossies sem DELETE, TRUNCATE ou REFERENCES', () => {
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.dossies TO authenticated;');
    expect(sql).not.toMatch(/GRANT (DELETE|ALL).*ON.*dossies TO authenticated/i);
  });

  it('deve proibir UPDATE geral em profiles e conceder apenas SELECT na tabela e UPDATE(name)', () => {
    expect(sql).toContain('GRANT SELECT ON TABLE public.profiles TO authenticated;');
    expect(sql).toContain('GRANT UPDATE (name) ON TABLE public.profiles TO authenticated;');
    // Proibido UPDATE geral no nivel de tabela
    expect(sql).not.toMatch(/GRANT\s+SELECT\s*,\s*UPDATE\s+ON\s+TABLE\s+public\.profiles/i);
    expect(sql).not.toMatch(/GRANT\s+UPDATE\s+ON\s+TABLE\s+public\.profiles/i);
  });

  it('deve revogar execucao de handle_new_user() para PUBLIC, anon e authenticated e conceder explicitamente a service_role', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;');
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.handle_new_user\(\) TO (authenticated|anon|PUBLIC)/i);
  });

  it('nao deve revogar privilegios de service_role', () => {
    expect(sql).not.toMatch(/REVOKE.*FROM.*service_role/i);
  });
});
