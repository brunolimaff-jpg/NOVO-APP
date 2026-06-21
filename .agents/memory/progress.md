# Progress

### 2026-06-21 — Fase 1 + Fase 2: paridade LiteLLM real ao Gemini + branch-review PRONTO + deploy preview

- **Fase 1 (Limpeza WIP):** 18 arquivos consolidados em 2 commits (docs + formatacao). `.gitignore` atualizado com `supabase/.temp/` e screenshots de sessao.
- **Fase 2 (Paridade LiteLLM):** 5 desabilitacoes silenciosas eliminadas:
  - Catalogo: 3 novos modelos na rotacao (Grok 4.1 Fast, DeepSeek V3.2, Grok 4 Fast Reasoning) — output <= $2/M
  - Output tokens 4096->8192 (paridade Gemini)
  - Retry inline com backoff exponencial (5 tentativas, 2s-30s) — import externo removido apos FUNCTION_INVOCATION_FAILED
  - Markers PORTA em XML estruturado (`instrucao_obrigatoria`) + validacao pos-resposta com `parsePortaMarkerV2`
  - Grounding hibrido: novo modulo `utils/llm/groundingHybrid.ts` (CRM + Brasil API), integrado via `groundingContextBlock`
  - Leak shield: `preserveInternalMarkersWhenSafe=true` em todos os call sites
  - Novo modelo: `oracle/xai.grok-4-fast-reasoning` (variant F) adicionado ao catalogo
- **Branch-review:** 5 dimensoes inspecionadas. Veredito: PRONTO. 2 findings nao bloqueantes (SF1: markers sem retry — TODO anotado para Fase 3; SF2: dead code).
- **gh-resolve PR #386:** 2 threads CodeRabbit resolvidas. ~80 threads resolvidas no total.
- **Deploy preview (3 deploys):** qxmx4lrtn (inicial), 2wcoh4w5m (2o), mpc5evjf7 (fix FUNCTION_INVOCATION_FAILED). Env vars atualizadas com 3 modelos e traffic split 40/30/30.
- **Debug:** `import ../utils/retry.js` quebrava serverless com FUNCTION_INVOCATION_FAILED. Fix: retry inline no proprio `api/_llm-client.ts`.
- **Playwright:** Login no preview mpc5evjf7 feito. Guest vinculado: bruno.ferreira@senior.com.br. Scheffer iniciada, aguardando waterfall.
- **Push:** 6 commits ahead de `0351441c`. 1609/1609 testes verdes. Typecheck limpo.
- **Proximo:** Validacao Playwright no preview com os 3 modelos. Se B1/B2 resolvidos pela Fase 2 -> fechar PR #386. Senao -> Fase 3 (fix UI bugs).

Last updated: 2026-06-21 — doc-handoff full PR #386 (HEAD `a9b2417a`, Fase 2 completa, deploy preview, Playwright login)

### 2026-06-20 (doc-handoff — Scheffer E2E + Opcao B causa raiz — PR #386)

- **Entregas:** spec E2E `scheffer-research-validation` + helper; ship-loop CI 14/14 + PR Gate 16/16; continual-learning AGENTS.md (transcripts 159->174).
- **Scheffer live** (`300000ms`): R1/R2 fail (CRM + mapa); R3 pass; `/api/cnpj` OK — **H1 refutada** (pesquisa OK, gargalo UI).
- **Bruno:** Opcao B — fix B1/B2 sem workaround E2E; criterio B Supabase pendente.
- **Implementer:** rate limit — **zero codigo** de fix commitado.
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-20T22-45-00-pr386-scheffer-e2e-root-cause.md`.

### 2026-06-20 (ship-loop Fase 6 — PR #386 preview `cad2dc`)

- **CI:** 14/14 OK (SHA `0351441c`).
- **PR Gate IA:** Playwright **16/16** OK no preview `scoutagro-git-feat-litellm-ex-cad2dc-...vercel.app` (~5,5 min).
- **Scheffer live** (`LITELLM_WATERFALL_TIMEOUT_MS=300000`, ~16,8 min):
  - **R1 fail:** `CLIENTE SENIOR CONFIRMADO` ausente em 300s.
  - **R2 fail:** `societary-map-shell` ausente em 300s.
  - **R3 pass:** waterfall completo, dossier 3907 chars, expand `panelEmpty=false`.
- **Veredito ship-loop:** **BLOCKED** — MERGE_READY nao (R1/R2 + criterio HANDOFF P1 bug painel 26k).
- **Loop:** nao armado (CI/deploy verdes; sem pendencia assincrona).

### 2026-06-20 (spec validacao pesquisa Scheffer — PR #386)

- **Novo:** `tests-e2e/scheffer-research-validation.spec.ts` + `tests-e2e/helpers/scheffer-research.ts` — live no preview, sem stubs CNPJ/Gemini.
- **Gates locais:** typecheck, 1609 testes, build OK.
- **Preview** `scoutagro-2wcoh4w5m-...vercel.app` (R1/R2/R3 @ 180-240s):
  - **R1 parcial:** GET `/api/cnpj` live OK (`qsa>=2`, Scheffer); UI **CLIENTE SENIOR 74 modulos** (180s).
  - **R2 fail:** `societary-map-shell` (240s).
  - **R3 fail:** `inline-loading-bubble` ainda visivel (waterfall incompleto em 180s).
- **Veredito:** **BLOCKED** — pesquisa QSA OK; waterfall/UI societario+CRM nao fecharam no budget; candidato **H2/H4** + timeout Grok.
- **MERGE_READY:** nao — aguardar rerun com `LITELLM_WATERFALL_TIMEOUT_MS=300000` ou preview SHA com waterfall estavel.

### 2026-06-20 (Scheffer waterfall + bug UI — PR #386)

- **Waterfall Scheffer** (sessao `1f143b11...`, CNPJ `04733767000180`, preview feat/litellm): LiteLLM confirmado (`/api/llm-experiment` OK); modulos sem foundation cache; waterfall `completed`, consolidacao ~1.9s, 26424 chars, PostCompletion OK.
- **BUG P1:** pos-geracao, scroll + clique "ver relatorio completo" -> painel principal vazio, area branca; console `dossier_accesses` 403 RLS, `raf-safety-net-fired`, Cofre `dissolve safety-timeout`.
- **Ship-loop:** CI 14/14, PR Gate 16/16, Playwright 16/16, threads 0 — **BLOCKED** ate row `completed` em `llm_experiment_runs` (confirmar Supabase).
- **Codigo (nao commitado):** log console `Scout360[LLM]` por modulo em `investigation-orchestration.ts`.
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-20T21-30-00-scheffer-litellm-ui-break.md`.

