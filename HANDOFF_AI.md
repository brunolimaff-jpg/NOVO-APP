# Handoff Sprint 1 — Cherry-picks sobre fe6c6f9

> **Estado:** Sprint 1 do plano de profissionalizacao (Caminho C) concluida.
> **Branch:** `stabilize/from-production-fe6c6f9` — `fe6c6f9ba59fb7063356a5f0adcc51c411db3c4a`
> **PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/389 (draft)
> **Preview Vercel:** https://scoutagro-1cwl2wpon.vercel.app

---

## Resumo da Sessao

| #   | Tarefa                                                   | Status                      |
| --- | -------------------------------------------------------- | --------------------------- |
| 1   | 5 cherry-picks sobre `stabilize/from-production-fe6c6f9` | ⚠️ 3/5 sucesso, 2 abortados |
| 2   | PR #379 (Cron + playbook P0) — 6 SHAs                    | ✅ Aplicado                 |
| 3   | PR #380 (CNPJ QSA knownCnpjs fix) — 2 SHAs               | ✅ Aplicado                 |
| 4   | Sentry DSN + error monitoring — 6 SHAs                   | ✅ Aplicado                 |
| 5   | MCP config (`.mcp.json`) — 25+ conflitos                 | ❌ Abortado                 |
| 6   | PR #383 (CI gates + auth lockout) — 10 conflitos         | ❌ Abortado                 |
| 7   | ChatInterface.tsx restaurado para baseline fe6c6f9       | ✅                          |
| 8   | Validacao: typecheck, build, preview Vercel, API CNPJ    | ✅                          |
| 9   | Merge em `origin/stabilize/from-production-fe6c6f9`      | ✅                          |

## Validacao final

| Gate           | Status                                             |
| -------------- | -------------------------------------------------- |
| Typecheck      | Verde                                              |
| Build          | 18.6s                                              |
| Testes         | 1489 pass / 13 fail (pre-existentes em fe6c6f9)    |
| Lint           | 8 erros (pre-existentes em blankPanelTelemetry.ts) |
| Preview Vercel | scoutagro-1cwl2wpon                                |
| API CNPJ       | Scheffer, 6 socios                                 |

## Descobertas importantes

- **`useStaticTimelineFallback.ts` e `blankPanelTelemetry.ts` FAZEM parte de fe6c6f9.** Nao sao scar tissue. Podem ser removidos em Sprint posterior.
- **O que NAO esta em fe6c6f9:** `useCofreTransition.ts`, `CofreOverlay.tsx`, `api/_llm-client.ts`, `api/llm-experiment.ts`
- Cherry-pick de commit que toca 25+ arquivos com dependencias cross-cutting (Cofre, LiteLLM) e inviavel. Reimplementacao manual mais segura.

## Decisoes desta sessao

- **DI-2026-06-26-01:** Cherry-pick de commits com dependencias cross-cutting (Cofre, LiteLLM) e inviavel. MCP config e CI gates serao reimplementados manualmente na Sprint 2.
- **DI-2026-06-26-02:** `useStaticTimelineFallback.ts` e `blankPanelTelemetry.ts` sao parte de fe6c6f9 — nao removidos. Poderao ser tratados em Sprint posterior de codebase cleanup.

## Correcoes aplicadas

N/A — sessao de cherry-pick e merge, sem correcao de bugs.

## O que NAO funcionou

- **MCP cherry-pick** (commit 8670e5e7): conflito em 25+ arquivos, modify/delete em docs/mcp/fetch.generic.example.json, abortado via `git cherry-pick --abort`
- **PR #383 cherry-pick** (commit 62323649): conflito em 10 arquivos incluindo App.tsx, useCofreTransition.ts (modify/delete), testes. Abortado.

## O que ficou para Sprint 2

- MCP config (`.mcp.json`) — reimplementacao manual
- CI gates (`.github/workflows/`) — reimplementacao manual
- LiteLLM core (`api/_llm-client.ts` + reestruturacao de providers)

## Proximo passo

Sprint 2: reimplementar MCP config e CI gates manualmente sobre a branch `stabilize/from-production-fe6c6f9`.
