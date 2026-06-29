# Active Context

Last updated: 2026-06-26 — Marathon session closeout: Sprint 1 + Sprint 2 concluidos

## STATUS ATUAL: PRONTO PARA REVISAO FINAL

- **Branch atual:** `refac/litellm-clean`
- **Base com Sprints:** `origin/stabilize/from-production-fe6c6f9` — contem ambas as Sprints
- **PRs mergeadas:** [#389](https://github.com/brunolimaff-jpg/NOVO-APP/pull/389) (Sprint 1 — cherry-picks), [#390](https://github.com/brunolimaff-jpg/NOVO-APP/pull/390) (Sprint 2 — LiteLLM)
- **Tags:** `fase-1-done`, `fase-2-done`
- **Plano maior:** https://github.com/brunolimaff-jpg/NOVO-APP/issues/386
- **Fase:** Sprint 1 + Sprint 2 concluidos. 0 BLOCKER. Proximo: Sprint 3.

## O que foi entregue

### Sprint 1 (PR #389)

- 3/5 cherry-picks: PR #379 (Cron), PR #380 (QSA knownCnpjs), Sentry
- 2 abortados por conflito massivo: MCP config, PR #383
- Limpeza: ChatInterface.tsx restaurado, scar tissue confirmado como parte fe6c6f9
- 11 threads resolvidas, squash merged, tag `fase-1-done`

### Sprint 2 (PR #390)

- 4 novos arquivos: `api/_llm-client.ts`, `utils/llm/modelRouter.ts`, `utils/llm/types.ts`, `api/ping-litellm.ts`
- 5 modificados: `api/gemini.ts`, `investigation-orchestration.ts`, `waterfall-orchestrator.ts`, `foundation-cache.ts`, `SectionalBotMessage.tsx`
- 64 threads resolvidas (Gemini Code Assist + 7 rodadas Cursor + 1 security review Cursor)
- 13 commits, squash merged, tag `fase-2-done`
- 10 bugs corrigidos: 2 P0, 4 P1, 1 P5 + 3 infra
- Validacao completa: typecheck, build, 1489/13 testes, ping, dossie, freeze

## HEAD

- **DI-2026-06-26-01:** Cherry-pick inviavel para commits >5 arquivos com cross-cutting
- **DI-2026-06-26-02:** useStaticTimelineFallback e blankPanelTelemetry sao parte de fe6c6f9
- **DI-2026-06-26-03:** Roteamento 100% server-side via selectModelForModule
- **DI-2026-06-26-04:** useGrounding removido, Score PORTA recalibrado
- **DI-2026-06-26-05:** LiteLLM gate unico (LLM_PROVIDER flag)
- **DI-2026-06-26-06:** Foundation cache desliga com VITE_HYBRID_PIPELINE_ENABLED=1

## Proximo: Sprint 3

- Recalibrar Score PORTA sem grounding
- Fallback Gemini em erro LiteLLM
- Unificar flags VITE_HYBRID_PIPELINE_ENABLED + LLM_PROVIDER
- Testes unitarios modelRouter + LiteLLM gate
- Remover CodeRabbit do repo
- 13 testes fail + 8 erros lint (debito fe6c6f9)
- MIGRATION_DEADLINE (debito fe6c6f9)

## Proximos passos

- 13 testes falham — todos pre-existentes em fe6c6f9 (MIGRATION_DEADLINE expirado)
- Pipeline hibrido NAO esta ativo em producao (LLM_PROVIDER default = gemini)
- Grounding removido afeta Score PORTA — recalibracao pendente
- Foundation cache desliga automaticamente quando pipeline hibrido ativo
- Branch `refac/litellm-clean` pode ser removida — commits estao em origin/stabilize/from-production-fe6c6f9
