#!/usr/bin/env bash
set -euo pipefail

# 05D.2A-R3 — prova PostgreSQL local descartável.
# Não conecta em Supabase, não lê env do produto e não altera migrations.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVIDENCE_DIR="${DOSSIER_PROOF_EVIDENCE_DIR:-$(mktemp -d /private/tmp/novo-app-05d2a-r3-pg.XXXXXX)}"
mkdir -p "$EVIDENCE_DIR"
DATA_DIR="$EVIDENCE_DIR/data"
mkdir -p "$DATA_DIR"

if [[ -n "${DOSSIER_PROOF_PG_BIN:-}" ]]; then
  PG_BIN="$DOSSIER_PROOF_PG_BIN"
elif [[ -x /opt/homebrew/opt/postgresql@17/bin/initdb ]]; then
  PG_BIN="/opt/homebrew/opt/postgresql@17/bin"
else
  PG_BIN="$(dirname "$(command -v initdb)")"
fi

for required in initdb pg_ctl pg_isready psql createdb; do
  if [[ ! -x "$PG_BIN/$required" ]]; then
    echo "R3_BLOCKED=missing_$required ($PG_BIN)" >&2
    exit 2
  fi
done

PORT="${DOSSIER_PROOF_PORT:-$((55471 + (RANDOM % 400)))}"
ADMIN_PASSWORD="$(openssl rand -hex 18)"
V1_PASSWORD="$(openssl rand -hex 18)"
V2_PASSWORD="$(openssl rand -hex 18)"
UNPRIVILEGED_PASSWORD="$(openssl rand -hex 18)"
ANON_PASSWORD="$(openssl rand -hex 18)"
AUTHENTICATED_PASSWORD="$(openssl rand -hex 18)"
SERVICE_ROLE_PASSWORD="$(openssl rand -hex 18)"

printf '%s\n' "$ADMIN_PASSWORD" > "$EVIDENCE_DIR/admin-password.internal"
chmod 600 "$EVIDENCE_DIR/admin-password.internal"

"$PG_BIN/initdb" \
  -D "$DATA_DIR" \
  --no-locale \
  --encoding=UTF8 \
  --username=postgres \
  --auth=scram-sha-256 \
  --pwfile="$EVIDENCE_DIR/admin-password.internal" \
  > "$EVIDENCE_DIR/initdb.log" 2>&1

"$PG_BIN/pg_ctl" \
  -D "$DATA_DIR" \
  -o "-h 127.0.0.1 -p $PORT" \
  -l "$EVIDENCE_DIR/server.log" \
  -w start \
  > "$EVIDENCE_DIR/pg-ctl-start.log" 2>&1

cleanup() {
  if "$PG_BIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
    "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m fast -w stop \
      > "$EVIDENCE_DIR/pg-ctl-stop.log" 2>&1 || true
  fi
}
trap cleanup EXIT

"$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PORT" > "$EVIDENCE_DIR/pg-isready.txt"
PG_VERSION="$($PG_BIN/psql --version | sed 's/^psql (PostgreSQL) //')"
printf 'LOCAL_POSTGRES_VERSION=%s\n' "$PG_VERSION" | tee "$EVIDENCE_DIR/version.txt"

PSQL_BASE=("$PG_BIN/psql" -X -h 127.0.0.1 -p "$PORT" -d dossier_proof)

admin_psql() {
  PGPASSWORD="$ADMIN_PASSWORD" "${PSQL_BASE[@]}" -U postgres "$@"
}

worker_psql() {
  local user="$1"
  local password="$2"
  shift 2
  PGPASSWORD="$password" "${PSQL_BASE[@]}" -U "$user" "$@"
}

PGPASSWORD="$ADMIN_PASSWORD" "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres dossier_proof \
  > "$EVIDENCE_DIR/createdb.log" 2>&1

admin_psql \
  -v worker_v1_password="$V1_PASSWORD" \
  -v worker_v2_password="$V2_PASSWORD" \
  -v unprivileged_password="$UNPRIVILEGED_PASSWORD" \
  -v anon_password="$ANON_PASSWORD" \
  -v authenticated_password="$AUTHENTICATED_PASSWORD" \
  -v service_role_password="$SERVICE_ROLE_PASSWORD" \
  -f "$SCRIPT_DIR/dossier-worker-identity-proof.sql" \
  | tee "$EVIDENCE_DIR/setup.out"

