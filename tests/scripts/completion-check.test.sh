#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
HOOK="$ROOT_DIR/scripts/hooks/completion-check.sh"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

file_mode() {
  local file=$1
  stat -f '%Lp' "$file" 2>/dev/null || stat -c '%a' "$file"
}

prepare_repo() {
  local repo=$1
  mkdir -p "$repo/.agents/memory"
  git -C "$repo" init -q
  git -C "$repo" config user.email "tests@example.com"
  git -C "$repo" config user.name "Hook Tests"
  printf '%0600d\n## O que nao funcionou\nNenhuma falha nesta sessao.\n' 0 > "$repo/HANDOFF_AI.md"
  for file in activeContext.md progress.md last-session-context.md; do
    printf '# Atualizado\n' > "$repo/.agents/memory/$file"
  done
  git -C "$repo" add .
  git -C "$repo" commit -qm "fixture limpa"
}

assert_non_blocking_warning_uses_event_cwd() {
  local repo="$TMP_DIR/repo com espacos"
  local home="$TMP_DIR/home-warning"
  local audit_dir="$home/.claude/session-env/exit-issues"
  local audit_file
  local payload
  local output
  prepare_repo "$repo"
  mkdir -p "$home"
  printf 'pendente\n' > "$repo/arquivo pendente.txt"
  payload=$(jq -cn --arg cwd "$repo" --arg session_id "session-warning" \
    '{cwd: $cwd, session_id: $session_id}')

  output=$(cd "$TMP_DIR" && printf '%s\n' "$payload" | HOME="$home" "$HOOK")
  audit_file=$(find "$audit_dir" -type f -name 'session-*.json' -print -quit)

  jq -e '.decision == null' <<<"$output" >/dev/null || fail "pendencias nao podem bloquear o Stop"
  jq -e '.hookSpecificOutput.hookEventName == "Stop"' <<<"$output" >/dev/null || fail "aviso deve usar o schema do Stop hook"
  jq -e '.hookSpecificOutput.additionalContext | contains("1 categoria(s) de pendencia")' <<<"$output" >/dev/null || fail "contagem deve distinguir categorias de arquivos"
  jq -e '.project == "repo com espacos" and .projectPath == $path and .sessionId == "session-warning"' \
    --arg path "$repo" "$audit_file" >/dev/null || fail "auditoria deve identificar sessao e projeto"
  [ "$(file_mode "$audit_file")" = "600" ] || fail "auditoria deve ter permissao 0600"
  [ "${#audit_file}" -lt 240 ] || fail "nome da sessao deve permanecer limitado"
  ! find "$(dirname "$audit_file")" -name '*.tmp.*' -print -quit | grep -q . || fail "escrita atomica nao pode deixar temporarios"
}

assert_clean_repo_is_silent_with_pwd_fallback() {
  local repo="$TMP_DIR/repo-limpo"
  local home="$TMP_DIR/home-clean"
  local audit_dir="$home/.claude/session-env/exit-issues"
  local payload
  local output
  prepare_repo "$repo"
  mkdir -p "$home"

  printf 'pendente\n' > "$repo/pendente.txt"
  payload=$(jq -cn --arg cwd "$repo" --arg session_id "other-session" \
    '{cwd: $cwd, session_id: $session_id}')
  printf '%s\n' "$payload" | HOME="$home" "$HOOK" >/dev/null
  payload=$(jq -cn --arg cwd "$repo" --arg session_id "current-session" \
    '{cwd: $cwd, session_id: $session_id}')
  printf '%s\n' "$payload" | HOME="$home" "$HOOK" >/dev/null
  rm "$repo/pendente.txt"

  output=$(cd "$TMP_DIR" && printf '%s\n' "$payload" | HOME="$home" "$HOOK")

  [ -z "$output" ] || fail "repositorio limpo e documentado deve ser silencioso"
  [ "$(find "$audit_dir" -type f -exec jq -r '.sessionId' {} \; | grep -c '^current-session$' || true)" = "0" ] || fail "limpeza deve remover o registro da sessao atual"
  [ "$(find "$audit_dir" -type f -exec jq -r '.sessionId' {} \; | grep -c '^other-session$' || true)" = "1" ] || fail "limpeza nao pode apagar auditoria de outra sessao"
}

