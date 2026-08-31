#!/usr/bin/env bash
# BRU-81 B' — prova concorrente real do SINGLE_ACTIVE_RUN (Postgres descartável).
#
# Sobe um cluster PostgreSQL efêmero (initdb + pg_ctl em porta livre), aplica a
# RPC acquire_dossier_run_lease da migration 20260813190000 com um stub de
# auth.uid() (GUC app.owner_id) e roda os 9 cenários do contrato congelado
# pelo Planejador com conexões REAIS simultâneas:
#
#   S1 A e B novos na mesma sessão   → exatamente 1 RUNNING + 1 FAILED, sem deadlock (prova real de término)
#   S2 A vivo + B novo               → A permanece, B falha (SINGLE_ACTIVE_RUN_BLOCKED)
#   S3 A expirado + B novo           → A fecha (SUPERSEDED_STALE_RUN), B inicia
#   S4 múltiplos RUNNING históricos  → nenhum fica ignorado (todos terminalizados)
#   S5 sessões diferentes            → não se bloqueiam
#   S6 owners diferentes             → não interferem
#   S7 cancelamento vivo + B novo    → ocupação preservada, B falha (SINGLE_ACTIVE_RUN_BLOCKED)
#   S8 cancelamento expirado + B novo→ antigo vira CANCELLED (cancelled_at), B inicia
#   S9 run alvo sem session_id       → alvo vira FAILED (RUN_SESSION_REQUIRED), nunca PENDING órfão
#
# Uso: bash scripts/test-bru81-single-active-run-concurrency.sh
# Saída: cenário a cenário (PASS/FAIL) + exit code 0 apenas se TODOS passarem.
set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
MIGRATION="$REPO_ROOT/supabase/migrations/20260813190000_bru81_single_active_run.sql"

command -v "$PG_BIN/initdb" >/dev/null 2>&1 || { echo "SKIP: postgresql@16 indisponível em $PG_BIN"; exit 2; }
[ -f "$MIGRATION" ] || { echo "FAIL: migration não encontrada em $MIGRATION"; exit 1; }

CLUSTER_DIR="$(mktemp -d /tmp/bru81-pg.XXXXXX)"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')"
PSQL="$PG_BIN/psql -h 127.0.0.1 -p $PORT -U postgres -d bru81 -X -q -v ON_ERROR_STOP=1 -t -A"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$CLUSTER_DIR" stop -m immediate >/dev/null 2>&1
  rm -rf "$CLUSTER_DIR"
}
trap cleanup EXIT

echo "== BRU-81 B' harness concorrente (porta $PORT) =="

"$PG_BIN/initdb" -D "$CLUSTER_DIR" -A trust -U postgres >/dev/null 2>&1 || { echo "FAIL: initdb"; exit 1; }
"$PG_BIN/pg_ctl" -D "$CLUSTER_DIR" -o "-p $PORT -F -c max_connections=20" -l "$CLUSTER_DIR/log" start >/dev/null 2>&1
sleep 1
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres bru81 >/dev/null 2>&1

# --- schema mínimo + stub auth.uid() + RPC real da migration ---
"$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d bru81 -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
SQL
$PSQL <<'SQL'
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE plpgsql AS $$
BEGIN
  RETURN (current_setting('app.owner_id', true))::uuid;
END $$;

CREATE TABLE public.dossier_runs (
  run_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  operator_id text,
  session_id uuid,
  dossier_id uuid,
  status text NOT NULL DEFAULT 'PENDING',
  idempotency_key text,
  lease_owner text,
  lease_expires_at timestamptz,
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_heartbeat_at timestamptz,
  environment text,
  app_version text,
  error_code text,
  error_stage text
);
SQL
# a migration redefine a função e aplica a ACL — a função precisa do
# objeto public.dossier_runs já criado acima.
$PSQL < "$MIGRATION" || { echo "FAIL: aplicar migration"; exit 1; }

