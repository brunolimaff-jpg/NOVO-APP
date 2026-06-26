# Active Context

Last updated: 2026-06-26 — Sprint 2 validada: infraestrutura LiteLLM

## Estado Atual

- **Branch:** `refac/litellm-clean` — commit `ba6e0a0c`
- **Base:** `stabilize/from-production-fe6c6f9`
- **PR #390:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/390 — **MERGEABLE**, 24/24 threads resolvidas
- **Preview Vercel:** https://scoutagro-ngx18jvgf-brunolimaff-3629s-projects.vercel.app
- **Projeto:** Plano de Profissionalizacao — Caminho C (LiteLLM infrastructure)
- **Plano maior:** https://github.com/brunolimaff-jpg/NOVO-APP/issues/386

## O que foi entregue nesta sessao (Sprint 2)

- **Novos arquivos (4):** `api/_llm-client.ts`, `utils/llm/modelRouter.ts`, `utils/llm/types.ts`, `api/ping-litellm.ts`
- **Arquivos modificados (2):** `api/gemini.ts` (branch LiteLLM), `investigation-orchestration.ts` (useGrounding removido)
- **Patches (2):** `useDeferredValue` em SectionalBotMessage.tsx, useGrounding removido (Score recalibrado)
- **8 commits de correcao pos-review** (24 threads: Gemini 5+1, Cursor 10+4)
- **Validacao completa:** typecheck verde, build verde, 1488/14 testes, ping LiteLLM ok, CNPJ ok, dossie completo, Score 82

## Novos arquivos-chave

- `api/_llm-client.ts` — client LiteLLM com retry seletivo, timeout, auth Bearer
- `utils/llm/modelRouter.ts` — roteamento Sonnet 4.6 + DeepSeek V3.2 por modulo
- `api/ping-litellm.ts` — endpoint diagnostico (usa DEFAULT_MODEL)
- `api/gemini.ts` — branch LiteLLM no handler `generateContent` (roteamento 100% server-side)

## Decisoes ativas

- **DI-2026-06-26-03:** Roteamento 100% server-side via `selectModelForModule` em `api/gemini.ts`. Client-side mantem STABLE_RESEARCH_MODEL_ID fixo.
- **DI-2026-06-26-04:** `useGrounding` removido (default false). Score PORTA recalibrado — benchmark esperado 68-75.
- **DI-2026-06-26-05:** LiteLLM gate unico. Flag `LLM_PROVIDER` controla: `gemini` (default) ou `litellm`. Ambiente ativo: DEV apenas.
- **DI-2026-06-26-01:** Cherry-pick inviavel para 25+ arquivos — reimplementacao manual (aplicado)
- **DI-2026-06-26-02:** useStaticTimelineFallback.ts e blankPanelTelemetry.ts sao parte de fe6c6f9

## Pendente para Sprint 3

- Recalibrar metricas Score PORTA (sem grounding, benchmark 68-75)
- Ativar LiteLLM em HOMOLOG (LLM_PROVIDER=litellm) com foundation cache off
- Validar dossie real com pipeline hibrido Sonnet + DeepSeek
- Testes unitarios modelRouter + LiteLLM gate
- Remover CodeRabbit do repo

## Atencao

- 14 testes falham — todos pre-existentes em fe6c6f9 (antes eram 13, agora 14 — variacao normal de baseline)
- LiteLLM ativo apenas em DEV. HOMOLOG e PROD usam Gemini direto (LLM_PROVIDER nao configurado = default `gemini`)
- Grounding removido afeta Score PORTA — recalibracao pendente na Sprint 3
