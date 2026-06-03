# Active Context

Last updated: 2026-06-03 — fix raiz spinner handoff pós-#330 (local)

## Boot

`docs/ai-context/refactor/loading-panel-contract.md`

## Estado

- Patch local: handoff estático síncrono (`preferStaticForLargeDossier`), deps viewport sem `safeMessages.length`, suspend respeita preview ≥200 chars, telemetria não trata placeholder como OK
- Contrato: `docs/ai-context/refactor/loading-panel-contract.md`

## Próximo passo

1. Branch `fix/post-waterfall-handoff-static-sync` + PR
2. Smoke Scheffer no preview
3. Performance trace manual se lentidão persistir (SocietaryMap — PR separada)

## Ponteiros

- PR #330 (merged): https://github.com/brunolimaff-jpg/NOVO-APP/pull/330