OWNER1="11111111-1111-4111-8111-111111111111"
OWNER2="22222222-2222-4222-8222-222222222222"
SESS1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
SESS2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
S1S="c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1"
S2S="c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2"
S3S="c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3"
S4S="c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4"
S5S1="c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5"
S5S2="d5d5d5d5-d5d5-4d5d-8d5d-d5d5d5d5d5d5"
S6S="c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6"
S7S="c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7"
S8S="c8c8c8c8-c8c8-4c8c-8c8c-c8c8c8c8c8c8"

sql_run() { # sql_run <sql>
  $PSQL -c "$1"
}
new_run() { # new_run <run_id> <owner> <session> [status] [lease_expr]
  local run="$1" owner="$2" sess="$3" status="${4:-PENDING}" lease="${5:-}"
  sql_run "INSERT INTO dossier_runs (run_id, owner_id, session_id, status${lease:+, lease_expires_at}) VALUES ('$run','$owner','$sess','$status'${lease:+, $lease});" >/dev/null
}
state_of() { # state_of <run_id> → "STATUS|error_code|lease_owner"
  $PSQL -c "SELECT status || '|' || coalesce(error_code,'-') || '|' || coalesce(lease_owner,'-') FROM dossier_runs WHERE run_id = '$1';" | tr -d ' '
}
acquire_in_session() { # acquire_in_session <owner> <run_id> <lease_owner> <extra_sql>
  $PSQL <<SQL
SET app.owner_id = '$1';
BEGIN;
SELECT public.acquire_dossier_run_lease('$2', '$3', 45) IS NOT NULL AS acquired;
$4
COMMIT;
SQL
}

PASS=0; FAIL=0
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✓ $1"; else FAIL=$((FAIL+1)); echo "  ✗ $1 — esperado [$2], obtido [$3]"; fi
}

# ---------- S1: A e B novos na mesma sessão, concorrentes ----------
R_A="c1aaaaaa-0000-4000-8000-000000000001"; R_B="c1bbbbbb-0000-4000-8000-000000000002"
new_run "$R_A" "$OWNER1" "$S1S"; new_run "$R_B" "$OWNER1" "$S1S"
echo "S1: A e B novos na mesma sessão (concorrentes)"
# Prova REAL do término: mede duração e exit code das DUAS conexões.
# A abre a transação, adquire o lease e segura o advisory 2s (pg_sleep);
# B começa 0.4s depois e só pode terminar depois do COMMIT de A.
T0=$(python3 -c 'import time; print(time.monotonic())')
acquire_in_session "$OWNER1" "$R_A" "A:lease" "SELECT pg_sleep(2);" >/dev/null 2>&1 &
PID_A=$!
sleep 0.4
T_B0=$(python3 -c 'import time; print(time.monotonic())')
acquire_in_session "$OWNER1" "$R_B" "B:lease" "" >/dev/null 2>&1
B_RC=$?
T_B1=$(python3 -c 'import time; print(time.monotonic())')
wait "$PID_A"
A_RC=$?
T_A1=$(python3 -c 'import time; print(time.monotonic())')
DUR_A=$(python3 -c "print(round($T_A1 - $T0, 2))")
DUR_B=$(python3 -c "print(round($T_B1 - $T_B0, 2))")
ST_A=$(state_of "$R_A"); ST_B=$(state_of "$R_B")
RUNNING_COUNT=$(sql_run "SELECT count(*) FROM dossier_runs WHERE session_id='$S1S' AND status='RUNNING';")
FAILED_COUNT=$(sql_run "SELECT count(*) FROM dossier_runs WHERE session_id='$S1S' AND status='FAILED';")
check "exatamente 1 RUNNING" "1" "$RUNNING_COUNT"
check "exatamente 1 FAILED" "1" "$FAILED_COUNT"
check "perdedor com SINGLE_ACTIVE_RUN_BLOCKED" "1" "$(echo "$ST_A|$ST_B" | grep -c 'SINGLE_ACTIVE_RUN_BLOCKED')"
check "conexao A terminou com exit 0" "0" "$A_RC"
check "conexao B terminou com exit 0" "0" "$B_RC"
check "A segurou a transacao >= 2s (pg_sleep real)" "true" "$(python3 -c "print('true' if $DUR_A >= 2.0 else 'false')")"
check "B so terminou depois do commit de A (esperou o advisory ~1.6s+)" "true" "$(python3 -c "print('true' if $DUR_B >= 1.5 else 'false')")"
check "sem deadlock: ambas concluiram dentro de 30s (A=$DUR_A s, B=$DUR_B s)" "true" "$(python3 -c "print('true' if $DUR_A < 30.0 and $DUR_B < 30.0 else 'false')")"

