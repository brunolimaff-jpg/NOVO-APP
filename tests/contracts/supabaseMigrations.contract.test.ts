// tests/contracts/supabaseMigrations.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');

const CRITICAL_MIGRATIONS = ['20260528_operator_tracking.sql', '20260603_blank_panel_observability.sql'];

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

  it('contém pelo menos 1 arquivo .sql', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(CRITICAL_MIGRATIONS)('migration crítica existe: %s', filename => {
    const filePath = resolve(MIGRATIONS_DIR, filename);
    expect(existsSync(filePath)).toBe(true);
  });

  it.each(CRITICAL_INDEXES)('índice crítico existe: %s', indexName => {
    const allContent = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8'))
      .join('\n');

    expect(allContent).toContain(indexName);
  });

  it('migration 20260613_lock_profiles_operator_id.sql existe (Phase 2)', () => {
    expect(existsSync(resolve(MIGRATIONS_DIR, '20260613_lock_profiles_operator_id.sql'))).toBe(true);
  });

  it('migration 20260613_user_context_schema.sql existe (Phase 4)', () => {
    expect(existsSync(resolve(MIGRATIONS_DIR, '20260613_user_context_schema.sql'))).toBe(true);
  });

  it('migration 20260612_cron_cleanup_function.sql existe (Phase 3)', () => {
    expect(existsSync(resolve(MIGRATIONS_DIR, '20260612_cron_cleanup_function.sql'))).toBe(true);
  });
});

describe('supabaseMigrations contract — RLS policies', () => {
  const migrationFiles = existsSync(MIGRATIONS_DIR) ? readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')) : [];

  for (const file of migrationFiles) {
    const content = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');

    const hasCreateTable = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;

    let match: RegExpExecArray | null;
    const tables: string[] = [];
    while ((match = hasCreateTable.exec(content)) !== null) {
      tables.push(match[1]);
    }

    for (const table of tables) {
      // _migration_* sao tabelas operacionais criadas e dropadas no mesmo script
      // Ex: _migration_canonical — RLS seria ruido operacional
      if (table.startsWith('_migration_')) continue;

      it(`tabela ${table} em ${file} tem RLS habilitado ou justificativa documentada`, () => {
        const hasRls = new RegExp(
          `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
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
    const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}`, 'i');
    expect(tableRegex.test(allContent)).toBe(true);
  });

  it.each(CRITICAL_TABLES)('tabela %s tem RLS habilitado', table => {
    const rlsRegex = new RegExp(
      `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
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
    // Deve revogar UPDATE geral e conceder apenas UPDATE (name)
    const revokeMatch = allContent.match(/REVOKE\s+UPDATE\s+ON\s+public\.profiles\s+FROM\s+authenticated/i);
    const grantNameMatch = allContent.match(
      /GRANT\s+UPDATE\s*\(\s*name\s*\)\s+ON\s+public\.profiles\s+TO\s+authenticated/i,
    );

    expect(revokeMatch).not.toBeNull();
    expect(grantNameMatch).not.toBeNull();
  });

  it('get_expired_unconfirmed_users executavel por service_role', () => {
    // Deve conceder EXECUTE para service_role
    // e revogar de PUBLIC, authenticated e anon
    const grantSr = allContent.match(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_expired_unconfirmed_users\s+TO\s+service_role/i,
    );
    const revokeAnon = allContent.match(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_expired_unconfirmed_users\s+FROM\s+anon/i,
    );

    expect(grantSr).not.toBeNull();
    expect(revokeAnon).not.toBeNull();
  });

  it('migrations criam coluna supabase_auth_id em user_context', () => {
    const lockFile = existsSync(resolve(MIGRATIONS_DIR, '20260613_user_context_schema.sql'))
      ? readFileSync(resolve(MIGRATIONS_DIR, '20260613_user_context_schema.sql'), 'utf-8')
      : '';

    expect(lockFile).toContain('supabase_auth_id');
    expect(lockFile).toContain('ADD COLUMN supabase_auth_id UUID');
  });

  it('consolidacao garante colunas auth antes de usa-las', () => {
    const consolidateFile = existsSync(resolve(MIGRATIONS_DIR, '20260612_consolidate_operators.sql'))
      ? readFileSync(resolve(MIGRATIONS_DIR, '20260612_consolidate_operators.sql'), 'utf-8')
      : '';

    const firstAdd = consolidateFile.indexOf('ADD COLUMN IF NOT EXISTS supabase_auth_id UUID');
    const firstUse = consolidateFile.indexOf('SET supabase_auth_id');

    expect(firstAdd).toBeGreaterThanOrEqual(0);
    expect(firstUse).toBeGreaterThan(firstAdd);
  });

  it('migrations criam coluna auth_provider em user_context', () => {
    const lockFile = existsSync(resolve(MIGRATIONS_DIR, '20260613_user_context_schema.sql'))
      ? readFileSync(resolve(MIGRATIONS_DIR, '20260613_user_context_schema.sql'), 'utf-8')
      : '';

    expect(lockFile).toContain('auth_provider');
    expect(lockFile).toContain('ADD COLUMN auth_provider TEXT');
  });

  it('profiles tem RLS exception documentada para _migration_ prefix tables', () => {
    const consolidateFile = existsSync(resolve(MIGRATIONS_DIR, '20260612_consolidate_operators.sql'))
      ? readFileSync(resolve(MIGRATIONS_DIR, '20260612_consolidate_operators.sql'), 'utf-8')
      : '';

    // A migration de consolidacao usa _migration_canonical — tabela operacional
    // que e criada e dropada no mesmo script. RLS seria ruido.
    expect(consolidateFile).toContain('_migration_');
  });

  it('link_legacy_operator RPC existe e e SECURITY DEFINER', () => {
    expect(allContent).toContain('link_legacy_operator');
    expect(allContent).toContain('SECURITY DEFINER');
  });

  it('link_legacy_operator exige email autenticado e nao aceita claim sem prova', () => {
    const lockFile = existsSync(resolve(MIGRATIONS_DIR, '20260613_lock_profiles_operator_id.sql'))
      ? readFileSync(resolve(MIGRATIONS_DIR, '20260613_lock_profiles_operator_id.sql'), 'utf-8')
      : '';

    expect(lockFile).toContain('p_email TEXT,');
    expect(lockFile).toContain('Email is required to link legacy operator');
    expect(lockFile).toContain('Email does not match authenticated profile');
    expect(lockFile).toContain('email_normalized = LOWER(caller_email)');
  });

  it('auth storage policies permitem contexto proprio sem confiar em localStorage', () => {
    expect(allContent).toContain('authenticated_select_own_user_context');
    expect(allContent).toContain('authenticated_insert_own_user_context');
    expect(allContent).toContain('authenticated_update_own_user_context');
    expect(allContent).toContain('p.operator_id = user_context.operator_id');
    expect(allContent).toContain('user_context.email_normalized = LOWER(p.email)');
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
  const lifecycleMigration = readFileSync(
    resolve(MIGRATIONS_DIR, '20260721090000_dossier_runs_lifecycle.sql'),
    'utf-8',
  );

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
    expect(lifecycleMigration).toContain("SECURITY DEFINER SET search_path = ''");
    expect(lifecycleMigration).toContain('owner_id = auth.uid()');
    expect(lifecycleMigration).toContain('REVOKE ALL ON TABLE public.dossier_runs FROM PUBLIC, anon');
    expect(lifecycleMigration).toContain('TO authenticated');
  });
});
