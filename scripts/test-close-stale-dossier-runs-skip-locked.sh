#!/usr/bin/env bash
# =============================================================================
# Teste DETERMINÍSTICO do FOR UPDATE SKIP LOCKED na RPC close_stale_dossier_runs
# -----------------------------------------------------------------------------
# Prova de sobreposição observável (não é stress smoke):
#   1. Conexão A abre transação e bloqueia deliberadamente 2 linhas candidatas
#      com FOR UPDATE, segurando o lock por 3s (barreira de sincronização).
#   2. Conexão B chama a RPC REAL com lock_timeout=500ms e statement_timeout=10s.
#      Com SKIP LOCKED, B NÃO espera A: processa apenas a linha não bloqueada,
#      conclui em < 3s (enquanto A ainda segura o lock) e não falha por timeout.
#   3. A libera o lock (COMMIT).
#   4. Nova chamada fecha as linhas restantes (2).
# Asserts: contagens (1 + 2 = 3), estados finais (3 FAILED, 0 RUNNING),
#          duração de B < duração do lock de A (sobreposição comprovada).
#
# Uso:
#   scripts/test-close-stale-dossier-runs-skip-locked.sh <nome_do_banco>
# =============================================================================
set -euo pipefail

PSQL=${PSQL:-psql}
DB_NAME="${1:?uso: test-close-stale-dossier-runs-skip-locked.sh <banco>}"

echo "==> Preparando 3 runs stale em $DB_NAME"
$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -q <<SQL
DELETE FROM public.dossier_runs WHERE operator_id = 'measure-g-skip-locked';
DELETE FROM auth.users WHERE email = 'measure-g-skip-locked-owner@example.com';
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (gen_random_uuid(), 'measure-g-skip-locked-owner@example.com', now(), now());
INSERT INTO public.dossier_runs (owner_id, operator_id, status, idempotency_key, lease_owner, lease_expires_at, environment, app_version, last_heartbeat_at)
SELECT u.id, 'measure-g-skip-locked', 'RUNNING', 'sl-' || i,
       'owner-' || i, now() - interval '2 hours', 'test', 'test', now() - interval '2 hours'
FROM auth.users u CROSS JOIN generate_series(1, 3) AS i
WHERE u.email = 'measure-g-skip-locked-owner@example.com';
SQL

echo "==> [A] Transação bloqueia sl-1 e sl-2 com FOR UPDATE (lock por 3s)"
$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -q <<'SQL' >/dev/null 2>&1 &
BEGIN;
SELECT run_id FROM public.dossier_runs
 WHERE operator_id = 'measure-g-skip-locked' AND idempotency_key IN ('sl-1', 'sl-2')
 FOR UPDATE;
SELECT pg_sleep(3);
COMMIT;
SQL
pid_a=$!

# Barreira de sincronização: garante que A já segura os locks
sleep 1

echo "==> [B] RPC real com lock_timeout=500ms e statement_timeout=10s"
t0=$(python3 -c 'import time; print(time.monotonic())')
set +e
b_out=$($PSQL -d "$DB_NAME" -q -v ON_ERROR_STOP=1 -tA \
  -c "SET lock_timeout = '500ms'; SET statement_timeout = '10s'; SELECT public.close_stale_dossier_runs(3600, 50, FALSE);" 2>&1)
b_rc=$?
set -e
t1=$(python3 -c 'import time; print(time.monotonic())')
b_duration=$(python3 -c "print(f'{$t1 - $t0:.2f}')")

echo "  B retornou: '${b_out}' (exit $b_rc) em ${b_duration}s"

if [[ "$b_rc" -ne 0 ]]; then
  echo "ERRO: B falhou — esperado sucesso com SKIP LOCKED (lock_timeout não deve disparar): $b_out" >&2
  wait "$pid_a" 2>/dev/null || true
  exit 1
fi

# B deve processar exatamente 1 linha (sl-3, a única não bloqueada)
if [[ "$(tr -d '[:space:]' <<<"$b_out")" != "1" ]]; then
  echo "ERRO: B deveria fechar exatamente 1 linha (a não bloqueada), retornou: $b_out" >&2
  wait "$pid_a" 2>/dev/null || true
  exit 1
fi

# Sobreposição comprovada: B terminou enquanto A ainda segurava o lock (3s)
if python3 -c "exit(0 if $b_duration < 3.0 else 1)"; then
  echo "  Sobreposição OK: B concluiu em ${b_duration}s < 3s do lock de A"
else
  echo "ERRO: B levou ${b_duration}s (>= 3s) — sem sobreposição observável ou esperou o lock" >&2
  wait "$pid_a" 2>/dev/null || true
  exit 1
fi

echo "==> [A] Libera o lock (COMMIT)"
wait "$pid_a"
echo "  A concluída"

echo "==> [C] Nova chamada fecha as linhas restantes (sl-1, sl-2)"
c_out=$($PSQL -d "$DB_NAME" -q -v ON_ERROR_STOP=1 -tA \
  -c "SELECT public.close_stale_dossier_runs(3600, 50, FALSE);")
echo "  C retornou: ${c_out}"
if [[ "$(tr -d '[:space:]' <<<"$c_out")" != "2" ]]; then
  echo "ERRO: C deveria fechar 2 linhas (liberadas por A), retornou: $c_out" >&2
  exit 1
fi

echo "==> Asserts finais"
failed_count=$($PSQL -d "$DB_NAME" -tA -c \
  "SELECT count(*) FROM public.dossier_runs WHERE operator_id='measure-g-skip-locked' AND status='FAILED';")
running_count=$($PSQL -d "$DB_NAME" -tA -c \
  "SELECT count(*) FROM public.dossier_runs WHERE operator_id='measure-g-skip-locked' AND status='RUNNING';")
echo "  FAILED: $failed_count (esperado 3) · RUNNING: $running_count (esperado 0)"

if [[ "$failed_count" != "3" || "$running_count" != "0" ]]; then
  echo "ERRO: estados finais divergentes (FAILED=$failed_count, RUNNING=$running_count)" >&2
  exit 1
fi

$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -q \
  -c "DELETE FROM public.dossier_runs WHERE operator_id = 'measure-g-skip-locked';"
echo "OK — SKIP LOCKED determinístico: B não esperou A (${b_duration}s < 3s), fechou só a linha livre; A liberou; C fechou as 2 restantes; 3 FAILED, 0 RUNNING."
