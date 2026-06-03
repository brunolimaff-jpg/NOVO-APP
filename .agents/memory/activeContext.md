# Active Context

Last updated: 2026-06-03 — PR #331 MERGED em `main`

## Boot

`docs/ai-context/refactor/loading-panel-contract.md`

## Estado

- **PR #331** mergeada (`eab12e20`): handoff estático síncrono pós-waterfall, P0 watchdog, refs PostCompletion, telemetria stuck-viewport-*.
- **Validação Bruno (preview):** pós-overlay OK (PORTA, mapa societário, dossiê visível). Travada só durante loading em Bordas de Controle (~53s) — backlog separado.
- **PR #330** já em `main` (`d4849aa7`).

## Próximo passo

1. Smoke produção Scheffer após deploy Vercel de `main`.
2. PR separada: loading hero (Bordas/Compliance + `gemini` pendente) e/ou SocietaryMap performance.
3. WIP local fora do merge: `LoadingSmart`, `SocietaryMap`, `waterfall-orchestrator` (não commitados).

## Ponteiros

- PR #331: https://github.com/brunolimaff-jpg/NOVO-APP/pull/331 (MERGED)
- Handoff #330: `docs/handoffs/2026-06-03-pr330-scheffer-blank-panel.md`
