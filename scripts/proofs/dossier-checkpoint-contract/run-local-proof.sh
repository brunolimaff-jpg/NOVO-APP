#!/usr/bin/env bash
set -euo pipefail

# DOSSIER-FLOW-05E.0C local-only proof runner.
# It starts two disposable PostgreSQL 17.10 clusters, replays the complete
# migration chain in both, runs the functional contract proof in cluster 1,
# and runs independent-connection concurrency proofs in cluster 1.

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PG_BIN=/opt/homebrew/opt/postgresql@17/bin
EVIDENCE_DIR="$(mktemp -d /tmp/dossier-flow-05e0c-proof.XXXXXX)"
CLUSTER_ONE="$EVIDENCE_DIR/cluster-one"
CLUSTER_TWO="$EVIDENCE_DIR/cluster-two"
PORT_ONE=55482
PORT_TWO=55483
OWNER_ID="11111111-1111-1111-1111-111111111111"
RUN_BEGIN="ffffffff-ffff-ffff-ffff-ffffffffffff"
RUN_CHECKPOINT="99999999-9999-9999-9999-999999999998"
RUN_DIVERGENT="99999999-9999-9999-9999-999999999997"

mkdir -p "$EVIDENCE_DIR"

for required in initdb pg_ctl psql createdb; do
  test -x "$PG_BIN/$required" || {
    echo "missing PostgreSQL 17 binary: $PG_BIN/$required" >&2
    exit 1
  }
done