# ---------- S2: A vivo + B novo ----------
R_A="c2aaaaaa-0000-4000-8000-000000000001"; R_B="c2bbbbbb-0000-4000-8000-000000000002"
new_run "$R_A" "$OWNER1" "$S2S" RUNNING "now() + interval '10 minutes'"
new_run "$R_B" "$OWNER1" "$S2S"
echo "S2: A vivo + B novo"
acquire_in_session "$OWNER1" "$R_B" "B:lease" "" >/dev/null 2>&1
ST_A=$(state_of "$R_A"); ST_B=$(state_of "$R_B")
check "A permanece RUNNING" "RUNNING|-|-" "$ST_A"
check "B FAILED SINGLE_ACTIVE_RUN_BLOCKED" "FAILED|SINGLE_ACTIVE_RUN_BLOCKED|-" "$ST_B"

# ---------- S3: A expirado + B novo ----------
R_A="c3aaaaaa-0000-4000-8000-000000000001"; R_B="c3bbbbbb-0000-4000-8000-000000000002"
new_run "$R_A" "$OWNER1" "$S3S" RUNNING "now() - interval '1 minute'"
new_run "$R_B" "$OWNER1" "$S3S"
echo "S3: A expirado + B novo"
acquire_in_session "$OWNER1" "$R_B" "B:lease" "" >/dev/null 2>&1
ST_A=$(state_of "$R_A"); ST_B=$(state_of "$R_B")
check "A FAILED SUPERSEDED_STALE_RUN" "FAILED|SUPERSEDED_STALE_RUN|-" "$ST_A"
check "B RUNNING" "RUNNING|-|B:lease" "$ST_B"

# ---------- S4: múltiplos RUNNING históricos mortos ----------
R_A="c4aaaaaa-0000-4000-8000-000000000001"; R_B="c4bbbbbb-0000-4000-8000-000000000002"; R_C="c4cccccc-0000-4000-8000-000000000003"
new_run "$R_A" "$OWNER1" "$S4S" RUNNING "now() - interval '1 minute'"
new_run "$R_C" "$OWNER1" "$S4S" RUNNING "now() - interval '2 minutes'"
new_run "$R_B" "$OWNER1" "$S4S"
echo "S4: múltiplos RUNNING mortos + B novo"
acquire_in_session "$OWNER1" "$R_B" "B:lease" "" >/dev/null 2>&1
ST_A=$(state_of "$R_A"); ST_B=$(state_of "$R_B"); ST_C=$(state_of "$R_C")
check "A terminalizado" "FAILED|SUPERSEDED_STALE_RUN|-" "$ST_A"
check "C terminalizado (não ignorado)" "FAILED|SUPERSEDED_STALE_RUN|-" "$ST_C"
check "B RUNNING" "RUNNING|-|B:lease" "$ST_B"
check "nenhum RUNNING órfão restante na sessão" "1" "$(sql_run "SELECT count(*) FROM dossier_runs WHERE session_id='$S4S' AND status='RUNNING';")"

# ---------- S5: sessões diferentes não se bloqueiam ----------
R_A="c5aaaaaa-0000-4000-8000-000000000001"; R_B="c5bbbbbb-0000-4000-8000-000000000002"
new_run "$R_A" "$OWNER1" "$S5S1" RUNNING "now() + interval '10 minutes'"
new_run "$R_B" "$OWNER1" "$S5S2"
echo "S5: sessões diferentes"
acquire_in_session "$OWNER1" "$R_B" "B:lease" "" >/dev/null 2>&1
ST_A=$(state_of "$R_A"); ST_B=$(state_of "$R_B")
check "A (sessão 1) intocado" "RUNNING|-|-" "$ST_A"
check "B (sessão 2) RUNNING" "RUNNING|-|B:lease" "$ST_B"

