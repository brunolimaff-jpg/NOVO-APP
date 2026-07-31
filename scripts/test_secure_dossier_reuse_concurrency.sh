#!/usr/bin/env bash
set -euo pipefail

# Teste reproduzível com duas conexões reais.
# Pré-condição: PostgreSQL 17, psql autenticado localmente e banco descartável
# exatamente chamado novoapp_dossier_reuse_concurrency_test.
# Uso: scripts/test_secure_dossier_reuse_concurrency.sh [host] [port]

host="${1:-${PGHOST:-}}"
port="${2:-${PGPORT:-5432}}"
db="novoapp_dossier_reuse_concurrency_test"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql_args=(-v ON_ERROR_STOP=1 -h "$host" -p "$port" -d "$db")
cd "$root_dir"

if ! command -v psql >/dev/null 2>&1; then
  echo 'FALHA: psql não encontrado' >&2
  exit 1
fi

psql "${psql_args[@]}" -f "$root_dir/scripts/test_secure_dossier_reuse_concurrency_setup.sql" >/dev/null

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/dossier-concurrency.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

(
  psql "${psql_args[@]}" -X -A -t <<'SQL' >"$tmp_dir/first.out"
BEGIN;
SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT pg_advisory_xact_lock(pg_catalog.hashtextextended('operator-b:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0));
SELECT pg_sleep(1);
SELECT dossier_id FROM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
COMMIT;
SQL
) &
first_pid=$!

sleep 0.1
psql "${psql_args[@]}" -X -A -t <<'SQL' >"$tmp_dir/second.out"
BEGIN;
SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT dossier_id FROM public.reuse_dossier_for_current_operator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
COMMIT;
SQL

wait "$first_pid"

first_id="$(awk '/^[0-9a-f-]{36}$/ { id = $0 } END { print id }' "$tmp_dir/first.out")"
second_id="$(awk '/^[0-9a-f-]{36}$/ { id = $0 } END { print id }' "$tmp_dir/second.out")"

if [[ -z "$first_id" || "$first_id" != "$second_id" ]]; then
  echo "FALHA: sessões retornaram IDs diferentes: first=$first_id second=$second_id" >&2
  exit 1
fi

active_count="$(psql "${psql_args[@]}" -X -A -t -c "SELECT count(*) FROM public.dossies WHERE operator_id = 'operator-b' AND source_dossier_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND deleted_at IS NULL;" | tr -d '[:space:]')"
if [[ "$active_count" != "1" ]]; then
  echo "FALHA: cópias ativas esperadas=1 obtidas=$active_count" >&2
  exit 1
fi

echo "PASS: duas conexões retornaram a mesma cópia ($first_id); cópias ativas=$active_count"
