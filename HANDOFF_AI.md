# Handoff — PR #386: READY TO MERGE — 20 commits, 2 waterwalls validados em producao

**Atualizado:** 2026-06-24 18:00
**Branch:** `feat/litellm-experiment`
**HEAD:** `ffdcf096` (20 commits de `origin/main`, +10 desde ultimo handoff)
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386

---

## ESTADO ATUAL

### STATUS: PRONTO PARA REVISAO FINAL (Bruno vai revisar)

2 waterwalls validados em producao. 20 commits. Bug do timeout 38s corrigido. Cap 330s removido. Pipeline hibrido funcional.

### NOVOS COMMITS (nesta sessao — 2 novos)

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

### 2 WATERWALLS VALIDADOS EM PRODUCAO

- **1o:** status=completed, 6/6 modulos, 47.573 chars, score PORTA 75, $0.135, 317s
- **2o (Tabbit):** status=completed, 6/6 modulos, 51.043 chars, $0.137, 373s
- **HYBRID_MODEL_MAP confirmado:** Sonnet 4.6 na Operacao (69-72s) e Caminho de Venda; DeepSeek V3.2 nos demais (Teia, Bordas, Riscos)

### MAPEAMENTO DE 30 ENV VARS LITELLM

Plano completo em: `/Users/brunolima/.claude/plans/streamed-purring-gem.md`

**Vercel: Adicionadas:**

- `VITE_HYBRID_PIPELINE_ENABLED=true`
- `VITE_LITELLM_CLIENT_TIMEOUT_MS=120000`

**Vercel: Removidas (zumbis):**

- `VITE_LITELLM_REQUEST_TIMEOUT_MS` (nunca foi lido pelo codigo)
- `LLM_FALLBACK_ENABLED` (substituido por `isFallbackEnabled=false`)
- `VITE_LLM_FALLBACK_ENABLED` (substituido por `isFallbackEnabled=false`)

### ARQUITETURA DE TIMEOUTS ATUAL

| Camada            | Valor                                    | Arquivo                                              |
| ----------------- | ---------------------------------------- | ---------------------------------------------------- |
| Cliente (env var) | `VITE_LITELLM_CLIENT_TIMEOUT_MS=120000`  | waterfall-orchestrator, geminiProxy                  |
| Servidor (cap)    | `MAX_LITELLM_REQUEST_TIMEOUT_MS=180_000` | `api/_llm-client.ts:7`                               |
| Efetivo           | `Math.min(120000, 180000) = 120s`        |                                                      |
| Waterfall         | SEM HARD CAP                             | `waterfall-orchestrator.ts` (removido em `ffdcf096`) |

### BUG IDENTIFICADO (NAO corrigido)

- **"Ver relatorio completo (+3 secoes)" nao expande ao clicar**
- Componente: `SectionalBotMessage.tsx`, usa `useDeferredValue`
- Nao foi causado pelas alteracoes desta PR (bug pre-existente)
- Commit suspeito: `eea8783c` (Cofre overlay — adicionou useDeferredValue)
- Vercel Live Feedback (`<vercel-live-feedback>` com z-index 2147483647) estava bloqueando cliques — desativado no painel Vercel
- Tabbit acionado para debugar, resultado pendente

### O QUE FUNCIONA (testado)

- **`respondWithGeminiFallback` REMOVIDO** — nao existe mais no codigo (commit `322b3d7f`). Zero Gemini como provider principal.
- **`isFallbackEnabled = false`** hardcoded em `_llm-client.ts:79` — pipeline hibrido nao faz fallback automatico.
- **`checkReportQuality`** modo lenient implementado (`164ad5d3`) — aceita provider nao-Gemini sem bloquear renderizacao.
- **`HYBRID_MODEL_MAP`** implementado em `modelRouter.ts` — Sonnet 4.6 para modulos criticos, DeepSeek V3.2 para operacionais. Testes unitarios em `modelRouter.test.ts`.
- **`DossierModuleError`** type + `ModuleErrorCards` component para erros por modulo.
- **`moduleName`** no waterfall-orchestrator para roteamento por modelo.
- **`resolveLiteLLMClientTimeoutMs()`** lendo env var (default 120s).
- **Waterfall sem hard-cap** — timeout individual de 120s por modulo.

### O QUE NAO FUNCIONOU

1. **Ultracode worktrees em base errada = codigo PERDIDO.** 7 agentes Ultracode fizeram mudancas em worktrees com base errada. NADA chegou ao branch. Skeleton inline, contador real, Brave Search contextual, Foundation Block condensado, DeepDiveTopics — tudo perdido.
2. **PR body desatualizado** — ainda menciona Grok e commits antigos. Precisa atualizar descricao.
3. **4 checks CI falhando:**
   - Coverage Gate (2m)
   - GitGuardian Security Checks (1s)
   - Golden Dossier Live (7m57s — blocking)
   - Tests (2m04s)
4. ~~**callLiteLLM NAO testado com timeout novo**~~ — RESOLVIDO. 2 waterwalls completos em producao com timeout 120s efetivo.
5. **CNPJ Lookup quebrado** (BrasilAPI 403) — ainda nao resolvido.
6. **19 runs orfas** em `llm_experiment_runs` (status: running).
7. **waterfall_logs parados desde 30/maio.**
8. **SectionalBotMessage expand nao funciona** — bug pre-existente, nao relacionado a esta PR.

