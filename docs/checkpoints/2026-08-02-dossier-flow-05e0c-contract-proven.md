# Checkpoint — DOSSIER-FLOW 05E.0C — contrato local comprovado

Data: 2026-08-02 (America/Cuiaba)

## Resultado executivo

`CHECKPOINT_CONTRACT_LOCALLY_PROVEN`.

O contrato persistente mínimo para tentativa, checkpoint, fencing, retry,
resume e terminalização server-owned foi implementado em uma única migration e
comprovado em PostgreSQL 17.10 local. O veredito é local: não autoriza migration
remota, integração do runtime, Preview, Produção, commit, push ou merge.

## Contexto canônico

```text
TASK_ID=DOSSIER-FLOW-05E.0C-CHECKPOINT-CONTRACT-01
SOURCE_HEAD=a65f425b579ae429d9dd3823b0721a1a1d7d52bf
WORKTREE=/private/tmp/novo-app-dossier-flow-05a
BRANCH=codex/dossier-flow-server-owned-05a
05E_0C_AUTHORIZED=YES
RUNTIME_INTEGRATION_AUTHORIZED=NO
REMOTE_MIGRATION_AUTHORIZED=NO
```

## Entrega do contrato

- Uma migration nova: `supabase/migrations/20260802111500_dossier_checkpoint_attempt_contract.sql`.
- Exatamente duas tabelas novas: `dossier_run_attempts` e
  `dossier_run_checkpoints`.
- Oito RPCs `SECURITY DEFINER` com `search_path = ''`: begin/renew attempt,
  record checkpoint, resume state, retry, fail, cancel e terminalização da
  attempt.
- Tentativas limitadas a 2; backoff fixo de 5.000 ms; digest SHA-256
  calculado no PostgreSQL; payload limitado a 1 MiB; fencing por token e lease
  do `dossier_runs`.
- RLS habilitado e forçado, políticas autenticadas explícitas e privilégios
  diretos revogados; somente `authenticated` recebe `EXECUTE` nas RPCs.
- `dossier_runs`, a RPC legada e migrations existentes não foram alterados.

## Evidência local

| Prova | Resultado | Artefato |
| --- | --- | --- |
| Replay completo das 25 migrations em dois bancos descartáveis | PASS; `gates.txt` registra 21 tabelas públicas observadas em cada banco | `/tmp/dossier-flow-05e0c-proof.pGMvJY/replay-one.log` e `replay-two.log` |
| Fluxo funcional: begin, checkpoint, idempotência, divergência, ordem, limite, retry/resume, fencing, falha, cancelamento e terminalização | PASS | `/tmp/dossier-flow-05e0c-proof.pGMvJY/functional.log` |
| Duas conexões independentes — checkpoint equivalente | PASS | `/tmp/dossier-flow-05e0c-proof.pGMvJY/equivalent-connection-one.log` e `equivalent-connection-two.log` |
| Duas conexões independentes — checkpoint divergente | PASS | `/tmp/dossier-flow-05e0c-proof.pGMvJY/divergent-connection-one.log` e `divergent-connection-two.log` |
| Duas conexões independentes — um único vencedor no begin | PASS | `/tmp/dossier-flow-05e0c-proof.pGMvJY/begin-connection-one.log` e `begin-connection-two.log` |
| Script de prova | PASS | `scripts/proofs/dossier-checkpoint-contract/run-local-proof.sh` |

Resumo emitido pelo runner:

```text
POSTGRES_VERSION=17.10
MIGRATION_COUNT=25
REPLAY_ONE|17.10|21 (public tables observed)
REPLAY_TWO|17.10|21 (public tables observed)
CONCURRENCY_EQUIVALENT|PASS
CONCURRENCY_DIVERGENT|PASS
CONCURRENCY_BEGIN_SINGLE_WINNER|PASS
```

## Gates de aplicação em Node 24

- `npm run typecheck`: PASS (`/tmp/dossier-flow-05e0c-node24-gates.OR8A72/typecheck.log`).
- `npm run lint`: PASS, 0 erros e 61 avisos existentes
  (`/tmp/dossier-flow-05e0c-node24-gates.OR8A72/lint.log`).
- `npm run build`: PASS (`/tmp/dossier-flow-05e0c-node24-gates.OR8A72/build.log`).
- `git diff --check`: PASS.
- `npm run test:contracts`: 9 arquivos / 136 testes PASS
  (`/tmp/dossier-flow-05e0c-node24-gates2.r3E5xC/contract_tests.log`).
- `npm test`: 175 arquivos / 1.668 testes PASS
  (`/tmp/dossier-flow-05e0c-node24-gates2.r3E5xC/global_tests.log`).
- Node usado: `v24.18.1`; npm `11.11.0`.

## Gate Vercel local

`vercel build` sob Node 24 terminou com exit 0. O artefato sanitizado em
`/tmp/dossier-flow-05e0c-vercel-node24.XS2CXz` materializou
`functions/api/dossier.func/.vc-config.json` com `runtime=nodejs24.x` e
`maxDuration=300`; o arquivo `.vercel/project.json` foi restaurado e o cache
gerado foi removido após a inspeção.

## Limites e próximo passo

O runtime server-owned ainda não foi conectado ao endpoint nem ao frontend. A
migration está apenas no worktree; o estado remoto é `NÃO VERIFICADO`. O próximo
passo depende de nova adjudicação do Planner para o cartão de integração 05E.0B,
mantendo o contrato legado e o caminho client-owned fora do cutover até haver
prova de ownership único.

```text
REMOTE_MIGRATION=NO
PREVIEW=NO
PRODUCTION=NO
COMMIT=NO
PUSH=NO
MERGE=NO
RUNTIME_READINESS=NOT_PROVEN
```
