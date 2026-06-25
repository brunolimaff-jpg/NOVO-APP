# PR #386 — LiteLLM Experiment: Estado Completo

> **ATENCAO: Este documento esta DESATUALIZADO.** Foi escrito antes dos 9 fixes que resolveram Virtuoso computeItemKey, static-fallback loop e isCofreRenderReady (commits `3d42cf03` a `fccfddfd`). Para estado atual, consulte:
>
> - `HANDOFF_AI.md` — handoff canonico com resultados do teste `fccfddfd`
> - `CALIBER_LEARNINGS.md` — arquitetura final consolidada
> - `.agents/memory/activeContext.md` — prioridade e metricas atuais
> - `.agents/memory/decisions.md` — decisoes DI-24-11 a DI-24-25 e DI-FINAL
>
> **Mudancas desde este documento:** freeze cause CONFIRMADA (`pushWaterfallPreviewToStore`), 5 fixes de Cofre/UI, PR #387 aberta para code review.

**Projeto:** Senior Scout 360 (NOVO-APP)
**Branch:** `feat/litellm-experiment` (HEAD `6dd6b051`)
**Objetivo:** Adicionar suporte a modelos não-Gemini via proxy LiteLLM

---

## Arquitetura do Experimento

O LiteLLM é um proxy OpenAI-compatible que permite usar modelos de múltiplos providers (AWS Bedrock, Huawei/OpenRouter, Oracle/xAI) através de uma única API.

### Fluxo pretendido

```
Browser (React)
  └─ waterfall-orchestrator.ts
       └─ selectExperimentModel()          → escolhe modelo LiteLLM
       └─ generateDossierModule()
            └─ proxyGenerateContent()       → POST /api/gemini {action:"generateContent", model:"bedrock/..."}
                 └─ Serverless Vercel (/api/gemini.ts)
                      └─ G1: isLiteLLMEnabled()
                      └─ G2: useLiteLLMPath
                      └─ G3: authenticateExperimentRequest()
                      └─ G5: allowedModels.includes()
                      └─ executeLiteLLMGenerateContent()
                           └─ callLiteLLM()
                                └─ fetch(litellm.dev.seniorlabs.io/chat/completions)
                           └─ [fallback] respondWithGeminiFallback()
```

### Os 5 Gates (Server-side)

| Gate | Arquivo:Linha            | O que verifica                                                             |
| ---- | ------------------------ | -------------------------------------------------------------------------- |
| G1   | `_llm-client.ts:60`      | `LLM_PROVIDER===litellm` && `LITELLM_API_KEY` && `LITELLM_BASE_URL`        |
| G2   | `gemini.ts:455`          | `!requestedModel.includes('gemini')` — se for Gemini, usa Gemini direto    |
| G3   | `_experiment-auth.ts:42` | Supabase auth OU preview local auth (header `x-experiment-operator-email`) |
| G4   | `modelRouter.ts:83`      | `allowlist.length > 0 && email in allowlist`                               |
| G5   | `gemini.ts:486`          | `experimentModels.includes(requestedModel)`                                |

### Client-side Gate

| Gate | Arquivo:Linha        | O que verifica                                                    |
| ---- | -------------------- | ----------------------------------------------------------------- |
| CG1  | `modelRouter.ts:111` | `selectExperimentModel()` retorna modelo se `config.enabled=true` |

---

## O que JÁ TENTAMOS (tudo que foi feito)

### 1. Configuração de Modelos

- [x] Catálogo com 6 modelos (`modelCatalog.ts`)
- [x] Modelo padrão: `bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0`
- [x] 4 modelos testados: Grok F, GLM-5, Nova 2 Lite, Haiku 4.5
- [x] Todos falham com o mesmo padrão (60s timeout, 0 módulos)

### 2. Proxy LiteLLM

- [x] Descoberto proxy interno da Senior: `litellm.dev.seniorlabs.io` (dev), `litellm.seniorlabs.io` (prod)
- [x] Ping endpoint (`/api/ping-litellm`) confirma: proxy funciona em 1.4s com 120K chars
- [x] Testado com e sem system prompt: ambos funcionam
- [x] Testado com `max_tokens=8000`: funciona
- [x] URL prod (`litellm.seniorlabs.io`) rejeita a chave (token_not_found_in_db)
- [x] URL dev (`litellm.dev.seniorlabs.io`) aceita a chave

### 3. Autenticação

- [x] Supabase auth confirmado funcional (TRACE: `hasUser:true, userEmail:bruno.ferreira@senior.com.br`)
- [x] Header `x-experiment-operator-email` era condicional (`!authHeaders.Authorization`) → corrigido para sempre enviar no preview
- [x] `LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH=true` configurado
- [x] `LLM_ALLOWLIST=bruno.ferreira@senior.com.br` configurado

### 4. Env vars (Vercel Preview — feat/litellm-experiment)