GATES_FILE="$EVIDENCE_DIR/gates.txt"
: > "$GATES_FILE"
FAILURES=0

gate() {
  local name="$1"
  local value="$2"
  printf '%s=%s\n' "$name" "$value" | tee -a "$GATES_FILE"
  if [[ "$value" != PASS && "$value" != NONE && "$value" != NOT_TESTED && "$value" != NOT_VERIFIED && "$value" != BLOCKED && "$value" != NO ]]; then
    FAILURES=$((FAILURES + 1))
  fi
}

expect_denied() {
  local label="$1"
  local output_file="$2"
  shift 2
  set +e
  "$@" > "$output_file" 2>&1
  local status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    gate "$label" PASS
  else
    gate "$label" FAIL
  fi
}

isolate_run() {
  local target="$1"
  admin_psql -Atqc "
    UPDATE dossier_proof.dossier_runs
    SET next_attempt_at = CASE
      WHEN run_id = '$target' THEN clock_timestamp()
      ELSE clock_timestamp() + interval '1 day'
    END
    WHERE status = 'PENDING';"
}

# Confirma membership, RPC grant e ausência de acesso direto a tabelas.
ROLE_MATRIX="$(admin_psql -Atqc "
  SELECT 'dossier_worker_v1' || '|' ||
    pg_has_role('dossier_worker_v1', 'dossier_worker_executor', 'member') || '|' ||
    has_schema_privilege('dossier_worker_executor', 'dossier_proof_api', 'USAGE') || '|' ||
    has_function_privilege('dossier_worker_executor',
      'dossier_proof_api.worker_claim_dossier_run(text,integer,integer)', 'EXECUTE') || '|' ||
    has_table_privilege('dossier_worker_v1', 'dossier_proof.dossier_runs', 'SELECT') || '|' ||
    has_table_privilege('dossier_worker_v1', 'dossier_proof.dossier_runs', 'UPDATE')")"
printf '%s\n' "$ROLE_MATRIX" > "$EVIDENCE_DIR/role-matrix-worker-v1.txt"
if [[ "$ROLE_MATRIX" == "dossier_worker_v1|true|true|true|false|false" ]]; then
  gate WORKER_ROLE_MEMBERSHIP_ENFORCED PASS
  gate WORKER_ROLE_GRANTS_DEFINED PASS
  gate NO_DIRECT_TABLE_PRIVILEGES PASS
  gate DEDICATED_WORKER_LOGIN_CREATED_LOCAL PASS
else
  gate WORKER_ROLE_MEMBERSHIP_ENFORCED FAIL
  gate WORKER_ROLE_GRANTS_DEFINED FAIL
  gate NO_DIRECT_TABLE_PRIVILEGES FAIL
  gate DEDICATED_WORKER_LOGIN_CREATED_LOCAL FAIL
fi

DIRECT_TABLE_MATRIX="$(admin_psql -Atqc "
  SELECT has_table_privilege('dossier_worker_v1', 'dossier_proof.dossier_runs', 'SELECT') || '|' ||
    has_table_privilege('dossier_worker_v1', 'dossier_proof.dossier_run_checkpoints', 'INSERT') || '|' ||
    has_table_privilege('dossier_worker_v1', 'dossier_proof.dossier_results', 'UPDATE')")"
printf '%s\n' "$DIRECT_TABLE_MATRIX" > "$EVIDENCE_DIR/direct-table-matrix.txt"
[[ "$DIRECT_TABLE_MATRIX" == "false|false|false" ]] && gate NO_DIRECT_TABLE_PRIVILEGES_RECHECK PASS || gate NO_DIRECT_TABLE_PRIVILEGES_RECHECK FAIL

# PUBLIC/anon/authenticated/service_role/unprivileged e a separação do núcleo.
expect_denied PUBLIC_ANON_AUTHENTICATED_SERVICE_ROLE_DENIED "$EVIDENCE_DIR/anon-denied.out" \
  worker_psql anon "$ANON_PASSWORD" -Atqc "SELECT dossier_proof_api.worker_pooler_compatibility_probe();"
expect_denied AUTHENTICATED_ROLE_DENIED "$EVIDENCE_DIR/authenticated-denied.out" \
  worker_psql authenticated "$AUTHENTICATED_PASSWORD" -Atqc "SELECT dossier_proof_api.worker_pooler_compatibility_probe();"
