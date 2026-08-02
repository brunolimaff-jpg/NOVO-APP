# Progress

## 2026-07-28 — PR #464 baseline nativo PG 17 & least privilege hardening

- Reconstruída a cadeia canônica de migrações em `fix/canonical-supabase-migration-baseline` (PR #464, HEAD: `a8a07919a606969fc34c7daee4ec41ca72f48b57`).
- Dump nativo via `pg_dump` 17.10 contra PostgreSQL 17.6 remoto de Produção gerou `20260501000000_production_schema_baseline.sql` sem contaminar objetos do schema `auth`.
- Mantidos 18 marcadores no-op de Produção (preservando timestamps canônicos).
- Adicionadas migrações de hardening: `20260728173731_harden_dossier_grants.sql` e `20260728180000_harden_legacy_operator_linking.sql`.
- Paridade de catálogo em 15 categorias contra Produção aprovada com `PRODUCTION_BASELINE_CATALOG_DIFF: ZERO` (37/37 constraints com `pg_get_constraintdef`).
- Replay PSQL (`-v ON_ERROR_STOP=1`) e `npx supabase db push` local em PG 17 aprovados com 21 migrações registradas.
- Testes runtime PostgreSQL (`test_harden_dossier_grants.sql` e `test_harden_identity.sql`) e 61/61 asserções vitest de contrato aprovados.
- Lint (0 erros) e `git diff --check` aprovados.
- Vault: [[2026-07-28T17-25-00-fix-canonical-supabase-migration-baseline|Baseline nativo PG17 + Hardening]].

## 2026-07-24 — PR4 code gate e Preview Supabase isolado

- PR3 `#450` permanece com code gate aprovado e release gate bloqueado; head `3b929f7b`.
- PR4 `#451` permanece draft, base `codex/dossie-pr3-lifecycle`, mergeável e com code gate aprovado; head funcional `5807e630`.
- Preview Git ficou READY no head esperado e comprovou 10 Functions.
- Criado o Supabase `scoutagro-preview` em `sa-east-1`, ref mascarada `xlvs…owec`, status `ACTIVE_HEALTHY` e custo registrado de 0 por mês.
- Preview e Produção agora têm refs distintos; isolamento documentado como confirmado. Produção `vmqf…npig` não foi alterada.
- Cinco envs Supabase foram configurados somente no Preview; LiteLLM base URL, API key e alias geral estão presentes; alias de chat é opcional e está ausente.
- Envs exigem novo deployment Preview. Migration, SQL, RPC/RLS, usuário/run controlados e smoke ainda não foram executados.
- Code gate PR4 registra 65 testes focados, build passando e zero erro novo de typecheck nos arquivos da PR4.
- Decisões preservadas: alias lógico obrigatório, retry da aplicação igual a zero, tools/Brave/EvidencePack na PR5 e cutover na PR6.
- Bloqueador PR6: definir proprietário único da lease entre geração, persistência, conclusão, falha e cancelamento.
- Checkpoint: `docs/checkpoints/2026-07-24-pr4-code-gate-e-preview-isolado.md`.
- Nesta atualização documental não foram executados testes, build, deploy, migration, SQL ou smoke.

## 2026-07-23 — PR4 gateway LiteLLM local

- Branch `codex/dossie-pr4-gateway` sobre a base exata `3b929f7b`; commit funcional `2f132aa1`.
- Criado `api/dossier.ts` com auth Supabase, ownership por `runId`, generate/chat contextual e correlação.
- Gateway interno encadeia `AbortSignal` até o LiteLLM e limita o budget a 50 s.
- Compatibilidade do caminho legado `/api/gemini` preservada após revisão adversarial.
- 32 testes focados, ESLint focado, diff check e build passaram.
- Typecheck e suíte ampla permanecem bloqueados por falhas preexistentes; detalhes em `HANDOFF_AI.md`.
- Uma consulta Vercel aos envs retornou 403; isolamento segue `NÃO_VERIFICADO`.
- Sem push, deploy, PR, migration, alteração remota ou merge.
- Vault: [[2026-07-23T13-54-30-novo-app-pr4-local-gateway]].

## 2026-07-20 — PR 2: contenção de Radar e War Room

- Baseline `e0e3d8b2468fdf4e1afe3159c2a5b8320e395845`; branch `codex/dossie-pr2-contencao`.
- Radar, auto-scan, War Room, benchmark independente, docs-RAG, health generativo e ping LiteLLM foram removidos da aplicação ativa.
- `api/gemini`, `api/rag`, Pinecone, dados históricos e o benchmark interno do waterfall foram preservados.
- Preview deverá comprovar nove Functions Node; não houve LLM real, migration, deploy manual ou merge.

## 2026-07-14 — Fase 3B.3C.1 (live readiness macOS)

- Branch `fix/fase-3b3c1-live-readiness-macos` @ `636c3d4e`
- Separa `asset_checksums_esperados` × `binary_checksums_esperados` (arm64 binário com proveniência)
- Verificador live de hook + atestação humana fora do repo
- `check-pilot-readiness.rb` somente leitura
- Sem instalar DCG / sem alterar hooks / sem Codex ou piloto real

## 2026-07-14 — PR #430 MERGED (Fase 3B.3C)

- Squash `636c3d4e6fe2b369f7e7644242e79b7edb8781d1`

## 2026-07-17 — Encerramento da prova final supervisionada

- PRs #442, #443 e #444 concluídas e preservadas.
- Preparação bloqueada antes da reserva por `RUNNER_HEAD_NOT_FROZEN`.
- Encerramento formal documentado; nenhum runtime, piloto, state, evidência,
  entrega ou Run Report foi criado.
- Prioridade devolvida ao backlog do Scout 360; próxima triagem: #409–#418 e
  #435.

# 2026-07-20 — PR 1: baseline, CI e Vercel

- Baseline remota confirmada em `a55113e525d31c5a0de82f5b01208ac82ae1eb29`.
- Worktree principal estava suja; PR 1 segue em worktree isolada.
- Plano consolidado: `docs/planos/estabilizacao-dossie-litellm-v1.md`.
- Escopo: Node 24, npm 11.11.0, `npm ci`, CI, Vercel, sourcemaps Sentry opt-in e documentação operacional.
- Node `24.14.1`, npm `11.11.0`, `npm ci`, build e docs check passaram.
- Preview final `dpl_AMQkRove9o47UHrVwt1pB8okXE9d` ficou READY, comprovou Build Output e 13 Functions Node; sem deploy manual ou produção.
- Sentry runtime não mudou; o plugin de build só envia sourcemaps com opt-in explícito e token.
- Typecheck, Tests, Golden e E2E continuam com falhas preexistentes comparadas à baseline.

## 2026-08-02 — 05E.0A runtime target freeze + harness local

- Planner resolveu a ambiguidade: `RUNTIME_PROOF_TARGET=SERVER_OWNED_END_TO_END_MULTI_CALL`; caminho client-owned é baseline-only.
- Criado harness local/injetável fora do runtime, com modelo 300s/270s/30s, cenários de body-read, retry agregado, abort, persistência, reconciliação e lease.
- Exercício direto do helper canônico: 8 provider calls sintéticas, 12 buscas sintéticas, 1 benchmark sintético; nenhuma dependência client-side.
- 17/17 harness e 67/67 API/contrato focados passaram; typecheck, lint focado, build e diff-check passaram; `api/` preservado.
- Bloqueio para 05E.0B: helper não implementa retry/reconciliação PORTA/persistência terminal; Vercel deployable count e Fluid Compute efetivo não verificados.
- Artefatos: checkpoint e pacote em `docs/checkpoints/2026-08-02-dossier-flow-05e0a-*`; handoff em `docs/handoffs/2026-08-02-dossier-flow-05e0a-runtime-handoff.md`.

## 2026-08-02 — 05E.0B Gate Zero e bloqueio de contrato

- Worktree de execução: `/private/tmp/novo-app-dossier-flow-05a`; branch `codex/dossier-flow-server-owned-05a`; source head `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`.
- Gate Zero comprovado localmente: `api/dossier.ts` declara `maxDuration: 300` dentro de `config`; Vercel Build Output materializou `runtime=nodejs24.x` e `maxDuration=300`, sem nova Function (9 API + middleware, igual ao baseline).
- Planner adjudicou `05E.0B_GATE_ZERO=PASS` e depois `FINAL_DECISION=BLOCKED_BY_EXISTING_DATABASE_CONTRACT`.
- O schema versionado não possui tentativa, step/checkpoint, digest/payload de checkpoint ou versão de pipeline; a RPC existente cobre apenas finalização idempotente e conflito divergente. Não iniciar retry/resume server-owned em memória.
- Runtime server-owned e readiness continuam `NOT_PROVEN`; nenhum provider, Preview, Produção, migration remota, commit, push ou merge foi executado.
- Checkpoint/pacote/handoff: `docs/checkpoints/2026-08-02-dossier-flow-05e0b-contract-blocked.md`, `docs/checkpoints/2026-08-02-dossier-flow-05e0b-contract-canonical-package.md`, `docs/handoffs/2026-08-02-dossier-flow-05e0b-contract-blocked.md`.
- Próxima etapa condicionada ao cartão Planner `DOSSIER-FLOW-05E.0C-CHECKPOINT-CONTRACT-01`: migration/RPC/tabela local, replay PostgreSQL e novos gates; Node 24.x obrigatório antes do veredito final.

## 2026-08-02 — 05E.0C contrato de checkpoint comprovado localmente

- Implementada em uma única migration a fundação autorizada para attempts, checkpoints, fencing, retry, resume e terminalização; exatamente duas tabelas e oito RPCs, sem alteração em `dossier_runs` ou na RPC legada.
- Runner local executou replay completo da cadeia em dois bancos PostgreSQL 17.10 e provas concorrentes em conexões independentes: `CONCURRENCY_EQUIVALENT=PASS`, `CONCURRENCY_DIVERGENT=PASS`, `CONCURRENCY_BEGIN_SINGLE_WINNER=PASS`.
- Gates Node 24: typecheck, lint (0 erros/61 avisos), build, diff-check, contratos 136/136 e suíte global 1.668/1.668; Vercel build local materializou `nodejs24.x`/`maxDuration=300`.
- Resultado canônico: `CHECKPOINT_CONTRACT_LOCALLY_PROVEN`; runtime/readiness `NOT_PROVEN`. Nenhuma migration remota, Preview, Produção, commit, push ou merge.
- Evidência: `/tmp/dossier-flow-05e0c-proof.pGMvJY`; checkpoint/pacote/handoff repo em `docs/checkpoints/2026-08-02-dossier-flow-05e0c-*` e `docs/handoffs/2026-08-02-dossier-flow-05e0c-contract-handoff.md`; Vault `2026-08-02T12-15-00-dossier-flow-05e0c-contract-proven.md`.
- Próximo passo: adjudicação do Planner para a integração server-owned 05E.0B; reler `licoes` antes da próxima etapa.

## 2026-08-02 — 05E.0C-R1 evidence closure

- Fechada a prova corretiva: resume base/condicional sem duplicação, conclusão terminal equivalente idempotente e conclusão divergente com `DOSSIER_CONFLICT`/vencedor único.
- Baseline global Node 24.18.1/npm 11.11.0: `SOURCE_HEAD` 461 suítes/1.589 testes/0 falhas; alvo 481/1.670/0; comparação por identidade PASS, nenhuma falha nova.
- Comparador passou a preservar multiplicidade e separar `tests` de `identities`; lição registrada no Vault `testing/baseline-por-identidade-preserva-multiplicidade.md`.
- Planner final: `05E_0C_R1_RESULT=APPROVED`, `CHECKPOINT_CONTRACT_LOCALLY_PROVEN`; evidência `SUPPORTED_NOT_INDEPENDENTLY_REPRODUCED`.
- Drive complementar concluído, sem divergência; worktree é fonte atual. Novo cartão é obrigatório para 05E.0B; sem integração/publicação/merge/encerramento.
- Checkpoint/pacote/handoff: `docs/checkpoints/2026-08-02-dossier-flow-05e0c-r1-*`, `docs/handoffs/2026-08-02-dossier-flow-05e0c-r1-evidence-handoff.md`; evidência `/tmp/dossier-flow-05e0c-r1.bILGP4`.

## 2026-08-02 — 05E.0B runtime integration local

- Implementado o runtime server-owned autorizado pelo Planner em `/private/tmp/novo-app-dossier-flow-05a`, sem commit ou ação remota.
- Generate agora percorre begin → resume → helper canônico → checkpoints ordenados → retry/resume quando permitido → finalização/cancelamento/falha → persistência terminal atômica.
- RPC client cobre timeout da leitura do body e abort real; handler não aceita owner/operator do cliente; chat legado permanece separado.
- Gates: typecheck, build, lint focado, contratos 136/136 e 51 testes focados PASS; global 1668 PASS + 1 prova PG `NAO VALIDADO` por ausência de `R1_PG_*`; diff-check PASS.
- Checkpoint/handoff: `docs/checkpoints/2026-08-02-dossier-flow-05e0b-runtime-integration-local.md` e `docs/handoffs/2026-08-02-dossier-flow-05e0b-runtime-integration-local.md`.
- Vault: `Sessões/2026-08/2026-08-02T14-22-00-dossier-flow-05e0b-runtime-integration.md`.
- Próximo passo: adjudicação do Planner; nenhuma publicação remota antes de decisão nova.
