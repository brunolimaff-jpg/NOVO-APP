# HANDOFF AI — NOVO-APP / DOSSIER-FLOW 05E.0B

> Atualizado: 2026-08-02 — integração runtime local, sem publicação remota
> Branch de execução: `codex/dossier-flow-server-owned-05a`
> Worktree: `/private/tmp/novo-app-dossier-flow-05a`
> Source head: `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`
> Vault: `Sessões/2026-08/2026-08-02T14-22-00-dossier-flow-05e0b-runtime-integration.md`

## Estado imediato

- `api/dossier.ts` usa `runDossierRuntime` apenas no `generate`; chat permanece server-owned por ownership separado.
- RPC client, attempts/fence, checkpoints/resume, retry limitado, cancelamento, heartbeat e persistência atômica estão integrados localmente.
- Migration `20260802111500_dossier_checkpoint_attempt_contract.sql` preservada sem alteração.
- Gates locais focados PASS; suíte global tem 1668 testes PASS e uma prova PG `NAO VALIDADO` por falta de `R1_PG_*`.
- **Bloqueio:** commit, push, PR, CI remoto, Supabase, migration, Preview, provider real, Produção, deploy e merge aguardam Planner.

## Próxima ação

Enviar `docs/checkpoints/2026-08-02-dossier-flow-05e0b-runtime-integration-local.md` e o handoff correspondente ao Planner Web; aceitar a decisão dele como final.

---

## Histórico anterior — Baseline Canônico de Migrações Supabase & Hardening (PR #464)

> Atualizado: 2026-07-28  
> Projeto: **NOVO-APP**  
> Branch Ativa: `fix/canonical-supabase-migration-baseline`  
> PR Ativa: **#464** (Draft, Mergeável, Base `main`)  
> HEAD Commit SHA: `a8a07919a606969fc34c7daee4ec41ca72f48b57`  
> Vault Narrative: [[2026-07-28T17-25-00-fix-canonical-supabase-migration-baseline|Nota de Handoff no Bruno Vault]]

---

## 1. Estado da PR #464 & Migrações

- **Objetivo:** Substituir a cadeia de migrações corrompida por um baseline canônico nativo do schema de Produção e aplicar o hardening de privilégios e identidade (least privilege).
- **Status:** **CONCLUÍDO / AGUARDANDO AUTORIZAÇÃO DO ORQUESTRADOR**
- **Cadeia de Migrações (21 arquivos ativos com timestamps de 14 dígitos):**
  - `20260501000000_production_schema_baseline.sql`: Dump nativo PG 17 do schema `public` de Produção (`vmqfcaoirjcfucvlnpig`). Sem objetos do schema `auth`, sem `auth.users`, sem `auth.uid()`, e com extensões canônicas (`pg_trgm`, `pgcrypto`, `uuid-ossp`).
  - **18 Marcadores no-op de Produção:** Preservam os timestamps canônicos de Produção sem executar DDL redundante.
  - `20260728173731_harden_dossier_grants.sql`: Restringe privilégios em `dossier_runs`, `dossies`, `profiles` e `handle_new_user()` para o princípio do menor privilégio.
  - `20260728180000_harden_legacy_operator_linking.sql`: Hardening da RPC `link_legacy_operator` (exige `auth.uid()` igual a `p_auth_user_id`, e-mail obrigatório e correspondente ao perfil autenticado e ao `user_context`, `SECURITY DEFINER`, `search_path = ''` e ACL restrita a `authenticated`).

---

## 2. Validação & Garantias de Qualidade

- **Paridade de Catálogo:** 15 categorias de catálogo comparadas individualmente contra Produção (incluindo `pg_get_constraintdef` para 37/37 constraints, `pg_get_functiondef`, RLS, views, triggers e grants).  
  `PRODUCTION_BASELINE_CATALOG_DIFF: ZERO`.
- **Replay Local & `db push`:**
  - `BASELINE_PSQL_EXIT_CODE: 0` (Replay estrito com `-v ON_ERROR_STOP=1` em PostgreSQL 17 local).
  - `FULL_CHAIN_PUSH_EXIT_CODE: 0` (`npx supabase db push` registrou 21 migrações limpas).
- **Testes PostgreSQL Runtime:**
  - `scripts/test_harden_dossier_grants.sql`: Todos os asserts passaram.
  - `scripts/test_harden_identity.sql`: 11/11 asserts de segurança e negação de UPDATE direto de `operator_id` passaram.
- **Suíte Vitest Contratos:** 61/61 asserções de contrato de migração aprovadas em `tests/contracts/`.
- **Gates Estáticos:** `git diff --check` zerado; `npm run lint` zerado (0 erros).

---

## 3. Restrições Estritas

- NÃO aplicar migrações remotamente em Preview ou Produção.
- NÃO executar `migration repair` nem `db push` remoto.
- NÃO alterar a PR #456.
- NÃO fazer force push.
- NÃO marcar Ready e NÃO fazer merge sem palavra-chave `MERGE` e autorização do orquestrador.

---

## 4. Próxima Ação

Aguardar a validação final do orquestrador Bruno. Se autorizada com a instrução contendo a palavra `MERGE`, marcar a PR #464 como Ready e realizar o squash merge na `main`.

---

## 2026-08-02 — 05E.0A runtime target freeze + harness local

