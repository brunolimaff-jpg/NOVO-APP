# Progress

Last updated: 2026-06-26 — Marathon session closeout: Sprint 1 + Sprint 2 concluidos

- **HEAD:** `ffdcf096` (20 commits de `origin/main`, +10 desde ultimo handoff)
- **2 waterwalls validados em producao:** 1o: 47.573 chars, $0.135, 317s, 6/6 modulos. 2o: 51.043 chars, $0.137, 373s, 6/6 modulos.
- **HYBRID_MODEL_MAP confirmado:** Sonnet 4.6 na Operacao, DeepSeek V3.2 nos demais.
- **2 novos commits:** `0f179543` (timeouts cliente 38s/42s -> 120s via env var) + `ffdcf096` (hard-cap 330s removido).
- **Timeouts padronizados:** VITE_LITELLM_CLIENT_TIMEOUT_MS=120000 (cliente) + MAX_LITELLM_REQUEST_TIMEOUT_MS=180_000 (servidor) = 120s efetivo.
- **Vercel env vars:** 2 adicionadas (HYBRID_PIPELINE_ENABLED, CLIENT_TIMEOUT_MS), 3 removidas (zumbis: REQUEST_TIMEOUT_MS, LLM_FALLBACK_ENABLED, VITE_LLM_FALLBACK_ENABLED).
- **30 env vars LiteLLM mapeadas** em plano dedicado.
- **Bug SectionalBotMessage** (expand) identificado — pre-existente, nao desta PR. Vercel Live Feedback desativado (bloqueava cliques).
- **Estado:** PRONTO PARA SUBIR PR apos revisao final do Bruno.
- **Arquivos alterados:** `waterfall-orchestrator.ts`, `geminiProxy.ts`, `HANDOFF_AI.md`, `activeContext.md`, `progress.md` (checkpoint — sem commit, sem push)

### 2026-06-26 (Marathon Closeout — Sprint 1 + Sprint 2 concluidos)

- **Marathon session completa:** Plano de Profissionalizacao Caminho C, Sprints 1 e 2 finalizados
- **Origens:** Branch inicial `stabilize/fe6c6f9-cherry-picks` -> PR #389 -> merge + tag `fase-1-done`
  - Branch `refac/litellm-clean` -> PR #390 -> merge + tag `fase-2-done`