assert_project_fallback_key_is_stable() {
  local repo="$TMP_DIR/repo-fallback"
  local home="$TMP_DIR/home-fallback"
  local audit_dir="$home/.claude/session-env/exit-issues"
  local payload
  local first
  local second
  prepare_repo "$repo"
  mkdir -p "$home"
  printf 'pendente\n' > "$repo/pendente.txt"
  payload=$(jq -cn --arg cwd "$repo" '{cwd: $cwd}')

  printf '%s\n' "$payload" | HOME="$home" "$HOOK" >/dev/null
  first=$(find "$audit_dir" -type f -name 'project-*.json' -print)
  printf '%s\n' "$payload" | HOME="$home" "$HOOK" >/dev/null
  second=$(find "$audit_dir" -type f -name 'project-*.json' -print)

  [ -n "$first" ] && [ "$first" = "$second" ] || fail "fallback por projeto deve ser estavel"
  [ "$(find "$audit_dir" -type f | wc -l | tr -d ' ')" = "1" ] || fail "fallback nao deve criar registros duplicados"
}

assert_missing_home_is_non_blocking() {
  local repo="$TMP_DIR/repo-sem-home"
  local payload
  local output
  prepare_repo "$repo"
  printf 'pendente\n' > "$repo/pendente.txt"
  payload=$(jq -cn --arg cwd "$repo" '{cwd: $cwd}')

  output=$(printf '%s\n' "$payload" | env -u HOME "$HOOK")

  jq -e '.decision == null and .hookSpecificOutput.hookEventName == "Stop"' <<<"$output" >/dev/null || fail "HOME ausente deve continuar nao bloqueante"
}

assert_missing_jq_has_valid_fallback_json() {
  local repo="$TMP_DIR/repo-sem-jq"
  local home="$TMP_DIR/home-sem-jq"
  local bin="$TMP_DIR/bin-sem-jq"
  local payload
  local output
  prepare_repo "$repo"
  mkdir -p "$home" "$bin"
  printf 'pendente\n' > "$repo/pendente.txt"
  payload=$(jq -cn --arg cwd "$repo" --arg session_id "sem-jq" \
    '{cwd: $cwd, session_id: $session_id}')
  for command_name in bash basename cat chmod cksum cut date dirname git grep mkdir mktemp mv rm shasum stat tr wc; do
    ln -s "$(command -v "$command_name")" "$bin/$command_name"
  done

  output=$(cd "$repo" && printf '%s\n' "$payload" | PATH="$bin" HOME="$home" "$HOOK")

  jq -e '.decision == null and .hookSpecificOutput.hookEventName == "Stop"' <<<"$output" >/dev/null || fail "jq ausente deve produzir JSON valido e nao bloqueante"
  audit_file=$(find "$home/.claude/session-env/exit-issues" -type f -name '*.json' -print -quit)
  jq -e '.projectPath == $path and (.issues | length) > 0' --arg path "$repo" "$audit_file" >/dev/null || fail "fallback sem jq deve auditar o projeto atual"
  [ "$(file_mode "$audit_file")" = "600" ] || fail "fallback sem jq deve manter modo 0600"
}

assert_existing_symlink_target_is_not_followed() {
  local repo="$TMP_DIR/repo-symlink"
  local home="$TMP_DIR/home-symlink"
  local audit_dir="$home/.claude/session-env/exit-issues"
  local victim="$TMP_DIR/victim.json"
  local payload
  local target
  prepare_repo "$repo"
  mkdir -p "$audit_dir"
  printf 'nao alterar\n' > "$victim"
  printf 'pendente\n' > "$repo/pendente.txt"
  payload=$(jq -cn --arg cwd "$repo" '{cwd: $cwd}')
  printf '%s\n' "$payload" | HOME="$home" "$HOOK" >/dev/null
  target=$(find "$audit_dir" -type f -name 'project-*.json' -print -quit)
  rm "$target"
  ln -s "$victim" "$target"

  printf '%s\n' "$payload" | HOME="$home" "$HOOK" >/dev/null

  [ "$(cat "$victim")" = "nao alterar" ] || fail "writer nao pode seguir symlink do target"
  [ ! -L "$target" ] && jq -e . "$target" >/dev/null || fail "target deve ser substituido por JSON regular valido"
}

assert_non_blocking_warning_uses_event_cwd
assert_clean_repo_is_silent_with_pwd_fallback
assert_project_fallback_key_is_stable
assert_missing_home_is_non_blocking
assert_missing_jq_has_valid_fallback_json
assert_existing_symlink_target_is_not_followed
printf 'PASS: completion-check\n'
