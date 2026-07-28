# Active Context

Last updated: 2026-07-28 — PR #464 MERGEADA na Main (Baseline Canônico PG 17)

## Estado atual

- **Fase:** Fechamento e merge da PR #464.
- **Main SHA:** `8a9806291189c6f77588ce8413a983008173d936`.
- **PR:** `#464` (Status: `MERGED`, Método: `SQUASH`, Branch `fix/canonical-supabase-migration-baseline` preservada).
- **Vault Narrative:** [[2026-07-28T18-17-00-encerramento-pr464-baseline-canonical-merged|Bruno Vault Encerramento PR #464]].

## Migrações Canônicas na Main (21 arquivos)

- `20260501000000_production_schema_baseline.sql` (Dump nativo PG 17 do schema `public`)
- 18 marcadores no-op de Produção (preservando o histórico de timestamps)
- `20260728173731_harden_dossier_grants.sql` (Least privilege)
- `20260728180000_harden_legacy_operator_linking.sql` (Hardening de identidade e RPC)

## Paridade & Gates

- `PRODUCTION_BASELINE_CATALOG_DIFF: ZERO` (15 categorias, 37/37 constraints com `pg_get_constraintdef`).
- CodeRabbit Review: 0 achados bloqueantes.
- Replay PSQL, `db push` local, testes runtime PG e 61/61 asserções vitest aprovadas.

## Próxima ação

Aguardar o plano controlado de reconciliação remota para os bancos de Preview e Produção.
