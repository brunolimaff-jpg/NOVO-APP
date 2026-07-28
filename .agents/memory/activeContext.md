# Active Context

Last updated: 2026-07-28 — PR #464 baseline nativo PG 17 & least privilege hardening completo

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

## Próxima ação

Aguardar autorização do orquestrador Bruno. Se autorizada com token `MERGE`, marcar a PR #464 como Ready e fazer squash merge na `main`.
