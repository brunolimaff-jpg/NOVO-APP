# Active Context

Last updated: 2026-06-19 — LiteLLM env Preview + fix freeze link-status (#386)

## Prioridade Atual

**PR #386 (`feat/litellm-experiment`) — aguardando validação Bruno pós-fix freeze**

- Env Vercel Preview: **18 vars** configuradas; allowlist `bruno.ferreira@senior.com.br`; experimento **V4 Flash only** (R1/Kimi 404 no LiteLLM).
- Fix freeze consolidação deployado no preview **d47bkguue** — causa H3 link-status (~6.7s) vs budget cliente (5s).
- Instrumentação debug (`agentDebugLog`, sessão `c352f8`) **ainda no código** — remover só após Bruno confirmar.
- Testes unitários freeze-diag: **15/15** passando.
- **Bloqueia merge:** validação manual waterfall no preview + token **MERGE**.

## Preview ativo

- Fix freeze: https://scoutagro-d47bkguue-brunolimaff-3629s-projects.vercel.app
- Anterior V4-only: `scoutagro-90mpwvvhr`

## PR #385 — Concluída

- Mergeada 2026-06-19 — Ondas 0–3 estabilização pós-auditoria.

## Safety nets

- DOM safety nets em `App.tsx` / `finalizeWaterfallUI.ts` **mantidos** (critério 7 dias Cofre estável).
