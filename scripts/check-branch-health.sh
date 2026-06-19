#!/bin/bash
# check-branch-health.sh — Trava de acúmulo de commits sem PR
set -euo pipefail
MAIN_BRANCH="${1:-main}"
THRESHOLD_WARN=5
THRESHOLD_BLOCK=8

count_commits() { git rev-list --count "${MAIN_BRANCH}..HEAD" 2>/dev/null || echo "0"; }

emit_cursor_json() {
  python3 -c 'import json,sys; p=sys.argv[1]; m=sys.argv[2] if len(sys.argv)>2 else ""; o={"permission":p}; 
if m: o["user_message"]=o["agent_message"]=m
print(json.dumps(o,ensure_ascii=False))' "$1" "${2:-}"
}

is_git_commit_command() {
  printf '%s' "$1" | grep -qE '(^|[;&|]|&&[[:space:]]*)git[[:space:]]+commit\b'
}

HOOK_INPUT=""
[ ! -t 0 ] && HOOK_INPUT="$(cat)"

CURSOR_MODE=0
if [ -n "$HOOK_INPUT" ] && printf '%s' "$HOOK_INPUT" | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except json.JSONDecodeError: sys.exit(1)
sys.exit(0 if isinstance(d,dict) and isinstance(d.get("command"),str) else 1)' 2>/dev/null; then
  CURSOR_MODE=1
fi

if [ "$CURSOR_MODE" -eq 1 ]; then
  COMMAND="$(printf '%s' "$HOOK_INPUT" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("command",""))
except: print("")' 2>/dev/null || true)"
  if ! is_git_commit_command "$COMMAND"; then emit_cursor_json allow; exit 0; fi
  count="$(count_commits)"
  if [ "$count" -ge "$THRESHOLD_BLOCK" ] && [ "${BRANCH_HEALTH_SKIP:-0}" != "1" ]; then
    msg="${count} commits locais sem push. Abra PR ou push. BRANCH_HEALTH_SKIP=1 para forçar."
    emit_cursor_json deny "$msg"; exit 2
  fi
  if [ "$count" -gt "$THRESHOLD_WARN" ]; then
    emit_cursor_json allow "Atenção: ${count} commits locais sem push."
    exit 0
  fi
  emit_cursor_json allow; exit 0
fi

count="$(count_commits)"
if [ "$count" -ge "$THRESHOLD_BLOCK" ]; then
  echo "🚨 BLOQUEIO: $count commits sem push. BRANCH_HEALTH_SKIP=1 para forçar." >&2
  [ "${BRANCH_HEALTH_SKIP:-0}" = "1" ] && exit 0
  exit 1
elif [ "$count" -gt "$THRESHOLD_WARN" ]; then
  echo "⚠️ $count commits locais sem push (bloqueio em $THRESHOLD_BLOCK)." >&2
fi
exit 0

