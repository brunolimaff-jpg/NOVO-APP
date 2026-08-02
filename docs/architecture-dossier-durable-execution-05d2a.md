# Lote 05D.2A — entrega do worker, identidade e checkpoints

Status: `APROVADO_COM_RESSALVAS` pelo Planner; desenho local aprovado para
adjudicação de implementação. Nenhuma migration, worker real, endpoint, cron
novo, RPC/grant, frontend, commit, push, CI, Preview ou Produção foi executado.

## Decisão de desenho

O mecanismo alvo permanece `SUPABASE_POSTGRES_RUN_STATE_WORKER`, mas a
disponibilidade operacional ainda não está provada. O runtime escolhido para
o desenho é um worker serverless acionado por polling de Vercel Cron:

```text
WORKER_RUNTIME_SELECTED=VERCEL_CRON_POLLING_SERVERLESS_WORKER
DELIVERY_TRIGGER_SELECTED=VERCEL_CRON_POLLING
WORKER_IDENTITY_SELECTED=DEDICATED_WORKER_SECRET_RESTRICTED_RPCS
USER_TOKEN_PERSISTENCE=PROHIBITED
```

O cron-alvo é `* * * * *`, com `maxClaimsPerTick = 1`, entrega at-least-once,
recuperação de lease abandonada e no máximo três tentativas. A frequência e o
limite do plano Vercel são `DESIGN_ONLY_PLAN_LIMIT_UNVERIFIED`; não existe
cron de dossiê configurado no `vercel.json` atual.

## Identidade e autorização do worker

O worker não reutiliza nem persiste token do usuário. A identidade operacional
proposta é uma credencial dedicada, validada no handler e encaminhada somente
para RPCs restritas. O desenho futuro exige:

- validação de segredo de cron e de segredo dedicado do worker sem registrar o
  valor em log;
- worker ID estável e verificável no claim, renovação, checkpoint e conclusão;
- RPCs `SECURITY DEFINER` com `search_path` explícito, validação do worker e da
  lease em linha bloqueada;
- nenhuma concessão da RPC atômica atual a `service_role` como atalho;
- owner de negócio derivado do `dossier_runs` bloqueado, nunca do payload do
  cliente ou de um bearer token persistido.

Se a única forma de executar o worker exigir guardar token de sessão do
usuário, o lote deve parar com
`WORKER_IDENTITY_REQUIRES_UNSAFE_USER_TOKEN_STORAGE`. Se exigir provedor
externo não aprovado, deve parar com
`DELIVERY_MECHANISM_REQUIRES_UNAPPROVED_EXTERNAL_SERVICE`.

## Checkpoint e transações

O esquema proposto é `dossier_run_checkpoints`, com chave primária
`(run_id, step_key)` e unicidade adicional `(run_id, step_order)`. Os campos
mínimos são etapa/ordem, tentativa, digests de entrada/saída, payload de saída
redigido e limitado, próximo retry, erro/estágio, worker/lease, versão do
pipeline e timestamps. O payload é acessível somente por RPC do worker e tem
retenção limitada; conteúdo sensível não deve aparecer em logs.

RPCs de desenho:

```text
enqueue_dossier_work
claim_dossier_work
renew_dossier_work
checkpoint_dossier_work
schedule_dossier_retry
request_dossier_work_cancel
mark_dossier_work_cancelled
mark_dossier_work_failed
reconcile_dossier_work_result
persist_and_complete_dossier_run_worker
```

A transação de claim deve selecionar, em ordem de etapa, apenas trabalho
`PENDING`, retry vencido ou lease `RUNNING` expirada, usando lock de linha e
`SKIP LOCKED`; incrementa tentativa e grava worker/lease na mesma transação.
Um segundo worker não recebe o mesmo claim. O checkpoint e a renovação exigem
worker, tentativa e lease atuais. Uma resposta tardia não pode sobrescrever
checkpoint terminal ou transferir ownership implicitamente.

Falhas entram em `RETRY_WAIT` com backoff. Após a terceira tentativa, o estado
é `FAILED` com equivalente de dead-letter `FAILED_RETRY_EXHAUSTED`. O
cancelamento marca o run e impede novos claims; um claim em andamento só pode
ser finalizado como `CANCELLED` pelo owner válido. A conclusão do dossiê passa
por uma RPC atômica worker-authenticated separada, preservando a fundação de
`persist_and_complete_dossier_run` e sua reconciliação de resposta ambígua.

## Prova local e evidência observada

`api/_dossier-durable-delivery.ts` é um harness síncrono sem `fetch`, Supabase,
Vercel, ambiente ou transporte. Seus testes comprovam exclusão entre workers,
redelivery após expiração, owner/attempt, retry/backoff/dead-letter,
cancelamento, ordenação e limites de claim. Isso é prova de contrato local,
não prova de runtime, plano Vercel, RPC ou schema remoto.

Evidências read-only usadas no desenho:

- `vercel.json`: somente cron de limpeza de confirmação de e-mail;
- `package.json` e lockfile: nenhum SDK Temporal/Inngest/Trigger/BullMQ/Cloud
  Tasks/workflow;
- `20260501000000_production_schema_baseline.sql`: estados e RPCs atuais de
  `dossier_runs`;
- `20260801130000_atomic_dossier_persistence_completion.sql`: conclusão
  atômica exige `auth.uid()` e atualmente não autoriza o worker dedicado;
- não existe tabela de checkpoint nem endpoint de worker no worktree.

## Limites de PR e próxima adjudicação

`PR_SPLIT_BOUNDARIES_DEFINED=PASS`:

1. PR #468 permanece a fundação de persistência atômica server-owned.
2. PR futura de durabilidade conterá migration de checkpoint, RPCs restritas,
   handler/cron do worker, observabilidade e testes de integração.
3. Cutover da API síncrona e frontend para `202 Accepted`/polling fica em PR
   posterior, depois que o worker real for comprovado.

Não alterar PR #468 neste lote. Não instalar serviço externo, não provisionar
cron, não alterar grants, não usar `service_role`, não criar endpoint real e
não declarar produção pronta.

## Gates

```text
CHECKPOINT_SCHEMA_DEFINED=PASS_DESIGN_ONLY
CLAIM_TRANSACTION_DEFINED=PASS_DESIGN_ONLY
AT_LEAST_ONCE_DELIVERY_CONTRACT_DEFINED=PASS_DESIGN_ONLY
MULTI_WORKER_EXCLUSION_PROVEN=PASS_LOCAL_HARNESS
ATOMIC_COMPLETION_WORKER_AUTH_PATH_DEFINED=PASS_DESIGN_ONLY
PR_SPLIT_BOUNDARIES_DEFINED=PASS
DELIVERY_RUNTIME=DESIGN_ONLY_PLAN_LIMIT_UNVERIFIED
READY_FOR_05D_2B_IMPLEMENTATION_ADJUDICATION=YES
```

O próximo passo permitido é somente submeter este desenho ao Planner e obter a
autorização textual exata para `05D.2B`. Sem essa autorização, a implementação
de migration/worker permanece bloqueada.
