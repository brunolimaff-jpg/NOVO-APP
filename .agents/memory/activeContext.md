# Active Context

Last updated: 2026-08-02 — 05E.0C-R1 evidence closure aprovado localmente

## Estado atual

- **Fase:** Correção canônica de baseline de banco de dados e hardening de permissões (least privilege).
- **Branch:** `fix/canonical-supabase-migration-baseline`.
- **PR:** `#464` (Draft, Base `main`, HEAD: `a8a07919a606969fc34c7daee4ec41ca72f48b57`).
- **Vault Narrative:** [[2026-07-28T17-25-00-fix-canonical-supabase-migration-baseline|Bruno Vault Session Note]].

## Migrações & Baseline Canônico

- **Cadeia Ativa:** 21 arquivos `.sql` com timestamps de 14 dígitos.
- **Baseline:** `20260501000000_production_schema_baseline.sql` gerado via `pg_dump` 17.10 nativo a partir do PostgreSQL 17.6 de Produção (`vmqfcaoirjcfucvlnpig`). Sem objetos `auth`.
- **Hardening Grants:** `20260728173731_harden_dossier_grants.sql` (least privilege em `dossier_runs`, `dossies`, `profiles`, `handle_new_user()`).
- **Hardening Identity:** `20260728180000_harden_legacy_operator_linking.sql` (RPC `link_legacy_operator` com ownership, e-mail estrito de perfil e `user_context`, `SECURITY DEFINER`, `search_path = ''` e ACL restrita a `authenticated`).

## Paridade & Gates de Qualidade

- **Paridade Catálogo vs Produção:** `PRODUCTION_BASELINE_CATALOG_DIFF: ZERO` (15 categorias, 37/37 constraints com `pg_get_constraintdef`).
- **Replay Local PSQL:** Exit 0 (`-v ON_ERROR_STOP=1`).
- **Supabase CLI `db push` Local:** Exit 0 (21 migrações registradas).
- **Testes Runtime PG:** `test_harden_dossier_grants.sql` (OK), `test_harden_identity.sql` (11/11 asserts OK).
- **Testes de Contrato (Vitest):** 61/61 asserções aprovadas.
- **Linting & Diff Check:** `npm run lint` sem erros (0 errors); `git diff --check` zerado.

## 2026-08-02 — 05E.0A target freeze e harness local

- Alvo único congelado pelo Planner: `SERVER_OWNED_END_TO_END_MULTI_CALL`, com `api/_dossier-server-pipeline.ts` como helper canônico e `api/dossier.ts` como envelope futuro.
- Waterfall atual permanece `CLIENT_OWNED_FULL_WATERFALL` apenas como baseline; não foi usado para aprovar 300s.
- Harness local em `scripts/proofs/dossier-300s-runtime/` e `tests/proofs/dossier-300s-runtime/`; zero provider, rede, Supabase, Preview ou Produção.
- Gates comprovados: 17/17 harness; 67/67 API/contrato focados; typecheck, lint focado, build e diff-check.
- Bloqueio: helper canônico não cobre retry, reconciliação PORTA ou persistência terminal; `READY_FOR_05E_0B_PREVIEW_REAL_PROVIDER_PROOF=NO`.
- Checkpoint/handoff: `docs/checkpoints/2026-08-02-dossier-flow-05e0a-runtime-target-freeze.md`, `docs/checkpoints/2026-08-02-dossier-flow-05e0a-canonical-package.md`, `docs/handoffs/2026-08-02-dossier-flow-05e0a-runtime-handoff.md`.

## Próxima ação

Aguardar autorização do orquestrador Bruno. Se autorizada com token `MERGE`, marcar a PR #464 como Ready e fazer squash merge na `main`.

## 2026-08-02 — Contexto ativo: 05E.0B bloqueado por contrato

- **Missão atual:** Dossier Flow server-owned end-to-end; não confundir com a PR #464 histórica.
- **Execução:** worktree `/private/tmp/novo-app-dossier-flow-05a`, branch `codex/dossier-flow-server-owned-05a`, source head `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`.
- **Última adjudicação Planner:** `05E.0B_GATE_ZERO=PASS`; `FINAL_DECISION=BLOCKED_BY_EXISTING_DATABASE_CONTRACT`; runtime/readiness não provados.
- **Evidência:** `api/dossier.ts` usa `maxDuration: 300` em `config`; Build Output local materializou Node 24.x/300s e não criou nova Function. O schema versionado não tem checkpoint/attempt/step/resume.
- **Próximo passo:** aguardar cartão `DOSSIER-FLOW-05E.0C-CHECKPOINT-CONTRACT-01`; então reler `.agents/skills/licoes/SKILL.md`, revisar contrato, executar apenas prova local de migration/RPC/replay e pedir nova adjudicação antes de qualquer integração.
- **Restrições:** sem retry em memória, provider, Preview, Produção, migration remota, commit, push, merge ou encerramento do goal.

