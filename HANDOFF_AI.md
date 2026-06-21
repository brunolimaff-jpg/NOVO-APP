# Handoff — PR #386 LiteLLM Fase 1

**Atualizado:** 2026-06-20 (ship-loop Fase 6 + Scheffer live E2E + Opção B)
**Produção:** `scoutagro.vercel.app` — `LLM_PROVIDER=gemini` (sem mudança)
**Branch:** `feat/litellm-experiment` | **HEAD remoto:** `0351441c`
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
**Preview:** `https://scoutagro-2wcoh4w5m-brunolimaff-3629s-projects.vercel.app` ou `scoutagro-git-feat-litellm-ex-cad2dc-…vercel.app`
**CNPJ teste:** Scheffer `04733767000180`

## Estado atual

| Item                                    | Status                                                        |
| --------------------------------------- | ------------------------------------------------------------- |
| CI GitHub SHA `0351441c`                | ✅ 14/14                                                      |
| Gates locais (typecheck, vitest, build) | ✅                                                            |
| PR Gate IA 16/16 no preview             | ✅                                                            |
| Spec `scheffer-research-validation`     | ✅ commitada `0351441c`                                       |
| `/api/cnpj` live (6 sócios, ~1.4s)      | ✅                                                            |
| Scheffer R3 waterfall + expand          | ✅ ~4k chars, `panelEmpty=false`                              |
| Scheffer R1 CRM (`CLIENTE SENIOR`)      | ❌ ausente em 300s                                            |
| Scheffer R2 `societary-map-shell`       | ❌ ausente em 300s                                            |
| Bug P1 expand ~26k chars                | ❌ painel vazio (manual Bruno)                                |
| `llm_experiment_runs` critério B        | ⚠️ Bruno ainda não escolheu Opção 1 vs 2                      |
| Fix causa-raiz B1/B2                    | ❌ **não implementado** — implementer bloqueou por rate limit |
| `mergeStateStatus`                      | **BLOCKED** — MERGE_READY = false                             |

## Veredito sessão

**H1 refutada:** pesquisa QSA funciona (`/api/cnpj` OK). Gargalo ≠ "modelo escreveu lixo porque pesquisa falhou".

**Gargalos reais:** (1) UI waterfall live — `ClienteSeniorScore` + `SocietaryMap` não montam no budget 300s; (2) Bug P1 — expand "ver relatório completo" deixa painel vazio em dossiês ~26k chars.

**Decisão Bruno (Opção B):** corrigir causa raiz em CRM/SocietaryMap + P1; **sem** atalhos/workarounds no E2E.

## Scheffer live E2E (`LITELLM_WATERFALL_TIMEOUT_MS=300000`)

| Teste                  | Resultado | Evidência                                       |
| ---------------------- | --------- | ----------------------------------------------- |
| R1 QSA + CRM           | ❌        | `CLIENTE SENIOR CONFIRMADO` não visível em 300s |
| R2 socio-search + mapa | ❌        | `societary-map-shell` ausente em 300s           |
| R3 waterfall Grok      | ✅        | waterfall completo; expand `panelEmpty=false`   |

**Arquivos:** `tests-e2e/scheffer-research-validation.spec.ts`, `tests-e2e/helpers/scheffer-research.ts`

## Bloqueios MERGE (ordem)

1. **B1** — CRM + SocietaryMap no waterfall live LiteLLM (`waterfall-orchestrator.ts`, `SocietaryMap.tsx`, `investigation-orchestration.ts`)
2. **B2** — Bug P1 expand (`SectionalBotMessage`, ~26k chars; contrato `docs/ai-context/refactor/loading-panel-contract.md`)
3. **Critério B** — Bruno escolhe: row `status=success` (estrita) vs `quality_failure` aceitável se UX OK
4. **Token MERGE** na mensagem

## Próximo passo (implementer)

Retomar **B1** antes de B2. Instrumentar mount de CRM/map no waterfall; correlacionar `scout_diagnostics` + `operator_events`. Re-run R1/R2 após fix. MERGE só após A+B+C+D do plano abaixo.

### Critérios MERGE_READY (resumo)

| #   | Critério              | Validar                                     |
| --- | --------------------- | ------------------------------------------- |
| A   | Bug P1                | Expand renderiza conteúdo; sem painel vazio |
| B   | `llm_experiment_runs` | Opção 1 ou 2 documentada em `decisions.md`  |
| C   | SHA limpo             | `0351441c` + fixes; WIP reconciliado        |
| D   | Gates pós-fix         | CI + PR Gate 16/16 no SHA final             |
| E   | MERGE                 | Token **MERGE** na mensagem                 |

## WIP local unstaged (não mergear)

`AGENTS.md`, `AuthGate.tsx`, `socio-search/types.ts`, `onboarding.ts`, `investigation-orchestration.ts`, `diagnosticLog.ts`, `pr386-desktop-waterfall-complete.png`, `scheffer-d47bkguue-expanded.png`, `supabase/.temp` — revisar antes de commit.

## Links

- Vault: `Bruno Vault/20-SESSOES/2026-06/2026-06-20T22-45-00-pr386-scheffer-e2e-root-cause.md`
- Decisões: DI-2026-06-20-01, **DI-2026-06-20-02** (Opção B)
- Sessão UI break: `2026-06-20T21-30-00-scheffer-litellm-ui-break.md`

## Prompt de retomada

▎ PR #386 `feat/litellm-experiment` HEAD `0351441c`. Ship-loop verde (CI 14/14, PR Gate 16/16). Scheffer live: R1/R2 fail (CRM + SocietaryMap não montam em 300s); R3 pass; `/api/cnpj` OK — H1 refutada. Bruno escolheu **Opção B**: fix causa raiz B1 (waterfall UI CRM/SocietaryMap) + B2 (P1 expand ~26k) — sem workaround E2E. Implementer **não rodou** (rate limit). WIP unstaged fora do escopo. Próximo: implementer B1 → re-run R1/R2 → B2 P1 → critério B Supabase → gates → MERGE com token.
