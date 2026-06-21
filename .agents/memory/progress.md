# Progress

### 2026-06-21 — PR #386 R3 Grok + Brave aprovado no preview novo (49505a29)

- **Commit/push:** `49505a29 fix: alinhar grounding Brave — finalizar run LiteLLM`.
- **Preview validado:** `https://scoutagro-m8rhm7656-brunolimaff-3629s-projects.vercel.app`.
- **R3 Scheffer:** Playwright passou em 3.9 min; dossiê 8.068 chars; "Ver relatório completo" `panelEmpty=false`; 0 ocorrências de "NÃO encontrado".
- **Brave no waterfall:** 5 chamadas `/api/open-web-search`, todas `source=Brave Search API`, `rawCount=6`, `resultCount=4`, `afterFinalLimitCount=4`, `degraded=false`.
- **Experimento:** `createRun` 200, `finalizeRun` 200, `fallbackUsed=false`, `runStatus=success`.
- **CI:** Typecheck, Tests, Coverage Gate, Build, Dossier Golden, Smoke preview, GitGuardian e Analyze jobs OK; status agregado `CodeQL` ainda aparece FAILURE no rollup.
- **Gates locais:** `npm run typecheck` OK; testes focados 36/36 OK; `npm run build` OK; `npm test` 1620/1620 OK.

### 2026-06-21 — PR #386 ajuste final Brave grounding + finalizeRun (local, pendente push)

- **Brave endpoint preview validado:** `/api/open-web-search` em `4d17ff96` respondeu 200 com `source=Brave Search API`, `rawCount=6`, `afterFinalLimitCount=4`, `degraded=false`.
- **Causa raiz grounding vazio:** `api/open-web-search` expõe `sources`, mas `utils/llm/webSearchService.ts` lia só `results`; corrigido localmente para aceitar ambos.
- **Causa raiz `finalizeRun` 401:** `FinalizeRunPayload` não carregava `operatorEmail`, então preview local auth autenticava `createRun` mas não `finalizeRun`; corrigido localmente.
- **E2E R3:** helper agora lida com diálogo "Histórico de investigações" e captura Brave + `llm-experiment`; modo real auth só via `E2E_REAL_AUTH=1` + `E2E_AUTH_PASSWORD` em env, sem gravar segredo.
- **Rodada preview antigo `cad2dc`:** waterfall renderizou 7.696 chars, `Ver relatório completo` não ficou vazio, mas validação NAO APROVADA porque grounding efetivo ficou vazio e `finalizeRun` retornou 401.
- **Validação local:** `npm run typecheck` OK; testes focados 36/36 OK; `npm run build` OK.
- **Pendente:** commit/push, novo preview Vercel, R3 Scheffer com Brave fontes curadas + `finalizeRun` 200 + `fallbackUsed=false`.

### 2026-06-21 — PR #386 Fase 10 + ajustes Brave Search (12 commits, ate dd49f8ff)

- **Brave Search ajustes pos-implementacao:** 6 novos commits de fix no open-web-search.ts e webSearchService.ts
- **search_lang corrigido:** pt -> pt-br (Brave rejeitava com 422)
- **Testes open-web-search:** atualizados para Brave + DuckDuckGo providers
- **Logging adicionado:** console.warn/error/log em todos os caminhos do Brave Search
- **\_debug na resposta:** hasBraveKey, braveAttempted expostos para diagnostico
- **Modelo alternativo:** trocado para Grok 4 Fast Reasoning (6.9-11.7s, mais rapido que Grok 4.20)
- **BLOQUEIO:** Brave Search curadoria retorna 0 resultados — provavel filtro -site: quebrando as queries
- **Arquivos referencia:** GOLDEN_DOSSIER_SCHEFFER_Grok4.20.md, REFERENCIA_Gemini_SchefferR3.md, REFERENCIA_Gemini_Polato.md
- **Testes:** 1613/1613 verdes, typecheck limpo, build OK

### 2026-06-21 — PR #386 Brave Search + Web Search + testes (Fase 10, ate 78a7805c)

- **webSearchService.ts criado:** 5 queries paralelas (razao social, CNAE, socio/fundador, holding/grupo, endereco) + curadoria (remove listas telefonicas, duplicatas) + formatacao grounding context block
- **api/open-web-search.ts modificado:** Brave Search como provider primario, DuckDuckGo fallback
- **waterfall-orchestrator.ts modificado:** injecao do groundingContextBlock no sharedDossierModuleOptions quando llmEnabled=true
- **Modelos adicionados ao catalogo:** grok-4.20 (variante G), deepseek-v4-pro (variante H)
- **Estouro limite 12 functions Vercel Hobby:** web search consolidado no api/open-web-search.ts existente
- **Bugs corrigidos:** search_lang pt -> pt-br (422), types Brave Search, testes desatualizados

### 2026-06-21 — PR #386 validacao 3 modelos + descoberta cache gap (F6-F10)

(conteudo mantido — 3 modelos validados, foundation cache gap descoberto)

### 2026-06-21 — PR #386 gate fix 3 camadas + validacao DeepSeek V4 Flash (F1-F6)

(conteudo mantido do progresso anterior)

### 2026-06-21 — PR #386 diagnostico duplo bloqueio (gate + billing) + plano 9 fases

(conteudo mantido do progresso anterior)

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