```
LLM_PROVIDER=litellm                    VITE_LLM_PROVIDER=litellm
LLM_EXPERIMENT_MODE=fixed               VITE_LLM_EXPERIMENT_MODE=fixed
LLM_MODEL_DEFAULT=bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0
                                         VITE_LLM_MODEL_DEFAULT=(mesmo)
LLM_FALLBACK_ENABLED=true               VITE_LLM_FALLBACK_ENABLED=true
LLM_ALLOWLIST=bruno.ferreira@senior.com.br
LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH=true  VITE_LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH=true
LITELLM_API_KEY=sk-...
LITELLM_BASE_URL=https://litellm.dev.seniorlabs.io
LITELLM_REQUEST_TIMEOUT_MS=10000
LITELLM_MAX_RETRIES=0
SUPABASE_URL=(configurado)
SUPABASE_SERVICE_ROLE_KEY=(configurado)
GEMINI_API_KEY=(configurado)
GEMINI_API_KEY_FALLBACK=(configurado)
```

### 5. Código alterado (16+ commits)

| Arquivo                       | Mudança                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `utils/llm/modelCatalog.ts`   | +GLM-5, +Nova 2 Lite, +Haiku 4.5, -Grok F/G de EXPERIMENT_MODELS                           |
| `utils/llm/modelRouter.ts`    | G4: allowlist fail-closed                                                                  |
| `utils/llm/experimentGate.ts` | resolveLiteLLMExperimentGate                                                               |
| `services/geminiProxy.ts:204` | Header `x-experiment-operator-email` sempre enviado (removeu `!authHeaders.Authorization`) |
| `api/gerar-dossie.ts:126`     | `text: ''` na resposta de erro (previne tela branca)                                       |
| `api/gemini.ts`               | BUILD_TS marker + TRACE logs + scoutDiag.error nos G2/G5                                   |
| `api/_llm-client.ts`          | TRACE log G1 + callLiteLLM entrada/catch/fail                                              |
| `api/_experiment-auth.ts`     | TRACE logs G3a-G3d (cada branch de auth)                                                   |
| `api/ping-litellm.ts`         | Endpoint diagnóstico `?chars=N&system=1&timeout=N`                                         |

### 6. Testes

- [x] 1683/1683 testes unitários verdes
- [x] TypeCheck passa
- [x] Build Vite OK (~42s)
- [ ] E2E report-ready: falhou no login (bug pré-existente no helper)

### 7. Hipóteses investigadas e REFUTADAS

| #   | Hipótese                                         | Por que foi refutada                                                 |
| --- | ------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | Race condition `loadSessions()` zera mensagens   | Sessão nunca foi salva no Supabase antes de falhar                   |
| 2   | Proxy LiteLLM inacessível do Vercel              | Ping `/api/ping-litellm` responde em 1.4s com 120K chars             |
| 3   | Tamanho do prompt (119K chars) causa timeout     | Ping com 120K chars + system=1 responde em 1.3s                      |
| 4   | Modelo quebrado (Grok)                           | 4 modelos de 3 providers diferentes falham igual                     |
| 5   | Vercel Hobby timeout (60s)                       | `maxDuration: 300` configurado no `vercel.json`                      |
| 6   | LITELLM_BASE_URL errada (prod vs dev)            | Corrigido para dev; ping funciona; waterfall não                     |
| 7   | Header `x-experiment-operator-email` não enviado | Corrigido; Supabase auth funciona; waterfall ainda falha             |
| 8   | `generateContent` nunca chega no `/api/gemini`   | **Refutado pelo Supabase** — 5+ chamadas generateContent confirmadas |
| 9   | Vercel servindo código cacheado                  | BUILD_TS v3 + force deploy; mesmo comportamento                      |

---

## O que NÃO tentamos

### A. Debug do `callLiteLLM` em isolamento

- [ ] Fazer uma chamada `callLiteLLM` simples (fora do waterfall) para confirmar que a função em si funciona
- [ ] Testar `callLiteLLM` com prompt pequeno (não 119K chars)
- [ ] Testar `callLiteLLM` sem `withDeadline` e sem `AbortSignal.any`

### B. Verificar o corpo da resposta generateContent

- [ ] O `response:body-read` no scout_diagnostics mostra `body: null` — o conteúdo da resposta NÃO está sendo logado
- [ ] Precisamos ver o JSON completo que `/api/gemini` retorna para `generateContent`
- [ ] Isso diria se a resposta é Gemini fallback, erro, ou vazia

### C. Testar LiteLLM sem o `withDeadline` wrapper

- [ ] `callLiteLLM` tem uma camada extra: `withDeadline(fetch(...), signal)` + `AbortSignal.any([input.signal, timeoutController.signal])`
- [ ] O ping-litellm usa `fetch` simples e funciona
- [ ] Substituir `callLiteLLM` por `fetch` simples (igual ping) isolaria o problema

### D. Verificar o fluxo completo cliente→servidor

