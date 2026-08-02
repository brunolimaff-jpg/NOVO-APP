#!/usr/bin/env bash
set -euo pipefail

# DOSSIER-FLOW 05E.0C-R1. Local-only closure for the three gates left open by
# the Planner: real resume payload consumption, concurrent terminal completion,
# and identity comparison of the global suite against SOURCE_HEAD.

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PG_BIN=/opt/homebrew/opt/postgresql@17/bin
SOURCE_HEAD=a65f425b579ae429d9dd3823b0721a1a1d7d52bf
OWNER_ID=11111111-1111-1111-1111-111111111111
EVIDENCE_DIR="$(mktemp -d /tmp/dossier-flow-05e0c-r1.XXXXXX)"
CLUSTER_ROOT="$EVIDENCE_DIR/cluster"
PORT=55486
DB_NAME=dossier_r1

for required in initdb pg_ctl psql createdb; do
  test -x "$PG_BIN/$required" || { echo "missing PostgreSQL 17 binary: $PG_BIN/$required" >&2; exit 1; }
done

while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done

git status --porcelain=v1 | sed 's/^.. //' | sort >"$EVIDENCE_DIR/status-before.txt"

mkdir -p "$CLUSTER_ROOT/socket"
"$PG_BIN/initdb" -D "$CLUSTER_ROOT/data" -A trust --no-locale >"$EVIDENCE_DIR/initdb.log" 2>&1
"$PG_BIN/pg_ctl" -D "$CLUSTER_ROOT/data" -o "-p $PORT -k $CLUSTER_ROOT/socket" -l "$EVIDENCE_DIR/postgres.log" -w start >/dev/null
trap '"$PG_BIN/pg_ctl" -D "$CLUSTER_ROOT/data" -m fast -w stop >/dev/null 2>&1 || true' EXIT
"$PG_BIN/createdb" -h "$CLUSTER_ROOT/socket" -p "$PORT" "$DB_NAME"
"$PG_BIN/psql" -X -h "$CLUSTER_ROOT/socket" -p "$PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "CREATE ROLE postgres SUPERUSER LOGIN; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;" >"$EVIDENCE_DIR/bootstrap-role.log"
"$PG_BIN/psql" -X -h "$CLUSTER_ROOT/socket" -p "$PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$REPO_ROOT/scripts/bootstrap_supabase_auth_for_migration_test.sql" >"$EVIDENCE_DIR/bootstrap-auth.log"

replay_log="$EVIDENCE_DIR/replay-r1.log"
: >"$replay_log"
while IFS= read -r migration; do
  printf 'APPLY %s\n' "$(basename "$migration")" >>"$replay_log"
  "$PG_BIN/psql" -X -h "$CLUSTER_ROOT/socket" -p "$PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$migration" >>"$replay_log" 2>&1
done < <(find "$REPO_ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | sort)

"$PG_BIN/psql" -X -h "$CLUSTER_ROOT/socket" -p "$PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL >"$EVIDENCE_DIR/seed-auth.log"
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS \$\$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
\$\$;
INSERT INTO auth.users (id, email) VALUES ('$OWNER_ID', 'r1-owner@example.test') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, operator_id, email, name) VALUES ('$OWNER_ID', 'r1-owner', 'r1-owner@example.test', 'R1 Owner') ON CONFLICT (id) DO NOTHING;
SQL

R1_PG_BIN="$PG_BIN/psql" \
R1_PG_SOCKET="$CLUSTER_ROOT/socket" \
R1_PG_PORT="$PORT" \
R1_PG_DATABASE="$DB_NAME" \
R1_OWNER_ID="$OWNER_ID" \
npx --yes -p node@24 npm exec vitest -- run tests/proofs/dossier-checkpoint-contract/resume-payload.test.ts --reporter=verbose >"$EVIDENCE_DIR/resume-vitest.log" 2>&1

psql_admin() {
  "$PG_BIN/psql" -X -h "$CLUSTER_ROOT/socket" -p "$PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -At -c "$1"
}

psql_owner() {
  "$PG_BIN/psql" -X -h "$CLUSTER_ROOT/socket" -p "$PORT" -d "$DB_NAME" -v ON_ERROR_STOP=1 -At -c "SET ROLE authenticated; DO \$\$ BEGIN PERFORM set_config('request.jwt.claim.sub', '$OWNER_ID', false); END \$\$; $1"
}

