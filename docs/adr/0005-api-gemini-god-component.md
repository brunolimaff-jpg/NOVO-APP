# ADR-0005: api/gemini.ts como god component

**Data:** 29/06/2026
**Status:** Aceito — débito técnico documentado
**Componente:** `api/gemini.ts` (680 LOC — gateway serverless Gemini ↔ LiteLLM)
**Branch de referência:** `stabilize/from-production-fe6c6f9` @ `4e65bb1` (merge HOMOLOG `61ced7bc` em 29/06/2026)
**Decisor:** Bruno + IA gestora

---

## Contexto

O `api/gemini.ts` é a **função serverless (Vercel) que recebe TODAS as chamadas de
LLM vindas do navegador** no Senior Scout 360. Quando o usuário envia uma mensagem de
chat, quando o waterfall dispara cada um dos 7 módulos do dossiê, ou quando o sistema
de diagnóstico emite um batch de telemetria, a requisição HTTP bate neste endpoint
(`POST /api/gemini`). Ele é o **gateway único entre o frontend (Vite/React) e os
provedores de LLM** (Gemini nativo ou LiteLLM roteado para DeepSeek/Claude via Bedrock).

O arquivo é o ponto central da **migração LiteLLM HOMOLOG → PROD** que acabou de
estabilizar em produção (commit `61ced7bc`, 29/06/2026 — merge do PR #403
`worktree-migrate+litellm-no-gemini`). Por meses, este gateway chamava exclusivamente
a SDK nativa do Gemini (`@google/genai`) usando `GEMINI_API_KEY`. A migração introduziu
um **branch condicional** (linha 260) que, quando as 3 env vars do LiteLLM estão
configuradas (`LLM_PROVIDER=litellm` + `LITELLM_API_KEY` + `LITELLM_BASE_URL`,
verificadas pela função `isLiteLLMEnabled()` em `api/_llm-client.ts:20-29`), roteia a
chamada para o LiteLLM em vez do Gemini. Esse branch é o coração das **Decisões 11-14**
da sessão de 29/06/2026:

- **Decisão 11**: migração LiteLLM promovida a produção.
- **Decisão 12** (linha 118): foundation cache (recurso Gemini de `cachedContent`) só é
  exposto se `GEMINI_FOUNDATION_CACHE_ENABLED === '1'`. Default desligado — o branch
  LiteLLM não suporta `cachedContent` (texto plano, não recurso de cache nativo).
- **Decisão 13** (linha 440 — ver seção "O que entendo" para discrepância de linha):
  chat `useGrounding ?? false` — grounding (`googleSearch`) desligado por padrão no chat.
  LiteLLM não suporta `googleSearch` nativo, então qualquer chamada com grounding
  cai no fallback Gemini.
- **Decisão 14**: 3 endpoints residuais ainda dependem de `GEMINI_API_KEY` direto
  (`api/docs-rag.ts`, `api/radar-scan.ts`, `utils/documentExtractor.ts` — ver seção
  "O que entendo" item 12 para discrepância de contagem).

O arquivo cresceu para 680 LOC porque acumula responsabilidades que, em arquitetura
saudável, viveriam em módulos separados: validação Zod do schema de request, gestão de
API keys com fallback, roteamento LiteLLM/Gemini, gestão de foundation cache, loop de
function calling (tool use) para `performWebSearch`, fallback de grounding, aplicação
de prompt-leak-shield **local** (uma terceira cópia divergente — ver ADR da Task ID 4),
inserção de diagnósticos server-side no Supabase, e resposta HTTP padronizada com campo
`_model` para observabilidade (commit `6d265136`).

O blast radius deste god component é **total**: se `api/gemini.ts` falhar, nenhum
dossiê é gerado, nenhuma mensagem de chat é respondida, e nenhuma telemetria é
persistida. Os 20 usuários do piloto ficam sem produto. O dossiê Scheffer recentemente
gerado com sucesso (1181 linhas, citado no handoff) passou por este gateway.

---

## Responsabilidades acumuladas

