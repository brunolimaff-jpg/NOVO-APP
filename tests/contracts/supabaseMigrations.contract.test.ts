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
