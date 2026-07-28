# HANDOFF AI — Baseline Canônico de Migrações Supabase & Hardening (PR #464)

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