# ---------- S6: owners diferentes não interferem ----------
R_A="c6aaaaaa-0000-4000-8000-000000000001"; R_B="c6bbbbbb-0000-4000-8000-000000000002"
new_run "$R_A" "$OWNER1" "$S6S" RUNNING "now() + interval '10 minutes'"
new_run "$R_B" "$OWNER2" "$S6S"
echo "S6: owners diferentes na mesma sessão"
acquire_in_session "$OWNER2" "$R_B" "B:lease" "" >/dev/null 2>&1
ST_A=$(state_of "$R_A"); ST_B=$(state_of "$R_B")
check "A (owner1) intocado" "RUNNING|-|-" "$ST_A"
check "B (owner2) RUNNING" "RUNNING|-|B:lease" "$ST_B"

# ---------- S7: cancelamento VIVO + nova tentativa ----------
R_A="c7aaaaaa-0000-4000-8000-000000000001"; R_B="c7bbbbbb-0000-4000-8000-000000000002"
new_run "$R_A" "$OWNER1" "$S7S" CANCEL_REQUESTED "now() + interval '10 minutes'"
new_run "$R_B" "$OWNER1" "$S7S"
echo "S7: cancelamento vivo + nova tentativa"
acquire_in_session "$OWNER1" "$R_B" "B:lease" "" >/dev/null 2>&1
ST_A=$(state_of "$R_A"); ST_B=$(state_of "$R_B")
check "A permanece CANCEL_REQUESTED (ocupação viva preservada)" "CANCEL_REQUESTED|-|-" "$ST_A"
check "B FAILED SINGLE_ACTIVE_RUN_BLOCKED" "FAILED|SINGLE_ACTIVE_RUN_BLOCKED|-" "$ST_B"

# ---------- S8: cancelamento expirado + nova tentativa ----------
R_A="c8aaaaaa-0000-4000-8000-000000000001"; R_B="c8bbbbbb-0000-4000-8000-000000000002"
new_run "$R_A" "$OWNER1" "$S8S" CANCEL_REQUESTED "now() - interval '1 minute'"
new_run "$R_B" "$OWNER1" "$S8S"
echo "S8: cancelamento expirado + nova tentativa"
acquire_in_session "$OWNER1" "$R_B" "B:lease" "" >/dev/null 2>&1
ST_A=$(state_of "$R_A"); ST_B=$(state_of "$R_B")
A_CANCELLED_AT=$(sql_run "SELECT (cancelled_at IS NOT NULL)::text FROM dossier_runs WHERE run_id='$R_A';")
check "A vira CANCELLED com cancelled_at preenchido" "CANCELLED|-|-|true" "${ST_A}|${A_CANCELLED_AT}"
check "B RUNNING" "RUNNING|-|B:lease" "$ST_B"

# ---------- S9: run alvo sem session_id → FAILED RUN_SESSION_REQUIRED ----------
R_A="c9aaaaaa-0000-4000-8000-000000000001"
sql_run "INSERT INTO dossier_runs (run_id, owner_id, session_id, status) VALUES ('$R_A','$OWNER1', NULL, 'PENDING');" >/dev/null
echo "S9: run alvo sem session_id"
acquire_in_session "$OWNER1" "$R_A" "A:lease" "" >/dev/null 2>&1
ST_A=$(state_of "$R_A")
check "alvo vira FAILED RUN_SESSION_REQUIRED (nunca fica PENDING orfao)" "FAILED|RUN_SESSION_REQUIRED|-" "$ST_A"

echo "== RESULTADO: $PASS PASS / $FAIL FAIL =="
[ "$FAIL" -eq 0 ]