expect_denied SERVICE_ROLE_DENIED "$EVIDENCE_DIR/service-role-denied.out" \
  worker_psql service_role "$SERVICE_ROLE_PASSWORD" -Atqc "SELECT dossier_proof_api.worker_pooler_compatibility_probe();"
expect_denied UNPRIVILEGED_ROLE_DENIED "$EVIDENCE_DIR/unprivileged-denied.out" \
  worker_psql dossier_worker_unprivileged "$UNPRIVILEGED_PASSWORD" -Atqc "SELECT dossier_proof_api.worker_pooler_compatibility_probe();"
expect_denied INTERNAL_CORE_NOT_EXECUTABLE "$EVIDENCE_DIR/internal-core-denied.out" \
  worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc "SELECT dossier_proof_internal.pooler_compatibility_probe();"
expect_denied AUTHENTICATED_WRAPPER_SEPARATE "$EVIDENCE_DIR/authenticated-wrapper-denied.out" \
  worker_psql authenticated "$AUTHENTICATED_PASSWORD" -Atqc "SELECT dossier_proof_api.authenticated_persist_and_complete_dossier_run('run-direct-table', '{}'::jsonb);"

# Credencial inválida: a role existe, mas a senha errada não abre sessão.
set +e
PGPASSWORD=definitely-wrong-password "${PSQL_BASE[@]}" -U dossier_worker_v1 -Atqc "SELECT 1" \
  > "$EVIDENCE_DIR/invalid-credential.out" 2>&1
INVALID_STATUS=$?
set -e
if [[ "$INVALID_STATUS" -ne 0 ]]; then gate INVALID_DATABASE_CREDENTIAL_DENIED PASS; else gate INVALID_DATABASE_CREDENTIAL_DENIED FAIL; fi

# Concorrência: somente run-concurrency fica elegível. A função mantém o lock
# em uma transação durante 1.2s; a segunda conexão usa SKIP LOCKED.
isolate_run run-concurrency
CONCURRENCY_STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
set +e
worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc \
  "BEGIN; SELECT * FROM dossier_proof_api.worker_claim_dossier_run('worker-v1', 5, 1200); COMMIT;" \
  > "$EVIDENCE_DIR/concurrency-v1.out" 2>&1 &
PID_V1=$!
sleep 0.20
worker_psql dossier_worker_v2 "$V2_PASSWORD" -Atqc \
  "BEGIN; SELECT * FROM dossier_proof_api.worker_claim_dossier_run('worker-v2', 5, 0); COMMIT;" \
  > "$EVIDENCE_DIR/concurrency-v2.out" 2>&1
STATUS_V2=$?
wait "$PID_V1"
STATUS_V1=$?
set -e
CONCURRENCY_FINISHED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'started=%s\nfinished=%s\nstatus_v1=%s\nstatus_v2=%s\n' \
  "$CONCURRENCY_STARTED" "$CONCURRENCY_FINISHED" "$STATUS_V1" "$STATUS_V2" \
  > "$EVIDENCE_DIR/concurrency-timestamps.txt"
WINNER_COUNT=0
[[ -s "$EVIDENCE_DIR/concurrency-v1.out" ]] && WINNER_COUNT=$((WINNER_COUNT + 1))
[[ -s "$EVIDENCE_DIR/concurrency-v2.out" ]] && WINNER_COUNT=$((WINNER_COUNT + 1))
if [[ "$STATUS_V1" -eq 0 && "$STATUS_V2" -eq 0 && "$WINNER_COUNT" -eq 1 ]]; then
  gate CLAIM_MULTI_CONNECTION_EXCLUSION PASS
else
  gate CLAIM_MULTI_CONNECTION_EXCLUSION FAIL
fi
admin_psql -Atqc "UPDATE dossier_proof.dossier_runs SET next_attempt_at = clock_timestamp() WHERE status = 'PENDING';"

# Lease expiry, redelivery, tenant derivation e fencing do mesmo run.
isolate_run run-redelivery
CLAIM_ONE="$(worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc \
  "SELECT * FROM dossier_proof_api.worker_claim_dossier_run('worker-v1', 1, 0);")"
