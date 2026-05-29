# Handoff — PR #303: Correção Multi-Causal de Tela Branca e Hang

**Data:** 2026-05-27  
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/303  
**Branch:** `fix/white-screen-after-loading`  
**Status:** ✅ FUNCIONANDO — validado em Safari e Chrome (após fix do Service Worker)

---

## Resumo Executivo

Bug multi-causal de "tela branca após pesquisa" e "hang em 95% no dossiê", com sintomas diferentes entre Safari e Chrome. Foram necessários **6 agentes especializados** (debugger, rag-gemini, ui-ux, reviewer, explore, validator), **3 diagnósticos paralelos**, revisão de **16 arquivos** de documentação e memória, e **7 commits**.

---

## Todos os Achados (Ordem Cronológica de Descoberta)

### Achado 1: Benchmark `proxyGenerateContent` sem timeout — commit zero `9f02a96` (2026-04-04)

**Sintoma:** LoadingSmart travava em 95%, etapa "Finalizando cards de auditoria" com 0s, timer progredindo por 7+ minutos sem avançar.

**Causa:** `getIsolatedBenchmark` em `investigation-orchestration.ts` fazia 2 chamadas sequenciais: `benchmarkClientes` (Apps Script, 45s timeout via `runWithStepTimeout`) + `proxyGenerateContent` (Gemini, **SEM timeout**, dependendo apenas de `GEMINI_PROXY_TIMEOUT_MS = 210s`). No Vercel Preview (Hobby, 60s maxDuration), a função era morta e o fetch do browser aguardava TCP timeout.

**Correção (commit `9c5e858`):** Removeu `proxyGenerateContent` de `getIsolatedBenchmark`. Função agora retorna `formatarBenchmarkParaPrompt` direto (Markdown dos dados do Apps Script), sem segunda chamada Gemini.

**Arquivo:** `services/gemini/investigation-orchestration.ts:820-856`  
**Lições:**

- Funções que chamam `proxyGenerateContent` DEVEM ser envolvidas por `runWithStepTimeout` — `generateDossierModule` já fazia isso, `getIsolatedBenchmark` não
- O benchmark é uma seção cosmética ("🏷️ BENCHMARK SENIOR") — se falhar, o dossiê ainda é útil sem ela
- O commit `9f02a96` (2026-04-04) introduziu o bug com "Refactor: Modular Prompt Chaining & Benchmark Isolation"

---

### Achado 2: Tela branca por divs vazias no MessageTimeline

**Sintoma:** Após LoadingSmart desaparecer, tela completamente branca. Virtuoso não montava.

**Causa 1:** `MessageTimeline.tsx:334` — `<div className="h-full w-full" />` (completamente vazia) quando `isMessagesViewportReady = false`. Ocupava a tela inteira.

**Causa 2:** O `useEffect` de readiness dependia de `safeMessages.length`. Durante o waterfall, `updateSessionById` chamava `setSessions` a cada chunk, mudando `safeMessages.length` e resetando o emergency timer de 180ms antes de disparar.

**Correção (commit `797487f`):**

1. Substituiu divs vazias por spinners visíveis com label "Preparando investigação..."
2. Removeu `safeMessages.length` das dependências do `useEffect` ([`showInitialHome, shouldSuspendVirtualizedList`] apenas)

**Arquivo:** `components/chat/MessageTimeline.tsx:150-208, 304-310, 339-342`  
**Lições:**

- Placeholder vazio em tela cheia é tela branca literal — SEMPRE colocar feedback visual
- Dependências de useEffect que mudam com alta frequência (cada nova mensagem) matam timers de fallback

---

### Achado 3: `shouldSuspendHeroMessageTimeline` — guard `!isLoading`

**Sintoma:** `loadingVariant` ficava residual `'hero'` após loading terminar, potencialmente suspendendo a timeline.

**Causa:** `loadingVariant` era setado como `'hero'` no início de `processMessage` mas nunca resetado ao fim.

