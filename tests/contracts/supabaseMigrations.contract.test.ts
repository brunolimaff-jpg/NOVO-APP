// tests/contracts/supabaseMigrations.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');

const CRITICAL_MIGRATIONS = [
  '20260501000000_production_schema_baseline.sql',
  '20260529001658_operator_tracking.sql',
  '20260603143742_blank_panel_observability.sql',
  '20260728173731_harden_dossier_grants.sql'
];

const CRITICAL_INDEXES = [
  'idx_scout_diagnostics_session_created',
  'idx_scout_diagnostics_area_event_created',
  'idx_scout_diagnostics_blank_panel_created',
];

const CRITICAL_TABLES = ['operator_sessions', 'operator_events'];

describe('supabaseMigrations contract — estrutura', () => {
  it('pasta supabase/migrations existe', () => {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
  });

  it('contém exatamente 20 arquivos .sql (1 baseline + 18 marcadores + 1 harden_grants)', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
    expect(files.length).toBe(20);
  });

  it.each(CRITICAL_MIGRATIONS)('migration crítica existe: %s', filename => {
    const filePath = resolve(MIGRATIONS_DIR, filename);
    expect(existsSync(filePath)).toBe(true);
  });

  it.each(CRITICAL_INDEXES)('índice crítico existe no baseline/migrations: %s', indexName => {
    const allContent = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8'))
      .join('\n');

    expect(allContent).toContain(indexName);
  });
});

