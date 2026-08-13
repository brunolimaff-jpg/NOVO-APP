import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('supabaseMigrationChain contract', () => {
  const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
  const legacyDir = path.join(process.cwd(), 'supabase/migrations_legacy');

  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  it('todos os arquivos ativos devem seguir a convencao de 14 digitos (YYYYMMDDHHMMSS_nome.sql)', () => {
    const pattern = /^\d{14}_[a-zA-Z0-9_-]+\.sql$/;
    files.forEach(f => {
      expect(f).toMatch(pattern);
    });
  });

  it('nenhum timestamp ativo deve ser duplicado', () => {
    const timestamps = files.map(f => f.split('_')[0]);
    const uniqueTimestamps = new Set(timestamps);
    expect(uniqueTimestamps.size).toBe(timestamps.length);
  });

  it('deve existir exatamente 1 baseline e ser a primeira migration', () => {
    const baselineFiles = files.filter(f => f.includes('production_schema_baseline'));
    expect(baselineFiles.length).toBe(1);
    expect(files[0]).toBe('20260501000000_production_schema_baseline.sql');
  });

  it('devem existir exatamente 24 arquivos de migration ativos no total', () => {
    expect(files.length).toBe(30);
  });

  it('todos os 18 marcadores de producao devem conter apenas comentarios e whitespace (no-op)', () => {
    const markers = files.filter(
      f =>
        !f.includes('production_schema_baseline') &&
        !f.includes('harden_dossier_grants') &&
        !f.includes('harden_legacy_operator_linking') &&
        !f.includes('scout_diagnostics_opportunistic_retention') &&
        !f.includes('remove_duplicate_scout_diagnostics_indexes') &&
        !f.includes('close_stale_dossier_runs') &&
        !f.includes('p0_isolate_dossies') &&
        !f.includes('p0_isolate_events_sessions_and_anon') &&
        !f.includes('p0_secure_duplicate_discovery') &&
        !f.includes('bru81_atomic_dossier_promotion') &&
        !f.includes('bru81_acl_least_privilege') &&
        !f.includes('bru81_single_active_run'),
    );
    expect(markers.length).toBe(18);

    markers.forEach(m => {
      const content = fs.readFileSync(path.join(migrationsDir, m), 'utf8');
      const nonCommentLines = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('--'));
      expect(nonCommentLines.length).toBe(0);
    });
  });

  it('o hardening de grants e o hardening de identity devem ser posteriores a 20260727224304', () => {
    const hardenGrants = files.find(f => f.includes('harden_dossier_grants'));
    const hardenIdentity = files.find(f => f.includes('harden_legacy_operator_linking'));

    expect(hardenGrants).toBeDefined();
    expect(hardenIdentity).toBeDefined();

    expect(hardenGrants!.split('_')[0] > '20260727224304').toBe(true);
    expect(hardenIdentity!.split('_')[0] > '20260727224304').toBe(true);
  });

  it('nenhum arquivo arquivado em migrations_legacy com formato desatualizado deve estar no diretorio ativo', () => {
    expect(fs.existsSync(legacyDir)).toBe(true);
    const legacyFiles = fs.readdirSync(path.join(legacyDir, 'pre-baseline-20260728'));
    expect(legacyFiles.length).toBe(15);
  });

  it('nao devem existir versoes curtas legadas nem arquivos ativos desatualizados', () => {
    const forbidden = [
      '20260611_dossier_accesses.sql',
      '20260611_session_timeout.sql',
      '20260612_auth_profiles.sql',
      '20260612_consolidate_operators.sql',
      '20260612_cron_cleanup_function.sql',
      '20260613_lock_profiles_operator_id.sql',
      '20260613_user_context_schema.sql',
      '20260721090000_dossier_runs_lifecycle.sql',
      '20260724000000_harden_dossier_grants.sql',
    ];
    forbidden.forEach(f => {
      expect(files.includes(f)).toBe(false);
    });
  });
});
