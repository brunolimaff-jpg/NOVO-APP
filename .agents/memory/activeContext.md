# Active Context

Last updated: 2026-06-26 — Sprint 1 concluida: cherry-picks sobre fe6c6f9

## Estado Atual

- **Branch:** `stabilize/from-production-fe6c6f9` — commit `fe6c6f9ba59fb7063356a5f0adcc51c411db3c4a`
- **Branch de cherry-picks (merged):** `stabilize/fe6c6f9-cherry-picks` — merged em `origin/stabilize/from-production-fe6c6f9`
- **PR #389:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/389 (draft)
- **Preview Vercel:** https://scoutagro-1cwl2wpon.vercel.app
- **Projeto:** Plano de Profissionalizacao — Caminho C (branch limpa de producao + cherry-picks)
- **Plano maior:** https://github.com/brunolimaff-jpg/NOVO-APP/issues/386

## O que foi entregue nesta sessao (Sprint 1)

- 3/5 cherry-picks aplicados com sucesso sobre baseline fe6c6f9: PR #379 (Cron), PR #380 (CNPJ fix), Sentry
- 2 cherry-picks abortados por conflito massivo: MCP config, PR #383 (CI gates + auth lockout)
- ChatInterface.tsx restaurado para baseline (commit Sentry adicionou referencia a completedDossier inexistente)
- Validacao completa: typecheck verde, build 18.6s, preview Vercel OK, API CNPJ OK
- Merge em origin/stabilize/from-production-fe6c6f9

## Arquivos-chave (fe6c6f9 facts)

- **Parte de fe6c6f9 (nao remover):** `useStaticTimelineFallback.ts`, `blankPanelTelemetry.ts`
- **Fora de fe6c6f9:** `useCofreTransition.ts`, `CofreOverlay.tsx`, `api/_llm-client.ts`, `api/llm-experiment.ts`

## Decisoes ativas

- **DI-2026-06-26-01:** Cherry-pick inviavel para 25+ arquivos com cross-cutting — reimplementar manual na Sprint 2
- **DI-2026-06-26-02:** useStaticTimelineFallback.ts e blankPanelTelemetry.ts sao parte de fe6c6f9
- Demais decisoes em `decisions.md`

## Pendente para Sprint 2

- MCP config (`.mcp.json`) — reimplementacao manual
- CI gates (`.github/workflows/`) — reimplementacao manual
- LiteLLM core (`api/_llm-client.ts` + reestruturacao de providers)

## Atencao

- 13 testes falham, 8 erros de lint — todos pre-existentes em fe6c6f9. Nao foram introduzidos por esta sprint.
- A branch `stabilize/from-production-fe6c6f9` contem apenas producao + 3 cherry-picks seguros. Nao tem Cofre, LiteLLM, CI, ou MCP.
