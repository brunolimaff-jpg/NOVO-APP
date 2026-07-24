# Active Context

Last updated: 2026-07-24 — PR4 code gate aprovado e Preview Supabase isolado

## Estado atual

- **Plano:** estabilização do dossiê e migração LiteLLM.
- **Worktree:** `/Users/brunolima/Documents/NOVO-APP-dossie-pr4-gateway`.
- **Branch:** `codex/dossie-pr4-gateway`.
- **PR3:** `#450`, head `3b929f7b4d2be01e9b9c1d33e753599b96f98355`, code gate aprovado e release gate bloqueado.
- **PR4:** `#451`, draft, base `codex/dossie-pr3-lifecycle`, mergeável e code gate aprovado.
- **Head funcional PR4 antes do checkpoint documental:** `5807e630a3134b321847b900293b6b59f4622868`.
- **Checkpoint:** `docs/checkpoints/2026-07-24-pr4-code-gate-e-preview-isolado.md`.

## Preview

- Deployment Git READY no head funcional da PR4; commit match confirmado; 10 Functions.
- Supabase Produção: `vmqf…npig`, sem alteração.
- Supabase Preview: `scoutagro-preview`, `xlvs…owec`, `sa-east-1`, `ACTIVE_HEALTHY`.
- Isolamento Preview/Produção: **CONFIRMADO**.
- Cinco envs Supabase configurados somente no Preview.
- LiteLLM Preview: base URL, API key e alias geral presentes; alias de chat ausente e opcional.
- Um novo deployment Preview é necessário para aplicar os envs.

## Gates e pendências

- PR4: 65 testes focados, build e zero erro novo de typecheck nos arquivos alterados, conforme code gate registrado.
- Migration PR3, SQL, validação RPC/RLS, usuário/run controlados e smoke autenticado ainda não executados.
- Tests, Typecheck, Dossier Golden e E2E Critical Browser permanecem falhas amplas preexistentes.
- Próxima ação autorizável: novo deployment Preview; depois validar refs efetivos antes de qualquer migration.

## Fronteiras

- PR5: Brave, RAG, EvidencePack e tools/function calling.
- PR6: waterfall, persistência, UI e cutover; antes, resolver proprietário único da lease.
- Sem migration, SQL, smoke, ready ou merge sem autorização humana específica.
