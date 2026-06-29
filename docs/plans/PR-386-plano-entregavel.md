# Plano Entregável — PR #386 LiteLLM

**Data:** 2026-06-23 (fechado) | **Branch:** `feat/litellm-experiment` | **HEAD:** `9ef5b105`
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
**Preview:** https://scoutagro-ak7ic69gz-brunolimaff-3629s-projects.vercel.app

---

## 1. O Que Esta PR Tenta Fazer

Adicionar suporte a modelos não-Gemini (Claude Haiku 4.5, Grok 4.1 Fast, Amazon Nova 2 Lite, GLM-5) via proxy LiteLLM interno da Senior (`litellm.dev.seniorlabs.io`). O fluxo normal usa Gemini com Foundation Cache e funciona em ~5 minutos para um dossiê completo. O experimento LiteLLM deveria substituir o modelo de cada módulo por um modelo alternativo, mantendo o mesmo orquestrador (waterfall).

**Após ~8h de debugging, 16+ commits e 6 deploys, o experimento NÃO funciona:** 6 runs consecutivas com 0 módulos gerados, 54-67s de latência, `fallback_used: false` e `error_normalized: null`.

---

## 2. Arquitetura do Experimento

### 2.1 Fluxo Completo (Cliente → Servidor → LiteLLM)

```
Browser (React)
  │
  ├─ waterfall-orchestrator.ts:684
  │   resolveLiteLLMExperimentGate(operatorEmail)
  │   └─ experimentGate.ts:24 → supabase.auth.getSession()
  │   └─ experimentGate.ts:40 → getExperimentConfig().enabled?
  │   └─ Retorna { llmEnabled: true/false, operatorEmail, ... }
  │
  ├─ waterfall-orchestrator.ts:701
  │   effectiveFoundationCacheEnabled = llmEnabled ? false : isFoundationCacheEnabled()
  │   ⚠️ Quando llmEnabled=true, Foundation Cache é DESLIGADO
  │
  ├─ waterfall-orchestrator.ts:704-706
  │   selectExperimentModel() → { model: "bedrock/us.anthropic.claude-haiku-4-5-...", ... }
  │   └─ modelRouter.ts:111 → config.enabled? → sim → retorna modelo LiteLLM
  │
  ├─ waterfall-orchestrator.ts:708
  │   createExperimentRun() → POST /api/llm-experiment
  │   └─ experiment.ts:79-141 → fetch com timeout 15s + retry
  │   └─ Cria registro em llm_experiment_runs (status: "running")
  │
  ├─ waterfall-orchestrator.ts:831-836  ⚠️ FASE PRÉ-MÓDULO (C3)
  │   buildTeiaResearchContext() → QSA + concorrentes + PORTA
  │   └─ buildWaterfallSocioSearchContext() → cap agregado 100s, lote 52s
  │   └─ Roda ANTES do loop; pode consumir ~52–62s sem nenhum generateContent
  │
  ├─ waterfall-orchestrator.ts:909-928
  │   enrichDossierWithWebSearch(empresa) → 5 buscas paralelas (só se llmEnabled)
  │   └─ webSearchService.ts:147 → Promise.all de 5 searchOne()
  │   └─ webSearchService.ts:59 → cada searchOne tem AbortSignal.timeout(8000)
  │   └─ ⚠️ A auditoria externa disse que NÃO tinha timeout — ERRADO
  │
  ├─ waterfall-orchestrator.ts:1236 (loop de módulos)
  │   └─ investigation-orchestration.ts:545 generateDossierModule()
  │       ├─ L:555 modelToUse = options.selectedModel || STABLE_RESEARCH_MODEL_ID
  │       ├─ L:556 useLiteLLM = Boolean(options.selectedModel)
  │       ├─ L:560 effectiveUsesFoundationCache = usesFoundationCache && !useLiteLLM
  │       └─ L:604-634 proxyGenerateContent({ model: modelToUse, ... })
  │           │
  │           └─ geminiProxy.ts:291 proxyGenerateContent()
  │               └─ geminiProxy.ts:165 callGeminiApi()
  │                   ├─ L:200 scoutDiag.info('request:start') ⚠️ MUDO no preview
  │                   ├─ L:202 await getSupabaseAuthHeaders()
  │                   │   └─ supabaseClient.ts:16 → supabase.auth.getSession()
  │                   │   └─ ⚠️ Deadlock navigator.locks se getSession concorrente (C2)
  │                   ├─ L:208 fetch('/api/gemini', { action: 'generateContent', model: 'bedrock/...' })
  │                   │
  │                   └─ Servidor Vercel (/api/gemini.ts)
  │                       ├─ L:769 GeminiRequestSchema.safeParse(req.body)
  │                       ├─ L:774 body = parsed.data
  │                       ├─ L:780 new GoogleGenAI({ apiKey })
  │                       └─ L:781 executeGeminiAction(ai, body, req, res)
  │                           └─ L:433 case 'generateContent':
  │                               ├─ L:457 isLiteLLMEnabled() → G1
  │                               ├─ L:458 useLiteLLMPath = G1 && !model.includes('gemini') → G2
  │                               ├─ L:469 authenticateExperimentRequest(req) → G3
  │                               ├─ L:501 allowedModels.includes(requestedModel) → G5
  │                               └─ L:512 executeLiteLLMGenerateContent(ai, body, res, signal)
  │                                   └─ L:353 callLiteLLM({ model, systemInstruction, userContent, ... })
  │                                       └─ _llm-client.ts:218 callLiteLLM()
  │                                           ├─ L:231 resolveLiteLLMRequestBudgetMs(env.LITELLM_REQUEST_TIMEOUT_MS)
  │                                           │   └─ Se undefined → 55_000
  │                                           │   └─ Se "10000" → Math.min(10000, 55000) = 10000
  │                                           ├─ L:240 deadline = Date.now() + effectiveTimeoutMs
  │                                           ├─ L:265-281 fetch(litellm.dev.seniorlabs.io/chat/completions)
  │                                           └─ L:314-336 catch → retry ou throw
  │                                               └─ L:392-398 catch em executeLiteLLMGenerateContent
  │                                                   └─ respondWithGeminiFallback('error')
```

