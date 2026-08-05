#!/usr/bin/env bash
# =============================================================================
# Teste de concorrência da RPC close_stale_dossier_runs (medida G)
# -----------------------------------------------------------------------------
# Cria N runs stale e dispara DUAS conexões psql em paralelo chamando a RPC com
# lote grande. Com FOR UPDATE SKIP LOCKED, cada linha é fechada exatamente uma
# vez: soma dos retornos == N e nenhum run sobra. Timeout de lock guarda contra
# bloqueio indefinido.
#
# Uso:
#   scripts/test-close-stale-dossier-runs-concurrent.sh <nome_do_banco> [N]
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=${PSQL:-psql}
DB_NAME="${1:?uso: test-close-stale-dossier-runs-concurrent.sh <banco> [N]}"
N="${2:-6}"

echo "==> Preparando $N runs stale em $DB_NAME"
$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -q <<SQL
DELETE FROM public.dossier_runs WHERE operator_id = 'measure-g-concurrent';
DELETE FROM auth.users WHERE email = 'measure-g-concurrent-owner@example.com';
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (gen_random_uuid(), 'measure-g-concurrent-owner@example.com', now(), now());
INSERT INTO public.dossier_runs (owner_id, operator_id, status, idempotency_key, lease_owner, lease_expires_at, environment, app_version, last_heartbeat_at)
SELECT u.id, 'measure-g-concurrent', 'RUNNING', 'conc-' || i,
       'owner-' || i, now() - interval '2 hours', 'test', 'test', now() - interval '2 hours'
FROM auth.users u CROSS JOIN generate_series(1, $N) AS i
WHERE u.email = 'measure-g-concurrent-owner@example.com';
SQL

echo "==> Disparando 2 conexões concorrentes (lote 100, janela 1h)"
$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -tA \
  -c "SELECT public.close_stale_dossier_runs(3600, 100, FALSE);" > /tmp/conc-a.txt &
pid_a=$!
$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -tA \
  -c "SELECT public.close_stale_dossier_runs(3600, 100, FALSE);" > /tmp/conc-b.txt &
pid_b=$!
wait $pid_a
wait $pid_b

a=$(tr -d '[:space:]' < /tmp/conc-a.txt)
b=$(tr -d '[:space:]' < /tmp/conc-b.txt)
total=$((a + b))

echo "  conexão A fechou: $a"
echo "  conexão B fechou: $b"
echo "  soma: $total (esperado: $N)"

remaining=$($PSQL -d "$DB_NAME" -tA -c \
  "SELECT count(*) FROM public.dossier_runs WHERE operator_id='measure-g-concurrent' AND status='RUNNING';")
echo "  runs RUNNING restantes: $remaining (esperado: 0)"

if [[ "$total" -ne "$N" || "$remaining" -ne 0 ]]; then
  echo "ERRO: concorrência violou exclusividade (total=$total, restantes=$remaining)" >&2
  exit 1
fi

$PSQL -d "$DB_NAME" -v ON_ERROR_STOP=1 -q \
  -c "DELETE FROM public.dossier_runs WHERE operator_id = 'measure-g-concurrent';"
echo "OK — concorrência: $N runs fechados exatamente uma vez, 0 restantes, sem bloqueio."
