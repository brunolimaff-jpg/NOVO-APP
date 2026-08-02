# Checkpoint — DOSSIER-FLOW 05E.0C-R1 — fechamento de evidência

Data: 2026-08-02 (America/Cuiaba)

## Resultado executivo

O contrato local de attempt, checkpoint, fencing, retry, resume e
terminalização está comprovado pela rodada corretiva R1. O Planner adjudicou:

```text
05E_0C_R1_RESULT=APPROVED
FINAL_DECISION=CHECKPOINT_CONTRACT_LOCALLY_PROVEN
EVIDENCE_STATUS=SUPPORTED_NOT_INDEPENDENTLY_REPRODUCED
RUNTIME_INTEGRATION_AUTHORIZED=NO
05E_0B_RESUMPTION_AUTHORIZED=NO
NEW_EXPLICIT_CARD_REQUIRED=YES
```

Esse resultado encerra somente a prova local do contrato. Não autoriza integrar
o runtime, aplicar migration remota, abrir Preview, publicar em Produção,
commitar, fazer push, iniciar CI remoto ou fazer merge.

## Contexto canônico

```text
TASK_ID=DOSSIER-FLOW-05E.0C-R1-EVIDENCE-CLOSURE-01
SOURCE_HEAD=a65f425b579ae429d9dd3823b0721a1a1d7d52bf
WORKTREE=/private/tmp/novo-app-dossier-flow-05a
BRANCH=codex/dossier-flow-server-owned-05a
MIGRATION=supabase/migrations/20260802111500_dossier_checkpoint_attempt_contract.sql
MIGRATION_SHA256_BEFORE=5bbf36cbcd30da2c8a6dc68c96dcfb7d9be83cef3a434ff55a418b49feee9a61
MIGRATION_SHA256_AFTER=5bbf36cbcd30da2c8a6dc68c96dcfb7d9be83cef3a434ff55a418b49feee9a61
MIGRATION_UNCHANGED=YES
```

## Gates fechados

| Gate | Resultado | Evidência |
| --- | --- | --- |
| Resume com helper canônico, sem repetir etapa confirmada | PASS | `tests/proofs/dossier-checkpoint-contract/resume-payload.test.ts`; `/tmp/dossier-flow-05e0c-r1.bILGP4/resume-vitest.log` |
| Caminho-base e caminho condicional semanticamente equivalentes ao contínuo | PASS | 2/2 testes R1; call counts e spies no harness |
| Versão incompatível e limite de payload | PASS | `PIPELINE_VERSION_MISMATCH_DENIED`; payload abaixo de 1 MiB |
| Conclusão equivalente em duas conexões PG17.10 | PASS | `equivalent-completion-one.log`, `equivalent-completion-two.log`, `equivalent-state.log` |
| Conclusão divergente em duas conexões PG17.10 | PASS | `divergent-completion-one.log`, `divergent-completion-two.log`, `divergent-state.log` |
| Baseline isolado por identidade | PASS | `baseline-comparison.txt`, `source-head-global.json`, `target-global.json` |

As duas conclusões concorrentes foram sobrepostas por transações
`pg_sleep`-sincronizadas em processos PostgreSQL independentes. A conclusão
equivalente retornou o mesmo resultado terminal; a divergente preservou um
único vencedor e normalizou o perdedor como `DOSSIER_CONFLICT`.

## Baseline global corrigido

O comparador foi endurecido após a auditoria do Planner:

- caminhos absolutos dos worktrees são normalizados para a suíte relativa;
- a multiplicidade de nomes repetidos/parametrizados é preservada em arrays;
- a identidade é `suite relativa + fullName + ancestorTitles`;
- falhas do alvo são comparadas por identidade e o alvo também é exigido sem
  testes falhos;
- contagem física de testes e cardinalidade de identidades são reportadas
  separadamente.

```text
SOURCE_HEAD_GLOBAL_SUITE=PASS
SOURCE_HEAD_GLOBAL_SUITE_STATS=suites=461;tests=1589;identities=1584;failed=0
TARGET_GLOBAL_SUITE=PASS
TARGET_GLOBAL_SUITE_STATS=suites=481;tests=1670;identities=1665;failed=0
BASELINE_COMPARISON_BY_IDENTITY=PASS
NEW_FAILURES_VS_SOURCE_HEAD=NONE
```

Os números `1584`/`1665` são cardinalidades de identidades únicas; `1589`/
`1670` são testes físicos. A diferença não representa regressão.

## Validação local

```text
NODE=v24.18.1
NPM=11.11.0
RESUME_VITEST=2/2 PASS
TYPECHECK=0
FOCUSED_LINT=0
GIT_DIFF_CHECK=0
FORBIDDEN_FILE_GUARD=0
REAL_PROVIDER_CALLS=0
SUPABASE_REMOTE_READS=0
SUPABASE_REMOTE_MUTATIONS=0
PREVIEW_DEPLOYMENTS_CREATED=0
COMMIT_CREATED=0
PUSH_COUNT=0
```

Evidência consolidada: `/tmp/dossier-flow-05e0c-r1.bILGP4`.

## Pesquisa complementar

A pasta do Drive indicada pelo Bruno foi pesquisada pelo Planner:

`https://drive.google.com/drive/folders/1y2fRaJ_ybQQ15wJp25g5iVtmkue_8Gol?hl=pt-br`

Ela é histórica, anterior à R1, e não contém a prova atual. O Planner não
encontrou divergência arquitetural; o worktree permanece a fonte primária e o
Drive é somente base complementar.

## Próximo passo e fronteiras

O próximo passo permitido é aguardar um novo cartão explícito do Planner para
05E.0B. Até lá, não integrar `api/dossier.ts` às RPCs, não aplicar a migration,
não iniciar Preview/provider real e não tratar este checkpoint como
`RUNTIME_READY`, `READY_FOR_PRODUCTION` ou `05E_COMPLETE`.
