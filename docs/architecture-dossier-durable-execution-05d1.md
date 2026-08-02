# Lote 05D.1 — contrato de execução durável do dossiê

Status: design local isolado; sem worker real, migration nova, endpoint, frontend ou escrita remota.

## Mecanismo selecionado

`SUPABASE_POSTGRES_RUN_STATE_WORKER`

A opção escolhida é um estado durável no Postgres/Supabase, reclamado por um worker com entrega at-least-once, lease única, checkpoints e reconciliação. É a opção com menor acréscimo de tecnologia porque o repositório já contém `dossier_runs`, RPCs de idempotência/lease/cancelamento e a RPC atômica `persist_and_complete_dossier_run`.

Evidências read-only:

- `supabase/migrations/20260501000000_production_schema_baseline.sql`: `dossier_runs`, `create_or_get_dossier_run`, `acquire_dossier_run_lease`, `renew_dossier_run_lease`, `request_dossier_run_cancel`, `mark_dossier_run_cancelled`, `complete_dossier_run` e `fail_dossier_run`.
- `supabase/migrations/20260801130000_atomic_dossier_persistence_completion.sql`: lock da linha, persistência de `dossies` e transição `COMPLETED` na mesma transação, com retry idempotente/conflito explícito.
- `vercel.json`: existe somente o cron de limpeza de confirmação de e-mail; não há worker de dossiê.
- `package.json`/`package-lock.json`: não há Temporal, Inngest, Trigger.dev, BullMQ, Cloud Tasks ou outro runtime de workflow instalado.

## Comparação de opções

| Opção | Entrega/recuperação | Infra adicional observada | Decisão |
|---|---|---|---|
| A. Postgres + worker reclamando `dossier_runs` | at-least-once via lease; crash recupera do checkpoint; retry/reconciliation explícitos | worker e migration de checkpoint ainda não existem; ambos exigem autorização | selecionada como alvo |
| B. Workflow/fila gerenciada | semântica depende do provedor; boa recuperação se provisionada | nenhum SDK/configuração/serviço existente no repo; exigiria nova infraestrutura | rejeitada por maior acréscimo não comprovado |

O mecanismo foi selecionado como desenho, mas não está disponível para produção sem uma decisão de infraestrutura. Resultado operacional do gate: `DURABLE_EXECUTION_REQUIRES_UNAUTHORIZED_INFRASTRUCTURE`.

## Máquina de estados provada localmente

Fluxo principal:

`ACCEPTED → QUEUED → LEASE_ACQUIRED → MODULE_<N>_RUNNING → MODULE_<N>_COMPLETED → FINAL_CONSOLIDATION → PERSISTING → COMPLETED`

Estados alternativos: `CANCEL_REQUESTED`, `CANCELLED`, `RETRY_WAIT`, `FAILED`, `RECOVERY_REQUIRED` e `RESULT_AMBIGUOUS`.

Invariantes provados no harness puro `api/_dossier-durable-execution.ts`:

- `(idempotencyKey, sessionId)` retorna o mesmo `runId`; redelivery não cria outra execução lógica.
- Uma única lease ativa; worker diferente recebe `LEASE_CONFLICT`; lease expirada volta a `RECOVERY_REQUIRED`.
- Checkpoint mantém módulos concluídos; crash entre etapas retoma do próximo módulo; crash durante módulo retoma o mesmo módulo.
- Digest de etapa concluída é idempotente somente no ponto de conclusão; repetição tardia viola a ordem.
- Cancelamento entre módulos ou durante módulo impede nova chamada e só o owner atualiza `CANCELLED`.
- Retry entra em `RETRY_WAIT` e só reabre após backoff; falha permanente termina em `FAILED`, nunca `COMPLETED`.
- Possível commit sem resposta entra em `RESULT_AMBIGUOUS`; reconciliação confirma `COMPLETED` ou reabre apenas a consolidação, sem duplicar dossiê.
- `COMPLETED` só ocorre após persistência marcada como `COMMITTED`; o contrato mantém `persist_and_complete_dossier_run` como operação atômica final.

## Contrato de API proposto (não integrado)

- `POST /api/dossier-runs` → `202`, aceita `runId`/idempotency e devolve estado inicial.
- `GET /api/dossier-runs/:runId` → `200`, somente leitura de estado autorizado.
- `POST /api/dossier-runs/:runId/cancel` → `202`, registra cancelamento.
- `POST /api/dossier-runs/:runId/recover` → `202`, somente para recuperação autorizada/reconciliação.

O cliente não é owner de lease, LLM, checkpoint, retry, persistência ou estados terminais. O contrato não foi conectado a `/api/dossier` nem ao frontend.

## PR decomposition

Recomendação: `SPLIT`. Manter a PR #468 como fundação de persistência atômica server-owned e criar uma PR separada para worker, checkpoint, scheduler/infraestrutura, observabilidade e cutover. Não alterar a PR #468 neste lote.

## Saída do lote

```text
DURABLE_EXECUTION_MECHANISM_SELECTED=SUPABASE_POSTGRES_RUN_STATE_WORKER
DELIVERY_SEMANTICS_DEFINED=AT_LEAST_ONCE_WITH_LEASE
IDEMPOTENCY_CONTRACT_DEFINED=PASS
CHECKPOINT_AND_RECOVERY_PROVEN=PASS_LOCAL_HARNESS
CANCELLATION_CONTRACT_PROVEN=PASS_LOCAL_HARNESS
LEASE_SINGLE_OWNER_PROVEN=PASS_LOCAL_HARNESS
ATOMIC_COMPLETION_PRESERVED=PASS_CONTRACT
PR_DECOMPOSITION_RECOMMENDATION=SPLIT
DURABLE_EXECUTION_REQUIRES_UNAUTHORIZED_INFRASTRUCTURE
READY_FOR_05D_2_ADJUDICATION=YES
```
