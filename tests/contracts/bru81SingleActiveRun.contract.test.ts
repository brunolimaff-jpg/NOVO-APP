import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * BRU-81 B' — SINGLE_ACTIVE_RUN no lease (P0 separado do F1.3).
 * Contrato material congelado pelo Planejador em 2026-08-13 e revisado no
 * mesmo dia (parecer adversário): sessão reservada ANTES de qualquer lock de
 * linha; TODOS os RUNNING avaliados (nunca LIMIT 1); rejeição determinística.
 * Estes REDs validam a MIGRATION (SQL estático) — a prova concorrente real
 * vive no harness de Postgres descartável (scripts/test-bru81-single-active-
 * run-concurrency.sh) e o apply no Supabase é gate remoto separado.
 */
describe('bru81 single_active_run contract', () => {
  const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
  const fileName = fs
    .readdirSync(migrationsDir)
    .find(f => f.includes('bru81_single_active_run.sql'));
  const migrationPath = path.join(migrationsDir, fileName || '');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('deve existir a migration do single-active-run', () => {
    expect(fileName).toBeDefined();
  });

  it('deve ser SECURITY DEFINER com search_path vazio e manter a assinatura anterior', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain(`SET search_path = ''`);
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.acquire_dossier_run_lease(\n  p_run_id uuid, p_lease_owner text, p_lease_seconds integer DEFAULT 45',
    );
  });

  it('deve reservar a SESSAO primeiro: advisory lock ANTES de qualquer lock de linha', () => {
    const advisoryIdx = sql.indexOf(`pg_advisory_xact_lock(hashtext('dossier_session:' || v_session_id::text))`);
    // considera apenas o CORPO da função (a partir de "AS $$") — o cabeçalho
    // documental também menciona FOR UPDATE e não pode contar como lock.
    const bodyStart = sql.indexOf('AS $$');
    const firstForUpdateIdx = sql.indexOf('FOR UPDATE', bodyStart);
    expect(advisoryIdx).toBeGreaterThan(-1);
    expect(firstForUpdateIdx).toBeGreaterThan(-1);
    expect(advisoryIdx).toBeLessThan(firstForUpdateIdx);
  });

  it('deve resolver a sessao do run alvo por LEITURA pura (sem FOR UPDATE antes do advisory)', () => {
    const resolveBlock = sql.substring(
      sql.indexOf('SELECT session_id INTO v_session_id'),
      sql.indexOf(`pg_advisory_xact_lock(hashtext('dossier_session:' || v_session_id::text))`),
    );
    expect(resolveBlock).toContain('Run not found or not owned');
    expect(resolveBlock).not.toContain('FOR UPDATE');
  });

  it('deve travar as linhas da sessao em ordem unica e previsivel (run_id ASC) apos o advisory', () => {
    const orderedLock = sql.substring(sql.indexOf('PASSO 2'), sql.indexOf('PASSO 3'));
    expect(orderedLock).toContain('ORDER BY run_id');
    expect(orderedLock).toContain('FOR UPDATE');
  });

  it('deve avaliar TODOS os outros runs com lifecycle ATIVO (RUNNING OU CANCEL_REQUESTED) e bloquear se QUALQUER lease estiver vivo', () => {
    const pass = sql.substring(sql.indexOf('PASSO 3'), sql.indexOf('PASSO 4'));
    expect(pass).toContain('IF EXISTS');
    expect(pass).not.toContain('LIMIT 1');
    expect(pass).toContain(`status IN ('RUNNING', 'CANCEL_REQUESTED')`);
    expect(pass).toContain(`lease_expires_at >= now()`);
  });

  it('lease vivo → novo run NAO comeca e o run alvo vira FAILED deterministicamente (sem PENDING orfao)', () => {
    expect(sql).toContain(`error_code = 'SINGLE_ACTIVE_RUN_BLOCKED'`);
    expect(sql).toContain(`error_stage = 'lease_acquire'`);
    expect(sql).toContain(`status = 'FAILED'`);
    expect(sql).toContain(`failed_at = coalesce(failed_at, now())`);
    // a linha marcada volta para o cliente (que aborta quando status != RUNNING)
    expect(sql).toContain('RETURNING * INTO v_run');
    expect(sql).toContain('RETURN v_run');
  });

  it('todos os demais ativos mortos sao terminalizados ANTES da ativacao, cada um no terminal semantico correto', () => {
    const pass = sql.substring(sql.indexOf('PASSO 4'), sql.indexOf('PASSO 5'));
    expect(pass).toContain(`error_code = 'SUPERSEDED_STALE_RUN'`);
    expect(pass).toContain(`status = 'RUNNING'`);
    expect(pass).toContain(`status = 'CANCEL_REQUESTED'`);
    expect(pass).toContain(`status = 'CANCELLED'`);
    expect(pass).toContain(`cancelled_at = coalesce(cancelled_at, now())`);
    expect(pass).not.toContain('LIMIT 1');
    expect(pass).toContain(`(lease_expires_at IS NULL OR lease_expires_at < now())`);
  });

  it('deve terminalizar o alvo sem session_id (FAILED RUN_SESSION_REQUIRED, retornado) ANTES de qualquer lock', () => {
    expect(sql).toContain(`IF NOT FOUND THEN`);
    expect(sql).toContain(`error_code = 'RUN_SESSION_REQUIRED'`);
    expect(sql).toContain(`status = 'FAILED'`);
    expect(sql).toContain(`failed_at = coalesce(failed_at, now())`);
    // retorna a linha marcada (não RAISE) para o cliente tratar como recusa
    expect(sql).toContain('RETURNING * INTO v_run');
    expect(sql).toContain('RETURN v_run');
    const sessionRequiredIdx = sql.indexOf(`error_code = 'RUN_SESSION_REQUIRED'`);
    const advisoryIdx = sql.indexOf(`pg_advisory_xact_lock(hashtext('dossier_session:' || v_session_id::text))`);
    expect(sessionRequiredIdx).toBeGreaterThan(-1);
    expect(sessionRequiredIdx).toBeLessThan(advisoryIdx);
    // run inexistente/de outro owner ainda gera erro
    expect(sql).toContain(`RAISE EXCEPTION 'Run not found or not owned'`);
  });

  it('deve preservar terminais anteriores: apenas PENDING/RUNNING sao tocados e nao redefine as RPCs de promocao/autosave', () => {
    expect(sql).toContain(`status IN ('PENDING', 'RUNNING')`);
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.complete_dossier_run_with_dossier');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.save_dossiers_autosave');
  });

  it('deve preservar a ativacao normal com re-acquire pelo proprio lease_owner', () => {
    expect(sql).toContain(`status = 'RUNNING'`);
    expect(sql).toContain('lease_owner = p_lease_owner');
    expect(sql).toContain(`lease_expires_at = now() + make_interval(secs => p_lease_seconds)`);
    expect(sql).toContain('started_at = coalesce(started_at, now())');
  });

  it('deve documentar o lock corretamente: autosave usa o advisory de sessao; promocao NAO usa', () => {
    expect(sql).toContain('save_dossiers_autosave usa o MESMO advisory lock de sessão');
    expect(sql).toContain('A promoção (complete_dossier_run_with_dossier)');
    expect(sql).toContain('NÃO usa esse lock');
  });

  it('deve manter a ACL historica: authenticated com EXECUTE, anon e PUBLIC revogados, service_role preservado', () => {
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.acquire_dossier_run_lease(uuid, text, integer) FROM PUBLIC;',
    );
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.acquire_dossier_run_lease(uuid, text, integer) FROM anon;',
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.acquire_dossier_run_lease(uuid, text, integer) TO authenticated;',
    );
    expect(sql).toContain('service_role NÃO é revogado aqui');
  });
});