**Correção (commit `0ea6240`, PR #302, já em main):** `shouldSuspendHeroMessageTimeline` tem guard `if (!isLoading) return false` — se não está carregando, nunca suspende.

**Correção adicional (commit `eb93974`):** Adicionado `setRequestKind('default')` no `finally` de `processMessage` para prevenir herança de `deep_dive` entre pesquisas.

**Arquivo:** `utils/loadingVariant.ts:42-51`, `features/chat/message-orchestrator.ts:444`  
**Lições:**

- Estado de loading deve ter reset completo no finally — nunca confiar que "o próximo início vai sobrescrever"
- Guard defensivo no cálculo derivado (`!isLoading`) é mais seguro que reset explícito

---

### Achado 4: `!viewport → setIsMessagesViewportReady(true)` prematuro

**Sintoma:** Virtuoso montava em container sem dimensões reais (altura zero).

**Causa:** `MessageTimeline.tsx:156-160` setava `isMessagesViewportReady = true` quando `messagesViewportRef.current` era `null`, sem verificar se o container tinha altura > 0.

**Correção (commit `eb93974`):** Substituiu por `return` (sem setar ready) — deixa o emergency timer (180ms) decidir quando liberar o Virtuoso.

**Arquivo:** `components/chat/MessageTimeline.tsx:156-161`  
**Lições:**

- "Ref existe" ≠ "container tem dimensões utilizáveis"
- Emergency timer (180ms) é fallback suficiente para quando o ResizeObserver falha

---

### Achado 5: `responseText` vazio do Gemini gera card invisível

**Sintoma:** Gemini retorna `text: ""` → `hasRenderableBotMessage = false` → Virtuoso renderiza mensagem com texto vazio → parece tela branca.

**Causa:** Nenhum guard contra `responseText` vazio em `processMessage`.

**Correção (commit `eb93974`):**

```typescript
const fallbackText = '*Sem resposta do assistente.*';
const finalResponseText = responseText && responseText.trim().length > 0 ? responseText : fallbackText;
```

**Arquivo:** `features/chat/message-orchestrator.ts:336-339`  
**Lições:**

- Resposta de IA nunca deve ser gravada como string vazia sem fallback
- `hasRenderableBotMessage` filtra `isThinking` mas não `text === ''`

---

### Achado 6: `throw new Error('AbortError')` não reconhecido como abort

**Sintoma:** `isAbortLikeError` não detectava o erro como abort porque `name` era `'Error'` e `message` era `'AbortError'` (`.includes('aborted')` = false).

**Causa:** `investigation-orchestration.ts:315` usava `new Error('AbortError')` em vez do padrão Web API `new DOMException('...', 'AbortError')`.

**Correção (commit `eb93974`):**

```typescript
if (signal?.aborted) {
  const abortErr = new DOMException('The operation was aborted', 'AbortError');
  throw abortErr;
}
```

**Arquivo:** `services/gemini/investigation-orchestration.ts:315-318`  
**Lições:**

- AbortError deve SEMPRE ser `DOMException` com `name: 'AbortError'` (padrão Web API)
- `isAbortLikeError` verifica `error.name === 'AbortError'` como check primário

---

### Achado 7: `logInvestigation` fetch sem timeout mantém spinner da aba

**Sintoma:** Aba do Chrome continuava mostrando spinner de carregamento após investigação completa.

**Causa:** `fetch(BACKEND_URL, ...)` em `message-orchestrator.ts:378` sem `AbortSignal`, requisição pendente eternamente.

**Correção (commit `eb93974`):** Adicionado `signal: AbortSignal.timeout(15_000)`.

**Arquivo:** `features/chat/message-orchestrator.ts:391`  
**Lições:**

- Todo fetch fire-and-forget deve ter timeout para não segurar a aba do navegador
- `setInvestigationLogged(true)` é chamado ANTES do fetch — se falhar, o log é perdido (intencional)

---

### Achado 8: Service Worker no Chrome servia cache velho (Safari ignorava)

**SINTOMA PRINCIPAL:** Safari funcionava, Chrome travava em 95% com "code hung error".

**Causa:** `index.tsx:94-106` desregistrava SW apenas em `DEV || localhost`. No Vercel Preview (produção), o SW ficava ativo e servia assets cacheados do deploy anterior. Como o alias do preview é fixo (`scoutagro-git-fix-white-scree-...`), o SW do primeiro deploy persistia. Safari não suporta SW da mesma forma → sempre pegava o bundle novo.

**Correção (commit `be10dd0`):**

```typescript
const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
if (!isStandalone) {
  // desregistra SW e limpa cache em TODO carregamento de página
}
```

**Arquivo:** `index.tsx:94-106`  
**Lições:**

- ⚠️ **SEMPRE testar em múltiplos navegadores** — Safari vs Chrome revelou o SW como causa raiz
- Alias fixo de preview + PWA/SW = armadilha de cache entre deploys
- SW só deve ficar ativo no modo standalone (PWA instalado)
- "Code hung error" no Chrome + "funciona no Safari" = suspeitar de Service Worker

---

### Achado 9: Timeouts e function calls na API Gemini

**Sintoma:** Chamadas Gemini podiam exceder 60s do Vercel Hobby, causando retry loops de 5+ minutos.

**Correções (commits `797487f` e `eb93974`):**

| Arquivo                             | Mudança                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `api/gemini.ts:406`                 | `AbortSignal.timeout(30s)` no fetch da tool call `/api/open-web-search`     |
| `api/gemini.ts:385`                 | `maxIterations` 5→3 no loop de function calls                               |
| `api/gemini.ts:441-445`             | `withTimeout(55s)` no `chatSession.sendMessage` do loop                     |
| `vercel.json:10-12`                 | Adicionado `api/open-web-search.ts` com `maxDuration: 60`                   |
| `waterfall-orchestrator.ts:786-829` | `Promise.race` + timeout 120s + `clearTimeout` no `reconcileWaterfallPorta` |

**Lições:**

- Vercel Hobby cap de 60s ignora `maxDuration: 300` no `vercel.json`
- Funções serverless não listadas no `vercel.json` usam default de 10s
- Function call loop com `maxIterations=5` + 30s por tool call = 150s (excede 60s)

---

### Achado 10: `withAbortSignal` não rejeitava com signal já abortado

**Sintoma:** Se `AbortSignal` já estava abortado ao chamar `withAbortSignal`, a promise original era retornada em vez de rejeitar imediatamente.

**Correção (commit `d3d8a2a`):**

```typescript
if (!sig) return promise;
if (sig.aborted) return Promise.reject(new DOMException('...', 'AbortError'));
```

**Arquivos:** `services/gemini/investigation-orchestration.ts:302-305`, `features/dossier/waterfall-orchestrator.ts:436-439`

---

## Lições Aprendidas — Compilado

### Lição 0: SW em preview é armadilha silenciosa

> Service Worker com alias fixo de preview serve cache de deploy anterior. Safari ignora SW → funciona. Chrome usa SW → bug. **Sempre testar em 2+ navegadores.**

### Lição 1: Placeholder vazio = tela branca

> `<div className="h-full w-full" />` ocupa a tela inteira e não mostra nada. SEMPRE colocar spinner/texto de feedback.

### Lição 2: Dependências de useEffect que variam rápido matam timers

> `safeMessages.length` mudava a cada chunk do waterfall, resetando o emergency timer de 180ms antes de disparar.

### Lição 3: Resposta de IA sempre precisa de fallback

> `text: ""` do Gemini gera card invisível. Guard com `'*Sem resposta do assistente.*'` resolve.

### Lição 4: AbortError deve ser DOMException

> `new Error('AbortError')` não é detectado por `isAbortLikeError`. Usar `new DOMException('...', 'AbortError')`.

### Lição 5: Fetch fire-and-forget precisa de timeout

> `fetch` sem `AbortSignal` mantém spinner da aba do Chrome ativo. Timeout de 15s resolve.

### Lição 6: `proxyGenerateContent` precisa de `runWithStepTimeout`

> Toda chamada Gemini deve ter timeout explícito. `generateDossierModule` já faz; `getIsolatedBenchmark` não fazia.

### Lição 7: Vercel Hobby = 60s cap, independente de config

> `maxDuration: 300` no `vercel.json` é ignorado no plano Hobby. Functions não listadas usam 10s default.

### Lição 8: Testar com CNPJ real revela bugs de conteúdo

> O dossiê do Scheffer (`04.733.767/0001-80`) gerava texto grande o suficiente para expor regex catastrófica e timeouts.

---

## Decisões Arquiteturais (para decisions.md)

### PR #303 — Contratos anti-tela-branca

**Decisão:** Estabelecer 10 contratos defensivos que garantem que o app nunca mais fique com tela branca: timeline sempre renderiza, resposta nunca é vazia, abort nunca vira erro comum, tool call nunca roda sem timeout, loading não carrega estado residual, benchmark não causa hang, Service Worker é desregistrado em preview.

**Reason:** O bug de tela branca é recorrente há 3+ meses com 7+ tentativas de fix. Cada correção tratava um sintoma sem atacar a arquitetura frágil de 5 estados competindo pela visibilidade da UI (`isLoading`, `loadingVariant`, `shouldSuspendVirtualizedList`, `isMessagesViewportReady`, `safeMessages`). Contratos defensivos em cada camada (UI, orquestração, API, Vercel config) são mais robustos que correções pontuais.

**Refs:** PR #303, `components/chat/MessageTimeline.tsx`, `features/chat/message-orchestrator.ts`, `services/gemini/investigation-orchestration.ts`, `api/gemini.ts`, `vercel.json`, `index.tsx`.

### PR #303 — `getIsolatedBenchmark` sem `proxyGenerateContent`

**Decisão:** Remover a chamada `proxyGenerateContent` de `getIsolatedBenchmark`. O benchmark agora retorna `formatarBenchmarkParaPrompt` direto (Markdown do Apps Script), sem segunda chamada ao Gemini para formatação editorial.

**Reason:** `proxyGenerateContent` não tinha timeout dedicado (ao contrário de `generateDossierModule` que usa `runWithStepTimeout`). No Vercel Preview (Hobby, 60s cap), a função era morta e o fetch do browser aguardava TCP timeout por minutos. A formatação editorial pelo Gemini é cosmética — o `formatarBenchmarkParaPrompt` já produz Markdown utilizável.

**Refs:** commit `9c5e858`, `services/gemini/investigation-orchestration.ts:820-856`.

---

## Ponteiros

- **PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/303
- **Branch:** `fix/white-screen-after-loading` (5 commits ahead of `main`)
- **Preview:** https://scoutagro-git-fix-white-scree-e6a6fb-brunolimaff-3629s-projects.vercel.app
- **Reviewer:** 10/10 contratos confirmados ✅
- **Testes:** 138 files / 1182 tests passando
- **Typecheck/Lint:** limpo

### Arquivos modificados (PR #303)

```
api/gemini.ts
components/chat/MessageTimeline.tsx
features/chat/message-orchestrator.ts
features/dossier/waterfall-orchestrator.ts
index.tsx
services/gemini/investigation-orchestration.ts
tests/services/geminiService.test.ts
vercel.json
```

### Comandos de validação

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

---

## Próximos Passos

1. **Merge da PR #303** — aprovar e mergear em `main`
2. **Validar em produção** — confirmar que o comportamento é igual ao preview (sem regressão do SW)
3. **Monitorar logs da Vercel** — verificar se os timeouts de API estão funcionando (menos function calls por dossiê)
4. **Avaliar seção de benchmark** — verificar se `benchmarkClientes` está retornando dados do Apps Script; se não, decidir se remove a seção ou conserta a fonte de dados
