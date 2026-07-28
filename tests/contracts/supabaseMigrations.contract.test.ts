// tests/contracts/supabaseMigrations.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');
const LEGACY_DIR = resolve(__dirname, '../../supabase/migrations_legacy/pre-baseline-20260728');

function fileExists(filename: string): boolean {
  return existsSync(resolve(MIGRATIONS_DIR, filename)) || existsSync(resolve(LEGACY_DIR, filename));
}

function getAllSqlContent(): string {
  const active = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8'));
  const legacy = existsSync(LEGACY_DIR)
    ? readdirSync(LEGACY_DIR)
        .filter(f => f.endsWith('.sql'))
        .map(f => readFileSync(resolve(LEGACY_DIR, f), 'utf-8'))
    : [];
  return [...active, ...legacy].join('\n');
}

const CRITICAL_INDEXES = [
  'idx_scout_diagnostics_session_created',
  'idx_scout_diagnostics_area_event_created',
  'idx_scout_diagnostics_blank_panel_created',
];

describe('supabaseMigrations contract — estrutura', () => {
  it('pasta supabase/migrations existe', () => {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
  });

  it('contém pelo menos 1 arquivo .sql', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
  });

  it('migrations históricas estao preservadas no baseline ou legacy', () => {
    expect(fileExists('20260528_operator_tracking.sql')).toBe(true);
    expect(fileExists('20260603_blank_panel_observability.sql')).toBe(true);
  });

  it.each(CRITICAL_INDEXES)('índice crítico existe: %s', indexName => {
    const allContent = getAllSqlContent();
    expect(allContent).toContain(indexName);
  });

  it('tabelas e RPCs críticas existem no schema baseline', () => {
    const allContent = getAllSqlContent();
    expect(allContent).toContain('CREATE TABLE IF NOT EXISTS public.user_context');
    expect(allContent).toContain('CREATE TABLE IF NOT EXISTS public.profiles');
    expect(allContent).toContain('CREATE TABLE IF NOT EXISTS public.dossier_runs');
  });
});

describe('supabaseMigrations contract — dossier run lifecycle', () => {
  it('lifecycle RPCs e constraints estao no baseline', () => {
    const allContent = getAllSqlContent();
    expect(allContent).toContain("status IN ('PENDING', 'RUNNING', 'CANCEL_REQUESTED', 'CANCELLED', 'COMPLETED', 'FAILED')");
    expect(allContent).toContain('create_or_get_dossier_run');
    expect(allContent).toContain('acquire_dossier_run_lease');
    expect(allContent).toContain('complete_dossier_run');
    expect(allContent).toContain('fail_dossier_run');
  });
});
