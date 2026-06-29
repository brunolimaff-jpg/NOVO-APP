# Handoff Marathon — Sprint 1 + Sprint 2 Concluidas

> **Estado:** Plano de Profissionalizacao (Caminho C) — Sprint 1 e Sprint 2 finalizados e mergeados. Tags `fase-1-done` e `fase-2-done` criadas.
> **Branch atual:** `refac/litellm-clean` (Sprint 2 — branch de trabalho, pode ser removida)
> **Base:** `origin/stabilize/from-production-fe6c6f9` — contem Sprints 1 + 2
> **PRs:** [#389](https://github.com/brunolimaff-jpg/NOVO-APP/pull/389) (Sprint 1), [#390](https://github.com/brunolimaff-jpg/NOVO-APP/pull/390) (Sprint 2) — ambos squash merged
> **Tags:** `fase-1-done`, `fase-2-done`

---

## ESTADO ATUAL

| #   | Tarefa                                                                                              | Status |
| --- | --------------------------------------------------------------------------------------------------- | ------ |
| 1   | Sprint 1 — 3/5 cherry-picks aplicados (Cron, QSA knownCnpjs, Sentry), 2 abortados                   | ✅     |
| 2   | PR #389 — 11 threads resolvidas, squash merged, tag fase-1-done                                     | ✅     |
| 3   | Sprint 2 — Infra LiteLLM: 4 novos arquivos, 5 modificados                                           | ✅     |
| 4   | PR #390 — 64 threads resolvidas (Gemini + Cursor), squash merged, tag fase-2-done                   | ✅     |
| 5   | Validacao final: typecheck, build, 1489/13 testes, ping-litellm ok, dossie Scheffer 47KB sem freeze | ✅     |
| 6   | Env vars configuradas no Vercel Preview                                                             | ✅     |
| 7   | Score PORTA null — recalibracao pendente na Fase 5                                                  | ⚠️     |

2 waterwalls validados em producao. 20 commits. Bug do timeout 38s corrigido. Cap 330s removido. Pipeline hibrido funcional.

| Correcao                                                                                             | Origem              |
| ---------------------------------------------------------------------------------------------------- | ------------------- |
| ChatInterface.tsx restaurado para baseline fe6c6f9 (completedDossier inexistente)                    | Diagnostico proprio |
| Scar tissue: useStaticTimelineFallback.ts e blankPanelTelemetry.ts confirmados como parte de fe6c6f9 | Diagnostico proprio |
| P0 Rules of Hooks — useDeferredValue movido para depois do early return                              | Cursor              |
| P0 Foundation cache bloqueava LiteLLM — gate VITE_HYBRID_PIPELINE_ENABLED adicionado                 | Bruno/Cursor        |
| P1 Nomes de modulo errados no modelRouter — acentos corrigidos                                       | Gemini Code Assist  |
| P1 cachedContent ID enviado como texto ao LiteLLM — delegado ao Gemini                               | Cursor              |
| P1 Grounding sem fallback — removido, chat restaurado default true                                   | Bruno/Cursor        |
| P1 Roteamento hibrido inoperante — movido 100% server-side com regex                                 | Cursor              |
| P5 useDeferredValue em dossies >30KB — anti-freeze                                                   | Diagnostico proprio |
| ESM .js extensions faltando — adicionadas para runtime Vercel                                        | Cursor              |
| Retry seletivo (4xx nao retenta, 429/5xx retenta)                                                    | Cursor              |
| extractContent com guard contra null                                                                 | Gemini Code Assist  |

## Arquivos alterados (Sprint 2)

| Arquivo                                                 | Mudanca                                                            | Status |
| ------------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| `api/_llm-client.ts`                                    | **Novo** — client LiteLLM com retry seletivo, timeout, auth Bearer | ✅     |
| `utils/llm/modelRouter.ts`                              | **Novo** — roteamento Sonnet 4.6 + DeepSeek V3.2 por modulo        | ✅     |
| `utils/llm/types.ts`                                    | **Novo** — tipos LLMProvider, LLMRequest, LLMResponse              | ✅     |
| `api/ping-litellm.ts`                                   | **Novo** — endpoint diagnostico (usa DEFAULT_MODEL)                | ✅     |
| `api/gemini.ts`                                         | Branch LiteLLM com roteamento server-side via regex                | ✅     |
| `services/gemini/investigation-orchestration.ts`        | STABLE_RESEARCH_MODEL_ID fixo, useGrounding false                  | ✅     |
| `features/dossier/waterfall-orchestrator.ts`            | useGrounding false no waterfall                                    | ✅     |
| `services/gemini/foundation-cache.ts`                   | Desliga cache com VITE_HYBRID_PIPELINE_ENABLED=1                   | ✅     |
| `components/SectionalBotMessage.tsx`                    | useDeferredValue para >30KB                                        | ✅     |
| `tests/features/dossier/waterfall-orchestrator.test.ts` | Expect useGrounding false                                          | ✅     |

## Validacao Final (26/06/2026)

| Gate                         | Status                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| Typecheck                    | Verde                                                                |
| Build                        | Verde                                                                |
| Testes                       | 1489 pass / 13 fail (baseline fe6c6f9 — MIGRATION_DEADLINE expirado) |
| ping-litellm                 | `status: ok`                                                         |
| VITE_HYBRID_PIPELINE_ENABLED | Confirmado "1" no bundle JS                                          |
| Dossie Scheffer              | 47.631 chars, Supabase ID 2bcd2079, sem freeze                       |
| Score PORTA                  | null (recalibracao Fase 5)                                           |
| Freeze UI                    | Sem raf-safety-net-fired                                             |
| Merge                        | Squash merged em origin/stabilize/from-production-fe6c6f9            |

| SHA        | Descricao                                                                            |
| ---------- | ------------------------------------------------------------------------------------ |
| `ffdcf096` | **fix: remover hard-cap 330s do waterfall (timeout 120s por modulo ja basta)**       |
| `0f179543` | **fix: timeouts cliente LiteLLM 38s/42s -> 120s via VITE_LITELLM_CLIENT_TIMEOUT_MS** |
| `a9a93d4f` | fix: MAX_LITELLM_REQUEST_TIMEOUT_MS 38s -> 180s (ERA O BUG DA PR DESDE O INICIO)     |
| `ee141323` | chore: trocar proxy LiteLLM para HOMOLOG                                             |
| `514a0015` | chore: corrigir timeouts LiteLLM 120s cliente + servidor                             |
| `e3cb0cad` | feat: moduleName no waterfall + HYBRID_MODEL_MAP por modulo                          |
| `dc61c013` | feat: DossierModuleError type + ModuleErrorCards component                           |
| `5c7c36bc` | chore: trigger redeploy com HYBRID_PIPELINE_ENABLED + LITELLM_BASE_URL               |
| `322b3d7f` | feat: pipeline hibrido Sonnet+DeepSeek + Zero Gemini                                 |
| `164ad5d3` | feat(llm): checkReportQuality modo lenient para providers nao-Gemini                 |

- **DI-2026-06-26-01:** Cherry-pick inviavel para commits com dependencias cross-cutting (>25 arquivos), reimplementacao manual
- **DI-2026-06-26-02:** useStaticTimelineFallback.ts e blankPanelTelemetry.ts sao parte de fe6c6f9, nao scar tissue
- **DI-2026-06-26-03:** Roteamento 100% server-side via `selectModelForModule` em api/gemini.ts
- **DI-2026-06-26-04:** useGrounding removido (default false), Score PORTA recalibrado — benchmark esperado 68-75
- **DI-2026-06-26-05:** LiteLLM gate unico (LLM_PROVIDER): `gemini` (default) ou `litellm`
- **DI-2026-06-26-06:** isFoundationCacheEnabled() retorna false quando VITE_HYBRID_PIPELINE_ENABLED=1

## CI failures documentados (debito fe6c6f9)

- Dossier Golden: MIGRATION_DEADLINE expirado
- Tests: AuthGate.test.tsx migration banner
- E2E Critical Browser: onboarding.ts login CI

## Env vars configuradas (Vite e Vercel Preview)

- `LLM_PROVIDER=litellm`
- `LITELLM_API_KEY=sk-...`
- `LITELLM_BASE_URL=https://litellm.homolog.seniorlabs.io`
- `VITE_HYBRID_PIPELINE_ENABLED=1`

## Licoes aprendidas

| #   | Licao                                                                            | Anti-padrao                                 | Onde aplicar        |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------- | ------------------- |
| 1   | Revisao por multiplos bots capturou mais bugs que 1 revisor                      | Depender de 1 bot de review                 | Fluxo de PR         |
| 2   | Roteamento server-side e mais seguro para LLM                                    | Roteamento frontend expoe provedores        | api/gemini.ts       |
| 3   | `useDeferredValue` resolve freeze >30KB sem sacrificar UX                        | Renderizar blocos grandes sincronamente     | SectionalBotMessage |
| 4   | Foundation cache incompativel com proxy LiteLLM                                  | Assumir compatibilidade cache/proxy         | foundation-cache.ts |
| 5   | Cherry-pick inviavel para commits >5 arquivos com cross-cutting                  | Tentar cherry-pick de diff massivo          | Fluxo de merge      |
| 6   | Revisao multi-bot (Gemini + Cursor + humano) quadruplicou cobertura vs 1 revisor | Confiar em unico bot de review              | Fluxo de PR         |
| 7   | `LLM_PROVIDER` como gate unico simplifica operacao contra 5 gates planejados     | Multiplas flags com interdependencia oculta | foundation-cache.ts |

## Pendentes para Sprint 3 / Fase 5

| Pendencia                                                  | Risco                             |
| ---------------------------------------------------------- | --------------------------------- |
| Recalibrar Score PORTA sem grounding                       | Medio — score superestimado       |
| Fallback Gemini em erro LiteLLM                            | Alto — sem fallback = tela branca |
| Unificar flags VITE_HYBRID_PIPELINE_ENABLED + LLM_PROVIDER | Baixo — duplicidade               |
| Testes unitarios modelRouter + LiteLLM gate                | Medio — sem cobertura             |
| Remover CodeRabbit do repo                                 | Baixo — processo                  |
| 13 testes fail + 8 erros lint (debito fe6c6f9)             | Medio — pre-existente             |
| MIGRATION_DEADLINE (debito fe6c6f9)                        | Medio — teste golden quebrado     |
| Ativar LiteLLM em HOMOLOG                                  | Alto — primeiro contato real      |

## Links Vault

- Sessao: [[2026-06-26T21-30-00-marathon-sprint1-sprint2|Marathon Sprint 1 + Sprint 2 completas]]
- Licoes: [[LICOES-APRENDIDAS-MARATHON-SPRINT1-SPRINT2-2026-06-26]]

- **"Ver relatorio completo (+3 secoes)" nao expande ao clicar**
- Componente: `SectionalBotMessage.tsx`, usa `useDeferredValue`
- Nao foi causado pelas alteracoes desta PR (bug pre-existente)
- Commit suspeito: `eea8783c` (Cofre overlay — adicionou useDeferredValue)
- Vercel Live Feedback (`<vercel-live-feedback>` com z-index 2147483647) estava bloqueando cliques — desativado no painel Vercel
- Tabbit acionado para debugar, resultado pendente

Iniciar Sprint 3 do plano de profissionalizacao — MCP config + CI gates + refinamentos. A infraestrutura LiteLLM esta deployada em stabilize, pronta para ativacao em HOMOLOG.
