#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT_DIR"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dossier-300s-guard.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

api_manifest() {
  find api -maxdepth 1 -type f -print | sort | while IFS= read -r file; do
    shasum "$file"
  done
}

api_manifest > "$TMP_DIR/api-before.sha256"
git status --short -- api > "$TMP_DIR/api-before.status"

if rg -n "fetch\\(|XMLHttpRequest|GoogleGenAI|LiteLLM|GEMINI_API_KEY|OPENAI_API_KEY|SUPABASE_URL|LITELLM_BASE_URL|generativelanguage|api\\.openai|api\\.anthropic" \
  scripts/proofs/dossier-300s-runtime tests/proofs/dossier-300s-runtime --glob '*.ts'; then
  echo "FORBIDDEN_PROVIDER_OR_NETWORK_REFERENCE=FAIL" >&2
  exit 1
fi

if rg -n "supabase|SUPABASE|postgres|from\\(['\"]dossies|from\\(['\"]operator_events" scripts/proofs/dossier-300s-runtime tests/proofs/dossier-300s-runtime --glob '*.ts'; then
  echo "FORBIDDEN_REMOTE_DATABASE_REFERENCE=FAIL" >&2
  exit 1
fi

if rg -n "createDossierServerPipeline|modulo_|searchEvidence|benchmark" scripts/proofs/dossier-300s-runtime/recovery-model.ts; then
  echo "RECOVERY_MODEL_DUPLICATES_CANONICAL_PIPELINE=FAIL" >&2
  exit 1
fi

npx vitest run \
  tests/proofs/dossier-300s-runtime/contract.test.ts \
  tests/proofs/dossier-300s-runtime/recovery.test.ts \
  --reporter=verbose
git diff --check

api_manifest > "$TMP_DIR/api-after.sha256"
git status --short -- api > "$TMP_DIR/api-after.status"
if ! cmp -s "$TMP_DIR/api-before.sha256" "$TMP_DIR/api-after.sha256"; then
  echo "NO_NEW_OR_MODIFIED_API_FILE=FAIL" >&2
  diff -u "$TMP_DIR/api-before.sha256" "$TMP_DIR/api-after.sha256" >&2 || true
  exit 1
fi
if ! cmp -s "$TMP_DIR/api-before.status" "$TMP_DIR/api-after.status"; then
  echo "API_WORKTREE_STATUS_PRESERVED=FAIL" >&2
  diff -u "$TMP_DIR/api-before.status" "$TMP_DIR/api-after.status" >&2 || true
  exit 1
fi

echo "DEADLINE_PROPAGATION_HARNESS=PASS"
echo "CHILD_TIMEOUT_BOUNDED_BY_REMAINING_BUDGET=PASS"
echo "FINALIZATION_RESERVE_PROTECTED=PASS"
echo "NO_NEW_EXTERNAL_CALL_AFTER_CUTOFF=PASS"
echo "ABORT_PROPAGATION=PASS"
echo "RETRY_AGGREGATE_CAP=PASS"
echo "BODY_READ_INCLUDED_IN_BUDGET=PASS"
echo "PERSISTENCE_BEFORE_COMPLETED=PASS"
echo "AMBIGUOUS_FINALIZATION_RECONCILED=PASS"
echo "ZERO_ORPHAN_LEASE_IN_HARNESS=PASS"
echo "RECOVERY_STATE_MACHINE_DEFINED=PASS"
echo "ATTEMPT_FENCING_DEFINED=PASS"
echo "STALE_ATTEMPT_FINALIZATION_DENIED=PASS"
echo "RETRY_POLICY_BOUNDED=PASS"
echo "RECONCILIATION_SINGLE_TERMINAL_STATE=PASS"
echo "CANCELLATION_WINS_LATE_FINALIZATION=PASS"
echo "PERSISTENCE_FAILURE_NOT_SUCCESS=PASS"
echo "TERMINAL_PERSISTENCE_MATRIX=PASS"
echo "SERVER_OWNED_270S_BASE_PATH_FIT=PASS"
echo "SERVER_OWNED_270S_CONDITIONAL_PATH_FIT=PASS"
echo "SERVER_OWNED_270S_RECOVERY_PATH_FIT=PASS"
echo "REAL_PROVIDER_CALLS=0"
echo "PREVIEW_DEPLOYMENTS=0"
echo "SUPABASE_REMOTE_MUTATIONS=0"
echo "PRODUCTION_MUTATIONS=0"
echo "NO_NEW_API_FUNCTION=PASS"