- Planner decidiu `RUNTIME_PROOF_TARGET=SERVER_OWNED_END_TO_END_MULTI_CALL`; o waterfall cliente é somente baseline.
- Helper canônico: `api/_dossier-server-pipeline.ts`; envelope futuro: `api/dossier.ts`; nenhuma integração foi feita neste lote.
- Criados `scripts/proofs/dossier-300s-runtime/` e `tests/proofs/dossier-300s-runtime/` com relógio virtual, budget 300s/270s/30s e guard de `api/`.
- Gates: 17/17 harness; 67/67 testes focados API/contrato; typecheck, lint focado, build e `git diff --check` passaram.
- Exercício direto: 8 chamadas LLM sintéticas, 12 buscas sintéticas, 1 benchmark sintético; provider/rede/Supabase/Preview/Produção = zero.
- Bloqueio explícito: helper ainda não possui retry, reconciliação PORTA ou persistência terminal; `READY_FOR_05E_0B_PREVIEW_REAL_PROVIDER_PROOF=NO`.
- `api/` preservado; R3 SHA-256 preservado; contagem efetiva Vercel/Fluid Compute permanece `NOT_VERIFIED`.
- Checkpoint: `docs/checkpoints/2026-08-02-dossier-flow-05e0a-runtime-target-freeze.md`.
- Pacote canônico: `docs/checkpoints/2026-08-02-dossier-flow-05e0a-canonical-package.md`.
- Handoff: `docs/handoffs/2026-08-02-dossier-flow-05e0a-runtime-handoff.md`.
- Próxima ação: aguardar adjudicação do Planner para resolver recovery/persistência antes de qualquer B1 Preview.

## 2026-08-02 — 05E.0B Gate Zero / bloqueio de contrato durável

- **Worktree/branch:** `/private/tmp/novo-app-dossier-flow-05a` / `codex/dossier-flow-server-owned-05a`; source head `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`.
- **Gate Zero:** PASS local. `api/dossier.ts` declara `maxDuration: 300` no objeto `config`; Build Output local materializou `runtime=nodejs24.x`, `maxDuration=300` e manteve 9 Functions API + middleware.
- **Adjudicação Planner:** `FINAL_DECISION=BLOCKED_BY_EXISTING_DATABASE_CONTRACT`; `RUNTIME_IMPLEMENTATION=NOT_STARTED`; `RUNTIME_READINESS=NOT_PROVEN`.
- **Causa:** o schema versionado contém lease e finalização atômica, mas não contém `attempt`, `step_key`, checkpoint digest/payload, pipeline version ou RPC de resume/fencing por step. Não substituir isso por estado em memória.
- **Artefatos:** `docs/checkpoints/2026-08-02-dossier-flow-05e0b-contract-blocked.md`, `docs/checkpoints/2026-08-02-dossier-flow-05e0b-contract-canonical-package.md`, `docs/handoffs/2026-08-02-dossier-flow-05e0b-contract-blocked.md`.
- **Próximo cartão:** `DOSSIER-FLOW-05E.0C-CHECKPOINT-CONTRACT-01` para migration/RPC/tabela local, replay PostgreSQL e prova de fencing/resume; Node 24.x deve ser validado antes do fechamento.
- **Não executado:** nenhum provider real, Preview, Produção, migration remota, commit, push, merge ou fechamento do goal. Estado remoto da migration permanece `NÃO VERIFICADO`.

## 2026-08-02 — 05E.0C contrato de checkpoint comprovado localmente

- **Worktree/branch:** `/private/tmp/novo-app-dossier-flow-05a` / `codex/dossier-flow-server-owned-05a`; source head `a65f425b579ae429d9dd3823b0721a1a1d7d52bf`.
- **Resultado:** `CHECKPOINT_CONTRACT_LOCALLY_PROVEN`. Uma migration nova materializa exatamente duas tabelas e oito RPCs para attempt/checkpoint/fencing/retry/resume.
- **Provas:** replay completo em dois bancos PG 17.10, funcionalidade SQL e concorrência em conexões independentes passaram; evidência em `/tmp/dossier-flow-05e0c-proof.pGMvJY`.
- **Gates Node 24:** typecheck, lint (0 erros/61 avisos), build, diff-check, contratos 136/136 e suíte global 1.668/1.668 passaram. Vercel build local materializou `nodejs24.x`/`maxDuration=300`.
- **Fronteira:** migration somente local; runtime/API/frontend, provider, Preview, Produção, commit, push e merge continuam bloqueados. `RUNTIME_READINESS=NOT_PROVEN`.
- **Artefatos:** `docs/checkpoints/2026-08-02-dossier-flow-05e0c-contract-proven.md`, `docs/checkpoints/2026-08-02-dossier-flow-05e0c-contract-canonical-package.md`, `docs/handoffs/2026-08-02-dossier-flow-05e0c-contract-handoff.md` e Vault `2026-08-02T12-15-00-dossier-flow-05e0c-contract-proven.md`.
- **Próximo passo:** enviar o veredito ao Planner Web e aguardar cartão explícito de integração 05E.0B; reler `licoes` antes da próxima etapa.

## Atualização 05E.0C-R1 — 2026-08-02

- Planner aprovou `CHECKPOINT_CONTRACT_LOCALLY_PROVEN` após prova local de resume, conclusões concorrentes e baseline global por identidade.
- Evidência: `/tmp/dossier-flow-05e0c-r1.bILGP4`; `SOURCE_HEAD` 461 suítes/1.589 testes/0 falhas; alvo 481/1.670/0; nenhuma falha nova.
- Drive complementar pesquisado; histórico anterior à R1, sem divergência. Worktree local continua fonte primária.
- Migration inalterada; nenhum runtime/API/frontend, remoto, Preview, Produção, commit, push, CI remoto, deploy ou merge foi executado.
- Próximo passo: novo cartão explícito para 05E.0B; goal permanece aberto.
