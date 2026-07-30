# Active Context

Last updated: 2026-07-30 — Draft PR #466 publicada

## Estado

- PR #465 mergeada em `main`: `bd98c829`.
- PR #466 `OPEN/DRAFT`: https://github.com/brunolimaff-jpg/NOVO-APP/pull/466
- Branch `codex/secure-cross-operator-dossier-reuse`; commit funcional `6f3e128b`.
- Copy-on-access implementado por RPCs `SECURITY DEFINER`, `search_path=''`, auth obrigatória e grants mínimos.
- Migration 24 e teste PostgreSQL versionado concluídos; nenhuma aplicação remota.
- Gates: 110/110 direcionados, PG17 PASS, replay 24/24, build/lint/diff PASS, zero regressão vs `main`.

## Guardrails

- Manter a PR Draft; merge somente com `MERGE` explícito.
- Não aplicar migration, smoke pago ou escrita manual em Produção/Preview/Vercel.
- Não alterar `shared_dossiers` nem PR #456.

## Ponteiros

- `HANDOFF_AI.md`
- Vault: `/Users/brunolima/Documents/bruno vault/04 - Histórico ChatGPT/Sessões Anteriores/2026-07/2026-07-30T15-51-32-pr466-reutilizacao-segura-dossies.md`
