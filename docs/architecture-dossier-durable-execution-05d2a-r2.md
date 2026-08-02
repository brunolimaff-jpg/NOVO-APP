# Lote 05D.2A-R2 — plano e identidade de banco do worker

Status: `AUTORIZADO SOMENTE COMO DESENHO/HARNESS LOCAL`. O Planner confirmou o
modo de acesso, mas manteve 05D.2B bloqueado: plano Vercel não verificado,
cron de dossiê ausente e nenhuma identidade/RPC/checkpoint existente no banco
vivo.

## Resultado canônico

```text
VERCEL_PLAN_PROOF=NOT_VERIFIED
CRON_FREQUENCY_ELIGIBILITY=BLOCKED
WORKER_DATABASE_ACCESS_MODE_SELECTED=DEDICATED_POSTGRES_LOGIN_VIA_SUPAVISOR_TRANSACTION_POOLER
WORKER_ROLE_GRANTS_DEFINED=DESIGN_ONLY_WORKER_RPC_ONLY_NO_GENERIC_TABLE_ACCESS
WORKER_RPCS_DEFINED=DESIGN_ONLY
TENANT_DERIVATION_DEFINED=LOCKED_DOSSIER_RUN_ROW
SECRET_STORAGE_AND_ROTATION_DEFINED=DESIGN_ONLY_VERCEL_ENVIRONMENT_SECRET_DUAL_WINDOW
NO_USER_TOKEN_PERSISTENCE=PASS
READY_FOR_05D_2B_IMPLEMENTATION_ADJUDICATION=NO
```

## Matriz de plano Vercel

| Plano | Cron mínimo | Elegibilidade para polling de dossiê | Estado atual |
|---|---:|---|---|
| Hobby | 1 dia, precisão horária | bloqueado para experiência orientada ao usuário | plano não verificado |
| Pro | 1 minuto | condicional; exige confirmação do plano | plano não verificado |
| Enterprise | 1 minuto | condicional; exige confirmação do plano | plano não verificado |

O projeto e a equipe foram identificados pelo conector, e `api/dossier.ts`
declara `maxDuration = 60`, mas o plano, Fluid Compute e registro ativo do cron
não foram expostos. Há somente configuração versionada do cron diário de
confirmação de e-mail. Cron automático não é executado em Preview.

## Identidade escolhida

O modo de acesso futuro é um login PostgreSQL dedicado, usado pelo endpoint do
worker através do Supavisor em modo transaction pooler. É uma decisão de
contrato, não uma credencial criada. O desenho rejeita `service_role`, `anon`,
JWT do usuário e a equivalência entre `CRON_SECRET` e identidade de banco.

Traçado futuro:

```text
Vercel Cron + CRON_SECRET
  -> endpoint autenticado
  -> login PostgreSQL dedicado do worker via Supavisor transaction pooler
  -> RPCs worker-only com grants mínimos
  -> claim bloqueado de dossier_runs/checkpoints
  -> checkpoint/retry/reconcile
  -> persist-and-complete worker-authenticated
```

O login deve ficar em segredo de ambiente do ambiente correto, com rotação em
janela dupla e nenhum valor em log. A role não recebe acesso genérico às
tabelas; só executa RPCs worker-only. `tenant_id` e `owner_id` são derivados da
linha reclamada sob lock, nunca aceitos como autoridade do handler.

## Estado observado

- Produção não possui `dossier_run_checkpoints` nem RPCs worker-only.
- `persist_and_complete_dossier_run` da PR #468 ainda não está vivo em
  Produção; a migração proposta exige `auth.uid()` e concede somente a
  `authenticated`.
- RPCs legadas concedem `service_role`, mas continuam dependentes de
  `auth.uid()` e não constituem identidade de worker independente.
- Preview não tem scheduler automático e o binding Vercel Preview → Supabase
  Preview não foi comprovado.

## Harness local

`api/_dossier-worker-identity.ts` não usa rede, ambiente, Supabase ou
`service_role`. Os testes demonstram que `CRON_SECRET` e token do usuário não
podem reclamar, credencial inválida não altera o run, tenant/owner vêm da
linha reclamada, dois workers são mutuamente exclusivos, role ampla é rejeitada
e conclusão exige worker/lease atuais.

## Limites

Não criar migration, role, grant, segredo, cron, endpoint, worker,
configuração, API/frontend, commit, push, CI, Preview mutável, Produção,
deploy ou merge. 05D.2B só pode ser solicitado após prova do plano e desenho
completo de grants/RPCs/rotação/isolamento; a decisão final continua do Planner.