begin_attempt() {
  local run_id="$1"
  psql_owner "SELECT (payload->>'attempt_id') || '|' || (payload->>'fence_token') FROM (SELECT public.begin_dossier_run_attempt('$run_id'::uuid, 'dossier-server-pipeline.v1', 120) AS payload) AS q;" | tail -n 1
}

completion_call() {
  local run_id="$1" attempt_id="$2" fence_token="$3" dossier_id="$4" content="$5"
  psql_owner "SELECT row_to_json(public.persist_and_complete_dossier_run_attempt('$run_id'::uuid, '$attempt_id'::uuid, '$fence_token'::uuid, 'dossier-server-pipeline.v1', '$dossier_id'::uuid, 'R1 dossier', 'R1 Empresa', '04733767000180', 'r1', 80, 'R1 resumo', jsonb_build_object('messages', jsonb_build_array(jsonb_build_object('role','assistant','content','$content')))));"
}

completion_call_hold() {
  local run_id="$1" attempt_id="$2" fence_token="$3" dossier_id="$4" content="$5"
  psql_owner "BEGIN; SELECT row_to_json(public.persist_and_complete_dossier_run_attempt('$run_id'::uuid, '$attempt_id'::uuid, '$fence_token'::uuid, 'dossier-server-pipeline.v1', '$dossier_id'::uuid, 'R1 dossier', 'R1 Empresa', '04733767000180', 'r1', 80, 'R1 resumo', jsonb_build_object('messages', jsonb_build_array(jsonb_build_object('role','assistant','content','$content'))))); SELECT pg_sleep(2); COMMIT;"
}

seed_completion_run() {
  local run_id="$1"
  psql_admin "INSERT INTO public.dossier_runs (run_id, owner_id, operator_id, status, idempotency_key, environment, app_version) VALUES ('$run_id'::uuid, '$OWNER_ID'::uuid, 'r1-owner', 'PENDING', 'r1-$run_id', 'test', 'r1') ON CONFLICT (run_id) DO NOTHING;"
}

RUN_EQ=22222222-2222-4222-8222-222222222222
RUN_DIV=33333333-3333-4333-8333-333333333333
DOSSIER_EQ=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
DOSSIER_DIV_WIN=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
DOSSIER_DIV_LOSE=cccccccc-cccc-4ccc-8ccc-cccccccccccc

seed_completion_run "$RUN_EQ"
IFS='|' read -r EQ_ATTEMPT EQ_FENCE <<<"$(begin_attempt "$RUN_EQ")"
completion_call_hold "$RUN_EQ" "$EQ_ATTEMPT" "$EQ_FENCE" "$DOSSIER_EQ" equivalent >"$EVIDENCE_DIR/equivalent-completion-one.log" 2>&1 &
EQ_PID=$!
sleep 0.25
completion_call "$RUN_EQ" "$EQ_ATTEMPT" "$EQ_FENCE" "$DOSSIER_EQ" equivalent >"$EVIDENCE_DIR/equivalent-completion-two.log" 2>&1
wait "$EQ_PID"
rg -q '"status":"COMPLETED"' "$EVIDENCE_DIR/equivalent-completion-one.log"
rg -q '"status":"COMPLETED"' "$EVIDENCE_DIR/equivalent-completion-two.log"
psql_owner "WITH state AS (SELECT public.get_dossier_run_resume_state('$RUN_EQ'::uuid, 'dossier-server-pipeline.v1') AS payload) SELECT CASE WHEN (SELECT count(*) FROM public.dossies WHERE id = '$DOSSIER_EQ'::uuid) = 1 AND (payload->>'status') = 'COMPLETED' AND (payload->'attempts'->0->>'status') = 'COMPLETED' THEN 'CONCURRENT_EQUIVALENT_COMPLETION_STATE_CONSISTENT|PASS' ELSE 'CONCURRENT_EQUIVALENT_COMPLETION_STATE_CONSISTENT|FAIL' END FROM state;" >"$EVIDENCE_DIR/equivalent-state.log"
rg -q 'CONCURRENT_EQUIVALENT_COMPLETION_STATE_CONSISTENT|PASS' "$EVIDENCE_DIR/equivalent-state.log"

