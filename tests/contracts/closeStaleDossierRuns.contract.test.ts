import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('close_stale_dossier_runs contract', () => {
  const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
  const fileName = fs
    .readdirSync(migrationsDir)
    .find(f => f.includes('close_stale_dossier_runs.sql'));
  const migrationPath = path.join(migrationsDir, fileName || '');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('deve existir a migration de cleanup de stale runs', () => {
    expect(fileName).toBeDefined();
  });

  it('deve ser SECURITY DEFINER com search_path vazio', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain(`SET search_path = ''`);
  });

  it('deve espelhar a semantica de fail_dossier_run: FAILED + lease liberado', () => {
    expect(sql).toContain(`status = 'FAILED'`);
    expect(sql).toContain(`failed_at = coalesce(failed_at, now())`);
    expect(sql).toContain(`error_code = 'STALE_RUN_LEASE_EXPIRED'`);
    expect(sql).toContain(`error_stage = 'stale_cleanup'`);
    expect(sql).toContain(`lease_owner = NULL`);
    expect(sql).toContain(`lease_expires_at = NULL`);
  });

  it('deve selecionar apenas RUNNING com lease expirado alem da janela', () => {
    expect(sql).toContain(`WHERE status = 'RUNNING'`);
    expect(sql).toContain(`lease_expires_at IS NOT NULL`);
    expect(sql).toContain(`lease_expires_at < stale_cutoff`);
    expect(sql).toContain(`p_stale_after_seconds <= 0`);
  });

  it('deve suportar dry-run sem mutacao', () => {
    expect(sql).toContain('p_dry_run BOOLEAN DEFAULT FALSE');
    expect(sql).toContain('IF p_dry_run THEN');
    expect(sql).toContain('RETURN result_count;');
  });

  it('deve ter janela padrao de 3600s (decisao registrada) e lote limitado', () => {
    expect(sql).toContain('p_stale_after_seconds INT DEFAULT 3600');
    expect(sql).toContain('p_batch_limit INT DEFAULT 50');
    expect(sql).toContain('p_batch_limit > 1000');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('deve criar indice parcial para a busca de runs obsoletos', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_dossier_runs_stale');
    expect(sql).toContain('WHERE status = \'RUNNING\'');
  });

  it('deve liberar execucao apenas para service_role', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, INT, BOOLEAN) FROM PUBLIC;');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, INT, BOOLEAN) FROM authenticated;');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, INT, BOOLEAN) FROM anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.close_stale_dossier_runs(INT, INT, BOOLEAN) TO service_role;');
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.close_stale_dossier_runs\(INT, INT, BOOLEAN\) TO (authenticated|anon|PUBLIC)/i);
  });
});
