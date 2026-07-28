# HANDOFF AI — Baseline Canônico Supabase MERGEADO na Main (PR #464)

> Atualizado: 2026-07-28  
> Projeto: **NOVO-APP**  
> Main SHA Atual: `8a9806291189c6f77588ce8413a983008173d936`  
> PR Mergeada: **#464** (Squash Merge, Branch `fix/canonical-supabase-migration-baseline` preservada)  
> Vault Narrative: [[2026-07-28T18-17-00-encerramento-pr464-baseline-canonical-merged|Nota de Encerramento no Bruno Vault]]

---

## 1. Estado da Main & Migrações

- **Status:** **PR #464 MERGEADA COM SUCESSO NA MAIN**
- **Cadeia Canônica de Migrações (21 arquivos ativos na `main`):**
  - `20260501000000_production_schema_baseline.sql`: Dump nativo PG 17 do schema `public` de Produção (`vmqfcaoirjcfucvlnpig`). Sem objetos do schema `auth`, sem `auth.users`, sem `auth.uid()`, e com extensões canônicas (`pg_trgm`, `pgcrypto`, `uuid-ossp`).
  - **18 Marcadores no-op de Produção:** Preservam os timestamps canônicos de Produção sem executar DDL redundante.
  - `20260728173731_harden_dossier_grants.sql`: Restringe privilégios em `dossier_runs`, `dossies`, `profiles` e `handle_new_user()` para o menor privilégio.
  - `20260728180000_harden_legacy_operator_linking.sql`: Hardening da RPC `link_legacy_operator` (`SECURITY DEFINER`, `search_path = ''`, validação de ownership `auth.uid()`, e-mail de perfil correspondente e ACL restrita a `authenticated`).

---

## 2. Evidência de Paridade & Qualidade

- **Paridade de Catálogo:** 15 categorias de catálogo comparadas contra Produção (`vmqfcaoirjcfucvlnpig`), incluindo `pg_get_constraintdef` para 37/37 constraints.  
  `PRODUCTION_BASELINE_CATALOG_DIFF: ZERO`.
- **Replay Local & `db push`:** Replay PSQL exit 0; `npx supabase db push` local registrou 21 migrações limpas.
- **Testes Runtime & Vitest:** Testes PostgreSQL runtime de grants e identidade (11/11 asserts) e suíte vitest (61/61 asserções) aprovados.
- **CodeRabbit Review:** Acionado na transição para Ready; 0 achados bloqueantes.

---

## 3. Próxima Ação

Aguardar o plano controlado de reconciliação remota para os ambientes de Preview (`xlvsrnbynpawgfapowec`) e Produção.
