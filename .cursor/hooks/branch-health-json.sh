#!/usr/bin/env bash
# Cursor/Claude PreToolUse wrapper: runs branch-health check, emits JSON on stdout only.
set -euo pipefail

MAIN_BRANCH="${1:-main}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

emit_json() {
  local permission="$1"
  local message="${2:-}"
  python3 -c 'import json,sys; p=sys.argv[1]; m=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else ""; o={"permission":p};
if m: o["agent_message"]=m; o["user_message"]=m
print(json.dumps(o,ensure_ascii=False))' "$permission" "$message"
}

is_git_commit_command() {
  local cmd="$1"
  printf '%s' "$cmd" | grep -qE '(^|[;&|]|&&[[:space:]]*)git[[:space:]]+commit\b'
}

HOOK_INPUT=""
if [ ! -t 0 ]; then
  HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

COMMAND=""
if [ -n "$HOOK_INPUT" ]; then
  COMMAND="$(printf '%s' "$HOOK_INPUT" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get("command") or d.get("tool_input",{}).get("command") or "")
except Exception:
  print("")' 2>/dev/null || true)"
fi

if [ -n "$COMMAND" ] && ! is_git_commit_command "$COMMAND"; then
  emit_json allow
  exit 0
fi

OUTPUT=""
EXIT_CODE=0
OUTPUT="$(bash "$REPO_ROOT/scripts/check-branch-health.sh" "$MAIN_BRANCH" 2>&1)" || EXIT_CODE=$?

if [ "$EXIT_CODE" -eq 0 ]; then
  if [ -n "$OUTPUT" ]; then
    emit_json allow "$OUTPUT"
  else
    emit_json allow
  fi
  exit 0
fi

if [ "${BRANCH_HEALTH_SKIP:-0}" = "1" ]; then
  emit_json allow "BRANCH_HEALTH_SKIP=1: commit liberado apesar do limite de commits locais."
  exit 0
fi

MSG="${OUTPUT:-Limite de commits locais atingido. Abra PR ou faça push. BRANCH_HEALTH_SKIP=1 para forçar.}"
emit_json deny "$MSG"
exit 2
