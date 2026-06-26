#!/usr/bin/env bash
set -u

# Stop hook nao bloqueante: registra pendencias e as devolve como contexto.
if [ -t 0 ]; then INPUT="{}"; else INPUT=$(cat 2>/dev/null || printf "{}"); fi
START_DIR=$PWD
HAS_JQ=false
REQUESTED_CWD=
SESSION_ID=

if command -v jq >/dev/null 2>&1; then
  HAS_JQ=true
  REQUESTED_CWD=$(printf '%s' "$INPUT" | jq -r \
    'if (.cwd? | type) == "string" then .cwd else empty end' 2>/dev/null || true)
  SESSION_ID=$(printf '%s' "$INPUT" | jq -r \
    'if (.session_id? | type) == "string" then .session_id else empty end' 2>/dev/null || true)
fi

if [ -n "$REQUESTED_CWD" ] && [ -d "$REQUESTED_CWD" ]; then
  PROJECT_DIR=$REQUESTED_CWD
else
  PROJECT_DIR=$START_DIR
fi

cd -- "$PROJECT_DIR" 2>/dev/null || exit 0
PROJECT_DIR=$PWD

AUDIT_ENABLED=false
EXIT_ISSUES=
if [ -n "${HOME:-}" ]; then
  AUDIT_ENABLED=true
  AUDIT_DIR="$HOME/.claude/session-env/exit-issues"
  mkdir -p "$AUDIT_DIR" 2>/dev/null || AUDIT_ENABLED=false

  if [ "$AUDIT_ENABLED" = true ]; then
    if [ -n "$SESSION_ID" ]; then
      SAFE_SESSION_ID=$(printf '%s' "$SESSION_ID" | tr -c 'A-Za-z0-9._-' '_')
      case "$SAFE_SESSION_ID" in
        ''|'.'|'..') SAFE_SESSION_ID="session-unknown" ;;
      esac
      EXIT_ISSUES="$AUDIT_DIR/$SAFE_SESSION_ID.json"
    else
      CHECKSUM=$(printf '%s' "$PROJECT_DIR" | cksum)
      PROJECT_KEY=${CHECKSUM%% *}
      EXIT_ISSUES="$AUDIT_DIR/project-$PROJECT_KEY.json"
    fi
  fi
fi

ISSUES=()
SUGGESTIONS=()
CRITICAL=false
TODAY=$(date +%Y-%m-%d)

file_date() {
  local file=$1
  if [[ "${OSTYPE:-}" == "darwin"* ]]; then
    stat -f "%Sm" -t "%Y-%m-%d" "$file" 2>/dev/null
  else
    stat -c "%y" "$file" 2>/dev/null | cut -d' ' -f1
  fi
}

json_escape() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}

if git rev-parse --git-dir >/dev/null 2>&1; then
  STATUS_COUNT=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')

  if [ "$STATUS_COUNT" -gt 0 ]; then
    CRITICAL=true
    ISSUES+=("Git: $STATUS_COUNT item(ns) pendente(s); nao rastreados: $UNTRACKED")
    SUGGESTIONS+=("Revise e registre as alteracoes antes de encerrar")
  fi
fi

if [ -f HANDOFF_AI.md ]; then
  HANDOFF_MODIFIED=$(file_date HANDOFF_AI.md)
  if [ "$HANDOFF_MODIFIED" != "$TODAY" ]; then
    CRITICAL=true
    ISSUES+=("HANDOFF_AI.md nao foi atualizado hoje (ultima: $HANDOFF_MODIFIED)")
    SUGGESTIONS+=("Atualize HANDOFF_AI.md com estado atual, riscos e proximo passo")
  fi

  HANDOFF_SIZE=$(wc -c < HANDOFF_AI.md 2>/dev/null | tr -d ' ')
  if [ "$HANDOFF_SIZE" -lt 500 ]; then
    ISSUES+=("HANDOFF_AI.md muito curto (${HANDOFF_SIZE} bytes)")
    SUGGESTIONS+=("Inclua estado atual, riscos e proximo passo no handoff")
  fi

  if ! grep -qiE "não funcionou|nao funcionou|what did not work|falhou|failed" HANDOFF_AI.md 2>/dev/null; then
    ISSUES+=("HANDOFF_AI.md nao documenta erros/falhas da sessao")
    SUGGESTIONS+=("Adicione uma secao sobre falhas e causas verificadas")
  fi