### 2.2 Gates (cliente vs servidor)

**Cliente (antes do fetch):**

| Gate | Arquivo:Linha                    | Verificação                                              |
| ---- | -------------------------------- | -------------------------------------------------------- |
| G0   | `utils/llm/experimentGate.ts`    | `config.enabled` + sessão Supabase ou preview local auth |
| G4c  | `utils/llm/modelRouter.ts:78-86` | `allowlist.length > 0 && email in allowlist`             |

**Servidor (`/api/gemini` generateContent):**

| Gate | Arquivo:Linha                | Verificação                                                                   |
| ---- | ---------------------------- | ----------------------------------------------------------------------------- |
| G1   | `api/_llm-client.ts:60`      | `LLM_PROVIDER === 'litellm' && LITELLM_API_KEY && LITELLM_BASE_URL`           |
| G2   | `api/gemini.ts:458`          | `!requestedModel.includes('gemini')` — se for Gemini, vai pelo caminho nativo |
| G3   | `api/_experiment-auth.ts:42` | Supabase Bearer token OU preview local auth (`x-experiment-operator-email`)   |
| G5   | `api/gemini.ts:501`          | `allowedModels.includes(requestedModel)` (catálogo server-side)               |

### 2.3 Env Vars no Preview Vercel

```
LLM_PROVIDER=litellm
LLM_EXPERIMENT_MODE=fixed
LLM_MODEL_DEFAULT=bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0
LLM_FALLBACK_ENABLED=true
LLM_ALLOWLIST=bruno.ferreira@senior.com.br
LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH=true
LITELLM_API_KEY=sk-...
LITELLM_BASE_URL=https://litellm.dev.seniorlabs.io
LITELLM_REQUEST_TIMEOUT_MS=10000       ← configurado mas pode não ser lido
LITELLM_MAX_RETRIES=0
SUPABASE_URL=(configurado)
SUPABASE_SERVICE_ROLE_KEY=(configurado)
GEMINI_API_KEY=(configurado)
GEMINI_API_KEY_FALLBACK=(configurado)
```