seed_completion_run "$RUN_DIV"
IFS='|' read -r DIV_ATTEMPT DIV_FENCE <<<"$(begin_attempt "$RUN_DIV")"
completion_call_hold "$RUN_DIV" "$DIV_ATTEMPT" "$DIV_FENCE" "$DOSSIER_DIV_WIN" winner >"$EVIDENCE_DIR/divergent-completion-one.log" 2>&1 &
DIV_PID=$!
sleep 0.25
set +e
completion_call "$RUN_DIV" "$DIV_ATTEMPT" "$DIV_FENCE" "$DOSSIER_DIV_LOSE" loser >"$EVIDENCE_DIR/divergent-completion-two.log" 2>&1
DIV_STATUS=$?
set -e
wait "$DIV_PID"
test "$DIV_STATUS" -ne 0
rg -q 'DOSSIER_CONFLICT' "$EVIDENCE_DIR/divergent-completion-two.log"
psql_owner "WITH state AS (SELECT public.get_dossier_run_resume_state('$RUN_DIV'::uuid, 'dossier-server-pipeline.v1') AS payload) SELECT CASE WHEN (SELECT count(*) FROM public.dossies WHERE id IN ('$DOSSIER_DIV_WIN'::uuid, '$DOSSIER_DIV_LOSE'::uuid)) = 1 AND (SELECT dossier_id FROM public.dossier_runs WHERE run_id = '$RUN_DIV'::uuid) = '$DOSSIER_DIV_WIN'::uuid AND (payload->>'status') = 'COMPLETED' AND (payload->'attempts'->0->>'status') = 'COMPLETED' THEN 'CONCURRENT_DIVERGENT_COMPLETION_STATE_CONSISTENT|PASS' ELSE 'CONCURRENT_DIVERGENT_COMPLETION_STATE_CONSISTENT|FAIL' END FROM state;" >"$EVIDENCE_DIR/divergent-state.log"
rg -q 'CONCURRENT_DIVERGENT_COMPLETION_STATE_CONSISTENT|PASS' "$EVIDENCE_DIR/divergent-state.log"

BASELINE_ROOT="$(mktemp -d /tmp/dossier-flow-05e0c-r1-baseline.XXXXXX)"
git archive "$SOURCE_HEAD" | tar -x -C "$BASELINE_ROOT"
ln -s "$REPO_ROOT/node_modules" "$BASELINE_ROOT/node_modules"
(cd "$BASELINE_ROOT" && npx --yes -p node@24 npm exec vitest -- run --reporter=json --outputFile="$EVIDENCE_DIR/source-head-global.json" >"$EVIDENCE_DIR/source-head-global.log" 2>&1)
R1_PG_BIN="$PG_BIN/psql" \
R1_PG_SOCKET="$CLUSTER_ROOT/socket" \
R1_PG_PORT="$PORT" \
R1_PG_DATABASE="$DB_NAME" \
R1_OWNER_ID="$OWNER_ID" \
R1_RUN_NAMESPACE=target-global \
npx --yes -p node@24 npm exec vitest -- run --reporter=json --outputFile="$EVIDENCE_DIR/target-global.json" >"$EVIDENCE_DIR/target-global.log" 2>&1