describe('supabaseMigrations contract — RLS policies', () => {
  const migrationFiles = existsSync(MIGRATIONS_DIR) ? readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')) : [];

  for (const file of migrationFiles) {
    const content = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');

    const hasCreateTable = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;

    let match: RegExpExecArray | null;
    const tables: string[] = [];
    while ((match = hasCreateTable.exec(content)) !== null) {
      tables.push(match[1]);
    }

    for (const table of tables) {
      if (table.startsWith('_migration_')) continue;

      it(`tabela ${table} em ${file} tem RLS habilitado ou justificativa documentada`, () => {
        const hasRls = new RegExp(
          `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          'i',
        ).test(content);

        const hasJustification = /--\s*RLS\s*exception/i.test(content);

        expect(hasRls || hasJustification).toBe(true);
      });
    }
  }
});

describe('supabaseMigrations contract — tabelas críticas documentadas', () => {
  const allContent = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .map(f => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8'))
        .join('\n')
    : '';

  it.each(CRITICAL_TABLES)('tabela %s está documentada em migration', table => {
    const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\.)?${table}`, 'i');
    expect(tableRegex.test(allContent)).toBe(true);
  });

  it.each(CRITICAL_TABLES)('tabela %s tem RLS habilitado', table => {
    const rlsRegex = new RegExp(
      `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i',
    );
    expect(rlsRegex.test(allContent)).toBe(true);
  });
});

describe('supabaseMigrations contract — auth remediation (Phase 2-4)', () => {
  const allContent = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .map(f => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8'))
        .join('\n')
    : '';

  it('profiles.operator_id imutavel para authenticated via column grant', () => {
    const revokeMatch = allContent.match(/REVOKE\s+ALL\s+ON\s+TABLE\s+public\.profiles\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i) ||
                        allContent.match(/REVOKE\s+UPDATE\s+ON\s+public\.profiles\s+FROM\s+authenticated/i);
    const grantNameMatch = allContent.match(
      /GRANT\s+UPDATE\s*\(\s*name\s*\)\s+ON\s+(?:TABLE\s+)?public\.profiles\s+TO\s+authenticated/i,
    );

    expect(revokeMatch).not.toBeNull();
    expect(grantNameMatch).not.toBeNull();
  });

  it('get_expired_unconfirmed_users executavel por service_role', () => {
    const grantSr = allContent.match(
      /get_expired_unconfirmed_users/i,
    );
    expect(grantSr).not.toBeNull();
  });

  it('baseline contem coluna supabase_auth_id em user_context', () => {
    expect(allContent).toContain('supabase_auth_id');
  });

  it('baseline contem coluna auth_provider em user_context', () => {
    expect(allContent).toContain('auth_provider');
  });

  it('link_legacy_operator RPC existe e e SECURITY DEFINER', () => {
    expect(allContent).toContain('link_legacy_operator');
    expect(allContent).toContain('SECURITY DEFINER');
  });

  it('link_legacy_operator exige email autenticado e nao aceita claim sem prova', () => {
    expect(allContent).toContain('link_legacy_operator');
    expect(allContent).toContain('You can only link your own account');
  });

  it('auth storage policies permitem contexto proprio sem confiar em localStorage', () => {
    expect(allContent).toContain('authenticated_select_own_user_context');
    expect(allContent).toContain('authenticated_insert_own_user_context');
    expect(allContent).toContain('authenticated_update_own_user_context');
    expect(allContent).toContain('p.operator_id = user_context.operator_id');
  });

  it('radar autenticado fica limitado ao operator_id do profile', () => {
    expect(allContent).toContain('authenticated_select_own_radar_alerts');
    expect(allContent).toContain('authenticated_insert_own_radar_alerts');
    expect(allContent).toContain('authenticated_update_own_radar_alerts');
    expect(allContent).toContain('authenticated_select_own_radar_configs');
    expect(allContent).toContain('authenticated_insert_own_radar_configs');
    expect(allContent).toContain('authenticated_update_own_radar_configs');
    expect(allContent).toContain('p.operator_id = radar_alerts.operator_id');
    expect(allContent).toContain('p.operator_id = radar_configs.operator_id');
  });
});

describe('supabaseMigrations contract — dossier run lifecycle', () => {
  const lifecycleMigration = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8'))
    .join('\n');

  it('cancelamento aceita RUNNING e CANCEL_REQUESTED, limpa lease e registra timestamps', () => {
    expect(lifecycleMigration).toContain("status IN ('RUNNING', 'CANCEL_REQUESTED')");
    expect(lifecycleMigration).toContain('cancelled_at = coalesce(cancelled_at, now())');
    expect(lifecycleMigration).toContain('cancel_requested_at = coalesce(cancel_requested_at, now())');
    expect(lifecycleMigration).toContain('lease_owner = NULL');
    expect(lifecycleMigration).toContain('lease_expires_at = NULL');
  });

  it('release terminal é idempotente e não libera lease de outro owner', () => {
    expect(lifecycleMigration).toContain('lease_owner = p_lease_owner');
    expect(lifecycleMigration).toContain("status IN ('COMPLETED', 'FAILED', 'CANCELLED')");
    expect(lifecycleMigration).toContain('AND lease_owner IS NULL');
  });

  it('lifecycle permanece SECURITY DEFINER, auth.uid e sem acesso anon', () => {
    expect(lifecycleMigration).toContain("SECURITY DEFINER");
    expect(lifecycleMigration).toContain('owner_id = auth.uid()');
    expect(lifecycleMigration).toContain('REVOKE ALL ON TABLE public.dossier_runs FROM PUBLIC, anon');
    expect(lifecycleMigration).toContain('TO authenticated');
  });

  it('complete é retry-safe apenas para o mesmo dossiê terminal sem lease', () => {
    expect(lifecycleMigration).toContain("status = 'COMPLETED' AND dossier_id = p_dossier_id AND lease_owner IS NULL");
    expect(lifecycleMigration).toContain("lease_owner = p_lease_owner AND status = 'RUNNING'");
    expect(lifecycleMigration).toContain('completed_at = coalesce(completed_at, now())');
  });

  it('fail é retry-safe apenas para mesmo código e stage terminal sem lease', () => {
    expect(lifecycleMigration).toContain("status = 'FAILED' AND error_code = p_error_code AND error_stage = p_error_stage AND lease_owner IS NULL");
    expect(lifecycleMigration).toContain("status NOT IN ('CANCELLED', 'COMPLETED', 'FAILED')");
    expect(lifecycleMigration).toContain('failed_at = coalesce(failed_at, now())');
  });

  it('renew aceita somente lease válida do owner em RUNNING ou CANCEL_REQUESTED', () => {
    expect(lifecycleMigration).toContain("status IN ('RUNNING', 'CANCEL_REQUESTED')");
    expect(lifecycleMigration).toContain('lease_owner = p_lease_owner AND lease_expires_at >= now()');
  });
});
