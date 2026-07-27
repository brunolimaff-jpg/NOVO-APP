// tests/contracts/rlsSensitiveTablesHardening.contract.test.ts
//
// Contract tests for the v2 RLS hardening migration
// (20260725173515_rls_sensitive_tables_hardening_v2.sql).
//
// Estes testes validam a ESTRUTURA e SEMÂNTICA da migration por análise
// estática do SQL. Não exigem um banco de dados real (sem Docker/Supabase
// local), o que os torna executáveis em CI sem infra adicional.
//
// O que cobrem:
//   * cada bloco de tabela é protegido por to_regclass (idempotente
//     mesmo quando a tabela não existe — ex.: Preview sem extract_cache);
//   * TODAS as policies legadas conhecidas são removidas, incluindo
//     authenticated_own_dossies FOR ALL (que concorreria com as novas);
//   * anon não recebe grant;
//   * authenticated recebe apenas SELECT/INSERT/UPDATE (sem DELETE/TRUNCATE);
//   * WITH CHECK usa EXISTS (auth.uid() -> profiles.operator_id) — fail-closed;
//   * service_role não é tocado (mantém bypass);
//   * a migration usa DO $$ ... $$ com RETURN quando to_regclass IS NULL.
//
// O que NÃO cobrem (declarado explicitamente):
//   * aplicação real da migration num banco com dados;
//   * runtime cross-operator (exige 2 contas autenticadas + escrita).
//   Para validação runtime, rodar `supabase start` local + aplicar migration
//   + exercitar com 2 roles distintas (fora do escopo do CI).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-safe: este repositório é "type": "module". __dirname não existe nativo.
const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260725173515_rls_sensitive_tables_hardening_v2.sql',
);

const SENSITIVE_TABLES = ['dossies', 'extract_cache', 'feedback_events'] as const;

// Grants esperados por tabela. feedback_events é write-once (SELECT/INSERT);
// dossies e extract_cache admitem UPDATE.
const GRANTS_BY_TABLE: Record<string, string> = {
  dossies: 'SELECT, INSERT, UPDATE',
  extract_cache: 'SELECT, INSERT, UPDATE',
  feedback_events: 'SELECT, INSERT',
};

function loadMigration(): string {
  if (!existsSync(MIGRATION_PATH)) {
    throw new Error(`Migration não encontrada: ${MIGRATION_PATH}`);
  }
  return readFileSync(MIGRATION_PATH, 'utf-8');
}