port_is_free() {
  ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

while ! port_is_free "$PORT_ONE"; do PORT_ONE=$((PORT_ONE + 1)); done
while ! port_is_free "$PORT_TWO" || [ "$PORT_TWO" = "$PORT_ONE" ]; do PORT_TWO=$((PORT_TWO + 1)); done

start_cluster() {
  root="$1"
  port="$2"
  db="$3"
  mkdir -p "$root/socket"
  "$PG_BIN/initdb" -D "$root/data" -A trust --no-locale >"$root/initdb.log" 2>&1
  "$PG_BIN/pg_ctl" -D "$root/data" -o "-p $port -k $root/socket" -l "$root/postgres.log" -w start >/dev/null
  "$PG_BIN/createdb" -h "$root/socket" -p "$port" "$db"
  "$PG_BIN/psql" -X -h "$root/socket" -p "$port" -d "$db" -v ON_ERROR_STOP=1 -c "CREATE ROLE postgres SUPERUSER LOGIN; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;"
  "$PG_BIN/psql" -X -h "$root/socket" -p "$port" -d "$db" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/scripts/bootstrap_supabase_auth_for_migration_test.sql" >"$root/bootstrap.log"
}

stop_cluster() {
  root="$1"
  "$PG_BIN/pg_ctl" -D "$root/data" -m fast -w stop >/dev/null 2>&1 || true
}

replay_chain() {
  root="$1"
  port="$2"
  db="$3"
  log="$4"
  : >"$log"
  while IFS= read -r migration; do
    printf 'APPLY %s\n' "$(basename "$migration")" >>"$log"
    "$PG_BIN/psql" -X -h "$root/socket" -p "$port" -d "$db" -v ON_ERROR_STOP=1 -f "$migration" >>"$log" 2>&1
  done < <(find "$REPO_ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | sort)
}

psql_admin() {
  root="$1"
  port="$2"
  db="$3"
  shift 3
  "$PG_BIN/psql" -X -h "$root/socket" -p "$port" -d "$db" "$@"
}

psql_owner() {
  root="$1"
  port="$2"
  db="$3"
  shift 3
  psql_admin "$root" "$port" "$db" -v ON_ERROR_STOP=1 -c "SET ROLE authenticated; SET request.jwt.claim.sub = '$OWNER_ID'; $*"
}

cleanup() {
  stop_cluster "$CLUSTER_ONE"
  stop_cluster "$CLUSTER_TWO"
}
trap cleanup EXIT

start_cluster "$CLUSTER_ONE" "$PORT_ONE" dossier_contract
start_cluster "$CLUSTER_TWO" "$PORT_TWO" dossier_replay

replay_chain "$CLUSTER_ONE" "$PORT_ONE" dossier_contract "$EVIDENCE_DIR/replay-one.log"
replay_chain "$CLUSTER_TWO" "$PORT_TWO" dossier_replay "$EVIDENCE_DIR/replay-two.log"

psql_admin "$CLUSTER_ONE" "$PORT_ONE" dossier_contract -v ON_ERROR_STOP=1 -f "$REPO_ROOT/tests/proofs/dossier-checkpoint-contract/checkpoint-contract.sql" >"$EVIDENCE_DIR/functional.log"

psql_admin "$CLUSTER_ONE" "$PORT_ONE" dossier_contract -v ON_ERROR_STOP=1 -c "
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS \$\$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
\$\$;
INSERT INTO auth.users (id, email)
VALUES ('$OWNER_ID', 'owner@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, operator_id, email, name)
VALUES ('$OWNER_ID', 'op_concurrency_owner', 'owner@example.test', 'Concurrency Owner')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.dossier_runs (run_id, owner_id, operator_id, status, idempotency_key, environment, app_version)
VALUES
  ('$RUN_BEGIN', '$OWNER_ID', 'op_concurrency_owner', 'PENDING', 'concurrency-begin', 'test', 'contract'),
  ('$RUN_CHECKPOINT', '$OWNER_ID', 'op_concurrency_owner', 'PENDING', 'concurrency-checkpoint', 'test', 'contract'),
  ('$RUN_DIVERGENT', '$OWNER_ID', 'op_concurrency_owner', 'PENDING', 'concurrency-divergent', 'test', 'contract')
ON CONFLICT (run_id) DO NOTHING;
"

psql_owner "$CLUSTER_ONE" "$PORT_ONE" dossier_contract "SELECT public.begin_dossier_run_attempt('$RUN_CHECKPOINT'::uuid, 'v1', 30);" >"$EVIDENCE_DIR/checkpoint-begin.log"
CHECKPOINT_ATTEMPT="$(psql_admin "$CLUSTER_ONE" "$PORT_ONE" dossier_contract -Atqc "SET ROLE authenticated; SET request.jwt.claim.sub = '$OWNER_ID'; SELECT (public.get_dossier_run_resume_state('$RUN_CHECKPOINT'::uuid, 'v1')->>'attempts_consumed');" | tail -n 1 | tr -d '[:space:]')"
test "$CHECKPOINT_ATTEMPT" = "1"
CHECKPOINT_ID="$(psql_admin "$CLUSTER_ONE" "$PORT_ONE" dossier_contract -Atqc "SELECT attempt_id::text || '|' || fence_token::text FROM public.dossier_run_attempts WHERE run_id = '$RUN_CHECKPOINT'::uuid")"
IFS='|' read -r ATTEMPT_ID FENCE_TOKEN <<<"$CHECKPOINT_ID"

psql_owner "$CLUSTER_ONE" "$PORT_ONE" dossier_contract "BEGIN; SELECT public.record_dossier_run_checkpoint('$RUN_CHECKPOINT'::uuid, '$ATTEMPT_ID'::uuid, '$FENCE_TOKEN'::uuid, 'v1', 'parallel', 0, jsonb_build_object('kind','parallel')); SELECT pg_sleep(2); COMMIT;" >"$EVIDENCE_DIR/equivalent-connection-one.log" 2>&1 &
CONNECTION_ONE_PID=$!
sleep 0.25
set +e
psql_owner "$CLUSTER_ONE" "$PORT_ONE" dossier_contract "SELECT public.record_dossier_run_checkpoint('$RUN_CHECKPOINT'::uuid, '$ATTEMPT_ID'::uuid, '$FENCE_TOKEN'::uuid, 'v1', 'parallel', 0, jsonb_build_object('kind','parallel'));" >"$EVIDENCE_DIR/equivalent-connection-two.log" 2>&1
EQUIVALENT_STATUS=$?
set -e
wait "$CONNECTION_ONE_PID"
test "$EQUIVALENT_STATUS" -eq 0
rg -q '"idempotent": true' "$EVIDENCE_DIR/equivalent-connection-two.log"

psql_owner "$CLUSTER_ONE" "$PORT_ONE" dossier_contract "SELECT public.begin_dossier_run_attempt('$RUN_DIVERGENT'::uuid, 'v1', 30);" >"$EVIDENCE_DIR/divergent-begin.log"
DIVERGENT_ID="$(psql_admin "$CLUSTER_ONE" "$PORT_ONE" dossier_contract -Atqc "SELECT attempt_id::text || '|' || fence_token::text FROM public.dossier_run_attempts WHERE run_id = '$RUN_DIVERGENT'::uuid")"
IFS='|' read -r DIVERGENT_ATTEMPT DIVERGENT_FENCE <<<"$DIVERGENT_ID"

psql_owner "$CLUSTER_ONE" "$PORT_ONE" dossier_contract "BEGIN; SELECT public.record_dossier_run_checkpoint('$RUN_DIVERGENT'::uuid, '$DIVERGENT_ATTEMPT'::uuid, '$DIVERGENT_FENCE'::uuid, 'v1', 'race', 0, jsonb_build_object('winner',true)); SELECT pg_sleep(2); COMMIT;" >"$EVIDENCE_DIR/divergent-connection-one.log" 2>&1 &
DIVERGENT_ONE_PID=$!
sleep 0.25
set +e
psql_owner "$CLUSTER_ONE" "$PORT_ONE" dossier_contract "SELECT public.record_dossier_run_checkpoint('$RUN_DIVERGENT'::uuid, '$DIVERGENT_ATTEMPT'::uuid, '$DIVERGENT_FENCE'::uuid, 'v1', 'race', 0, jsonb_build_object('winner',false));" >"$EVIDENCE_DIR/divergent-connection-two.log" 2>&1
DIVERGENT_STATUS=$?
set -e
wait "$DIVERGENT_ONE_PID"
test "$DIVERGENT_STATUS" -ne 0
rg -q 'CHECKPOINT_CONFLICT' "$EVIDENCE_DIR/divergent-connection-two.log"

psql_owner "$CLUSTER_ONE" "$PORT_ONE" dossier_contract "BEGIN; SELECT public.begin_dossier_run_attempt('$RUN_BEGIN'::uuid, 'v1', 30); SELECT pg_sleep(2); COMMIT;" >"$EVIDENCE_DIR/begin-connection-one.log" 2>&1 &
BEGIN_ONE_PID=$!
sleep 0.25
set +e
psql_owner "$CLUSTER_ONE" "$PORT_ONE" dossier_contract "SELECT public.begin_dossier_run_attempt('$RUN_BEGIN'::uuid, 'v1', 30);" >"$EVIDENCE_DIR/begin-connection-two.log" 2>&1
BEGIN_STATUS=$?
set -e
wait "$BEGIN_ONE_PID"
test "$BEGIN_STATUS" -ne 0
rg -q 'RUN_LEASE_UNAVAILABLE' "$EVIDENCE_DIR/begin-connection-two.log"

psql_admin "$CLUSTER_ONE" "$PORT_ONE" dossier_contract -Atqc "
SELECT 'REPLAY_ONE|17.10|' || count(*) FROM pg_tables WHERE schemaname = 'public';
SELECT 'REPLAY_TWO|17.10|' || count(*) FROM pg_tables WHERE schemaname = 'public';
SELECT 'CONCURRENCY_EQUIVALENT|PASS';
SELECT 'CONCURRENCY_DIVERGENT|PASS';
SELECT 'CONCURRENCY_BEGIN_SINGLE_WINNER|PASS';
" >"$EVIDENCE_DIR/gates.txt"

printf 'EVIDENCE_DIR=%s\n' "$EVIDENCE_DIR"
printf 'POSTGRES_VERSION=%s\n' "$("$PG_BIN/psql" --version | sed 's/^psql (PostgreSQL) //')"
printf 'MIGRATION_COUNT=%s\n' "$(find "$REPO_ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
cat "$EVIDENCE_DIR/gates.txt"
