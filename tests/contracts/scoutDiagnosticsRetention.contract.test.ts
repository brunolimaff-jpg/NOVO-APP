import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('scout_diagnostics retention migrations', () => {
  it('limita a retenção a uma execução diária, usa lock e lote pequeno', () => {
    const sql = readFileSync(
      resolve('supabase/migrations/20260730090000_scout_diagnostics_opportunistic_retention.sql'),
      'utf8',
    );
    expect(sql).toContain('pg_try_advisory_xact_lock');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('last_run_date < EXCLUDED.last_run_date');
    expect(sql).toContain('LIMIT batch_size');
    expect(sql).toContain('batch_size > 1000');
    expect(sql).toContain('make_interval(days => retention_days)');
    expect(sql).toContain('max_batches constant integer := 20');
    expect(sql).toContain("set_config('statement_timeout', '2000ms', true)");
    expect(sql).toContain("max_runtime constant interval := interval '1500 milliseconds'");
    expect(sql).toContain('clock_timestamp() - started_at >= max_runtime');
    expect(sql).toContain('deleted_count := deleted_count + deleted_batch');
    expect(sql).toContain('EXIT WHEN deleted_batch < batch_size');
  });

  it('remove índices duplicados em migration separada', () => {
    const sql = readFileSync(
      resolve('supabase/migrations/20260730090100_remove_duplicate_scout_diagnostics_indexes.sql'),
      'utf8',
    );
    expect(sql).toContain("table_class.relname = 'scout_diagnostics'");
    expect(sql).toContain('keeper.indisvalid');
    expect(sql).toContain('keeper.indisready');
    expect(sql).toContain('keeper.indislive');
    expect(sql).toContain('keeper.indkey = duplicate.indkey');
    expect(sql).toContain('keeper_class.relam = duplicate_class.relam');
    expect(sql).toContain('dependency.conindid = duplicate.indexrelid');
    expect(sql).toContain('DROP INDEX IF EXISTS');
  });
});
