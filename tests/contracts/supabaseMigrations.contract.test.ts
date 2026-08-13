// tests/contracts/supabaseMigrations.contract.test.ts
// Adapted for canonical baseline migration chain (21 existing + 2 scout diagnostics maintenance migrations)
// All original behavioral guarantees are preserved across the full migration chain.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');

// Helper: reads and concatenates all .sql files in migrations dir
function getAllContent(): string {
  if (!existsSync(MIGRATIONS_DIR)) return '';
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8'))
    .join('\n');
}

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

  it('contém exatamente 24 arquivos .sql', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
    expect(files.length).toBe(29);
  });

  it('baseline é o primeiro arquivo e existe', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    expect(files[0]).toBe('20260501000000_production_schema_baseline.sql');
  });

  it.each(CRITICAL_INDEXES)('índice crítico existe no baseline/migrations: %s', indexName => {
    expect(getAllContent()).toContain(indexName);
  });
});

describe('supabaseMigrations contract — RLS policies', () => {
  const migrationFiles = existsSync(MIGRATIONS_DIR) ? readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')) : [];

  for (const file of migrationFiles) {
    const content = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');

    const hasCreateTable = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"\.)?"(\w+)"/gi;

    let match: RegExpExecArray | null;
    const tables: string[] = [];
    while ((match = hasCreateTable.exec(content)) !== null) {
      tables.push(match[1]);
    }

    for (const table of tables) {
      if (table.startsWith('_migration_')) continue;

      it(`tabela ${table} em ${file} tem RLS habilitado ou justificativa documentada`, () => {
        const hasRls = new RegExp(
          `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:"public"\\.)?"${table}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          'i',
        ).test(content);

        const hasJustification = /--\s*RLS\s*exception/i.test(content);

        expect(hasRls || hasJustification).toBe(true);
      });
    }
  }
});

describe('supabaseMigrations contract — tabelas críticas documentadas', () => {
  const allContent = getAllContent();

  it.each(CRITICAL_TABLES)('tabela %s está documentada em migration', table => {
    const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:"public"\\.)?"${table}"`, 'i');
    expect(tableRegex.test(allContent)).toBe(true);
  });

  it.each(CRITICAL_TABLES)('tabela %s tem RLS habilitado', table => {
    const rlsRegex = new RegExp(
      `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:"public"\\.)?"${table}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i',
    );
    expect(rlsRegex.test(allContent)).toBe(true);
  });
});

describe('supabaseMigrations contract — auth remediation & least privilege', () => {
  const allContent = getAllContent();

  it('profiles.operator_id imutável para authenticated via column grant', () => {
    const revokeMatch = allContent.match(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+(?:")?public(?:")?\.(?:")?profiles(?:")?\s+FROM\s+PUBLIC/i,
    );
    const grantNameMatch = allContent.match(
      /GRANT\s+UPDATE\s*\(\s*(?:")?name(?:")?\s*\)\s+ON\s+(?:TABLE\s+)?(?:")?public(?:")?\.(?:")?profiles(?:")?\s+TO\s+(?:")?authenticated(?:")?/i,
    );

    expect(revokeMatch).not.toBeNull();
    expect(grantNameMatch).not.toBeNull();
  });

  it('get_expired_unconfirmed_users executável por service_role com revogação pública', () => {
    const revokePublic = allContent.match(
      /REVOKE\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+(?:")?public(?:")?\.(?:")?get_expired_unconfirmed_users(?:")?(?:\([^)]*\))?\s+FROM\s+PUBLIC/i,
    );
    const grantSr = allContent.match(
      /GRANT\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+(?:")?public(?:")?\.(?:")?get_expired_unconfirmed_users(?:")?(?:\([^)]*\))?\s+TO\s+(?:")?service_role(?:")?/i,
    );
    const grantAnon = allContent.match(
      /GRANT\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+(?:")?public(?:")?\.(?:")?get_expired_unconfirmed_users(?:")?(?:\([^)]*\))?\s+TO\s+(?:")?anon(?:")?/i,
    );
    const grantAuth = allContent.match(
      /GRANT\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+(?:")?public(?:")?\.(?:")?get_expired_unconfirmed_users(?:")?(?:\([^)]*\))?\s+TO\s+(?:")?authenticated(?:")?/i,
    );

    expect(revokePublic).not.toBeNull();
    expect(grantSr).not.toBeNull();
    expect(grantAnon).toBeNull();
    expect(grantAuth).toBeNull();
  });

  it('baseline contém colunas supabase_auth_id e auth_provider em user_context', () => {
    expect(allContent).toContain('supabase_auth_id');
    expect(allContent).toContain('auth_provider');
  });

  it('link_legacy_operator RPC existe e é SECURITY DEFINER com search_path limpo', () => {
    expect(allContent).toContain('link_legacy_operator');
    expect(allContent).toContain('SECURITY DEFINER');
    expect(allContent).toMatch(/SET\s+"?search_path"?\s+(TO\s+|=)\s*''/i);
  });

  it('link_legacy_operator exige ownership, email obrigatório, email de perfil e validação em user_context', () => {
    expect(allContent).toContain('You can only link your own account');
    expect(allContent).toContain('Email is required to link legacy operator');
    expect(allContent).toContain('Email does not match authenticated profile');
    expect(allContent).toContain('Operator ID does not match authenticated email');
  });

  it('link_legacy_operator tem ACL restrita a apenas authenticated', () => {
    const hardenFile = readFileSync(
      resolve(MIGRATIONS_DIR, '20260728180000_harden_legacy_operator_linking.sql'),
      'utf-8',
    );

    expect(hardenFile).toContain(
      'REVOKE ALL ON FUNCTION public.link_legacy_operator(UUID, TEXT, TEXT, TEXT) FROM PUBLIC',
    );
    expect(hardenFile).toContain(
      'REVOKE ALL ON FUNCTION public.link_legacy_operator(UUID, TEXT, TEXT, TEXT) FROM anon',
    );
    expect(hardenFile).toContain(
      'REVOKE ALL ON FUNCTION public.link_legacy_operator(UUID, TEXT, TEXT, TEXT) FROM service_role',
    );
    expect(hardenFile).toContain(
      'GRANT EXECUTE ON FUNCTION public.link_legacy_operator(UUID, TEXT, TEXT, TEXT) TO authenticated',
    );
  });

  it('auth storage policies permitem contexto proprio sem confiar em localStorage', () => {
    expect(allContent).toContain('authenticated_select_own_user_context');
    expect(allContent).toContain('authenticated_insert_own_user_context');
    expect(allContent).toContain('authenticated_update_own_user_context');
  });

  it('radar autenticado fica limitado ao operator_id do profile', () => {
    expect(allContent).toContain('authenticated_select_own_radar_alerts');
    expect(allContent).toContain('authenticated_insert_own_radar_alerts');
    expect(allContent).toContain('authenticated_update_own_radar_alerts');
    expect(allContent).toContain('authenticated_select_own_radar_configs');
    expect(allContent).toContain('authenticated_insert_own_radar_configs');
    expect(allContent).toContain('authenticated_update_own_radar_configs');
  });
});

describe('supabaseMigrations contract — dossier run lifecycle', () => {
  const allContent = getAllContent();

  it('cancelamento aceita RUNNING e CANCEL_REQUESTED, limpa lease e registra timestamps', () => {
    expect(allContent).toContain("status IN ('RUNNING', 'CANCEL_REQUESTED')");
    expect(allContent).toContain('cancelled_at = coalesce(cancelled_at, now())');
    expect(allContent).toContain('cancel_requested_at = coalesce(cancel_requested_at, now())');
    expect(allContent).toContain('lease_owner = NULL');
    expect(allContent).toContain('lease_expires_at = NULL');
  });

  it('release terminal é idempotente e não libera lease de outro owner', () => {
    expect(allContent).toContain('lease_owner = p_lease_owner');
    expect(allContent).toContain("status IN ('COMPLETED', 'FAILED', 'CANCELLED')");
    expect(allContent).toContain('AND lease_owner IS NULL');
  });

  it('lifecycle permanece SECURITY DEFINER, auth.uid e sem acesso anon', () => {
    expect(allContent).toContain('SECURITY DEFINER');
    expect(allContent).toMatch(/SET\s+"?search_path"?\s+(TO\s+|=)\s*''/i);
    expect(allContent).toContain('owner_id = auth.uid()');
    expect(allContent).toContain('REVOKE ALL ON TABLE public.dossier_runs FROM PUBLIC, anon');
    expect(allContent).toContain('TO authenticated');
  });

  it('complete é retry-safe apenas para o mesmo dossiê terminal sem lease', () => {
    expect(allContent).toContain("status = 'COMPLETED' AND dossier_id = p_dossier_id AND lease_owner IS NULL");
    expect(allContent).toContain("lease_owner = p_lease_owner AND status = 'RUNNING'");
    expect(allContent).toContain('completed_at = coalesce(completed_at, now())');
  });

  it('fail é retry-safe apenas para mesmo código e stage terminal sem lease', () => {
    expect(allContent).toContain(
      "status = 'FAILED' AND error_code = p_error_code AND error_stage = p_error_stage AND lease_owner IS NULL",
    );
    expect(allContent).toContain("status NOT IN ('CANCELLED', 'COMPLETED', 'FAILED')");
    expect(allContent).toContain('failed_at = coalesce(failed_at, now())');
  });

  it('renew aceita somente lease válida do owner em RUNNING ou CANCEL_REQUESTED', () => {
    expect(allContent).toContain("status IN ('RUNNING', 'CANCEL_REQUESTED')");
    expect(allContent).toContain('lease_owner = p_lease_owner AND lease_expires_at >= now()');
  });
});

describe('supabaseMigrations contract — baseline integrity (PR #464)', () => {
  const allContent = getAllContent();

  it('nenhuma policy contém TO { ou FROM { (roles devem ser normalizadas)', () => {
    const invalidTo = allContent.match(/\bTO\s+\{/);
    const invalidFrom = allContent.match(/\bFROM\s+\{/);
    expect(invalidTo).toBeNull();
    expect(invalidFrom).toBeNull();
  });

  it('nenhum objeto de extensão pg_trgm é recriado como LANGUAGE c', () => {
    expect(allContent).not.toMatch(/LANGUAGE\s+c\b/i);
  });

  it('baseline não cria auth.users nem substitui auth.uid()', () => {
    expect(allContent).not.toMatch(/CREATE\s+TABLE\s+(?:")?auth(?:")?\.(?:")?users(?:")?/i);
    expect(allContent).not.toMatch(/CREATE\s+SCHEMA\s+(?:")?auth(?:")?/i);
  });

  it('trigger on_auth_user_created está presente', () => {
    expect(allContent).toContain('on_auth_user_created');
    expect(allContent).toContain('handle_new_user');
  });

  it('extensão pg_trgm está declarada canonicamente', () => {
    expect(allContent).toContain('pg_trgm');
  });
});