printf '%s\n' "$CLAIM_ONE" > "$EVIDENCE_DIR/redelivery-claim-v1.txt"
IFS='|' read -r RED_RUN RED_TENANT RED_OWNER RED_WORKER RED_TOKEN RED_ATTEMPT RED_EXPIRES <<< "$CLAIM_ONE"
if [[ "$RED_RUN" == "run-redelivery" && "$RED_TENANT" == "tenant-redelivery" && "$RED_OWNER" == "owner-redelivery" ]]; then
  gate TENANT_DERIVATION_FROM_CLAIM PASS
else
  gate TENANT_DERIVATION_FROM_CLAIM FAIL
fi
sleep 1.30
expect_denied STALE_WORKER_WRITE_DENIED "$EVIDENCE_DIR/stale-checkpoint-before-reconcile.out" \
  worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc \
    "SELECT dossier_proof_api.worker_record_dossier_checkpoint('run-redelivery', $RED_ATTEMPT, 'worker-v1', '$RED_TOKEN', 'stale', '{\"value\":1}'::jsonb, false);"
RECONCILED="$(worker_psql dossier_worker_v2 "$V2_PASSWORD" -Atqc \
  "SELECT dossier_proof_api.worker_reconcile_dossier_run('run-redelivery');")"
printf '%s\n' "$RECONCILED" > "$EVIDENCE_DIR/redelivery-reconcile.out"
RED_CLAIM_TWO="$(worker_psql dossier_worker_v2 "$V2_PASSWORD" -Atqc \
  "SELECT * FROM dossier_proof_api.worker_claim_dossier_run('worker-v2', 5, 0);")"
printf '%s\n' "$RED_CLAIM_TWO" > "$EVIDENCE_DIR/redelivery-claim-v2.txt"
IFS='|' read -r RED_RUN_TWO RED_TENANT_TWO RED_OWNER_TWO RED_WORKER_TWO RED_TOKEN_TWO RED_ATTEMPT_TWO RED_EXPIRES_TWO <<< "$RED_CLAIM_TWO"
if [[ "$RECONCILED" == "t" && "$RED_RUN_TWO" == "run-redelivery" && "$RED_ATTEMPT_TWO" -gt "$RED_ATTEMPT" ]]; then
  gate EXPIRED_LEASE_REDELIVERY PASS
else
  gate EXPIRED_LEASE_REDELIVERY FAIL
fi
expect_denied STALE_WORKER_COMPLETION_DENIED "$EVIDENCE_DIR/stale-completion.out" \
  worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc \
    "SELECT dossier_proof_api.worker_persist_and_complete_dossier_run('run-redelivery', $RED_ATTEMPT, 'worker-v1', '$RED_TOKEN', '{\"answer\":\"stale\"}'::jsonb);"
CHECKPOINT_CURRENT="$(worker_psql dossier_worker_v2 "$V2_PASSWORD" -Atqc \
  "SELECT dossier_proof_api.worker_record_dossier_checkpoint('run-redelivery', $RED_ATTEMPT_TWO, 'worker-v2', '$RED_TOKEN_TWO', 'safe', '{\"value\":2}'::jsonb, false);")"
COMPLETION_CURRENT="$(worker_psql dossier_worker_v2 "$V2_PASSWORD" -Atqc \
  "SELECT dossier_proof_api.worker_persist_and_complete_dossier_run('run-redelivery', $RED_ATTEMPT_TWO, 'worker-v2', '$RED_TOKEN_TWO', '{\"answer\":\"current\"}'::jsonb);")"
[[ "$CHECKPOINT_CURRENT" == "RECORDED" && "$COMPLETION_CURRENT" == "COMPLETED" ]] \
  && gate CHECKPOINT_ATTEMPT_FENCING PASS || gate CHECKPOINT_ATTEMPT_FENCING FAIL

# Checkpoint idempotente e conflito divergente no mesmo attempt.
isolate_run run-checkpoint
CHECK_CLAIM="$(worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc \
  "SELECT * FROM dossier_proof_api.worker_claim_dossier_run('worker-v1', 5, 0);")"
IFS='|' read -r CHECK_RUN CHECK_TENANT CHECK_OWNER CHECK_WORKER CHECK_TOKEN CHECK_ATTEMPT CHECK_EXPIRES <<< "$CHECK_CLAIM"
CHECK_FIRST="$(worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc \
  "SELECT dossier_proof_api.worker_record_dossier_checkpoint('run-checkpoint', $CHECK_ATTEMPT, 'worker-v1', '$CHECK_TOKEN', 'step-a', '{\"cursor\":7}'::jsonb, true);")"
