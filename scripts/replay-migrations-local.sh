#!/usr/bin/env bash
# =============================================================================
# Replay local das migrations em PostgreSQL descartável
# -----------------------------------------------------------------------------
# Cria um banco temporário, aplica o bootstrap de auth (roles/schema) e roda
# TODAS as migrations de supabase/migrations em ordem, reportando PASS/FAIL.
# Uso principal: validação da medida G (STALE_RUN_RECONCILIATION) — prova que
# a cadeia de 24 migrations executa desde um banco vazio.
#
# Uso:
#   scripts/replay-migrations-local.sh [nome_do_banco] [--keep]
#   KEEP_DB=1 scripts/replay-migrations-local.sh   # não dropar o banco ao final
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=${PSQL:-psql}
DB_NAME="${1:-scout_migrations_replay_$$}"
KEEP_DB="${KEEP_DB:-0}"

MIGRATIONS_DIR="$ROOT/supabase/migrations"
BOOTSTRAP="$ROOT/scripts/bootstrap_supabase_auth_for_migration_test.sql"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "ERRO: diretório de migrations não encontrado: $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "==> Criando banco descartável: $DB_NAME"
createdb "$DB_NAME"

cleanup() {
  if [[ "$KEEP_DB" != "1" ]]; then
    echo "==> Removendo banco descartável: $DB_NAME"
    dropdb --if-exists "$DB_NAME"
  else
    echo "==> KEEP_DB=1: banco mantido: $DB_NAME"
  fi
}
trap cleanup EXIT

echo "==> Schema extensions (exigido pelo baseline)"
psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -q -c 'CREATE SCHEMA IF NOT EXISTS extensions;'

echo "==> Bootstrap de auth (roles anon/authenticated/service_role + auth.uid)"
psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -q -f "$BOOTSTRAP"

total=0
passed=0
failed=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  total=$((total + 1))
  name="$(basename "$f")"
  if psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1; then
    echo "  PASS  $name"
    passed=$((passed + 1))
  else
    echo "  FAIL  $name"
    failed=$((failed + 1))
  fi
done

echo "==> Resumo: $passed/$total migrations aplicadas (falhas: $failed)"

if [[ "$failed" -gt 0 ]]; then
  echo "ERRO: replay com falhas — verifique as migrations acima." >&2
  exit 1
fi
