# Checkpoint — DOSSIER-FLOW 05E.0B — Contrato de persistência bloqueador

Data: 2026-08-02 11:00 (America/Cuiaba)

## Resultado executivo

`FINAL_DECISION=BLOCKED_BY_EXISTING_DATABASE_CONTRACT`.

O Gate Zero foi aprovado pelo Planner, mas a implementação server-owned não
começou porque o contrato versionado no `SOURCE_HEAD` não suporta checkpoint,
tentativa persistente e retomada. Implementar esse comportamento em memória ou
repetir todo o waterfall dentro da mesma invocação violaria o cartão 05E.0B.

## Gate Zero preservado

| Evidência | Resultado |
| --- | --- |
| `api/dossier.ts` com `export const config = { runtime: 'nodejs', maxDuration: 300 }` | PASS |
| Build Vercel local (`vercel` 54.14.0) | PASS |
| Handler construído | `api/dossier.js` |
| Limite no `.vc-config.json` | `300` s / `300000` ms |
| Funções API construídas | 9 |
| Funções com middleware | 10 |
| Funções novas | 0 |
| `vercel.json` override para dossier | ausente |

Artefato temporário sanitizado: `/tmp/novo-app-vercel-build-05e0b-r2.y58UC8`.

## Contrato ativo observado

- `supabase/migrations/20260501000000_production_schema_baseline.sql` possui
  `lease_owner`, `lease_expires_at`, cancelamento e estados terminais, mas não
  possui `attempt`, `step_key`, digest, payload intermediário ou versão de
  pipeline.
- O `status_check` ativo só aceita `PENDING`, `RUNNING`, `CANCEL_REQUESTED`,
  `CANCELLED`, `COMPLETED` e `FAILED`.
- Não existe `dossier_run_checkpoints` nas migrations ativas.
- `persist_and_complete_dossier_run` garante lock, lease, conclusão atômica,
  idempotência equivalente e conflito divergente; não registra checkpoints ou
  resume.
- `api/_dossier-durable-execution.ts` e `api/_dossier-durable-delivery.ts` são
  contratos/harness design-only locais, não persistência ativa.

## Gates não comprováveis sem nova fundação de banco

```text
CHECKPOINT_RESUME_IMPLEMENTED=NO_CONTRACT
ATTEMPT_RETRY_DURABLE=NO_CONTRACT
STALE_ATTEMPT_STEP_FENCING=PARTIAL_LEASE_OWNER_ONLY
TERMINAL_IDEMPOTENCY=SUPPORTED_BY_EXISTING_RPC
DIVERGENT_CONFLICT=SUPPORTED_BY_EXISTING_RPC
NEW_MIGRATION_OR_RPC_REQUIRED=YES
```

## Escopo e segurança

- Única mudança de runtime nesta etapa: configuração local de duração em
  `api/dossier.ts`.
- Nenhuma migration, RPC, RLS, role, grant, frontend, provider real, Supabase
  remoto, Preview, deploy, commit, push, Produção ou merge.
- `.vercel/.env.preview.local` criado pelo CLI foi removido sem leitura de
  conteúdo; `.vercel/project.json` e cache gerados foram restaurados/removidos.

## Próximo cartão recomendado

`DOSSIER-FLOW-05E.0C-CHECKPOINT-CONTRACT-01`, exclusivamente para desenhar e
provar localmente attempt, checkpoint, fencing e resume com migration/RPC,
antes de retomar a integração 05E. Não iniciar esse cartão sem adjudicação
explícita do Planner.

## Validação

Gate Zero: PASS. Runtime 05E.0B, testes médios do handler, typecheck/lint/build
da implementação e suíte global: **NAO VALIDADO**, pois a implementação foi
interrompida pelo contrato insuficiente.