## 2026-08-02 — Contexto ativo: 05E.0C contrato local comprovado

- **Resultado Planner-card:** `CHECKPOINT_CONTRACT_LOCALLY_PROVEN` em `/private/tmp/novo-app-dossier-flow-05a`, branch `codex/dossier-flow-server-owned-05a`.
- **Contrato:** migration `20260802111500_dossier_checkpoint_attempt_contract.sql`, exatamente duas tabelas e oito RPCs; RLS/grants restritos, attempt 1..2, backoff 5s, digest SHA-256 no banco, payload 1 MiB e fencing por token/lease.
- **Evidência:** replay duplo, funcionalidade e concorrência em conexões independentes com PostgreSQL 17.10 PASS; Node 24 typecheck/lint/build, contratos 136/136, suíte 1.668/1.668 e Vercel build local PASS.
- **Fronteira:** runtime server-owned, API/frontend, provider, migration remota, Preview, Produção, commit, push, merge e fechamento do goal continuam bloqueados; `RUNTIME_READINESS=NOT_PROVEN`.
- **Handoff:** Vault `2026-08-02T12-15-00-dossier-flow-05e0c-contract-proven.md`; repo `docs/handoffs/2026-08-02-dossier-flow-05e0c-contract-handoff.md`.

## 2026-08-02 — Contexto ativo: 05E.0C-R1 aprovado localmente

- Planner aprovou `FINAL_DECISION=CHECKPOINT_CONTRACT_LOCALLY_PROVEN` após a rodada R1 no worktree `/private/tmp/novo-app-dossier-flow-05a`.
- Resume base/condicional, concorrências terminais equivalentes/divergentes e baseline por identidade passaram; `NEW_FAILURES_VS_SOURCE_HEAD=NONE`.
- Métricas reais: `SOURCE_HEAD` 461 suítes/1.589 testes/0 falhas; alvo 481 suítes/1.670 testes/0 falhas. A cardinalidade de identidades é reportada separadamente.
- Drive foi pesquisado como fonte complementar e está desatualizado; worktree continua fonte primária.
- Runtime/API/frontend, migration remota, Preview, Produção, commit, push, merge e encerramento do goal continuam proibidos. Novo cartão Planner é obrigatório para 05E.0B.
- Handoff Vault: `2026-08-02T12-58-00-dossier-flow-05e0c-r1-evidence-closure.md`; repo: `docs/handoffs/2026-08-02-dossier-flow-05e0c-r1-evidence-handoff.md`.

## 2026-08-02 — Contexto ativo: 05E.0B runtime integrado localmente

- Cartão Planner: `DOSSIER-FLOW-05E.0B-RUNTIME-INTEGRATION-02`, integração local autorizada; publicação remota proibida.
- Worktree/branch/head: `/private/tmp/novo-app-dossier-flow-05a`, `codex/dossier-flow-server-owned-05a`, `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`.
- `api/dossier.ts` delega generate ao `runDossierRuntime`; `api/_dossier-run-rpc.ts` aplica deadline total e body-read abort; `_dossier-persistence.ts` usa a RPC terminal attempt.
- Testes focados e prova vertical PASS; typecheck/build/lint/contratos PASS. Suíte global: 1668 PASS e a prova PG R1 não iniciou por falta de `R1_PG_SOCKET/R1_PG_PORT/R1_PG_DATABASE` (`NAO VALIDADO`).
- Checkpoint/handoff: `docs/checkpoints/2026-08-02-dossier-flow-05e0b-runtime-integration-local.md`, `docs/handoffs/2026-08-02-dossier-flow-05e0b-runtime-integration-local.md`.
- Vault: `Sessões/2026-08/2026-08-02T14-22-00-dossier-flow-05e0b-runtime-integration.md`.
- Próximo passo: enviar pacote ao Planner Web e aguardar decisão antes de qualquer commit/push/PR/CI/Supabase/Preview/deploy/merge.
