# Handoff Sprint 2 — LiteLLM Infrastructure Validated

> **Estado:** Sprint 2 do plano de profissionalizacao (Caminho C) concluida e validada.
> **Branch:** `refac/litellm-clean` — commit `ba6e0a0c`
> **Base:** `stabilize/from-production-fe6c6f9`
> **PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/390 — **MERGEABLE**, 24/24 threads resolvidas
> **Preview Vercel:** https://scoutagro-ngx18jvgf-brunolimaff-3629s-projects.vercel.app

---

## Resumo da Sessao

| #   | Tarefa                                                                            | Status |
| --- | --------------------------------------------------------------------------------- | ------ |
| 1   | Infraestrutura LiteLLM com 1 gate (nao 5): client, modelRouter, ping              | ✅     |
| 2   | api/gemini.ts branch LiteLLM no handler generateContent                           | ✅     |
| 3   | investigation-orchestration: STABLE_RESEARCH_MODEL_ID fixo, useGrounding removido | ✅     |
| 4   | useDeferredValue em SectionalBotMessage.tsx (>30KB)                               | ✅     |
| 5   | Correcoes pos-review (8 commits, 24 threads) — Gemini + Cursor                    | ✅     |
| 6   | Validacao preview Vercel: typecheck, build, testes, ping, CNPJ, dossie, score     | ✅     |

## Correcoes aplicadas

| Correcao                                               | Origem              | Onde                                    |
| ------------------------------------------------------ | ------------------- | --------------------------------------- |
| modelRouter normalize provider                         | Gemini Code Assist  | utils/llm/modelRouter.ts                |
| Retry config duplicado removido                        | Cursor              | api/\_llm-client.ts                     |
| Timeout inconsistente homogeneizado                    | Cursor              | api/\_llm-client.ts                     |
| Roteamento 100% server-side (selectModelForModule)     | Cursor              | api/gemini.ts                           |
| useGrounding removido (false)                          | Bruno/Cursor        | investigation-orchestration.ts          |
| useDeferredValue em SectionalBotMessage >30KB          | Diagnostico proprio | components/chat/SectionalBotMessage.tsx |
| 4 intencionais mantidos (cache, fallback, retry, ping) | Revisao             | —                                       |

## Arquivos alterados

| Arquivo                                        | Mudanca                                                 | Status |
| ---------------------------------------------- | ------------------------------------------------------- | ------ |
| api/\_llm-client.ts                            | Novo — client LiteLLM com retry, timeout, auth Bearer   | ✅     |
| utils/llm/modelRouter.ts                       | Novo — roteamento Sonnet 4.6 + DeepSeek V3.2 por modulo | ✅     |
| utils/llm/types.ts                             | Novo — tipos LLMProvider, LLMRequest, LLMResponse       | ✅     |
| api/ping-litellm.ts                            | Novo — endpoint diagnostico (usa DEFAULT_MODEL)         | ✅     |
| api/gemini.ts                                  | Branch LiteLLM no handler generateContent               | ✅     |
| services/gemini/investigation-orchestration.ts | STABLE_RESEARCH_MODEL_ID fixo, useGrounding false       | ✅     |
| components/chat/SectionalBotMessage.tsx        | useDeferredValue para >30KB                             | ✅     |

## Validacao final (26/06/2026)

| Gate            | Status                                   |
| --------------- | ---------------------------------------- |
| Typecheck       | Verde                                    |
| Build           | Verde                                    |
| Testes          | 1488 pass / 14 fail (baseline fe6c6f9)   |
| Ping LiteLLM    | `status: ok`                             |
| CNPJ API        | Scheffer, 6 socios                       |
| Dossie Scheffer | Completo, sem freeze                     |
| Score PORTA     | 82                                       |
| Supabase        | ID: 5d45cc3b-b598-462f-a074-6f0d8213ca07 |
| Grounding       | Timeout ignorado → DuckDuckGo fallback   |

## Decisoes desta sessao

- **DI-2026-06-26-03:** Roteamento de LLM e 100% server-side via `api/gemini.ts` (`selectModelForModule`). Client-side (`investigation-orchestration.ts`) mantem `STABLE_RESEARCH_MODEL_ID` fixo. Nao ha roteamento no frontend.
- **DI-2026-06-26-04:** `useGrounding` removido (default false). Score PORTA recalibrado apos — benchmark esperado 68-75 (vs 82 atual). Sprint 3 recalibrara metricas.
- **DI-2026-06-26-05:** LiteLLm gate unico (nao 5 gates como planejado originalmente). Flag `LLM_PROVIDER` controla: `gemini` = direto (default), `litellm` = via proxy. Ambiente ativo: DEV apenas.

## Lições aprendidas

| #   | Licao                                                                                | Anti-padrao / o que evitar                | Onde aplicar        |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------- |
| 1   | Revisao por multiplos bots (Gemini + Cursor) capturou mais bugs que um unico revisor | Depender de 1 bot de review               | Fluxo de PR         |
| 2   | Roteamento server-side e mais seguro que client-side para LLM                        | Roteamento no frontend (expõe provedores) | api/gemini.ts       |
| 3   | `useDeferredValue` resolve freeze com >30KB de conteudo sem sacrificar UX            | Renderizar blocos grandes sincronamente   | SectionalBotMessage |

## Pendentes para Sprint 3

| Pendencia                                                                 | Risco                        |
| ------------------------------------------------------------------------- | ---------------------------- |
| Recalibrar metricas Score PORTA (sem grounding, benchmark 68-75)          | Medio — score superestimado  |
| Ativar LiteLLM em HOMOLOG (LLM_PROVIDER=litellm) com foundation cache off | Alto — primeiro contato real |
| Validar dossie real com pipeline hibrido Sonnet + DeepSeek                | Alto — pipeline novo         |
| Testes unitarios modelRouter + LiteLLM gate                               | Medio — sem cobertura        |
| Remover CodeRabbit do repo                                                | Baixo — processo             |

## Proximo passo

Sprint 3: Recalibrar Score PORTA + ativar LiteLLM em HOMOLOG + validar dossie real com pipeline hibrido.
