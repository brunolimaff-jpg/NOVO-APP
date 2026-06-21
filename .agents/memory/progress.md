# Progress

### 2026-06-21 — PR #386 validacao 3 modelos + descoberta cache gap + Brave Search (F6-F10)

- **Validacao Grok 4.20 Reasoning:** 6/6 modulos, 0 erros, 12-22s/modulo. Rapido mas dossie completamente generico — tudo "Nao encontrado", apenas 1 CNPJ.
- **Validacao DeepSeek V4 Pro:** 1/6 modulos, 44s. Lento, inviavel.
- Validacao DeepSeek V4 Flash ja documentada (2/6, 4 timeouts, 62-119s).
- **DESCOBERTA CRITICA:** Gemini produz dossies excelentes porque recebe foundation cache (~43k chars) + Google Search grounding. Modelos via LiteLLM recebem ~15k chars sem web search. Este e o real diferencial, nao o modelo em si.
- **Fase 10 — Web Search Brave implementada:**
  - `api/open-web-search.ts`: Brave Search como provider primario, DuckDuckGo fallback
  - `utils/llm/webSearchService.ts`: 5 queries paralelas + curadoria + grounding block
  - `waterfall-orchestrator.ts`: injecao no sharedDossierModuleOptions.groundingContextBlock
  - `utils/llm/modelCatalog.ts`: modelos `grok-4.20` e `deepseek-v4-pro` adicionados
- **6 commits novos:** `69242e26` (fix auth 3 camadas), `fa6938b3` (grok-4.20 catalogo), `110fc2ad` (deepseek-v4-pro), `36754f58` (fix Bearer priority), `129a08a3` (web search), `78a7805c` (fix types + cleanup).
- **8 arquivos alterados** no total: experimentGate.ts, types.ts, modelRouter.ts, \_experiment-auth.ts, experiment.ts, geminiProxy.ts, waterfall-orchestrator.ts, experimentGate.test.ts + novos: webSearchService.ts, open-web-search.ts.
- **Pendente:** deploy preview `scoutagro-no9vz1mwu` com Brave Search + smoke Grok com web search.

Last updated: 2026-06-21 — 3 modelos validados, foundation cache gap descoberto, Brave Search implementado (HEAD 78a7805c)

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