- [ ] Instrumentar `proxyGenerateContent` com TRACE (sabemos que é chamado, mas não sabemos com quais parâmetros)
- [ ] Instrumentar `callGeminiApi` com o payload completo
- [ ] Verificar se `stepSignal` chega abortado em `runWithStepTimeout`

### E. Testar com modelo Gemini via LiteLLM

- [ ] Se o modelo fosse `gemini/gemini-2.0-flash` (via LiteLLM), o G2 bloquearia? (contém 'gemini')
- [ ] Isso confirmaria se o G2 é um bloqueio ou não

---

## Evidência do Supabase (18:20-18:22 UTC, 23/Jun)

### Request/Response confirmados

5 chamadas `generateContent` com `response:body-read` confirmado:

| Hora     | Módulo              | Duration | Response   |
| -------- | ------------------- | -------- | ---------- |
| 18:20:30 | Teia Identidade     | 14.7s    | 1181 chars |
| 18:20:47 | Teia Profundidade   | 20.3s    | 5198 chars |
| 18:21:08 | Operação            | 22.6s    | 5487 chars |
| 18:21:30 | Bordas de Controle  | 18.5s    | 5724 chars |
| 18:21:49 | Riscos & Compliance | 18.8s    | 4998 chars |

**Todos usando Gemini + Foundation Cache** (não LiteLLM). `foundationCacheName` presente em todos.

### LiteLLM Experiment Runs (todas falhas)

| Run ID   | Modelo    | Status | Latency | Chars | Módulos | Fallback |
| -------- | --------- | ------ | ------- | ----- | ------- | -------- |
| 94c1be03 | haiku-4-5 | failed | 62.3s   | 0     | 0       | false    |
| 3d8f698a | haiku-4-5 | failed | 63.0s   | 0     | 0       | false    |
| 8a32a0f4 | haiku-4-5 | failed | 62.5s   | 0     | 0       | false    |
| 2fb7d7ca | haiku-4-5 | failed | 54.0s   | 0     | 0       | false    |
| 62d7ac48 | haiku-4-5 | failed | 63.0s   | 0     | 0       | false    |
| aaff2189 | haiku-4-5 | failed | 67.4s   | 0     | 0       | false    |

---

## Perguntas para o Auditor

1. O `callLiteLLM` é chamado com sucesso? O `[TRACE] callLiteLLM ENTRADA` NUNCA aparece nos logs — mas isso pode ser porque a função é morta pelo Vercel antes do flush do `console.error`.

2. Se não é chamado, qual dos 5 gates (G1-G5) está bloqueando? O G3 (Supabase auth) foi confirmado funcional. G1, G2, G4, G5 não têm evidência de bloqueio.

3. O `LLM_FALLBACK_ENABLED=true` deveria fazer o fallback para Gemini quando `callLiteLLM` falha. Por que `fallback_used: false` em TODAS as 6 runs?

4. O `error_normalized: null` indica que o erro não é HTTP — é timeout/abort. O catch block em `executeLiteLLMGenerateContent` captura `signal is aborted without reason` e chama `respondWithGeminiFallback('error')`. Isso está realmente acontecendo?

5. Existe algum caminho onde `executeLiteLLMGenerateContent` NÃO é chamado mesmo com todos os gates passando?

---

## Commits na Branch

```
9ef5b105 debug: FORCE_CACHE_MISS v3 no gemini.ts
cc28083a debug: FORCE_CACHE_MISS v2
20a6b3d9 debug(litellm): scoutDiag.error nos pontos criticos
fa7357df debug(litellm): instrumentacao completa com [TRACE] em todos os gates
16f4c69c trigger: deploy limpo com fixes LiteLLM e gerar-dossie
b8db5241 fix: prevenir tela branca + enviar header preview sempre
8c74e71e fix(litellm): enviar x-experiment-operator-email sempre no preview
8206c667 debug(litellm): console.error para forcar visibilidade nos logs Vercel
c8787ce8 debug(litellm): log budget configurado no callLiteLLM
05ccb12e debug(litellm): suporte ?system=1 no ping para testar system prompt
1781e366 debug(litellm): ping-litellm aceita ?chars=N&timeout=N
b03e7210 debug(litellm): endpoint /api/ping-litellm para testar conectividade
8faf59dd fix(litellm): adicionar Amazon Nova 2 Lite
7eb39843 fix(litellm): migrar modelo padrao para GLM-5
59f57230 fix(litellm): adicionar Claude Haiku 4.5 via Bedrock
8e141204 fix(litellm): unificar foundation block
f2ee6d94 fix(e2e): substituir waitForNetworkIdle
a51be34d fix(pr386): harden experiment gates
```

## PR #386

- URL: https://github.com/brunolimaff-jpg/NOVO-APP/pull/386
- Status: Aberta, NÃO mergear
- Merge: BLOQUEADO (requer token MERGE explícito)
