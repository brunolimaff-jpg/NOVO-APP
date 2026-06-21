# Progress

### 2026-06-21 — PR #386 gate fix 3 camadas + validacao DeepSeek V4 Flash (F1-F6)

- **Gate LiteLLM resolvido:** 3 camadas de bypass preview local auth implementadas em 3 commits:
  - `69242e26` — preview local auth no cliente (experimentGate.ts) + servidor (\_experiment-auth.ts)
  - `964a3bce` — header x-experiment-operator-email no geminiProxy + experiment API
  - `42e154d3` — setPreviewOperatorEmail via module-level var no geminiProxy
- **8 arquivos alterados:** experimentGate.ts, types.ts, modelRouter.ts, \_experiment-auth.ts, experiment.ts, geminiProxy.ts, waterfall-orchestrator.ts, experimentGate.test.ts
- **4 novos testes:** preview local auth sem session, preview local auth com email, preview sem authMode, preview com authMode errado
- **Preview deploy** `scoutagro-bmgpi1o2e-brunolimaff-3629s-projects.vercel.app` (SHA 42e154d3)
- **Validacao real LiteLLM (Fase 6):** Gate ABERTO com `authMode=preview_local`, `operatorEmail=bruno.ferreira@senior.com.br`. LiteLLM chamado (provider=litellm, fallback_used=false). Modelo: huawei/deepseek-v4-flash.
- **Resultado:** 2/6 modulos concluidos, 4 timeouts. Modulos concluidos levaram 62-84s. Timeouts aos 119s (limite 120s). DeepSeek V4 Flash muito lento para producao.
- **0 erros auth:** nenhum 401 ou 403 em todo o fluxo.
- **Proximo:** testar oracle/xai.grok-4.20-0309-reasoning — adicionar ao modelCatalog, atualizar env, deploy, smoke, waterfall.

Last updated: 2026-06-21 — gate fix + validacao real LiteLLM (HEAD 42e154d3)

### 2026-06-21 — PR #386 diagnostico duplo bloqueio (gate + billing) + plano 9 fases

- **Diagnostico raiz:** Investigacao Scheffer (04.733.767/0001-80) falhou com "Erro no processamento" no preview `scoutagro-idbcy03n0...`. Descobriu-se DOIS bloqueios, nao um.
- **BLOQUEIO 1:** `[ModularDossier] LiteLLM experiment gate fechado {reason: no_supabase_session, hasSupabaseSession: false}` — gate `experimentGate.ts` server-side exige Supabase Session, mas preview usa auth local-only (OperatorContext). Kimi/LiteLLM nunca passam do gate.
- **BLOQUEIO 2:** `[GeminiProxy] HTTP 429 "Your prepayment credits are depleted"` — creditos pre-pagos Gemini esgotados. Nem fallback Gemini funciona.
- **Env vars corretas:** Todas as variaveis `LLM_*`/`VITE_LLM_*` ja estavam configuradas para Kimi K2, mas o gate barrava antes do router.
- **Plano 9 fases criado:** F1 (diagnostico) OK, F2 (bypass gate via `LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH=true`) e o proximo passo.
- **Regras criticas documentadas:** NAO mergear, NAO adicionar n8n, NAO liberar bypass em producao.
- **Corrigido entendimento anterior:** na sessao anterior (2026-06-21T11-17-46), o bloqueio foi atribuido a env var incorreta. O diagnostico atual revelou que a causa raiz e o gate server-side.
- **Vault:** `/Users/brunolima/Documents/Bruno Vault/20-SESSOES/2026-06/2026-06-21T11-34-20-pr386-diagnostico-duplo-bloqueio.md`.

### 2026-06-21 — PR #386 preview/Kimi: validacao bloqueada por env server-side

(conteudo mantido do progresso anterior)

### 2026-06-21 — Fase 1 + Fase 2: paridade LiteLLM real ao Gemini + branch-review PRONTO + deploy preview

(conteudo mantido do progresso anterior)

### 2026-06-20 (doc-handoff — Scheffer E2E + Opcao B causa raiz — PR #386)

(conteudo mantido do progresso anterior)

### 2026-06-20 (ship-loop Fase 6 — PR #386 preview `cad2dc`)

(conteudo mantido do progresso anterior)

### 2026-06-20 (spec validacao pesquisa Scheffer — PR #386)

(conteudo mantido do progresso anterior)

### 2026-06-20 (Scheffer waterfall + bug UI — PR #386)

(conteudo mantido do progresso anterior)

### 2026-06-20 (ship-loop PR #386 + prova LLM manual — PR #386)

(conteudo mantido do progresso anterior)

### 2026-06-20 (PR #386 LiteLLM Fase 1 + resolve threads — PR #386)

(conteudo mantido do progresso anterior)

### 2026-06-19 (LiteLLM env Preview + debug freeze consolidacao — PR #386)

(conteudo mantido do progresso anterior)