describe('rlsSensitiveTablesHardening contract — estrutura da migration', () => {
  it('arquivo da migration existe', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  it.each(SENSITIVE_TABLES)('bloco para %s é protegido por to_regclass', table => {
    const sql = loadMigration();
    // Cada bloco deve checar to_regclass('public.<table>') IS NULL antes
    // de executar qualquer REVOKE/GRANT/DROP/CREATE.
    const expectedCheck = `to_regclass('public.${table}') IS NULL`;
    expect(sql).toContain(expectedCheck);
  });

  it.each(SENSITIVE_TABLES)('bloco para %s emite RAISE NOTICE quando ausente', table => {
    const sql = loadMigration();
    const noticePattern = new RegExp(
      `RAISE\\s+NOTICE\\s+'Skipping\\s+${table}:\\s+table\\s+does\\s+not\\s+exist'`,
      'i',
    );
    expect(noticePattern.test(sql)).toBe(true);
  });

  it.each(SENSITIVE_TABLES)('bloco para %s executa RETURN após NOTICE', table => {
    const sql = loadMigration();
    // O RETURN dentro do DO block garante que o resto do bloco é no-op.
    const blockStart = sql.indexOf(`to_regclass('public.${table}') IS NULL`);
    expect(blockStart).toBeGreaterThan(-1);
    const afterCheck = sql.slice(blockStart, blockStart + 400);
    expect(afterCheck).toMatch(/RETURN\s*;/);
  });
});

describe('rlsSensitiveTablesHardening contract — remoção de policies legadas', () => {
  const sql = loadMigration();

  it.each(SENSITIVE_TABLES)('enumera e remove toda policy residual de %s', table => {
    const catalogPattern = new RegExp(
      `SELECT\\s+policyname\\s+FROM\\s+pg_policies[\\s\\S]*?schemaname\\s*=\\s*'public'\\s+AND\\s+tablename\\s*=\\s*'${table}'[\\s\\S]*?DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+%I\\s+ON\\s+public\\.${table}`,
      'i',
    );
    expect(catalogPattern.test(sql)).toBe(true);
  });

  it('não cria policy FOR ALL ou FOR DELETE', () => {
    const createdPolicies = Array.from(
      sql.matchAll(/EXECUTE\s+\$sql\$\s*(CREATE\s+POLICY[\s\S]*?)\$sql\$/gi),
      match => match[1],
    );
    expect(createdPolicies.length).toBeGreaterThan(0);
    for (const policy of createdPolicies) {
      expect(policy).not.toMatch(/FOR\s+ALL/i);
      expect(policy).not.toMatch(/FOR\s+DELETE/i);
    }
  });
});

describe('rlsSensitiveTablesHardening contract — grants mínimos', () => {
  const sql = loadMigration();

  it.each(SENSITIVE_TABLES)('revoga TODO acesso de anon em %s (junto com PUBLIC e authenticated)', table => {
    // A migration usa um único REVOKE consolidado: FROM PUBLIC, anon, authenticated.
    // Verificamos a presença de anon na cláusula FROM do mesmo statement que
    // também revoga de PUBLIC.
    const revokePattern = new RegExp(
      `REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated`,
      'i',
    );
    expect(revokePattern.test(sql)).toBe(true);
  });

  it.each(SENSITIVE_TABLES)('revoga TODO acesso de PUBLIC em %s (herança de role)', table => {
    // PUBLIC é herdado por TODAS as roles. Sem revoke explícito de PUBLIC,
    // qualquer grant residual sobrevive às revogações de anon/authenticated.
    const revokePublicPattern = new RegExp(
      `REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+PUBLIC`,
      'i',
    );
    expect(revokePublicPattern.test(sql)).toBe(true);

    // A cláusula FROM deve listar PUBLIC, anon e authenticated no mesmo REVOKE
    // (ou pelo menos PUBLIC em conjunto). Aqui exigimos a forma canônica
    // `FROM PUBLIC, anon, authenticated` para fixar a normalização.
    const combinedRevokePattern = new RegExp(
      `REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated`,
      'i',
    );
    expect(combinedRevokePattern.test(sql)).toBe(true);
  });

  it.each(SENSITIVE_TABLES)(
    'authenticated recebe APENAS os grants esperados em %s (sem DELETE/TRUNCATE/ALL)',
    table => {
      const expectedGrants = GRANTS_BY_TABLE[table];
      // Padrão esperado: GRANT <expectedGrants> ON TABLE public.<table> TO authenticated
      const grantPattern = new RegExp(
        `GRANT\\s+${expectedGrants.replace(/,\s*/g, ',\\s*')}\\s+ON\\s+TABLE\\s+public\\.${table}\\s+TO\\s+authenticated`,
        'i',
      );
      expect(grantPattern.test(sql)).toBe(true);

      // Não deve haver GRANT ALL ou GRANT ... DELETE/TRUNCATE para authenticated.
      const grantAllPattern = new RegExp(
        `GRANT\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+TO\\s+authenticated`,
        'i',
      );
      expect(grantAllPattern.test(sql)).toBe(false);

      const grantDeletePattern = new RegExp(
        `GRANT\\s+[^;]*DELETE[^;]*ON\\s+TABLE\\s+public\\.${table}\\s+TO\\s+authenticated`,
        'i',
      );
      expect(grantDeletePattern.test(sql)).toBe(false);
    },
  );

  it('não altera grants de service_role (mantém bypass RLS)', () => {
    const sql = loadMigration();
    const serviceRoleGrantPattern = /(?:GRANT|REVOKE)\s+[^;]*\bTO\b\s+service_role/i;
    const serviceRoleFromPattern = /(?:GRANT|REVOKE)\s+[^;]*\bFROM\b\s+service_role/i;
    expect(serviceRoleGrantPattern.test(sql)).toBe(false);
    expect(serviceRoleFromPattern.test(sql)).toBe(false);
  });
});

describe('rlsSensitiveTablesHardening contract — semântica fail-closed', () => {
  const sql = loadMigration();

  it.each(SENSITIVE_TABLES)(
    'policy SELECT de %s usa EXISTS com auth.uid() -> profiles.operator_id',
    table => {
      // Padrão esperado (semântico): USING (EXISTS (SELECT 1 FROM profiles p
      // WHERE p.id = auth.uid() AND p.operator_id = <table>.operator_id))
      const selectPolicyPattern = new RegExp(
        `CREATE\\s+POLICY\\s+authenticated_select_own_${table}[\\s\\S]*?USING\\s*\\(\\s*EXISTS[\\s\\S]*?FROM\\s+public\\.profiles\\s+p[\\s\\S]*?p\\.id\\s*=\\s*\\(\\s*SELECT\\s+auth\\.uid\\(\\)\\s*\\)[\\s\\S]*?p\\.operator_id\\s*=\\s*${table}\\.operator_id`,
        'i',
      );
      expect(selectPolicyPattern.test(sql)).toBe(true);
    },
  );

  it.each(SENSITIVE_TABLES)(
    'policy INSERT de %s usa WITH CHECK com EXISTS (não permite operator_id divergente)',
    table => {
      const insertPolicyPattern = new RegExp(
        `CREATE\\s+POLICY\\s+authenticated_insert_own_${table}[\\s\\S]*?WITH\\s+CHECK\\s*\\(\\s*EXISTS[\\s\\S]*?p\\.operator_id\\s*=\\s*${table}\\.operator_id`,
        'i',
      );
      expect(insertPolicyPattern.test(sql)).toBe(true);
    },
  );

  // UPDATE policy: só esperada para tabelas com grant UPDATE
  // (dossies e extract_cache). feedback_events é write-once.
  it.each(['dossies', 'extract_cache'])(
    'policy UPDATE de %s tem USING + WITH CHECK com EXISTS (fail-closed em reatribuição)',
    table => {
      const updatePolicyPattern = new RegExp(
        `CREATE\\s+POLICY\\s+authenticated_update_own_${table}[\\s\\S]*?FOR\\s+UPDATE[\\s\\S]*?USING\\s*\\(\\s*EXISTS[\\s\\S]*?WITH\\s+CHECK\\s*\\(\\s*EXISTS`,
        'i',
      );
      expect(updatePolicyPattern.test(sql)).toBe(true);
    },
  );

  it('feedback_events NÃO tem policy UPDATE nem ALL (write-once por design)', () => {
    // Detectar pela CLÁUSULA da policy, não pelo nome. Uma policy chamada
    // "modify_feedback" com FOR UPDATE passaria pelo teste anterior baseado
    // apenas em nome contendo "update". Aqui examinamos o escopo FOR.
    const createdPolicies = Array.from(
      sql.matchAll(/EXECUTE\s+\$sql\$\s*(CREATE\s+POLICY[\s\S]*?)\$sql\$/gi),
      match => match[1],
    );
    const feedbackPolicies = createdPolicies.filter(p =>
      /ON\s+public\.feedback_events/i.test(p),
    );
    expect(feedbackPolicies.length).toBeGreaterThan(0);
    for (const policy of feedbackPolicies) {
      // Cada policy de feedback_events deve ser FOR SELECT ou FOR INSERT.
      const scopeMatch = policy.match(/\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i);
      expect(scopeMatch).not.toBeNull();
      const scope = scopeMatch![1].toUpperCase();
      expect(scope === 'UPDATE' || scope === 'ALL' || scope === 'DELETE').toBe(false);
    }

    // Sanity: nenhuma policy ON feedback_events pode declarar FOR UPDATE ou FOR ALL.
    const feedbackUpdateOrAll = new RegExp(
      `CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+public\\.feedback_events[\\s\\S]*?\\bFOR\\s+(?:UPDATE|ALL)\\b`,
      'i',
    );
    expect(feedbackUpdateOrAll.test(sql)).toBe(false);
  });

  it('dossies usa UPDATE com USING + WITH CHECK para suportar soft delete próprio', () => {
    const updatePolicy = /CREATE\s+POLICY\s+authenticated_update_own_dossies[\s\S]*?FOR\s+UPDATE[\s\S]*?USING\s*\([\s\S]*?auth\.uid\(\)[\s\S]*?dossies\.operator_id[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?auth\.uid\(\)[\s\S]*?dossies\.operator_id/i;
    expect(updatePolicy.test(sql)).toBe(true);
  });
});

describe('rlsSensitiveTablesHardening contract — idempotência', () => {
  const sql = loadMigration();

  it.each(SENSITIVE_TABLES)('habilita RLS em %s (idempotente)', table => {
    const rlsPattern = new RegExp(
      `ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i',
    );
    expect(rlsPattern.test(sql)).toBe(true);
  });

  it.each(SENSITIVE_TABLES)('limpa policies antes de recriar as canônicas em %s', table => {
    const catalogIndex = sql.indexOf(`tablename = '${table}'`);
    const firstCreateIndex = sql.search(new RegExp(`CREATE\\s+POLICY\\s+authenticated_\\w+_own_${table}`, 'i'));
    expect(catalogIndex).toBeGreaterThan(-1);
    expect(firstCreateIndex).toBeGreaterThan(catalogIndex);
  });
});