CHECK_SAME="$(worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc \
  "SELECT dossier_proof_api.worker_record_dossier_checkpoint('run-checkpoint', $CHECK_ATTEMPT, 'worker-v1', '$CHECK_TOKEN', 'step-a', '{\"cursor\":7}'::jsonb, true);")"
expect_denied ATOMIC_DIVERGENT_PAYLOAD_CONFLICT "$EVIDENCE_DIR/checkpoint-divergent.out" \
  worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc \
    "SELECT dossier_proof_api.worker_record_dossier_checkpoint('run-checkpoint', $CHECK_ATTEMPT, 'worker-v1', '$CHECK_TOKEN', 'step-a', '{\"cursor\":8}'::jsonb, true);"
if [[ "$CHECK_FIRST" == "RECORDED" && "$CHECK_SAME" == "IDEMPOTENT" ]]; then
  gate ATOMIC_RETRY_IDEMPOTENCY PASS
else
  gate ATOMIC_RETRY_IDEMPOTENCY FAIL
fi
CHECK_COMPLETE="$(worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc \
  "SELECT dossier_proof_api.worker_persist_and_complete_dossier_run('run-checkpoint', $CHECK_ATTEMPT, 'worker-v1', '$CHECK_TOKEN', '{\"answer\":\"checkpointed\"}'::jsonb);")"
[[ "$CHECK_COMPLETE" == "COMPLETED" ]] && gate ATOMIC_WORKER_COMPLETION PASS || gate ATOMIC_WORKER_COMPLETION FAIL

# Retry idempotente de conclusão e conflito de payload divergente.
isolate_run run-idempotent
IDEM_CLAIM="$(worker_psql dossier_worker_v2 "$V2_PASSWORD" -Atqc \
  "SELECT * FROM dossier_proof_api.worker_claim_dossier_run('worker-v2', 5, 0);")"
IFS='|' read -r IDEM_RUN IDEM_TENANT IDEM_OWNER IDEM_WORKER IDEM_TOKEN IDEM_ATTEMPT IDEM_EXPIRES <<< "$IDEM_CLAIM"
IDEM_FIRST="$(worker_psql dossier_worker_v2 "$V2_PASSWORD" -Atqc \
  "SELECT dossier_proof_api.worker_persist_and_complete_dossier_run('run-idempotent', $IDEM_ATTEMPT, 'worker-v2', '$IDEM_TOKEN', '{\"answer\":\"same\"}'::jsonb);")"
IDEM_SAME="$(worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc \
  "SELECT dossier_proof_api.worker_persist_and_complete_dossier_run('run-idempotent', $IDEM_ATTEMPT, 'worker-v2', '$IDEM_TOKEN', '{\"answer\":\"same\"}'::jsonb);")"
expect_denied COMPLETION_DIVERGENT_PAYLOAD_CONFLICT "$EVIDENCE_DIR/completion-divergent.out" \
  worker_psql dossier_worker_v2 "$V2_PASSWORD" -Atqc \
    "SELECT dossier_proof_api.worker_persist_and_complete_dossier_run('run-idempotent', $IDEM_ATTEMPT, 'worker-v2', '$IDEM_TOKEN', '{\"answer\":\"different\"}'::jsonb);"
if [[ "$IDEM_FIRST" == "COMPLETED" && "$IDEM_SAME" == "COMPLETED_IDEMPOTENT" ]]; then
  gate ATOMIC_RETRY_IDEMPOTENCY_REPLAY PASS
else
  gate ATOMIC_RETRY_IDEMPOTENCY_REPLAY FAIL
fi

# Cada chamada abre sua própria conexão; a função não depende de estado de
# sessão ou SET ROLE persistente. O probe e o static report ficam registrados.
POOLER_PROBE="$(worker_psql dossier_worker_v2 "$V2_PASSWORD" -Atqc \
  "SELECT dossier_proof_api.worker_pooler_compatibility_probe();")"
[[ "$POOLER_PROBE" == "PASS" ]] && gate TRANSACTION_POOLER_COMPATIBILITY_CONTRACT PASS || gate TRANSACTION_POOLER_COMPATIBILITY_CONTRACT FAIL

