# Pacote canônico — DOSSIER-FLOW 05E.0C — resultado do contrato

```text
TASK_ID=DOSSIER-FLOW-05E.0C-CHECKPOINT-CONTRACT-01
SOURCE_HEAD=a65f425b579ae429d9dd3823b0721a1a1d7d52bf
WORKTREE=/private/tmp/novo-app-dossier-flow-05a
BRANCH=codex/dossier-flow-server-owned-05a
05E_0C_AUTHORIZED=YES
CONTRACT_SCOPE=LOCAL_SCHEMA_RPC_CONTRACT_ONLY
FINAL_VERDICT=CHECKPOINT_CONTRACT_LOCALLY_PROVEN
RUNTIME_INTEGRATION_AUTHORIZED=NO
API_CHANGE_AUTHORIZED=NO
FRONTEND_CHANGE_AUTHORIZED=NO
REMOTE_MIGRATION_AUTHORIZED=NO
COMMIT_PUSH_PREVIEW_DEPLOY_PRODUCTION_MERGE=NO
```

## Objetos autorizados

Migration única:

`supabase/migrations/20260802111500_dossier_checkpoint_attempt_contract.sql`

Tabelas novas (exatamente duas):

1. `public.dossier_run_attempts`
2. `public.dossier_run_checkpoints`

RPCs novas (exatamente oito):

1. `begin_dossier_run_attempt`
2. `renew_dossier_run_attempt_lease`
3. `record_dossier_run_checkpoint`
4. `get_dossier_run_resume_state`
5. `schedule_dossier_run_retry`
6. `fail_dossier_run_attempt`
7. `cancel_dossier_run_attempt`
8. `persist_and_complete_dossier_run_attempt`

## Regras invariantes

- `attempt_no` é único por `run_id` e limitado a 1..2.
- Uma única attempt `RUNNING` pode existir por run.
- Checkpoint é idempotente quando identidade, payload e digest são iguais; a
  divergência é rejeitada.
- `step_ordinal` não pode retroceder; step e pipeline são vinculados à attempt.
- Payload JSONB e seu texto serializado são limitados a 1 MiB.
- Digest é SHA-256 calculado pelo banco; o cliente não escolhe o resultado.
- Toda mutação exige dono, fence token, lease vigente e pipeline compatível.
- Retry usa backoff de 5.000 ms e não cria uma terceira attempt.
- RLS é habilitado/forçado; não há grant direto de tabela para cliente.

## Provas obrigatórias executadas

```text
REPLAY_ONE|17.10|21 (public tables observed)
REPLAY_TWO|17.10|21 (public tables observed)
CONCURRENCY_EQUIVALENT|PASS
CONCURRENCY_DIVERGENT|PASS
CONCURRENCY_BEGIN_SINGLE_WINNER|PASS
CONTRACT_TESTS=9 files / 136 tests PASS
GLOBAL_TESTS=175 files / 1668 tests PASS
NODE24_TYPECHECK=PASS
NODE24_LINT=PASS (0 errors, 61 warnings)
NODE24_BUILD=PASS
VERCEL_NODE24_BUILD=PASS
```

## Decisão de fronteira

Este pacote prova o contrato local; não prova conexão real do endpoint,
provider, Supabase remoto, Preview, Produção, observabilidade de deployment ou
cutover do frontend. Qualquer integração posterior exige cartão novo do
Planner, revalidação de `licoes` e validação média/grande antes de avançar.
