# Progress

### 2026-06-24 18:00 — PR #386: READY TO MERGE — 2 waterwalls validados, 20 commits

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

### 2026-06-24 (tarde/noite) — PR #386: TABBIT DESCOBRE O BUG REAL (38s cap) + 8 NOVOS COMMITS

- **HEAD:** `a9a93d4f` (17 commits, +8 desde ultimo handoff)
- **DESCOBERTA CRITICA:** `MAX_LITELLM_REQUEST_TIMEOUT_MS = 38_000` em `api/_llm-client.ts:7` anulava qualquer timeout maior. Tabbit achou em 5 minutos. Corrigido para 180_000.
- **8 novos commits:** Zero Gemini (respondWithGeminiFallback removido, isFallbackEnabled=false), HYBRID_MODEL_MAP, checkReportQuality lenient, DossierModuleError, timeouts 180s.
- **Causa travamento modulo 4-5: INCONCLUSIVO** — requer logs do Vercel.
- **Nao funcionou:** Ultracode worktrees perderam 7 tarefas, PR body desatualizado, 4 CI checks falhando.
- **Arquivos atualizados:** HANDOFF_AI.md, activeContext.md, progress.md, decisions.md (CHECKPOINT DOCUMENTAL — sem commit, sem push)

- **HEAD:** `fccfddfd` (9 commits) — 2 commits novos: `9b6ef410` (safety-net dissolve 3s) + `fccfddfd` (teste flush preview)
- **Teste `suspendMidWaterfallPreview = true`:** 7/7 modulos completos, 0 freeze, 292s (vs 349s antes). **CAUSA DO FREEZE CONFIRMADA:** `pushWaterfallPreviewToStore` a cada modulo satura React. MAS dossie NAO renderizou ao final — flush final quebrado.
- **Nova correcao:** safety-net dissolve 3s sem depender de DOM check (`9b6ef410`)
- **PR #387 aberta** para teste de code review automatizado.
- **Pendencia principal:** ajustar flush final para garantir saida visual do dossie.
- **Arquivos atualizados:** HANDOFF_AI.md, activeContext.md, progress.md, decisions.md (checkpoint documental pos-teste — sem commit, sem push)

### 2026-06-24 — Checkpoint documental FINAL: Consolidacao arquitetura Fase 5, inconsistencias identificadas

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

- **HEAD:** `bde69158` (7 commits) — NENHUM commit novo nesta sessao (somente documentacao)
- **3 REFUTACOES:** (1) parseMarkdownSections medido 0.06-1.4ms — NAO e gargalo; (2) CALIBER_LEARNINGS "fallback_used bloqueia UI" — codigo nao existe; (3) useLayoutEffect re-abre Cofre — `!isLoading` retorna early
- **3 CONFIRMACOES:** (1) Log dissolve sync != setState async; (2) Cofre z-60 + isInteractive bloqueia interacao; (3) callLiteLLM sempre falha (todos via Gemini fallback)
- **Hipotese sintetizada:** Freeze e ARQUITETURAL, nao de CPU: setIsLoading(false) → React agenda re-render 30K chars → RAF ~16ms antes do commit React → dispatchCofreRenderReady nunca dispara → polling 300ms falha → dissolve via safety-timeout (10s) ou absolute-max (320s)
- **Framework 7 oticas concluido:** #1 REFUTADA, #2 CONFIRMADA, #3 CONFIRMADA, #4 nao testada, #5 CONFIRMADA, #6 REFUTADA, #7 corrigida
- **Arquivos atualizados:** HANDOFF_AI.md, activeContext.md, progress.md, decisions.md (checkpoint documental final — sem commit, sem push)

### 2026-06-24 — PR #386 diagnostico REAL + 3 correcoes (Virtuoso, static-fallback, Cofre)

- **HEAD remoto:** `14d184cf` (6 commits: debug litellm `5912a03b`, fix Virtuoso `3d42cf03`, Sentry `72a140c0`, docs `4fc9d688`, fix static-fallback `9b958ad8`, fix Cofre `14d184cf`)
- **Achado CRITICO:** Diagnostico anterior ("fallback_used bloqueia UI") REFUTADO. NENHUM filtro fallback_used existe no frontend. Causas reais: (1) Virtuoso computeItemKey por ID nao forca re-render com texto novo; (2) static-fallback 110+ re-renders satura main thread; (3) isCofreRenderReady exige viewport que falha no primeiro paint.
- **Adversarial Review:** 3 personas (Saboteur, New Hire, Security Auditor), 5 CRITICAL findings. Veredict: BLOCK.
- **Fix #1 (P0):** computeItemKey inclui isThinking para forcar re-render (`3d42cf03`)
- **Fix #2 (P0):** console.error detalhado no catch do callLiteLLM (`5912a03b`)
- **Fix #3 (P1):** Sentry.captureException no catch do finalizeRun (`72a140c0`)
- **Fix #4 (P1):** static-fallback loop eliminado com useMemo + deps estabilizadas (`9b958ad8`)
- **Fix #5 (P1):** isCofreRenderReady leniente com hasBotContent (`14d184cf`)
- **Preview waterfall:** completou em 349s com 29.803 chars
- **Metricas:** static-fallback 7 re-renders (vs 110+); invisible-bot-content 0
- **Skills:** focused-fix, adversarial-reviewer, rag-architect instaladas
- **CI:** typecheck ✅ 1683/1684 tests (1 flaky nao relacionado)
- **Pendencias:** callLiteLLM sempre lanca (capturar erro real); 19 runs orfas; waterfall_logs parados; Cofre fix nao validado em producao

### 2026-06-23 — Delivery-loop PR #386 ate report-ready (BLOQUEADO overlay 390s)

- **HEAD remoto:** `8017a0cb` (budget Hobby LiteLLM + safety nets Cofre)
- **Fase 1 TRACE:** `4f453edd`–`b628c45b` — instrumentacao cliente; preview zero generateContent
- **Fase 1.5:** report-ready FAIL ~71s; A2+C3 (abort ~58s `signal is aborted without reason`); C2 refutada
- **Fase 2:** `f82bf780` fix socio-search abort (`mergeAbortSignals` 52s); TRACE 5× generateContent ✅
- **Gate E2E:** `1bb7fe49` — `waitForReportReadyLoadingOff` usa 390s compartilhado
- **report-ready preview `1bb7fe49`:** FAIL 390s — `cofre-overlay` visivel; sem `bot-message-content`
- **Preview canonico:** https://scoutagro-jba8ob9tz-brunolimaff-3629s-projects.vercel.app (`8017a0cb`) — report-ready NAO VALIDADO
- **CI:** Build/Typecheck/Smoke ✅; Golden Live/Tests/Coverage ❌
- **Proximo:** debugger `475f313c` waterfall/UI; re-run report-ready pos-fix

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