### 2026-06-20 (ship-loop PR #386 + prova LLM manual — PR #386)

- **Ship-loop VERDICT:** BLOCKED (nao MERGE_READY) — CI 14/14, gates locais, PR Gate IA **16/16**, Playwright **16/16** no preview SHA `a5d97516`.
- **Review:** 7 threads re-resolvidas pos-ship-loop -> **0 abertas**.
- **Waterfall Bruno** (~15:43 BRT, sessao `1f143b11...`, Scheffer): `operator_events` `dossier_completed`; `scout_diagnostics` `waterfall:end` completed.
- **Supabase `llm_experiment_runs`:** row mais recente `quality_failure`, `provider=litellm`, `fallback_used=true`, `fallback_model=gemini-3-flash-preview` — **0 rows `status=completed`**.
- **NAO VALIDADO:** causa do fallback V4 Flash; E2E `litellm-live-parallel` live; row `completed` sem fallback.
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-20T19-00-00-pr386-ship-loop-llm-proof.md`.

### 2026-06-20 (PR #386 LiteLLM Fase 1 + resolve threads — PR #386)

- **Fase 1 LiteLLM** commit `0d72a84f`: `utils/llm/experimentGate.ts`, gate client Supabase Auth + allowlist, fallback Gemini 401/403, ReDoS Bearer, hard-cap clearTimeout, `agentDebugLog` removido.
- **Validator APROVADO:** typecheck, 1603 testes, build, contracts, golden, budget.
- **CI** SHA `a5d97516`: 13 checks SUCCESS; `mergeStateStatus` BLOCKED.
- **Push** `0d72a84f`, `a5d97516`; 68 review threads resolvidas (#385+#386), 0 unresolved.
- **Token `gh`:** renovado device flow; `scripts/resolve-pr-threads.py` -> GraphQL `addPullRequestReviewThreadReply`.
- **NAO VALIDADO:** preview waterfall real, `llm_experiment_runs`, PR Gate IA 16/16, E2E litellm-live-parallel.
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-20T16-45-00-pr386-litellm-fase1-threads.md`.

### 2026-06-19 (LiteLLM env Preview + debug freeze consolidacao — PR #386)

- **Env Vercel Preview:** 18 vars scoped `feat/litellm-experiment`; allowlist corrigida para `bruno.ferreira@senior.com.br`; V4 Flash only (`TRAFFIC_SPLIT=100`); R1/Kimi 404 no LiteLLM.
- **Debug freeze** sessao `c352f8` / `scout_diagnostics` `0ea8ed46`: H3 confirmada — `/api/link-status` ~6.7s vs timeout cliente 5s em inline-validation (6 URLs).
- **Fix:** `link-status` timeout 2.5s, `vercel.json` maxDuration 15s, `VALIDATE_INLINE_TOTAL_TIMEOUT_MS` 12s + hard-cap 14s -> `[]`; `utils/agentDebugLog.ts` + instrumentacao (manter ate Bruno confirmar).
- Preview fix: https://scoutagro-d47bkguue-brunolimaff-3629s-projects.vercel.app — link-status ~3.5s (antes 6.7s).
- Testes `validate-inline-sources-freeze-diag`: 15/15. E2E `litellm-live-parallel` CNPJ falhou no preview; Scheffer stub ~27s OK.
- Decisoes: DI-2026-06-19-03 (V4-only preview), DI-2026-06-19-04 (budget link-status vs hard-cap).
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-19T23-45-00-litellm-env-freeze-link-status.md`.