fi

if [ -d .agents/memory ]; then
  STALE_COUNT=0
  for MEMFILE in activeContext.md progress.md last-session-context.md; do
    if [ -f ".agents/memory/$MEMFILE" ]; then
      MEM_MODIFIED=$(file_date ".agents/memory/$MEMFILE")
      if [ "$MEM_MODIFIED" != "$TODAY" ]; then
        STALE_COUNT=$((STALE_COUNT + 1))
      fi
    fi
  done

  if [ "$STALE_COUNT" -gt 0 ]; then
    ISSUES+=("$STALE_COUNT arquivos de memoria desatualizados (.agents/memory/)")
    SUGGESTIONS+=("Atualize a documentacao de continuidade")
    if [ "$STALE_COUNT" -ge 3 ]; then
      CRITICAL=true
    fi
  fi
fi

if git rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null)
  if [ -n "$BRANCH" ] && [ "$BRANCH" != main ] && [ "$BRANCH" != master ]; then
    REMOTE=$(git rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || true)
    if [ -n "$REMOTE" ]; then
      AHEAD=$(git rev-list --count '@{upstream}..HEAD' 2>/dev/null || printf '0')
      if [ "$AHEAD" -gt 0 ]; then
        ISSUES+=("$AHEAD commits locais nao estao no remote ($BRANCH)")
        SUGGESTIONS+=("Envie os commits pendentes ao remote")
      fi
    fi
  fi
fi

if [ ${#ISSUES[@]} -eq 0 ]; then
  if [ "$AUDIT_ENABLED" = true ]; then
    rm -f "$EXIT_ISSUES"
  fi
  exit 0
fi

if [ "$AUDIT_ENABLED" = true ]; then
  AUDIT_TMP="$EXIT_ISSUES.tmp.$$"
  umask 077

  if [ "$HAS_JQ" = true ]; then
    ISSUES_JSON=$(printf '%s\n' "${ISSUES[@]}" | jq -R . | jq -s .)
    SUGGESTIONS_JSON=$(printf '%s\n' "${SUGGESTIONS[@]}" | jq -R . | jq -s .)
    jq -n \
      --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg project "$(basename "$PROJECT_DIR")" \
      --arg project_path "$PROJECT_DIR" \
      --arg session_id "$SESSION_ID" \
      --argjson critical "$CRITICAL" \
      --argjson issues "$ISSUES_JSON" \
      --argjson suggestions "$SUGGESTIONS_JSON" \
      '{timestamp: $ts, project: $project, projectPath: $project_path, sessionId: $session_id, critical: $critical, issues: $issues, suggestions: $suggestions}' \
      > "$AUDIT_TMP"
  else
    printf '{"timestamp":"%s","project":"%s","projectPath":"%s","sessionId":"","critical":%s,"issues":["Detalhes indisponiveis sem jq"],"suggestions":[]}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      "$(json_escape "$(basename "$PROJECT_DIR")")" \
      "$(json_escape "$PROJECT_DIR")" \
      "$CRITICAL" > "$AUDIT_TMP"
  fi

  chmod 600 "$AUDIT_TMP" 2>/dev/null || true
  mv -f "$AUDIT_TMP" "$EXIT_ISSUES"
fi

if [ "$HAS_JQ" = true ]; then
  jq -n \
    --arg count "${#ISSUES[@]}" \
    --arg detail "$(printf '%s; ' "${ISSUES[@]}")" \
    '{
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext: "Aviso: \($count) categoria(s) de pendencia encontrada(s): \($detail)O encerramento continua liberado."
      }
    }'
else
  printf '{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"Aviso: %s categoria(s) de pendencia encontrada(s). O encerramento continua liberado."}}\n' \
    "${#ISSUES[@]}"
fi

exit 0
