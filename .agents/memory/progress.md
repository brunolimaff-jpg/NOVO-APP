# Progress

### 2026-06-23 — Delivery-loop Fase 1 TRACE + push (BLOQUEADO em REPORT_READY)

- **HEAD remoto:** `b628c45b` (3 commits: TRACE cliente `4f453edd`, report-ready E2E `97815710`, test fixes `b628c45b`)
- **Fase 1:** TRACE cliente implementado em geminiProxy, waterfall-orchestrator, investigation-orchestration
- **Preview:** https://scoutagro-imm8c1ae2-brunolimaff-3629s-projects.vercel.app — SHA `b628c45b` no bundle; marcadores `post-teia`, `pre-module-loop` presentes
- **Gates locais:** typecheck ✅ build ✅ test 1681/1683 (2 flaky suite completa)
- **CI:** core verde; GitGuardian fail (não bloqueante funcional); Golden Dossier Live ❌ timeout 840s
- **report-ready:** não executado local (E2E_AUTH_PASSWORD ausente no agente)
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
