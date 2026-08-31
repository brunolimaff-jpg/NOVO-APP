#!/usr/bin/env bash
# ============================================================================
# BRU-81 — prova de CONCORRÊNCIA REAL com duas conexões PostgreSQL.
# A conexão A segura o advisory lock (ativação do run) por 2.5s; a conexão B
# roda o autosave DURANTE esse intervalo. O autosave precisa BLOQUEAR até a
# ativação commitar e, em seguida, PULAR a thread (run RUNNING) — B intacto.
# Uso: scripts/test_bru81_atomic_concurrency.sh <banco_descartavel>
# NUNCA executar em Produção.
# ============================================================================
set -euo pipefail
DB="${1:?banco descartavel obrigatorio}"
PSQL=${PSQL:-psql}

SESSION_ID="cccccccc-0000-4000-8000-000000000003"
RUN_ID="99999999-0000-4000-8000-000000000099"
OWNER_A="aaaaaaaa-0000-4000-8000-000000000001"

# auth.uid() real (o bootstrap de replay cria stub que retorna NULL)
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS \$\$ SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid \$\$;"

# Prepara: usuário/profile do operador A (o harness principal usa ROLLBACK)
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -c "INSERT INTO auth.users (id, email) VALUES ('$OWNER_A', 'a@teste.com') ON CONFLICT (id) DO NOTHING;"
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -c "INSERT INTO public.profiles (id, operator_id, email, name) VALUES ('$OWNER_A', 'op_a', 'a@teste.com', 'Operador A') ON CONFLICT (id) DO NOTHING;"

# Prepara: run PENDING (o acquire vai ativá-lo segurando o advisory lock 2.5s)
$PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -c "INSERT INTO public.dossier_runs (run_id, owner_id, operator_id, session_id, status, idempotency_key, environment, app_version) VALUES ('$RUN_ID', '$OWNER_A', 'op_a', '$SESSION_ID', 'PENDING', 'idem_conc', 'test', 'test') ON CONFLICT (run_id) DO NOTHING;"

$PSQL -d "$DB" -v ON_ERROR_STOP=1 -q <<SQL &
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}', true);
-- ativação do run: acquire segura o advisory lock da session até o COMMIT
SELECT public.acquire_dossier_run_lease('$RUN_ID', 'lease-conc', 45);
SELECT pg_sleep(2.5);
COMMIT;
SQL
CONN_A_PID=$!

sleep 0.5  # garante que A segurou o lock

# Conexão B: autosave durante a janela da ativação (mede o bloqueio)
START=$(python3 -c 'import time; print(time.time())')
RESULT=$($PSQL -d "$DB" -v ON_ERROR_STOP=1 -At -c "SELECT set_config('request.jwt.claims', '{\"sub\":\"aaaaaaaa-0000-4000-8000-000000000001\"}', true); SELECT public.save_dossiers_autosave(jsonb_build_array(jsonb_build_object('id','$SESSION_ID','title','MIDFLIGHT','empresaAlvo','X','messages',jsonb_build_array(jsonb_build_object('sender','Bot','text','MIDFLIGHT'))))); SELECT 'DONE';")
END=$(python3 -c 'import time; print(time.time())')

wait $CONN_A_PID

ELAPSED=$(python3 -c "print(round($END - $START, 2))")
echo "AUTOSAVE BLOQUEADO POR: ${ELAPSED}s (esperado >= ~2s de bloqueio)"

# Asserts
[ "$(python3 -c "print(1 if $ELAPSED >= 1.5 else 0)")" = "1" ] || { echo "ASSERT-CONC-FAIL: autosave nao bloqueou (sem serialização)"; exit 1; }

CONTENT=$($PSQL -d "$DB" -At -c "SELECT content->'messages'->0->>'text' FROM public.dossies WHERE id = '$SESSION_ID';")
echo "CONTEUDO FINAL DE B: $CONTENT"

if [ "$CONTENT" = "MIDFLIGHT" ]; then
  echo "ASSERT-CONC-FAIL: B gravada mid-flight durante RUNNING (janela aberta)"
  exit 1
fi

echo "BRU81_ATOMIC_CONCURRENCY_PASSED (autosave bloqueou e pulou a thread com run ativo)"