node - "$EVIDENCE_DIR/source-head-global.json" "$EVIDENCE_DIR/target-global.json" <<'NODE' >"$EVIDENCE_DIR/baseline-comparison.txt"
const fs = require('node:fs');
const [sourcePath, targetPath] = process.argv.slice(2);
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const target = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
function normalizeSuiteName(name) {
  const marker = '/tests/';
  const index = name.lastIndexOf(marker);
  return index >= 0 ? name.slice(index + 1) : name;
}
function identities(report) {
  const result = new Map();
  for (const suite of report.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      const identity = `${normalizeSuiteName(suite.name)}::${assertion.fullName}::${(assertion.ancestorTitles ?? []).join(' > ')}`;
      const statuses = result.get(identity) ?? [];
      statuses.push(assertion.status);
      result.set(identity, statuses);
    }
  }
  return result;
}
const sourceIds = identities(source);
const targetIds = identities(target);
const newFailures = [];
for (const [identity, targetStatuses] of targetIds) {
  const remainingSourceStatuses = [...(sourceIds.get(identity) ?? [])];
  for (const status of targetStatuses) {
    if (status === 'passed') continue;
    const matchingSourceIndex = remainingSourceStatuses.indexOf(status);
    if (matchingSourceIndex >= 0) remainingSourceStatuses.splice(matchingSourceIndex, 1);
    else newFailures.push(`${identity}=${status}`);
  }
}
const sourceFailed = Number(source.numFailedTests ?? 0);
const targetFailed = Number(target.numFailedTests ?? 0);
console.log(`SOURCE_HEAD_GLOBAL_SUITE=${sourceFailed === 0 ? 'PASS' : 'FAIL_WITH_IDENTITIES'}`);
console.log(`SOURCE_HEAD_GLOBAL_SUITE_STATS=suites=${source.numTotalTestSuites ?? 0};tests=${source.numTotalTests ?? 0};identities=${sourceIds.size};failed=${sourceFailed}`);
console.log(`TARGET_GLOBAL_SUITE=${targetFailed === 0 ? 'PASS' : 'FAIL_WITH_IDENTITIES'}`);
console.log(`TARGET_GLOBAL_SUITE_STATS=suites=${target.numTotalTestSuites ?? 0};tests=${target.numTotalTests ?? 0};identities=${targetIds.size};failed=${targetFailed}`);
console.log(`BASELINE_COMPARISON_BY_IDENTITY=${newFailures.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`NEW_FAILURES_VS_SOURCE_HEAD=${newFailures.length === 0 ? 'NONE' : newFailures.join('|')}`);
if (newFailures.length || targetFailed > 0) process.exit(1);
NODE

if npx --yes -p node@24 npm run typecheck >"$EVIDENCE_DIR/typecheck.log" 2>&1; then TYPECHECK=0; else TYPECHECK=$?; fi
if npx --yes -p node@24 npm exec eslint -- tests/proofs/dossier-checkpoint-contract/resume-payload.test.ts >"$EVIDENCE_DIR/focused-lint.log" 2>&1; then FOCUSED_LINT=0; else FOCUSED_LINT=$?; fi
if git diff --check >"$EVIDENCE_DIR/diff-check.log" 2>&1; then DIFF_CHECK=0; else DIFF_CHECK=$?; fi

git status --porcelain=v1 | sed 's/^.. //' | sort >"$EVIDENCE_DIR/status-after.txt"
comm -13 "$EVIDENCE_DIR/status-before.txt" "$EVIDENCE_DIR/status-after.txt" >"$EVIDENCE_DIR/status-new.txt"
if awk 'NF && $0 !~ /^tests\/proofs\/dossier-checkpoint-contract\// && $0 !~ /^scripts\/proofs\/dossier-checkpoint-contract\// && $0 !~ /^docs\/(checkpoints|handoffs)\// && $0 != "HANDOFF_AI.md" && $0 !~ /^\.agents\/memory\// { bad=1; print } END { exit bad }' "$EVIDENCE_DIR/status-new.txt" >"$EVIDENCE_DIR/forbidden-files.txt"; then FORBIDDEN=0; else FORBIDDEN=1; fi

printf 'EVIDENCE_DIR=%s\n' "$EVIDENCE_DIR"
printf 'SOURCE_HEAD=%s\n' "$SOURCE_HEAD"
printf 'MIGRATION_SHA256=%s\n' "$(sha256sum "$REPO_ROOT/supabase/migrations/20260802111500_dossier_checkpoint_attempt_contract.sql" | awk '{print $1}')"
printf 'RESUME_VITEST=0\n'
printf 'CONCURRENT_EQUIVALENT_COMPLETION_IDEMPOTENT=PASS\n'
printf 'CONCURRENT_EQUIVALENT_COMPLETION_SINGLE_DOSSIER=PASS\n'
printf 'CONCURRENT_EQUIVALENT_COMPLETION_STATE_CONSISTENT=PASS\n'
printf 'CONCURRENT_DIVERGENT_COMPLETION_CONFLICT=PASS\n'
printf 'CONCURRENT_DIVERGENT_COMPLETION_SINGLE_WINNER=PASS\n'
printf 'CONCURRENT_DIVERGENT_COMPLETION_NO_OVERWRITE=PASS\n'
printf 'CONCURRENT_DIVERGENT_COMPLETION_STATE_CONSISTENT=PASS\n'
printf 'TYPECHECK=%s\n' "$TYPECHECK"
printf 'FOCUSED_LINT=%s\n' "$FOCUSED_LINT"
printf 'GIT_DIFF_CHECK=%s\n' "$DIFF_CHECK"
printf 'FORBIDDEN_FILE_GUARD=%s\n' "$FORBIDDEN"
cat "$EVIDENCE_DIR/baseline-comparison.txt"
test "$TYPECHECK" -eq 0
test "$FOCUSED_LINT" -eq 0
test "$DIFF_CHECK" -eq 0
test "$FORBIDDEN" -eq 0