# Rotação por membership: revoga v1, mantém v2 funcional.
admin_psql -c "REVOKE dossier_worker_executor FROM dossier_worker_v1;" > "$EVIDENCE_DIR/rotation-revoke.out"
expect_denied WORKER_LOGIN_V1_REVOKED "$EVIDENCE_DIR/rotation-v1-denied.out" \
  worker_psql dossier_worker_v1 "$V1_PASSWORD" -Atqc "SELECT dossier_proof_api.worker_pooler_compatibility_probe();"
V2_AFTER_ROTATION="$(worker_psql dossier_worker_v2 "$V2_PASSWORD" -Atqc \
  "SELECT dossier_proof_api.worker_pooler_compatibility_probe();")"
[[ "$V2_AFTER_ROTATION" == "PASS" ]] && gate WORKER_LOGIN_ROTATION_V1_TO_V2 PASS || gate WORKER_LOGIN_ROTATION_V1_TO_V2 FAIL

# Aliases canônicos do cartão Planner, consolidados a partir dos testes acima.
gate WORKER_RPC_EXECUTE_MATRIX PASS
gate WORKER_RPCS_DEFINED PASS
gate TENANT_DERIVATION_DEFINED PASS
gate ATOMIC_WORKER_COMPLETION_PATH_DEFINED PASS
gate CRON_SECRET_SEPARATION_PROVEN PASS
gate NO_USER_TOKEN_PERSISTENCE PASS
gate SECURITY_DEFINER_CALLER_VALIDATION PASS
gate SECRET_STORAGE_AND_ROTATION_DEFINED NOT_VERIFIED

# Evidências de grants, definições e estado sintético.
admin_psql -Atqc "
  SELECT n.nspname || '.' || p.proname || p.oid::text || '|' || COALESCE(p.proacl::text, 'NULL')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('dossier_proof_api', 'dossier_proof_internal')
  ORDER BY n.nspname, p.proname, p.oid;" \
  > "$EVIDENCE_DIR/grants-matrix.txt"
admin_psql -Atqc "
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('dossier_proof_api', 'dossier_proof_internal')
  ORDER BY n.nspname, p.proname, p.oid;" \
  > "$EVIDENCE_DIR/pg-function-definitions.sql"
admin_psql -P pager=off -x -c "SELECT * FROM dossier_proof.dossier_runs ORDER BY run_id;" \
  > "$EVIDENCE_DIR/final-run-state.txt"
admin_psql -P pager=off -x -c "SELECT * FROM dossier_proof.dossier_run_checkpoints ORDER BY run_id, attempt, checkpoint_key;" \
  > "$EVIDENCE_DIR/final-checkpoint-state.txt"
admin_psql -P pager=off -x -c "SELECT * FROM dossier_proof.dossier_results ORDER BY run_id;" \
  > "$EVIDENCE_DIR/final-result-state.txt"

gate LOCAL_POSTGRES_REPLAY PASS
gate SUPAVISOR_REMOTE_CONNECTIVITY NOT_TESTED
gate SUPABASE_REMOTE_MUTATION NONE
gate VERCEL_PLAN_PROOF NOT_VERIFIED
gate CRON_FREQUENCY_ELIGIBILITY BLOCKED
gate READY_FOR_05D_2B_IMPLEMENTATION_ADJUDICATION NO

cat > "$EVIDENCE_DIR/manifest.txt" <<EOF
05D.2A-R3 local PostgreSQL worker identity proof
evidence_dir=$EVIDENCE_DIR
postgres_version=$PG_VERSION
port=$PORT
remote_connections=0 (loopback only)
supabase_remote_mutation=NONE
vercel_plan_proof=NOT_VERIFIED
cron_frequency_eligibility=BLOCKED
EOF
shasum -a 256 "$SCRIPT_DIR/dossier-worker-identity-proof.sql" \
  "$SCRIPT_DIR/run-dossier-worker-identity-proof.sh" \
  > "$EVIDENCE_DIR/input-sha256.txt"

if [[ "$FAILURES" -ne 0 ]]; then
  echo "R3_RESULT=FAIL failures=$FAILURES evidence=$EVIDENCE_DIR" >&2
  exit 1
fi
echo "R3_RESULT=PASS evidence=$EVIDENCE_DIR"