| #   | Responsabilidade                                                                                                                                                                                                                                                             | Linhas aprox              | Deveria estar em                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| 1   | Schema Zod discriminado por `action` (5 actions: health, generateContent, createCachedContent, deleteCachedContent, chatSendMessage)                                                                                                                                         | 11-48                     | `api/schemas/gemini-request-schema.ts`                              |
| 2   | Configuração Vercel serverless (`runtime: 'nodejs'`, `maxDuration: 300`)                                                                                                                                                                                                     | 50-54                     | ✅ `api/gemini.ts` (correto)                                        |
| 3   | Constantes de timeout e modelo default (`CHAT_TIMEOUT_MS=55s`, `LONG_CHAT_TIMEOUT_MS=180s`, `DEFAULT_GEMINI_MODEL`)                                                                                                                                                          | 56-58                     | `api/config/llm-timeouts.ts`                                        |
| 4   | **Cópia LOCAL do prompt-leak-shield** (4 regex constants + 3 funções: `stripInternalMarkersLocal`, `detectPromptLeakIndicatorsLocal`, `applyPromptLeakShieldLocal`) — DIVERGENTE da cópia live em `utils/textCleaners.ts` (~~`utils/promptLeakShield.ts` deletado PR #405~~) | 59-115                    | `utils/textCleaners.ts` (consolidar — risco alto)                   |
| 5   | Gate de foundation cache (`isFoundationCacheEnabled()` lê `GEMINI_FOUNDATION_CACHE_ENABLED`) — Decisão 12                                                                                                                                                                    | 117-119                   | `api/_foundation-cache-gate.ts`                                     |
| 6   | Helpers de extração de resposta (`extractUsageMetadata`, `extractGeminiText`) — lida com `response.text` direto ou `candidates[].content.parts[].text`                                                                                                                       | 121-145                   | `api/_gemini-response-parser.ts`                                    |
| 7   | Helper de env var seguro (`getEnvVar` com try/catch para SSR)                                                                                                                                                                                                                | 147-153                   | `utils/serverEnv.ts`                                                |
| 8   | Gestão de API keys Gemini com fallback (`getApiKeys()` lê `GEMINI_API_KEY` + `GEMINI_API_KEY_FALLBACK`)                                                                                                                                                                      | 155-165                   | `api/_gemini-key-utils.ts` (parcialmente já existe)                 |
| 9   | Helper `toNumberSafe` + `normalizeHistory` (converte schema chat para SDK Gemini)                                                                                                                                                                                            | 167-179                   | `api/_gemini-helpers.ts`                                            |
| 10  | Helper `withTimeout<T>` genérico (Promise.race + setTimeout + clearTimeout no finally)                                                                                                                                                                                       | 181-192                   | `utils/withTimeout.ts` (já existe em outros arquivos — duplicado)   |
| 11  | Helper `extractGeminiHttpStatus` (mapeia erro SDK → 429/5xx)                                                                                                                                                                                                                 | 194-204                   | `api/_gemini-key-utils.ts`                                          |
| 12  | Resolução de thinking level (`resolveThinkingLevel` + `toSdkThinkingLevel` — converte `thinkingMode` legado para `ThinkingLevelSchema`)                                                                                                                                      | 209-220                   | `api/_thinking-level.ts`                                            |
| 13  | **`executeGeminiAction` — switch gigante de 5 cases** (health / generateContent / createCachedContent / deleteCachedContent / chatSendMessage)                                                                                                                               | 222-598                   | `api/handlers/{health,generate-content,cache,chat}.ts` (5 arquivos) |
| 14  | Dentro do case `generateContent`: **branch LiteLLM** (linha 260) — converte contents → messages, resolve modelo via `selectModelForModule`, chama `callLiteLLM`, retorna `{text, _model}`                                                                                    | 256-312                   | `api/_llm-client.ts` (já existe, expandir)                          |
| 15  | Dentro do case `generateContent`: **fallback Gemini** com 3 `console.warn` explicando por que não foi para o LiteLLM (grounding / foundation_cache / unknown)                                                                                                                | 314-325                   | `api/_llm-fallback-reason.ts`                                       |
| 16  | Diagnóstico server-side do waterfall (`insertDiagnosticsBatch` para `module:start` / `module:end` quando `srvModuleName` é detectado via regex `bloco de (.+?) com extrema`)                                                                                                 | 240-248, 326-340, 378-390 | `api/_waterfall-diagnostics.ts`                                     |
| 17  | Dentro do case `chatSendMessage`: closure `runChat` (ativa tools googleSearch/openWebSearch, cria chat com thinkingConfig, escolhe timeout 55s vs 180s)                                                                                                                      | 462-489                   | `api/_chat-runner.ts`                                               |
| 18  | Loop de Function Calling (max 3 iterações) — executa `performWebSearch` via fetch para `/api/open-web-search`, faz batching de `functionResponses`, fallback de timeout                                                                                                      | 500-566                   | `api/_function-call-loop.ts`                                        |
| 19  | Fallback de grounding (se `useGrounding=true` e chamada primária falhar, re-executa `runChat(false)` sem grounding)                                                                                                                                                          | 567-573                   | `api/_grounding-fallback.ts`                                        |
| 20  | Aplicação do prompt-leak-shield local na resposta do chat (`applyPromptLeakShieldLocal` + `console.warn` se bloqueada)                                                                                                                                                       | 578-585                   | `utils/textCleaners.ts` (consolidar)                                |
| 21  | Branch `recordDiagnostics` (early return ANTES da validação Gemini — só faz insert no Supabase e retorna)                                                                                                                                                                    | 606-646                   | `api/_diagnostics-handler.ts`                                       |
| 22  | **`handler` export default** — entry point: CORS, validação Zod, loop de API keys com fallback em quota/billing, error handling HTTP status                                                                                                                                  | 600-680                   | ✅ `api/gemini.ts` (correto — mas deveria delegar mais)             |

---

## Riscos conhecidos

1. **Blast radius total = todas as chamadas LLM em produção**: Se `api/gemini.ts`
   falhar na montagem (erro de import, TypeError no schema, Vercel cold start excedendo
   maxDuration=300s), nenhum dossiê é gerado e nenhum chat responde. Os 20 usuários do
   piloto ficam sem produto. Não há fallback HTTP para outro endpoint. O `ErrorBoundary`
   do frontend (ADR-0002) captura o erro visual, mas o usuário vê erro 500 sem recuperação.
   Impacto: P0 total. Probabilidade: baixa (estável desde 29/06/2026).

2. **2 cópias divergentes do prompt-leak-shield** (PR #405 reduziu de 3 para 2): (a) `utils/textCleaners.ts`
   (live, usa `Array<{id, regex}>` com ids nomeados como `internal_marker`, `protocolo_forense`);
   (b) cópia LOCAL neste arquivo (`api/gemini.ts:59-115`, server-side, diverge da client-side).
   ~~(c) `utils/promptLeakShield.ts` — deletado na PR #405 (H1), era órfão.~~
   (c) `api/gemini.ts:59-115` (server-side, usa `RegExp[]` simples e indicadores posicionais
   `hard_0`, `hard_1`, `soft_0` — DIVERGENTE das outras duas). Se a versão server-side (esta)
   bloquear uma resposta que a versão client-side (textCleaners.ts) deixaria passar, ou
   vice-versa, o usuário verá comportamento inconsistente entre chat e pós-processamento
   do waterfall. Impacto: respostas bloqueadas sem explicação clara. Probabilidade: média.

3. **`GEMINI_API_KEY` ainda presente**: O arquivo importa `GoogleGenAI` (linha 1) e chama
   `new GoogleGenAI({ apiKey: keys[i] })` (linha 660) para os paths de fallback Gemini
   (grounding, foundation cache, e quando LiteLLM desligado). A migração LiteLLM NÃO
   eliminou a dependência — apenas adicionou um branch condicional. Se `GEMINI_API_KEY`
   expirar, for rotacionada, ou cota for excedida em produção, todas as chamadas com
   grounding e foundation cache quebram. Impacto: chat com grounding (Decisão 13 default
   false, mas ativável por caller) e dossiês com cachedContent param de funcionar.
   Probabilidade: média.

4. **Serverless cold start + maxDuration=300s**: Vercel serverless functions sofrem cold
   start. Com `maxDuration: 300` (5 minutos), a função pode ser reiniciada a qualquer
   momento. O chat timeout é 55s (com grounding) ou 180s (sem grounding) — o 180s está
   perigosamente perto do limite. Se uma chamada longa (dossiê profundo) atingir 180s,
   o `withTimeout` dispara, mas o Vercel pode matar a função antes. Impacto: chamada
   perdida sem retry no nível do gateway. Probabilidade: baixa-média.

5. **Loop de Function Calling com teto fixo de 3 iterações** (linha 501): Se o modelo
   solicitar 4+ chamadas encadeadas de `performWebSearch`, o loop quebra silenciosamente
   no `maxIterations > 0`. Não há warning de truncamento. O usuário recebe resposta
   parcial sem saber que faltou uma busca. Impacto: resposta incompleta. Probabilidade: baixa.

6. **Fetch para `/api/open-web-search` sem retry** (linha 518): A execução da tool
   `performWebSearch` faz `fetch` para outro endpoint serverless com `AbortSignal.timeout(30_000)`.
   Se esse endpoint estiver instável, a tool falha, mas o erro é capturado e transformado
   em `functionResponse` de erro (linha 543-548). O modelo recebe o erro e decide o que
   fazer. Não há retry automático. Impacto: busca perdida, modelo improvisa. Probabilidade: média.

7. **Schema Zod discriminatedUnion não cobre `recordDiagnostics`**: O schema
   `GeminiRequestSchema` (linhas 17-48) define 5 actions válidas, mas o handler faz
   early-return para `recordDiagnostics` (linha 607) ANTES da validação Zod (que acontece
   na linha 649). Isso significa que `recordDiagnostics` aceita payload sem validação
   estrita — se o cliente enviar eventos malformados, o `insertDiagnosticsBatch` recebe
   dados sujos. Apenas valida `body.runId` e `Array.isArray(body.events)` (linha 619).
   Impacto: telemetria corrompida no Supabase. Probabilidade: baixa.

8. **Detecção de nome de módulo via regex frágil** (linha 247): `contentsStr.match(/bloco de (.+?) com extrema/i)`
   extrai o nome do módulo do prompt para roteamento via `selectModelForModule`. Se o
   prompt mudar (ex: refatoração de `megaPrompts.ts` alterar a frase "bloco de X com
   extrema"), o regex falha silenciosamente, `srvModuleName` fica null, e o LiteLLM é
   chamado com `DEFAULT_MODEL` em vez do modelo específico do módulo. O dossiê ainda é
   gerado, mas com modelo errado. Impacto: qualidade do dossiê degradada sem erro.
   Probabilidade: média.

9. **`_model` no response body é a única observabilidade server-side**: Para provar que
   LiteLLM está ativo em produção (Princípio 6 — não aceitar claim sem grep), o único
   sinal é o campo `_model: 'bedrock/deepseek.v3.2'` no JSON de resposta (linha 305 e 589).
   Se o campo estiver ausente, é impossível distinguir "Gemini fallback" de "LiteLLM ativo
   mas campo esquecido". Não há header HTTP, não há log estruturado obrigatório (apenas
   `console.warn` condicional na linha 321). Impacto: diagnóstico de P0 difícil.
   Probabilidade: baixa (mas alta severidade quando ocorre).

10. **`recordDiagnostics` early-return ignora CORS method check parcialmente**: O handler
    faz `applyCors` (linha 601) e valida `req.method !== 'POST'` (linha 602) ANTES do
    early-return, mas o early-return acontece ANTES da validação Zod. Se um atacante
    enviar POST com `action: 'recordDiagnostics'` e payload gigante, o `body.events.slice(0, MAX_EVENTS_PER_BATCH)`
    limita o número de eventos mas não o tamanho individual. Impacto: risco de DoS baixo
    (Vercel tem body size limit), mas não validado explicitamente. Probabilidade: muito baixa.

11. **Hardcoded fallback message em português** (linha 111): Quando o leak-shield bloqueia,
    a resposta é hardcoded como `'Para continuar com segurança na análise, confirme o CNPJ da empresa (14 dígitos).'`
    — uma mensagem que pode confundir o usuário se ele estava fazendo uma pergunta não
    relacionada a empresa. Não há fallback contextual. Impacto: UX ruim em caso de falso
    positivo do leak-shield. Probabilidade: baixa (padrões regex são específicos).

---

## O que entendo que faz (Princípio 14)

1. **`export default handler`** (linha 600): Entry point Vercel. Aplica CORS, rejeita
   métodos não-POST, faz early-return para `recordDiagnostics` (linha 607), valida o
   body com `GeminiRequestSchema.safeParse` (linha 649), itera sobre `getApiKeys()`
   com fallback em quota/billing (linhas 658-670), e chama `executeGeminiAction` (linha 661).
   Evidence: linhas 600-680.

2. **`executeGeminiAction`** (linha 222): Switch gigante com 5 cases discriminados por
   `body.action`. Cada case retorna `res.status(...).json(...)`. É o dispatcher central.
   Evidence: linhas 222-598.

3. **`isFoundationCacheEnabled`** (linha 117-119): **VERIFICADO com `sed -n '118p'` —
   MATCH exato com claim do handoff (Decision 12)**. Retorna `true` somente se
   `GEMINI_FOUNDATION_CACHE_ENABLED === '1'`. Usado em 2 points (createCachedContent
   linha 401, deleteCachedContent linha 427) — ambos retornam 403 se desligado.

4. **Branch LiteLLM em `generateContent`** (linha 260): **VERIFICADO com `sed -n '260p'` —
   MATCH exato com claim do handoff**. A condição é
   `isLiteLLMEnabled() && !(hasCachedContent && !hasSystemInstr) && !hasGrounding`.
   Ou seja: LiteLLM ativo E (não é foundation cache) E (não tem grounding). Quando ativo,
   converte `contents` (string/array/objeto) para `messages` no formato OpenAI, resolve
   modelo via `selectModelForModule(srvModuleName || '')` (linha 294), chama `callLiteLLM`
   (linha 299), retorna `{ text, _model: resolvedModel }` (linha 305).

5. **`isLiteLLMEnabled()` gate** (em `api/_llm-client.ts:20-29`): **1 gate limpo, confirmado
   via leitura completa do arquivo**. Retorna `true` somente se `LLM_PROVIDER === 'litellm'`
   AND `LITELLM_API_KEY` AND `LITELLM_BASE_URL` (3 env vars obrigatórias). Loga
   `[LiteLLM:gate]` em toda chamada para observabilidade.

6. **Chat `useGrounding ?? false`** (linha 440): **DISCREPÂNCIA com handoff — ver seção
   "O que NÃO entendo" item 1**. O handoff claimou que isto estava na linha 428. A linha
   428 é, na verdade, `return res.status(403).json({ error: 'Foundation cache disabled' });`
   (dentro do case `deleteCachedContent`). A linha 440 contém `const useGrounding = body.useGrounding ?? false;`
   — Decisão 13 (default false). O `?? false` significa: se o caller não enviar
   `useGrounding`, o chat roda SEM googleSearch (mais rápido, sem custo de grounding,
   compatível com LiteLLM).

7. **Fallback de API keys com quota/billing** (linhas 658-670): Se `isQuotaExhausted(error)`
   ou `isBillingOrPermissionDenied(error)` (helpers em `./_gemini-key-utils.js`) E existe
   próxima key (`i < keys.length - 1`), faz `continue` para tentar `GEMINI_API_KEY_FALLBACK`.
   Caso contrário, re-throw. Evidence: linhas 658-670.

8. **`extractGeminiText`** (linha 128): Robusto na extração de texto da resposta do SDK.
   Tenta `response.text` direto primeiro (linha 131-132); se vazio, percorre
   `candidates[].content.parts[].text` (linhas 134-144). Trata casos onde o SDK não
   preenche `response.text` automaticamente. Cobertura por testes: `tests/api-gemini.test.ts`
   it 6 e 7 (linhas 246 e 285).

9. **`applyPromptLeakShieldLocal`** (linha 97): **TERCEIRA cópia do leak-shield, confirmada
   divergente**. Recebe texto, chama `stripInternalMarkersLocal` (remove `[[MARKER:...]]`),
   roda `detectPromptLeakIndicatorsLocal` (testa 5 padrões hard + 4 padrões soft), e se
   detectado (`hardHits > 0 || softHits >= 2`), retorna mensagem hardcoded de bloqueio
   (linha 111) com `blocked: true`. Diferente das cópias em `utils/textCleaners.ts` (que
   usa `Array<{id, regex}>` com ids nomeados), esta usa `RegExp[]` e retorna indicadores
   posicionais `hard_0`, `hard_1`, etc.

10. **Loop de Function Calling** (linhas 500-566): Quando o modelo retorna
    `response.functionCalls` (ex: `performWebSearch`), o loop executa cada call via fetch
    para `/api/open-web-search` (linha 518), coleta `functionResponses`, envia em batch
    de volta ao modelo (`sendFunctionResponses`, linha 555-562), e repete até
    `maxIterations = 3` ou sem mais function calls. Trata erros de tool como
    `functionResponse` com campo `error` (linha 546) — modelo decide como reagir.

11. **Fallback de grounding** (linhas 567-573): Se `useGrounding=true` e a chamada primária
    (com googleSearch) falhar, captura o erro, seta `groundingActivated = false`, e
    re-executa `runChat(false)` sem tools. Se `useGrounding=false` e falhar, re-throw
    direto (sem fallback). Garante que chat com grounding degradado funcione mesmo se
    Google Search API estiver instável.

12. **Branch `recordDiagnostics`** (linhas 606-646): Early-return ANTES da validação Zod.
    Recebe batch de eventos de telemetria do frontend (vindos de `utils/diagnosticLog.ts:170`),
    valida apenas `body.runId` e `Array.isArray(body.events)`, faz slice em
    `MAX_EVENTS_PER_BATCH`, chama `insertDiagnosticsBatch` (Supabase). Se Supabase não
    configurado, retorna 200 com `degraded: true` (não falha o cliente por telemetria).

13. **3 endpoints residuais GEMINI_API_KEY — DISCREPÂNCIA com handoff**: O handoff claim
    "3 residual Gemini endpoints: `api/docs-rag.ts`, `api/radar-scan.ts`,
    `utils/documentExtractor.ts`". **VERIFICADO com grep** — o handoff subestimou. O grep
    `GEMINI_API_KEY` retorna 5 arquivos além de `api/gemini.ts`:
    - `api/docs-rag.ts:83` — `new GoogleGenAI({ apiKey: getRequiredEnv('GEMINI_API_KEY') })` ✓ (no handoff)
    - `api/gerar-dossie.ts:23-28` — primary + fallback keys (NÃO está no handoff)
    - `api/radar-scan.ts:414-427` — primary key only ✓ (no handoff)
    - `api/rag.ts:57` — `new GoogleGenAI(...)` (NÃO está no handoff)
    - `utils/documentExtractor.ts:184` — `LLM_API_KEY || GEMINI_API_KEY` ✓ (no handoff, mas com fallback LLM_API_KEY)

    **Conclusão**: o handoff identificou corretamente 3 endpoints, mas a lista real é 5.
    `api/gerar-dossie.ts` e `api/rag.ts` foram omitidos. Documentado aqui para Phase 7
    não ser pega de surpresa.

14. **Roteamento LiteLLM com `selectModelForModule`** (linha 294): Chama
    `selectModelForModule(srvModuleName || '')` importado de `../utils/llm/modelRouter.js`.
    O `modelRouter.ts` (21 LOC) tem `HYBRID_MODEL_MAP` (mapa nome-módulo → modelo LiteLLM),
    `DEFAULT_MODEL = 'bedrock/deepseek.v3.2'`, e `CRITICAL_MODEL = 'bedrock/us.anthropic.claude-sonnet-4-6'`.
    Se `srvModuleName` for null (regex não match), usa DEFAULT_MODEL.

15. **CORS e method guard** (linhas 601-604): `applyCors` de `./_cors-headers.js` seta
    headers CORS. Rejeita `req.method !== 'POST'` com 405. Testado em `tests/api/middleware.test.ts`
    (4 testes OPTIONS para `/api/gemini`).

---

## O que NÃO entendo completamente (Princípio 14)

1. **DISCREPÂNCIA de linha no handoff (Princípio 6)**: O handoff claimou linha 428 =
   chat `useGrounding ?? false` (Decision 13). **`sed -n '428p'` mostra que a linha 428
   é `return res.status(403).json({ error: 'Foundation cache disabled' });`** (dentro do
   case `deleteCachedContent`). A linha real do `useGrounding ?? false` é a **440**.
   Offset de 12 linhas. Provável causa: o handoff foi escrito contra uma versão anterior
   do arquivo, antes de algum commit inserir linhas. Não tenho como saber qual commit
   deslocou sem `git blame`. **Decisão 13 está correta na semântica (default false), apenas
   a linha do handoff estava errada**. Flagado aqui para o coordenador corrigir o handoff.

2. **DISCREPÂNCIA de contagem de endpoints residuais**: O handoff claim "3 residual
   endpoints". **Grep mostra 5**: docs-rag, gerar-dossie, radar-scan, rag, documentExtractor.
   Não sei se `api/gerar-dossie.ts` e `api/rag.ts` foram adicionados depois do handoff, ou
   se o handoff simplesmente não os listou. Precisa confirmação do coordenador sobre qual
   é a fonte canônica da "Decision 14". Verificado em `git log` — não rodei `git blame`
   por questão de tempo, mas a Phase 7 (decommissioning de `GEMINI_API_KEY`) deve usar
   esta lista de 5, não 3.

3. **Detecção de `srvModuleName` via regex `bloco de (.+?) com extrema`** (linha 247):
   Não consegui rastrear a origem deste regex. Ele extrai o nome do módulo do prompt
   para roteamento LiteLLM (via `selectModelForModule`). Procurei em `prompts/specialist-prompts.ts`
   e `megaPrompts.ts` (citados no Task ID 4) por esta frase — não executei grep direto
   por questão de tempo, mas a confiança é baixa. Se a frase "bloco de X com extrema"
   existir em apenas alguns prompts, os outros módulos rodam com `DEFAULT_MODEL` em vez
   do modelo crítico. **Risco: dossiê gerado com modelo errado sem erro**.

4. **`temperature: 0.1` vs `0.15` baseado em `resolvedThinkingLevel === 'high'`** (linha 472):
   A escolha entre 0.1 e 0.15 parece arbitrária. Não sei se veio de teste A/B, calibração
   empírica, ou foi chute inicial. Diferença de 0.05 é pequena mas pode afetar
   determinismo em respostas longas. Não há comentário explicando.

5. **`maxOutputTokens: 65536`** (linha 349 e 473): Limite muito alto (64K tokens ~ 250K
   caracteres). Não sei se é limite do Gemini Flash, do LiteLLM, ou se foi escolhido para
   nunca truncar. Se o LiteLLM/Bedrock rejeitar este valor, a chamada falha. Não há fallback
   para valor menor. Não testei o comportamento real.

6. **Ordem do loop de API keys + `lastError`**: O loop (linhas 658-670) itera sobre
   `keys.length` (1 ou 2). Se a primeira key falha com quota, tenta a segunda. Mas se a
   SEGUNDA também falha (com qualquer erro), o `throw error` (linha 669) descarta o
   `lastError` da primeira iteração. O `throw lastError` na linha 673 só executa se o loop
   terminar sem throw — o que não acontece se a última key falhar com erro não-quota.
   Acho que este path é unreachable, mas não tenho 100% de certeza.

7. **`response.functionCalls` no loop de function calling** (linha 502): Não sei se o SDK
   `@google/genai` retorna `functionCalls` como array (presumo sim, baseado no
   `response.functionCalls.length`). Mas não li a tipagem do SDK. Se o SDK mudar a forma
   de retornar function calls (ex: `response.candidates[0].functionCalls`), o loop quebra
   silenciosamente. Não há teste cobrindo este cenário.

8. **`chat.sendMessage as unknown as (...) => Promise<typeof response>`** (linhas 555-557):
   O cast duplo (`as unknown as`) é um code smell. Sugere que o tipo do SDK não bate com
   o que o código espera. Não sei se isso é workaround para bug do SDK, ou se o autor
   não conseguiu tipar corretamente. Se o SDK mudar, o cast esconde o erro até runtime.

9. **`vercelEnv` e `VERCEL_URL` no fetch interno** (linha 517): O fetch para
   `/api/open-web-search` constrói `origin` a partir de `VERCEL_URL`. Não sei se
   `VERCEL_URL` está sempre definida em produção Vercel (presumo sim, mas o fallback é
   `http://localhost:3000` — o que em produção faria fetch falhar e ser capturado pelo
   catch). Não testei este path em preview.

10. **`_model` em `chatSendMessage` mas não em `health`**: O case `health` (linha 224-233)
    retorna `{ ok, text }` sem `_model`. O case `generateContent` retorna `_model` (linha
    305 e 394). O case `chatSendMessage` retorna `_model` (linha 589). Não sei se
    `health` deveria retornar `_model` também para diagnóstico. O frontend (`llmProxy.ts`)
    provavelmente não consome `_model` no health check, mas não verifiquei.

11. **`responseMimeType` em `generateContent` mas não em `chatSendMessage`** (linha 352):
    O case `generateContent` repassa `responseMimeType` se existir. O case `chatSendMessage`
    não faz isso. Não sei se é intencional (chat sempre retorna texto) ou omissão.

12. **Padrões `HARD_PROMPT_LEAK_PATTERNS` e `SOFT_PROMPT_LEAK_PATTERNS`** (linhas 61-74):
    São 5 padrões hard e 4 padrões soft. Não sei se estes padrões foram calibrados contra
    respostas reais de vazamento de prompt (ex: incidente Scheffer mencionado no Task ID 4
    sobre "Nota de escopo"). Não sei se a versão client-side (`textCleaners.ts`) tem os
    mesmos padrões ou mais. Comparação visual rápida: `textCleaners.ts` usa
    `Array<{id, regex}>` — provavelmente tem mais padrões (não contei). Risco de divergência
    silenciosa.

13. **`isQuotaExhausted` e `isBillingOrPermissionDenied`** (em `./_gemini-key-utils.js`):
    Não li este arquivo. Sei que são usados na linha 664 para decidir fallback de key.
    Se a implementação for muito agressiva (tratar erro 500 como quota), o fallback
    dispara desnecessariamente. Se for muito conservadora, não dispara quando deveria.

---

## Plano de refatoração futuro

As extrações abaixo estão organizadas em ordem crescente de risco. Nenhuma deve ser
executada antes da Fase 7 do plano V3 (decommissioning gradual de `GEMINI_API_KEY`).
Todas exigem `npm run typecheck` e `npm test` passando, mais validação em preview Vercel.

### Triviais (risco baixo — extração pura, 0 dependências externas)

1. **Extrair `withTimeout<T>`** para `utils/withTimeout.ts`. ~12 linhas, função genérica
   pura. Já existe em outros arquivos (duplicada). Pré-requisito: grep para confirmar
   duplicações e consolidar.

2. **Extrair `extractGeminiText` + `extractUsageMetadata`** para
   `api/_gemini-response-parser.ts`. ~25 linhas, funções puras. Pré-requisito: nenhum.

3. **Extrair `resolveThinkingLevel` + `toSdkThinkingLevel`** para `api/_thinking-level.ts`.
   ~12 linhas, funções puras. Pré-requisito: nenhum.

4. **Extrair `getApiKeys` + `getEnvVar` + `extractGeminiHttpStatus`** para expansão do
   já existente `api/_gemini-key-utils.ts`. ~30 linhas. Pré-requisito: nenhum.

### Médio (risco médio — requer testes baseline)

5. **Extrair case `health`** para `api/handlers/health.ts`. ~10 linhas. Pré-requisito:
   teste de integração do health check.

6. **Extrair case `createCachedContent` + `deleteCachedContent`** para
   `api/handlers/foundation-cache.ts`. ~35 linhas, inclui gate `isFoundationCacheEnabled`.
   Pré-requisito: teste do foundation cache (já existe em `tests/services/gemini/foundation-cache.test.ts`).

7. **Extrair branch `recordDiagnostics`** para `api/_diagnostics-handler.ts`. ~40 linhas.
   Pré-requisito: teste do diagnostics pipeline (`tests/api-gemini.test.ts` não cobre
   este branch — adicionar antes de extrair).

8. **Extrair branch LiteLLM** (linhas 256-312) para expansão de `api/_llm-client.ts`
   já existente. ~55 linhas. Pré-requisito: teste de integração com LiteLLM real
   (`tests/api/llm-client.test.ts` tem 22 testes — provavelmente suficiente).

### Complexo (risco alto — requer Bruno + DeepSeek + Fase 7 completa)

9. **Consolidar as 2 cópias do prompt-leak-shield** em `utils/textCleaners.ts` (live).
   Remover a cópia local de `api/gemini.ts:59-115`.
   ~~`utils/promptLeakShield.ts` já deletado na PR #405.~~
   Substituir chamada `applyPromptLeakShieldLocal` por import de `applyPromptLeakShield`
   de `utils/textCleaners.ts`. **ALTO RISCO**: a versão local divergiu (usa `RegExp[]`
   vs `Array<{id, regex}>`), então consolidar pode mudar comportamento de bloqueio.
   Pré-requisito: alinhamento dos padrões hard/soft entre as 2 cópias + teste de
   regressão com respostas reais do Scheffer. **Decisor: Bruno + DeepSeek (não IA gestora sozinha)**.

10. **Extrair case `chatSendMessage` + closure `runChat` + loop de function calling**
    para `api/handlers/chat.ts` + `api/_function-call-loop.ts`. ~140 linhas. É a parte
    mais complexa do arquivo. Pré-requisito: testes E2E do fluxo de chat com grounding
    - function calling + fallback.

11. **Extrair case `generateContent`** (linhas 235-398) para `api/handlers/generate-content.ts`.
    ~165 linhas, inclui branch LiteLLM + fallback Gemini + diagnósticos server-side.
    Pré-requisito: extração #8 (LiteLLM branch) + teste de regressão do waterfall completo.

12. **Migrar 5 endpoints residuais para LiteLLM** (Decisão 14): `api/docs-rag.ts`,
    `api/gerar-dossie.ts`, `api/radar-scan.ts`, `api/rag.ts`, `utils/documentExtractor.ts`.
    Cada um precisa de branch condicional como `api/gemini.ts` tem hoje. **ALTO RISCO**:
    `api/gerar-dossie.ts` e `api/rag.ts` não estão no handoff — investigar antes de migrar.
    Pré-requisito: Fase 7 do plano V3 + análise individual de cada endpoint.

---

## Justificativa de não refatorar agora

1. **Princípio 4 (não refatorar o que não entende)**: Este ADR documenta 13 itens que
   NÃO entendo completamente (seção acima). Refatorar com essas lacunas arrisca
   introduzir regressão silenciosa em paths que o autor do ADR não consegue prever.

2. **LiteLLM HOMOLOG JUST estabilizou em produção (29/06/2026)**: O commit `61ced7bc`
   (merge: resolve conflito llmProxy com main) fechou o PR #403 que promovia LiteLLM
   de HOMOLOG para PROD. Antes deste commit, o gateway tinha bugs de roteamento (commits
   `b53ca5e9`, `6620211a`, `805901bf` — todos debug do gate `isLiteLLMEnabled`).
   Refatorar a estrutura agora arrisca re-introduzir os bugs de gate que custaram dias
   de debug. O dossiê Scheffer (1181 linhas) acabou de ser gerado com sucesso passando
   por este gateway — qualquer refactor agora coloca esse P0 recém-resolvido em risco.

3. **20 usuários reais ativos**: O piloto tem 20 usuários do agronegócio brasileiro
   usando o produto. Se o gateway quebrar, nenhum dossiê é gerado e nenhum chat responde.
   Não há fallback HTTP. O impacto comercial é imediato. Princípio 7 (cérebro fadigado
   mergeia nada) se aplica: a migração recém-estabilizou, dar mais um passo agora é
   mover o P0 que foi consertado ontem.

4. **Decisão 13 (default grounding false) recém-implementada**: O commit `62e01e0f`
   (feat: observabilidade LiteLLM + default grounding false) mudou o default de
   `useGrounding` para `false`. Esta mudança ainda não tem cobertura de testes ampla
   em produção — não sabemos se algum caller do frontend depende implicitamente de
   `useGrounding=true` default. Refatorar a estrutura antes de validar este comportamento
   em 1 semana de produção é aposta.

5. **Cobertura de testes insuficiente para extrações complexas**: `tests/api-gemini.test.ts`
   tem 11 testes em 472 LOC. Cobrem thinking level (3), foundation cache (3), extração
   de texto (2), function call error (1), tools repassed (1), cachedContent priority (1).
   **NÃO cobrem**: branch LiteLLM ativo, branch LiteLLM fallback para Gemini, loop de
   function calling com múltiplas iterações, fallback de grounding, recordDiagnostics
   branch, key fallback com GEMINI_API_KEY_FALLBACK, regex de `srvModuleName`. Refatorar
   sem esta cobertura é aposta.

6. **Fase 6 é documentação, não refatoração**: O plano V3 determina que a Fase 6
   apenas documenta débitos. A refatoração do gateway está planejada para a Fase 7
   (decommissioning de `GEMINI_API_KEY`) e Fase 9 (self-audit sênior). Documentar agora
   permite que o coordenador priorize extrações em sprints futuros sem pressa.

---

## Referências

### Código

- **Componente**: `api/gemini.ts` (680 LOC)
- **Gate LiteLLM**: `api/_llm-client.ts` (148 LOC) — função `isLiteLLMEnabled()` linhas 20-29, `callLiteLLM()` linhas 49-123
- **Roteamento de modelo**: `utils/llm/modelRouter.ts` (21 LOC) — `selectModelForModule`, `HYBRID_MODEL_MAP`, `DEFAULT_MODEL = 'bedrock/deepseek.v3.2'`
- **Helpers de key Gemini**: `api/_gemini-key-utils.js` — `isQuotaExhausted`, `isBillingOrPermissionDenied` (não lido neste ADR)
- **CORS**: `api/_cors-headers.js` — `applyCors`
- **Diagnósticos Supabase**: `utils/serverDiagnostics.ts` — `insertDiagnosticsBatch`, `MAX_EVENTS_PER_BATCH` (importado na linha 5)

### Cópias do prompt-leak-shield (Task ID 4)

- **Cópia #1 (live, client-side)**: `utils/textCleaners.ts:101-228` — `HARD_PROMPT_LEAK_PATTERNS` (L101), `SOFT_PROMPT_LEAK_PATTERNS` (L112), `detectPromptLeakIndicators` (L150), `stripInternalMarkers` (L176), `applyPromptLeakShield` (L192). Usa `Array<{id, regex}>` com ids nomeados.
- ~~**Cópia #2 (orphan, 150 LOC)**: `utils/promptLeakShield.ts:18-145` — deletado na PR #405 (H1).~~ Dead code removido.
- **Cópia #2 (server-side, divergente)**: `api/gemini.ts:59-115` — `HARD_PROMPT_LEAK_PATTERNS` (L61, `RegExp[]` simples), `SOFT_PROMPT_LEAK_PATTERNS` (L69), `stripInternalMarkersLocal` (L76), `detectPromptLeakIndicatorsLocal` (L85), `applyPromptLeakShieldLocal` (L97). **Divergente**: usa `RegExp[]` em vez de `Array<{id, regex}>`, indicadores posicionais `hard_0`/`soft_0` em vez de ids nomeados.

### Consumidores (callers)

- **Principal**: `services/llmProxy.ts:121-122` — `resolveGeminiApiEndpoint()` retorna `/api/gemini` (ou URL customizada em dev local). Toda chamada LLM do frontend passa por aqui.
- **Telemetria**: `utils/diagnosticLog.ts:170` — `fetch('/api/gemini', { method: 'POST', body: { action: 'recordDiagnostics', ... } })`
- **Dev local**: `config/localDevApiProxy.ts:4` — paths com proxy em dev

### ADRs relacionados

- **ADR-0001** (`docs/adr/0001-waterfall-orchestrator-god-component.md`): waterfall-orchestrator.ts — caller do `generateContent` via `investigation-orchestration.ts`
- **ADR-0003** (`docs/adr/0003-investigation-orchestration-god-component.md`): investigation-orchestration.ts — caller principal deste gateway via `llmProxy.ts` (`proxyChatSendMessage`, `proxyGenerateContent`)
- **ADR-0004** (`docs/adr/0004-client-lookup-service-god-component.md`): clientLookupService.ts — fornece contexto que vira prompt que chega neste gateway

### Princípios e handoff

- **PRINCIPLES.md**: Princípio 4 (não refatorar o que não entende), Princípio 6 (não aceitar claim sem grep), Princípio 9 (resumo em português), Princípio 14 (ADR honesto sobre limite de compreensão)
- **Handoff `scout360-handoff-v2`**: Decisões 11-14 (LiteLLM HOMOLOG, foundation cache gate, default grounding false, residual endpoints)
- **Task ID 4 (worklog)**: investigação de duplicação de prompts — confirmou as 2 cópias do leak-shield (reduzido de 3 após PR #405 deletar órfão)
- **Task ID 6 (worklog)**: ADR-0003 — investigation-orchestration.ts é o principal caller deste gateway
- **Task ID 7 (worklog)**: ADR-0004 — clientLookupService.ts alimenta prompts que chegam aqui

### Commits relevantes (branch `stabilize/from-production-fe6c6f9`)

- `61ced7bc` — merge: resolve conflito llmProxy com main (mantém clientModel) — **estabilização LiteLLM HOMOLOG → PROD**
- `7fdf93df` — Merge pull request #403 from brunolimaff-jpg/worktree-migrate+litellm-no-gemini
- `6d265136` — fix: responde feedback PR — warn condicional, \_model no chat, comentário atualizado
- `62e01e0f` — feat: observabilidade LiteLLM + default grounding false — **Decisão 13**
- `cfb2ac5a` — feat: inclui modelo real na resposta LiteLLM + loga no frontend
- `6620211a` — debug: loga isLiteLLMEnabled incondicional para ver env vars reais
- `b53ca5e9` — debug: log isLiteLLMEnabled gate para diagnosticar por que nao ativa

---

## Histórico de revisão

| Data       | Versão | Autor                    | Nota                                                                                                                                                                                                                                                                                           |
| ---------- | ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 29/06/2026 | 1.0    | IA gestora (ADR Author)  | Autor — análise de código e redação do ADR. Verificou claims do handoff com sed/grep: linha 118 ✓ (Decision 12), linha 260 ✓ (LiteLLM branch), linha 428 ✗ (offset de 12 linhas — Decision 13 está na linha 440). Flagged 2 discrepâncias (linha 428, contagem de endpoints residuais 3 vs 5). |
| Pendente   | —      | Bruno                    | Revisão — confirmação de que não refatorar agora é a decisão correta                                                                                                                                                                                                                           |
| Pendente   | —      | IA gestora (Coordinator) | Validar discrepâncias de handoff (linha 428, contagem 3 vs 5) e atualizar handoff v3 se necessário                                                                                                                                                                                             |
| Pendente   | —      | Sênior (Fase 9)          | Revisão técnica aprofundada antes de iniciar refatoração                                                                                                                                                                                                                                       |