**Espelho cliente (`VITE_*` no preview — confirmado em `.audit-pr386/STATE-OF-PR-386.md`):**

```
VITE_LLM_PROVIDER=litellm
VITE_LLM_EXPERIMENT_MODE=fixed
VITE_LLM_MODEL_DEFAULT=(mesmo que server)
VITE_LLM_FALLBACK_ENABLED=true
VITE_LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH=true
```

**Diagnóstico cliente:**

- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` — **confirmadas implícitas** (auth Supabase funciona; `supabase !== null`)
- `VITE_SCOUT_DIAGNOSTICS_ENABLED` / `VITE_VERBOSE_LOGS` — `scoutDiag.info()` é **mudo**; usar `warn`/`error` ou `console.error('[TRACE]')`

---

## 3. Evidência do Supabase (Dados Reais)

### 3.1 Chamadas Gemini que FUNCIONARAM (18:20-18:22 UTC, 23/Jun)

5 chamadas `generateContent` — TODAS com `foundationCacheName` presente:

| Hora     | Módulo              | Duração | Response   |
| -------- | ------------------- | ------- | ---------- |
| 18:20:30 | Teia Identidade     | 14.7s   | 1181 chars |
| 18:20:47 | Teia Profundidade   | 20.3s   | 5198 chars |
| 18:21:08 | Operação            | 22.6s   | 5487 chars |
| 18:21:30 | Bordas de Controle  | 18.5s   | 5724 chars |
| 18:21:49 | Riscos & Compliance | 18.8s   | 4998 chars |

**Diagnóstico:** `foundationCacheName` presente = Foundation Cache ativo = `llmEnabled` era FALSE. **Não contradiz o achado crítico** — são runs GEMINI separados, não LiteLLM.

### 3.2 Runs do Experimento LiteLLM (TODAS falhas)

| Run ID   | Modelo    | Status | Latência | Chars | Módulos | Fallback |
| -------- | --------- | ------ | -------- | ----- | ------- | -------- |
| 94c1be03 | haiku-4-5 | failed | 62.3s    | 0     | 0       | false    |
| 3d8f698a | haiku-4-5 | failed | 63.0s    | 0     | 0       | false    |
| 8a32a0f4 | haiku-4-5 | failed | 62.5s    | 0     | 0       | false    |
| 2fb7d7ca | haiku-4-5 | failed | 54.0s    | 0     | 0       | false    |
| 62d7ac48 | haiku-4-5 | failed | 63.0s    | 0     | 0       | false    |
| aaff2189 | haiku-4-5 | failed | 67.4s    | 0     | 0       | false    |

**Padrão consistente:** ~62s, 0 módulos, 0 chars, fallback_used=false, error_normalized=null.

### 3.3 Achado Crítico (confirmado em código + Network)

Durante runs LiteLLM no preview:

- **ZERO** POSTs `action: generateContent` chegam a `/api/gemini` — só `recordDiagnostics`
- TRACE **G1–G5** nunca aparecem nos logs Vercel do waterfall LiteLLM
- O problema está **antes do servidor** (cliente ou fase pré-módulo), não no proxy LiteLLM em si

---

## 4. Erros no Plano Anterior (corrigidos)

| #   | Erro                               | Correção                                                                                                     |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| E1  | H9: "`supabase` null sem VITE\_\*" | Auth confirmada → `supabase` existe; hipótese **deadlock `getSession()`** é **ATIVA** (C2)                   |
| E2  | A1: "fetch PODE estar disparando"  | Achado crítico: **fetch `generateContent` NÃO dispara**; A1 é só **cegueira de logs**, não hipótese raiz     |
| E3  | §3.1 lido como sucesso LiteLLM     | 5 `generateContent` com `foundationCacheName` = runs **GEMINI**, separados                                   |
| E4  | Fase 1.5–1.6 como bloqueante       | **Defensiva/opcional** — cada `searchOne` já tem `AbortSignal.timeout(8000)`                                 |
| E5  | Bug B como hipótese primária       | **Secundário** até confirmar request no servidor (G1 nos logs)                                               |
| E6  | Falta fase pré-módulo              | `buildTeiaResearchContext` + `buildWaterfallSocioSearchContext` (cap 100s, lote 52s) rodam **antes** do loop |
| E7  | Gates só server-side               | G4 cliente (`modelRouter.ts:78-86`) é gate **independente** do G4/G5 servidor                                |
| E8  | `error_normalized` ignorado        | Cliente **nunca envia** `errorNormalized` em `finalizeExperimentRun` → sempre `null`                         |

---

## 5. Hipóteses (reordenadas por probabilidade)

| Rank | ID     | Hipótese                                                                     | Prob.              | Confirmar                                                                 | Rejeitar                            |
| ---- | ------ | ---------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------- | ----------------------------------- |
| 1    | **C3** | Fase pré-módulo trava/aborta (`socio-search` ~52s/lote + CNPJ) antes do loop | **ALTA**           | TRACE `post-teia` sem `module:start`; Network `/api/socio-search` ~52–62s | `fetch-disparado` + G1 no mesmo run |
| 2    | **C2** | `getSupabaseAuthHeaders()` pendura (deadlock `navigator.locks`)              | **ALTA**           | `request:start` sem `pre-fetch`; hang ~60s                                | `hasAuth` em <3s; `fetch-disparado` |
| 3    | **C1** | `generateDossierModule` / `proxyGenerateContent` nunca chamados              | **MÉDIA-ALTA**     | Sem TRACE em `proxyGenerateContent` entry                                 | TRACE `module:start` + fetch        |
| 4    | **A2** | `activeSignal` abortado antes do `fetch`                                     | **MÉDIA**          | `signalAborted: true` no pre-fetch                                        | `signalAborted: false`              |
| 5    | **B**  | Servidor: `callLiteLLM` 55s + Hobby 60s mata antes do fallback               | **BAIXA** (até G1) | G1–G5 nos logs; latência server ~55–60s                                   | Zero logs G1–G5                     |
| —    | **V1** | `scoutDiag.info` mudo                                                        | **N/A**            | Mascara diagnóstico, não é causa                                          | `warn`/`console.error`              |

### 5.1 Refutadas (H1–H8)

H1–H8 conforme tabela original. **H9 removida** → reclassificada como C2.

---

## 6. Divergências com a Auditoria Externa (aa.rtf)

A auditoria foi feita pelo Claude Opus 4.8 e acertou em vários pontos, mas cometi erros ao revisá-la:

| Ponto                                       | Disse a Auditoria                            | Realidade (código)                                                           |
| ------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| `searchOne` não tem timeout                 | "sem timeout, sem AbortSignal"               | `webSearchService.ts:59`: `AbortSignal.timeout(8000)`                        |
| `enrichDossierWithWebSearch` é o bloqueador | "Promise.all fica pendurado indefinidamente" | Cada busca timeout em 8s + catch retorna `[]`; waterfall tem try/catch extra |
| Bug A é `enrichDossierWithWebSearch`        | Culpado principal                            | Inocente — timeouts garantem que completa em ~8s                             |
| `scoutDiag.info` visível no preview         | Tratado como evidência confiável             | `diagnosticLog.ts:601`: só funciona com `VITE_VERBOSE_LOGS=true` ou DEV      |

**O que a auditoria acertou:**

- Bug B (teto 60s Hobby) está correto
- Diagnóstico de 2 bugs independentes está correto
- Plano de 2 fases (instrumentar primeiro, corrigir depois) está correto
- Modelo mais rápido não resolve (o problema é anterior à chamada do modelo)

---

## 7. Plano de Execução FINAL

**Estratégia:** Fase 1 instrumentação cliente → reproduzir → Fase 2 correção **condicional** por hipótese confirmada.

### Fase 1 — Instrumentação cliente (bloqueante)

| Passo                | Arquivo                              | Ação                                                                                      | Depende de |
| -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- | ---------- |
| **1.1**              | `geminiProxy.ts:291`                 | `[TRACE] proxyGenerateContent:entry` no export                                            | —          |
| **1.2**              | `geminiProxy.ts:200`                 | `scoutDiag.warn` + `[TRACE] request:start`                                                | 1.1        |
| **1.3**              | `geminiProxy.ts:202`                 | `[TRACE] pre-fetch` (action, model, hasAuth, signalAborted) após `getSupabaseAuthHeaders` | 1.2        |
| **1.4**              | `geminiProxy.ts:208`                 | `[TRACE] fetch-disparado` antes do `fetch`                                                | 1.3        |
| **1.5**              | `geminiProxy.ts:176`                 | Guard `signal?.aborted` antes do controller                                               | 1.2        |
| **1.6**              | `waterfall-orchestrator.ts`          | `[TRACE] post-teia`, `pre-websearch`, `pre-module-loop`                                   | —          |
| **1.7**              | `investigation-orchestration.ts:545` | `[TRACE] module:start` com `useLiteLLM`, `modelToUse`                                     | —          |
| **1.8**              | `_llm-client.ts:65`                  | Confirmar G1 já deployado (server)                                                        | deploy     |
| **1.9** _(opcional)_ | `webSearchService.ts` + orchestrator | Propagar `activeSignal` em `enrichDossierWithWebSearch`                                   | defensivo  |

**Gate local:** `npm run typecheck && npm run build && npm test`

### Fase 1.5 — Reproduzir no preview

| Passo     | Ação                                                                                                                                          | Depende de |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **1.5.1** | Push → deploy preview Vercel                                                                                                                  | Fase 1     |
| **1.5.2** | Waterfall LiteLLM (CNPJ Scheffer)                                                                                                             | 1.5.1      |
| **1.5.3** | Coletar: Network (`generateContent` vs `recordDiagnostics`), console `[TRACE]`, `scout_diagnostics`, logs Vercel G1–G5, `llm_experiment_runs` | 1.5.2      |

**Árvore de decisão pós-coleta:**

```
Sem [TRACE] post-teia / pre-module-loop     → C3 (pré-módulo)
post-module-loop + sem proxyGenerateContent → C1
proxyGenerateContent + sem pre-fetch        → C2 (auth hang)
pre-fetch signalAborted=true                → A2
fetch-disparado + sem G1                    → rede/CORS/endpoint
G1 + timeout ~55-60s                        → B (Hobby)
```

### Fase 2 — Correção condicional (após medir)

| Se confirmado | Correção                                                                                                                   | Arquivos                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **C3**        | Reduzir cap socio-search no preview LiteLLM; garantir degrade não propaga abort ao loop; TRACE timing por lote             | `waterfall-socio-search.ts`, orchestrator |
| **C2**        | `Promise.race` 3s em `getSupabaseAuthHeaders`; singleton/dedupe `getSession`                                               | `supabaseClient.ts`, `geminiProxy.ts`     |
| **C1**        | Rastrear `assertNotAborted` / catch que engole erro antes do loop                                                          | `waterfall-orchestrator.ts`               |
| **A2**        | Corrigir propagação de abort (parent signal → waterfall hard-cap)                                                          | orchestrator, `runWithStepTimeout`        |
| **B**         | `MAX_LITELLM_REQUEST_TIMEOUT_MS` → 38_000; validar leitura `LITELLM_REQUEST_TIMEOUT_MS`                                    | `_llm-client.ts`                          |
| **E8**        | Enviar `errorNormalized` em `finalizeExperimentRun` (ex.: `client_no_generate_content`, `auth_hang`, `pre_module_timeout`) | `experiment.ts`, orchestrator `finally`   |

**Não aplicar Fase 2 sem evidência da Fase 1.5.**

---

## 8. Riscos e Mitigações

| Risco                                   | Impacto                   | Mitigação                                           |
| --------------------------------------- | ------------------------- | --------------------------------------------------- |
| Instrumentação insuficiente → 2ª rodada | Atraso 1+ deploy          | Milestones TRACE cobrem pré-módulo + proxy + server |
| C3 mascarado por degrade silencioso     | 62s sem módulos           | Log `elapsedMs` por lote socio-search               |
| C2 deadlock intermitente                | Falha só sob concorrência | Race 3s + medir tempo `getSupabaseAuthHeaders`      |
| Bug B corrigido cedo demais             | Mascara C1–C3             | B só após G1 confirmado                             |
| `recordDiagnostics` domina Network      | Falso "app funciona"      | Filtrar por `action:generateContent`                |
| Hobby 60s após fix cliente              | Módulos timeout           | Budget 38s + fallback Gemini                        |
| TRACE em prod pós-merge                 | Ruído/PII                 | Remover em commit de limpeza pós-validação          |

---

## 9. Orquestração de Subagentes

| Ordem | Agente          | Escopo                                            | Paralelo? |
| ----- | --------------- | ------------------------------------------------- | --------- |
| 1     | **implementer** | Fase 1 (1.1–1.7, opcional 1.9)                    | —         |
| 2     | **validator**   | `typecheck`, `test`, `build` pós-Fase 1           | após 1    |
| 3     | **debugger**    | Deploy preview + reproduzir + árvore de decisão   | após push |
| 4     | **implementer** | Fase 2 conforme hipótese confirmada               | após 3    |
| 5     | **validator**   | `npm run test:e2e:report-ready` no preview (390s) | após 4    |

**Não usar planner/reviewer até Fase 1.5 ter dados.**

---

## 10. Critérios de Sucesso (fechar PR #386)

| #   | Critério                  | Mensurável                                                      |
| --- | ------------------------- | --------------------------------------------------------------- |
| S1  | Request chega ao servidor | ≥1 POST `action:generateContent` no Network durante run LiteLLM |
| S2  | Gates server-side passam  | G1 + G2 nos logs Vercel do mesmo run                            |
| S3  | Módulos gerados           | `llm_experiment_runs.modules_generated >= 5`                    |
| S4  | Dossiê renderizado        | `report_chars > 5000`; painel com `bot-message-content`         |
| S5  | Gate delivery-loop        | `npm run test:e2e:report-ready` verde no preview                |
| S6  | Telemetria em falha       | `error_normalized` preenchido quando `status=failed`            |
| S7  | Qualidade (manual)        | Scheffer R3 ou golden — **fora do loop**, antes de MERGE        |

**MERGE:** só com token **MERGE** + S1–S6 + validação manual S7.

---

## 11. Notas API Design

### Gates cliente vs servidor

| Camada         | Onde                                           | O que valida                                |
| -------------- | ---------------------------------------------- | ------------------------------------------- |
| Cliente G0     | `experimentGate.ts`                            | sessão Supabase + `config.enabled`          |
| Cliente G4     | `modelRouter.ts:78-86`                         | allowlist email                             |
| Servidor G1–G5 | `_llm-client`, `gemini.ts`, `_experiment-auth` | provider, modelo, auth, allowlist, catálogo |

Cliente pode abrir gate (UI mostra experimento) enquanto servidor rejeita — ou cliente nunca envia request (estado atual).

### Gap `error_normalized`

- API aceita `errorNormalized` → `error_normalized` (`api/llm-experiment.ts:174`)
- `waterfall-orchestrator.ts` `finalizeExperimentRun` **não popula** o campo
- Resultado: todas as 6 falhas com `error_normalized=null` — **não prova ausência de erro**, prova gap de contrato cliente→API

### `recordDiagnostics` vs `generateContent`

- `recordDiagnostics` posta continuamente → mascara ausência de `generateContent` em inspeção casual
- Critério S1 deve filtrar explicitamente por `action`

---

## 12. O Que NÃO Fazer

1. **NÃO trocar de modelo** — Haiku 4.5 já é o mais rápido disponível. Se ele falha em 62s, qualquer modelo thinking (V4 Pro, R1, GLM-5) seria pior. Velocidade do modelo não é a causa raiz.
2. **NÃO fazer upgrade do plano Vercel** — o usuário confirmou que fica no Hobby.
3. **NÃO mergear sem waterfall LiteLLM validado** — a PR está bloqueada com MERGE_READY=false.
4. **NÃO remover os logs de debug antes de diagnosticar** — 16+ commits de `[TRACE]` e `BUILD_TS` serão limpos só no final.

---

## 13. Arquivos do Projeto (Referência Rápida)

| Arquivo                                          | Linhas | Função Principal                                                          |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------- |
| `api/gemini.ts`                                  | 800    | Handler principal — recebe `generateContent`, decide Gemini vs LiteLLM    |
| `api/_llm-client.ts`                             | 345    | `callLiteLLM()`, `isLiteLLMEnabled()`, budget, retry                      |
| `api/_experiment-auth.ts`                        | 153    | `authenticateExperimentRequest()` — Supabase ou preview local             |
| `api/ping-litellm.ts`                            | 72     | Endpoint diagnóstico para testar conectividade com proxy                  |
| `services/geminiProxy.ts`                        | 387    | `proxyGenerateContent()`, `callGeminiApi()` — cliente HTTP                |
| `utils/llm/modelRouter.ts`                       | 117+   | `getExperimentConfig()`, `selectExperimentModel()`, `isOperatorAllowed()` |
| `utils/llm/modelCatalog.ts`                      | ?      | `EXPERIMENT_MODELS` — catálogo de modelos                                 |
| `utils/llm/experimentGate.ts`                    | 66     | `resolveLiteLLMExperimentGate()` — decide se LiteLLM está habilitado      |
| `utils/llm/experiment.ts`                        | 156    | `createExperimentRun()`, `finalizeExperimentRun()`                        |
| `utils/llm/webSearchService.ts`                  | 183    | `enrichDossierWithWebSearch()` — 5 buscas paralelas                       |
| `utils/diagnosticLog.ts`                         | 641    | `scoutDiag` — diagnóstico persistente (Silent no preview!)                |
| `lib/supabaseClient.ts`                          | 51     | `getSupabaseAuthHeaders()` — cliente Supabase                             |
| `features/dossier/waterfall-orchestrator.ts`     | 748+   | Orquestrador do waterfall — loop de módulos                               |
| `services/gemini/investigation-orchestration.ts` | ?      | `generateDossierModule()` — geração de 1 módulo                           |
| `services/gemini/runtime.ts`                     | 165    | `runWithStepTimeout()` — timeout por módulo                               |
| `vercel.json`                                    | ~40    | Config Vercel — `maxDuration: 300` (ignorado no Hobby)                    |

---

## 14. Constraints Técnicas

- **Plano Vercel:** Hobby — teto 60s por invocação serverless, `maxDuration` ignorado
- **Node:** 24.x (`package.json:engines`)
- **Supabase:** `@supabase/supabase-js: ^2.106.1` — conhecido por deadlock com `navigator.locks` em `getSession()` concorrente
- **Proxy LiteLLM:** `litellm.dev.seniorlabs.io` (dev), `litellm.seniorlabs.io` (prod — rejeita a chave atual)
- **Testes:** 1683/1683 verdes, TypeCheck OK, Build OK

---

## 15. Próximo Passo Imediato

1. **implementer:** Fase 1 passos 1.1–1.7 (+ 1.9 opcional)
2. **validator:** `typecheck` + `test` + `build`
3. Push → preview → **debugger:** reproduzir Scheffer + árvore de decisão
4. **implementer:** Fase 2 condicional
5. **validator:** `test:e2e:report-ready` no preview