---

## ARQUITETURA ATUAL (branch feat/litellm-experiment)

- **Provedores:** Sonnet 4.6 (criticos) + DeepSeek V3.2 (operacionais) via LiteLLM/Bedrock. DeepSeek direto (`api.deepseek.com`) como provider economico.
- **Gemini:** ELIMINADO como provider principal. `respondWithGeminiFallback` removido.
- **Fallback:** Binario (ou roda ou mostra erro) — `isFallbackEnabled = false`.
- **Roteamento:** HYBRID_MODEL_MAP em `utils/llm/modelRouter.ts`.
- **Qualidade:** `checkReportQuality` com modo lenient implementado.
- **UI Loading:** AINDA CofreOverlay (skeleton inline perdido nos worktrees). Cofre tem fixes: computeItemKey, isCofreRenderReady, safety-net dissolve 3s.
- **Erro por modulo:** DossierModuleError + ModuleErrorCards.

---

## PROXIMOS PASSOS (pos-revisao Bruno)

| #   | Prioridade | Tarefa                                                              | Risco                  |
| --- | ---------- | ------------------------------------------------------------------- | ---------------------- |
| 1   | **P0**     | Revisao final do Bruno e subir PR #386                              | PR parada ha 10 dias   |
| 2   | **P1**     | Atualizar PR body (20 commits, sem Grok, pipeline hibrido)          | Documentacao incorreta |
| 3   | **P1**     | Aplicar codigo perdido dos Ultracode worktrees (skeleton, contador) | Retrabalho             |
| 4   | **P1**     | Brave Search contextual por modulo (plano ideator pronto)           | Qualidade waterfall    |
| 5   | **P2**     | Corrigir 4 checks CI (coverage, tests, golden, GitGuardian)         | CI bloqueada           |
| 6   | **P2**     | Diagnosticar SectionalBotMessage expand bug                         | UX quebrada            |
| 7   | **P3**     | DeepDiveTopics com LiteLLM                                          | Proximo passo natural  |
| 8   | **P3**     | Condensar Foundation Block (44K -> 10-15K)                          | Performance            |

---

## TABULACAO DE CORRECOES

| Correcao                                         | Origem       | Arquivo                                       |
| ------------------------------------------------ | ------------ | --------------------------------------------- |
| MAX_LITELLM_REQUEST_TIMEOUT_MS 38s->180s         | Tabbit       | `api/_llm-client.ts:7`                        |
| Timeouts cliente 38s/42s -> 120s (env var)       | Bruno/Bruno  | `waterfall-orchestrator.ts`, `geminiProxy.ts` |
| Hard-cap 330s removido                           | Bruno        | `waterfall-orchestrator.ts`                   |
| checkReportQuality modo lenient                  | Implementado | `utils/llm/reportQuality.ts`                  |
| HYBRID_MODEL_MAP por modulo                      | Implementado | `utils/llm/modelRouter.ts`                    |
| Zero Gemini (respondWithGeminiFallback removido) | Implementado | `api/gemini.ts`                               |
| isFallbackEnabled = false                        | Implementado | `api/_llm-client.ts:79`                       |
| DossierModuleError + ModuleErrorCards            | Implementado | `types.ts`, `components/`                     |
| moduleName no waterfall-orchestrator             | Implementado | `features/dossier/waterfall-orchestrator.ts`  |

---

## LICOES APRENDIDAS (desta sessao)

| #   | Licao                                               | Anti-padrao                                                                | Onde aplicar                                       |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | NUNCA confiar em "ja mudei" sem verificar o arquivo | Assumir que mudanca foi feita sem `git diff` ou `cat` para confirmar       | `CALIBER_LEARNINGS.md`, `docs/obsidian/decisions/` |
| 2   | Worktrees em base errada = codigo perdido           | Nao verificar `git log` da worktree antes de comecar                       | Fluxo de agentes Ultracode                         |
| 3   | Modelo caro != modelo bom                           | Assumir que maior custo = melhor qualidade                                 | Processo de selecao de modelos                     |
| 4   | Testar nos 3 ambientes antes de concluir            | Testar so em DEV e assumir PROD igual                                      | Deploy checklist                                   |
| 5   | Tabbit achou em 5 min o que levamos 7 dias          | Debug por tentativa sem audit automatizado                                 | Adotar Tabbit como gate de PR                      |
| 6   | Hard-cap global oculta timeout individual           | Cap unico aborta tudo em vez de deixar cada modulo expirar individualmente | Timeout design pattern                             |

---

**Prompt de retomada:**
"Retomar PR #386: HEAD `ffdcf096` (20 commits, +10 desde ultimo handoff). 2 waterwalls validados em producao (6/6 modulos, 47-51K chars, $0.135-0.137). HYBRID_MODEL_MAP confirmado: Sonnet na Operacao, DeepSeek nos demais. Timeouts padronizados: VITE_LITELLM_CLIENT_TIMEOUT_MS=120000 (cliente), MAX_LITELLM_REQUEST_TIMEOUT_MS=180_000 (servidor), 120s efetivo. Hard-cap 330s removido. Bug pre-existente: 'Ver relatorio completo' nao expande (SectionalBotMessage, useDeferredValue). Vercel Feedback desativado (bloqueava cliques). 4 CI checks falhando. PR body desatualizado. Bruno vai fazer revisao final. Proximo passo: subir PR #386 apos revisao."