- **Sprint 1 entregue (PR #389):**
  - 3/5 cherry-picks aplicados com sucesso: PR #379 (Cron), PR #380 (QSA knownCnpjs), Sentry
  - 2 abortados por conflito massivo: MCP config, PR #383
  - Limpeza: ChatInterface.tsx restaurado, scar tissue confirmado como parte de fe6c6f9
  - 11 threads resolvidas (Gemini Code Assist + Cursor)
- **Sprint 2 entregue (PR #390):**
  - 4 novos arquivos, 5 modificados
  - 64 threads resolvidas (Gemini Code Assist + 7 rodadas Cursor + 1 security review Cursor)
  - 10 bugs corrigidos: 2 P0 (Rules of Hooks, Foundation cache), 4 P1, 1 P5 + 3 infra
  - 13 commits, squash merged, tag `fase-2-done`
- **Decisoes:** 6 novas (DI-2026-06-26-01 a DI-2026-06-26-06)
- **Validacao final:** typecheck verde, build verde, 1489/13 testes, ping-litellm ok, dossie Scheffer 47KB sem freeze
- **Vault:** [[2026-06-26T21-30-00-marathon-sprint1-sprint2]], [[LICOES-APRENDIDAS-MARATHON-SPRINT1-SPRINT2-2026-06-26]]
- **Proximo:** Sprint 3 — MCP config + CI gates + refinamentos

### 2026-06-26 (Sprint 2 — Closeout: pipeline hibrido LiteLLM)

- **Branch:** `refac/litellm-clean` — commit `8ee5a2b7`
- **Base:** `stabilize/from-production-fe6c6f9`
- **PR #390:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/390 — **MERGEABLE**, 56/56 threads resolvidas
- **Preview Vercel:** https://scoutagro-git-refac-litellm-clean-brunolimaff-3629s-projects.vercel.app
- **Novos arquivos (4):**
  - `api/_llm-client.ts` — client LiteLLM com retry seletivo, timeout, auth Bearer
  - `utils/llm/modelRouter.ts` — roteamento Sonnet 4.6 + DeepSeek V3.2 por modulo
  - `utils/llm/types.ts` — tipos LLMProvider, LLMRequest, LLMResponse
  - `api/ping-litellm.ts` — endpoint diagnostico (usa DEFAULT_MODEL)
- **Arquivos modificados (5):**
  - `api/gemini.ts` — branch LiteLLM no handler generateContent (roteamento 100% server-side via regex)
  - `services/gemini/investigation-orchestration.ts` — STABLE_RESEARCH_MODEL_ID fixo, useGrounding false
  - `features/dossier/waterfall-orchestrator.ts` — useGrounding false no waterfall
  - `services/gemini/foundation-cache.ts` — desliga com VITE_HYBRID_PIPELINE_ENABLED=1
  - `components/SectionalBotMessage.tsx` — useDeferredValue para >30KB
- **Correcoes pos-review:** 13 commits, 56 threads (Gemini Code Assist + Cursor)
- **Validacao:** typecheck verde, build verde, 1489/13 testes, ping ok, CNPJ ok, dossie 32KB sem freeze, Score 82
- **Decisoes novas:**
  - DI-2026-06-26-03: Roteamento 100% server-side
  - DI-2026-06-26-04: useGrounding removido, Score recalibrado
  - DI-2026-06-26-05: LiteLLM gate unico (LLM_PROVIDER flag)
  - DI-2026-06-26-06: Foundation cache desliga com pipeline hibrido
- **Vault:** [[2026-06-26T20-30-00-sprint2-closeout-handoff.md]] em `20-SESSOES/2026-06/`
- **Status:** Sprint 2 concluida. **Aguardando validacao manual** do pipeline hibrido (Bruno verificando model=bedrock/... no Network).
- **Proximo:** Se validado → merge PR #390 e iniciar Sprint 3

### 2026-06-26 (Sprint 1 — Plano de Profissionalizacao: cherry-picks sobre fe6c6f9)

- **Branch alvo:** `stabilize/from-production-fe6c6f9` (commit `fe6c6f9ba59fb7063356a5f0adcc51c411db3c4a`)
- **Branch de trabalho:** `stabilize/fe6c6f9-cherry-picks`
- **3/5 cherry-picks aplicados com sucesso:**
  - PR #379 (Cron + playbook P0) — 6 SHAs
  - PR #380 (CNPJ QSA knownCnpjs fix) — 2 SHAs
  - Sentry DSN + error monitoring — 6 SHAs
- **2/5 ABORTADOS por conflito massivo:**
  - MCP config (`.mcp.json`) — 25+ arquivos em conflito, trouxe Cofre/LiteLLM que nao existem em fe6c6f9
  - PR #383 (CI gates + auth lockout) — 10 arquivos em conflito, dependia de useCofreTransition deletado
- **Limpeza pos-abortos:** ChatInterface.tsx restaurado para baseline fe6c6f9
- **Validacao:** typecheck verde, build 18.6s, preview Vercel OK, API CNPJ OK
- **PR criada:** #389 (draft)
- **Branch mergeada:** `stabilize/fe6c6f9-cherry-picks` → `origin/stabilize/from-production-fe6c6f9`
- **Decisoes:**
  - DI-2026-06-26-01: Cherry-pick de 25+ arquivos com cross-cutting inviavel, reimplementar manual
  - DI-2026-06-26-02: useStaticTimelineFallback.ts e blankPanelTelemetry.ts sao parte de fe6c6f9
- **Pendente para Sprint 2:** MCP config, CI gates, LiteLLM core

- **HEAD:** `fccfddfd` (9 commits) — 2 commits novos: `9b6ef410` (safety-net dissolve 3s) + `fccfddfd` (teste flush preview)
- **Teste `suspendMidWaterfallPreview = true`:** 7/7 modulos completos, 0 freeze, 292s (vs 349s antes). **CAUSA DO FREEZE CONFIRMADA:** `pushWaterfallPreviewToStore` a cada modulo satura React. MAS dossie NAO renderizou ao final — flush final quebrado.
- **Nova correcao:** safety-net dissolve 3s sem depender de DOM check (`9b6ef410`)
- **PR #387 aberta** para teste de code review automatizado.
- **Pendencia principal:** ajustar flush final para garantir saida visual do dossie.
- **Arquivos atualizados:** HANDOFF_AI.md, activeContext.md, progress.md, decisions.md (checkpoint documental pos-teste — sem commit, sem push)

- **Fechamento de 3 PRs obsoletas** (#367 Sprint1, #368 Sprint2, #370 Sprint4) — merges ja feitos direto na feature/supabase-auth, PRs fechadas sem merge
- **Confirmacao PRs #372 e #373** — ja estavam mergeadas em origin/main
- **Commit de 7 arquivos pendentes** — handoff, memory, MetricsDashboard.tsx, plano PR372, gitignore, ajustes residuais em AuthGate/AuthContext/OperatorContext/waterfall/smoke/tests
- **Sincronizacao main local** — de 31 commits atras para `ce444a2e` (atualizado com origin/main)
- **Merge feature/supabase-auth → main** — 2 novos commits + merge commit
- **Push** — origin/main + origin/feature/supabase-auth
- **Vercel deploy** — automatico apos push em main
- **.gitignore** — .claude/worktrees/ adicionado
- **Estado final:** git status limpo, branch sincronizada, nada pendente

- **HEAD:** `6dd6b051` (10 commits — +1 commit docs desta sessao) — SEM COMMIT deste checkpoint (somente documentacao)
- **Arquivo PR-386-MAPEAMENTO-COMPLETO.md**: NAO EXISTE — `.tmp/` esta vazio. Nenhum mapeamento completo foi gerado.
- **8 arquivos revisados e atualizados**: CALIBER_LEARNINGS.md, HANDOFF_AI.md, decisions.md, progress.md (este), activeContext.md, DECISIONS-Index.md (obsidian), STATE-OF-PR-386.md
- **Inconsistencias encontradas:**
  1. Task #30 "Remove respondWithGeminiFallback" marcada completed mas `api/gemini.ts:339` ainda tem a funcao ativa
  2. Task #14 "checkReportQuality modo lenient" ainda PENDING — `reportQuality.ts` nao aceita provider
  3. CofreOverlay ainda presente na branch (skeleton em worktree separado nao mergeado)
  4. callLiteLLM sempre falha — pipeline hibrido implementado mas NAO FUNCIONAL (todos via Gemini fallback)
  5. Aspiracional (zero Gemini, fallback binario, cofre skeleton) vs Realidade (Gemini fallback ativo, CofreOverlay ativo, checkReportQuality sem lenient)
  6. Obsidian decisions desatualizado (ultima revisao 2026-04-19)
  7. STATE-OF-PR-386.md desatualizado (anterior aos 9 fixes)
  - **Inconsistencias registradas e documentadas em decisions.md** (secoes INCONSISTENCIA REGISTRADA)
- **Arquitetura Final consolidada:** secao ARQUITETURA FINAL adicionada em CALIBER_LEARNINGS.md, HANDOFF_AI.md, decisions.md
- **O que NAO funcionou expandido:** erros exatos adicionados em HANDOFF_AI.md (6 arquiteturais + 10 de modelos)
- **Regra:** Nenhum commit feito — documentacao pura.
- **Proximo passo desta sessao de consolidacao:** concluido.

- **Code Review PR #372** — 5 agentes paralelos:
  - CLAUDE.md compliance, Bug scan, Git blame issues, PR anteriores, Code comments
  - 3 bugs corrigidos no commit `ed2d8b17` (signOut try/catch, AbortController, fetchPromise)
- **Merge PR #372** (`e3234855`) — 16:11 UTC, deploy producao Vercel
- **PR #373 criado** — remove comex morta + cache CNPJ TTL 30s + codigo orfao
- **5 ciclos de review** — Gemini + CodeRabbit apontaram 4 bugs no cache:
  - Promises rejeitadas bloqueavam retry (`f834794e`)
  - AbortSignal contaminava cache entre callers (`14f26d7f`)
  - Timer stale deletava entrada nova (`14f26d7f`)
  - CI quebrado por mock leakage (`9e9d3367`, `vitest.config.ts`)
- **Validacao preview** — Chrome DevTools: login, CNPJ, waterfall, console limpo
- **Merge PR #373** (`53b948dd`) — 17:47 UTC, deploy producao Vercel (12 lambdas)
- **Decisoes registradas:**
  - DI-2026-06-14-01: Worktree so para features novas
  - DI-2026-06-14-02: CNPJ cache sem AbortSignal + identity check
  - DI-2026-06-14-03: restoreMocks + clearMocks globais

### 2026-06-14 (antes do merge — fix waterfall + preview)

- Fix do travamento no preview da PR #372 (inline sources non-blocking)
- Validacao local e preview do fix

### 2026-06-24 — PR #386 diagnostico REAL + 3 correcoes (Virtuoso, static-fallback, Cofre)

- PR #372 pronta para merge, todos os checks passando
- 3 migrations aplicadas no Supabase remoto
- Validacao manual preview final

### 2026-06-23 — Delivery-loop PR #386 ate report-ready (BLOQUEADO overlay 390s)

- PR #372 (feature/supabase-auth): Migracao de auth local para Supabase Auth completa
- Sprint 0-4: diagnostico, auth context, validacao email, consolidacao, graceful fallback

### 2026-06-23 — Delivery-loop Fase 1 TRACE + push (BLOQUEADO em REPORT_READY)

- **HEAD remoto:** `b628c45b` (3 commits: TRACE cliente `4f453edd`, report-ready E2E `97815710`, test fixes `b628c45b`)
- **Fase 1:** TRACE cliente implementado em geminiProxy, waterfall-orchestrator, investigation-orchestration
- **Preview:** https://scoutagro-imm8c1ae2-brunolimaff-3629s-projects.vercel.app — SHA `b628c45b` no bundle; marcadores `post-teia`, `pre-module-loop` presentes
- **Gates locais:** typecheck ✅ build ✅ test 1681/1683 (2 flaky suite completa)
- **CI:** core verde; GitGuardian fail (nao bloqueante funcional); Golden Dossier Live ❌ timeout 840s
- **report-ready:** nao executado local (E2E_AUTH_PASSWORD ausente no agente)
- **Proximo:** Fase 1.5 console TRACE Scheffer → Fase 2 condicional conforme plano §7

### 2026-06-23 — Plano PR-386 fechado + continual-learning (handoff nova sessao)

- **Plano entregavel:** `docs/plans/PR-386-plano-entregavel.md` revisado e fechado (hipoteses C3/C2/C1/A2/B, Fase 1-2, criterios S1-S7)
- **Plano Cursor:** `.cursor/plans/pr-386_ajuste_litellm_caff9a11.plan.md`
- **Continual-learning:** AGENTS.md atualizado (instrumentar→medir→corrigir; LiteLLM zero generateContent; Hobby 60s; fase pre-modulo); index 230 entradas
- **Confianca:** ~95% bloqueio cliente/pre-modulo; ~40-55% fix especifico ate Fase 1.5
- **Pendente:** Fase 1 TRACE cliente (`geminiProxy.ts` ainda sem `[TRACE]`)
- **HEAD commitado:** `aaf05ec5` — working tree com mudancas locais nao commitadas
- **Proximo:** implementer Fase 1 → validator → preview Scheffer → Fase 2 condicional

### 2026-06-23 COMPLEMENTAR — Documento de auditoria PR #386

- **HEAD:** `aaf05ec5` (+1 commit: docs(audit): estado completo da PR #386)
- **Auditoria:** `.audit-pr386/STATE-OF-PR-386.md` — 235 linhas com arquitetura, 9 hipoteses refutadas, 16+ commits, 5 frentes inexploradas
- **Evidencia Supabase:** Gemini + Foundation Cache funciona (5 modulos, 22.4K chars). LiteLLM falha (6 runs, 0 modulos)
- **Prompt do auditor:** pronto em `.audit-pr386/` para envio externo
- **Testes:** 1683/1683 verdes. TypeCheck OK.

### 2026-06-23 FIM — LiteLLM: waterfall nunca chama generateContent (sessao ~8h de debug)

- **HEAD:** `9ef5b105` (4 novos commits de TRACE: `fa7357df`, `20a6b3d9`, `cc28083a`, `9ef5b105`)
- **ACHADO CRITICO:** ZERO chamadas `action: generateContent` chegam ao `/api/gemini` durante waterfall. TRACE G1-G5 nunca aparecem. O problema esta no CLIENTE, antes do `fetch`.
- **Hipotese anterior REFUTADA:** Header fix `8c74e71e` NAO e a causa raiz. O `proxyGenerateContent` nunca faz o fetch com `generateContent`.
- **Instrumentacao:** [TRACE] G1 `_llm-client.ts`, G2 `gemini.ts`, G3a-G3d `_experiment-auth.ts`. BUILD_TS markers forcam cache miss Vercel. `scoutDiag.error` nos pontos criticos.
- **Testes:** 1683/1683 verdes. TypeCheck OK.
- **Proxy LiteLLM:** Funcional via `ping-litellm` — 1.4s com 120K chars do Vercel.
- **Licoes:** Append na licao dos 5 gates com descoberta de que instrumentacao servidor e insuficiente.
- **Decisao:** DI-2026-06-23-05 — waterfall usa caminho diferente, nao passa por /api/gemini com generateContent.
- **Vault:** Sessao `2026-06-23T20-30-00-litellm-waterfall-path-breakthrough.md` + Decisao `DI-2026-06-23-05`.

### 2026-06-23 — LiteLLM descoberta dos 5 gates + fix header geminiProxy

[... historico anterior mantido ...]

### 2026-06-24 (documentacao final) — HYBRID_MODEL_MAP + 3 TIERS + STATE LITELLM

- **HYBRID_MODEL_MAP implementado** em `utils/llm/modelRouter.ts:34` (worktree): Sonnet 4.6 para 2 modulos criticos, DeepSeek V3.2 para 5 operacionais. Testes unitarios em `tests/utils/modelRouter.test.ts`.
- **3 waterwalls validados:** Sonnet+DeepSeek (52K, $0.17), Opus+Sonnet (83K, $0.60), DeepSeek direto (~$0.06)
- **3 tiers definidos:** Premium (Opus+Sonnet), Padrao (Sonnet+DeepSeek), Economico (DeepSeek direto)
- **Estado LiteLLM consolidado:** DEV (`litellm.dev.seniorlabs.io`) e HOMOLOG funcionam. PROD (`litellm.seniorlabs.io`) retorna `token_not_found_in_db` — chave nao autorizada.
- **Decisoes DI-24-19 a DI-24-25 registradas** em decisions.md
- **5 arquivos atualizados:** HANDOFF_AI.md, CALIBER_LEARNINGS.md, decisions.md, progress.md, activeContext.md
- **Nenhum commit novo** — apenas documentacao. Branch `feat/litellm-experiment`, HEAD `fccfddfd`.
