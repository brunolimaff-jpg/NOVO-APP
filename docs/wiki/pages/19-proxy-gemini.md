---
grok_wiki: true
page_id: 'page-gemini-proxy-reference'
title: 'Proxy Gemini'
description: 'Ações aceitas por `/api/gemini`, fallback de chave, cache foundation, grounding, Open Web Search tool, timeout até body read e fachada `geminiService`.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'api/gemini.ts'
  - 'services/geminiProxy.ts'
  - 'services/geminiService.ts'
  - 'services/gemini/contracts.ts'
  - 'services/gemini/runtime.ts'
  - 'services/gemini/foundation-cache.ts'
  - 'tests/services/geminiProxy.test.ts'
---

`/api/gemini` é a rota serverless Node.js que concentra chamadas ao Gemini, cache foundation do waterfall e ingestão de diagnósticos. O frontend não usa chave Gemini diretamente: `services/geminiProxy.ts` resolve o endpoint, envia `POST` JSON, aplica timeout até leitura do body e entrega funções consumidas pela fachada pública `services/geminiService.ts`.

## Superfície de runtime

:::endpoint POST /api/gemini Proxy serverless para Gemini e diagnósticos

A rota aceita apenas `POST`, aplica headers básicos de segurança e usa `@google/genai` no servidor. O modelo padrão é `gemini-3-flash-preview` quando o payload não define `model`.

<ParamField body="action" type="string" required>
Discriminador do payload. Ações Gemini passam pelo schema Zod; `recordDiagnostics` é tratado antes da validação Gemini.
</ParamField>

<ParamField body="model" type="string">
Opcional nas ações de geração. Quando ausente, usa `gemini-3-flash-preview`.
</ParamField>

<ResponseField name="error" type="string">
Presente em erro HTTP controlado, como método inválido, payload inválido, cache desabilitado ou falha do proxy.
</ResponseField>

:::

| Propriedade                 | Valor atual                                   |
| --------------------------- | --------------------------------------------- |
| Runtime                     | `nodejs`                                      |
| Duração máxima Vercel       | `300` segundos                                |
| Método aceito               | `POST`                                        |
| Chave primária              | `GEMINI_API_KEY`                              |
| Chave fallback              | `GEMINI_API_KEY_FALLBACK`                     |
| Modelo padrão               | `gemini-3-flash-preview`                      |
| Timeout do cliente proxy    | `VITE_GEMINI_PROXY_TIMEOUT_MS` ou `210000` ms |
| Endpoint local customizável | `VITE_GEMINI_PROXY_URL`                       |

<Warning>
`GEMINI_API_KEY` deve ficar no servidor. O frontend chama `/api/gemini` via proxy; não há contrato seguro para expor chave Gemini com prefixo `VITE_`.
</Warning>

## Ações aceitas

| Ação                  | Uso                                                              | Entrada principal                                     | Resposta                                            |
| --------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| `health`              | Canary simples do modelo                                         | Nenhum campo além de `action`                         | `{ ok, text }`                                      |
| `generateContent`     | Geração direta, módulos do dossiê e chamadas com `cachedContent` | `contents`, `model?`, `config?`                       | `{ text, candidates, usageMetadata }`               |
| `chatSendMessage`     | Chat com histórico, grounding e tool calls                       | `message`, `systemInstruction?`, `history?`           | `{ text, groundingChunks, groundingUsed }`          |
| `createCachedContent` | Criação do cache foundation do waterfall                         | `systemInstruction`, `ttl?`, `displayName?`, `tools?` | `{ name, expireTime, usageMetadata }`               |
| `deleteCachedContent` | Remoção explícita do cache foundation                            | `name`                                                | `{ ok: true }`                                      |
| `recordDiagnostics`   | Flush de `scoutDiag` para Supabase                               | `runId`, `events[]`                                   | `{ inserted }` ou `{ inserted: 0, degraded: true }` |

## `generateContent`

`generateContent` exige `contents`. O proxy monta `config` com `temperature` padrão `0.2` e `maxOutputTokens` padrão `65536`, e repassa `responseMimeType`, `systemInstruction`, `tools` e `toolConfig` quando não há cache.

Quando `config.cachedContent` é string, o serverless prioriza o cache e não repassa `systemInstruction`, `tools` nem `toolConfig` no `generateContent`. Esse contrato evita combinação inválida entre cache explícito e ferramentas na chamada de geração.

<RequestExample>

```json
{
  "action": "generateContent",
  "model": "gemini-3-flash-preview",
  "contents": "Empresa alvo: SCHEFFER & CIA LTDA\nGere o bloco de Operação.",
  "config": {
    "cachedContent": "cachedContents/test-cache",
    "temperature": 0.2,
    "maxOutputTokens": 8192
  }
}
```

</RequestExample>

<ResponseExample>

```json
{
  "text": "Módulo cacheado",
  "candidates": [],
  "usageMetadata": {
    "cachedContentTokenCount": 12000,
    "promptTokenCount": 900
  }
}
```

</ResponseExample>

## `chatSendMessage`

`chatSendMessage` cria uma sessão `ai.chats.create` com histórico normalizado no formato `{ role, parts: [{ text }] }`. `history` aceita papéis `user` e `model`; mensagens vazias são removidas.

| Campo               | Regra                                               |
| ------------------- | --------------------------------------------------- |
| `message`           | Obrigatório, `1` a `200000` caracteres              |
| `systemInstruction` | Opcional, até `100000` caracteres                   |
| `history`           | Opcional, itens `{ role: "user" ou "model", text }` |
| `useGrounding`      | Opcional, padrão `true`                             |
| `thinkingLevel`     | `low`, `medium` ou `high`                           |
| `thinkingMode`      | Legado: `true` vira `high`, `false` vira `low`      |
| `useOpenWebSearch`  | Opcional, padrão `false`                            |

A prioridade de raciocínio é: `thinkingLevel` explícito, depois `thinkingMode`, depois `high`. A temperatura efetiva é definida no servidor: `0.1` para `high` e `0.15` para os demais níveis. Campos do tipo cliente como `temperature` e `stopSequences` não controlam a chamada serverless atual de `chatSendMessage`.

### Grounding

Com `useGrounding` ativo, o servidor inclui `tools: [{ googleSearch: {} }]` e usa timeout interno de `55s` para a primeira tentativa. Se essa tentativa falha e `useGrounding` era `true`, o proxy executa fallback sem `googleSearch`, com timeout de `180s`.

`groundingUsed` só volta `true` quando o grounding estava ativo e `groundingChunks` contém fontes. Quando volta `false`, o chamador deve tratar como sem fonte verificada ou fallback silencioso.

### Open Web Search tool

Com `useOpenWebSearch: true`, o servidor registra a função `performWebSearch` para o modelo. A função aceita `query` ou `url` e chama `/api/open-web-search`.

```text
chatSendMessage
  -> ai.chats.create(... tools: googleSearch?, performWebSearch?)
  -> chat.sendMessage({ message })
  -> se Gemini pedir functionCalls:
       performWebSearch({ query?, url? })
       POST /api/open-web-search
       reenvia functionResponse em lote
  -> resposta final
```

O loop de function calling roda no máximo 3 iterações. Falha HTTP da tool não derruba imediatamente `/api/gemini`; o servidor envia um `functionResponse` com `{ error }` para o Gemini e deixa o modelo finalizar a resposta.

Em produção, a tool usa `https://${VERCEL_URL}/api/open-web-search`. Sem `VERCEL_URL`, usa `http://localhost:3000/api/open-web-search`.

## Cache foundation do waterfall

O cache foundation é opcional e precisa de duas flags ligadas:

| Camada              | Variável                               | Valor |
| ------------------- | -------------------------------------- | ----- |
| Serverless          | `GEMINI_FOUNDATION_CACHE_ENABLED`      | `1`   |
| Frontend/build Vite | `VITE_GEMINI_FOUNDATION_CACHE_ENABLED` | `1`   |

Sem a flag serverless, `createCachedContent` e `deleteCachedContent` retornam `403` com erro de cache desabilitado. Sem a flag frontend, o waterfall não tenta criar cache.

O helper `services/gemini/foundation-cache.ts` monta o contexto estático com seed do dossiê, lookup, evidência Senior e texto de teia. O cache usa TTL `600s`, `displayName: "scout360-waterfall-foundation"` e registra `tools: [{ googleSearch: {} }]` na criação.

```text
runMegaPromptWaterfall
  -> buildStaticDossierContext(...)
  -> createWaterfallFoundationCache(...)
  -> generateDossierModule(... foundationCacheName)
       com cache: config.cachedContent + contents dinâmico
       sem cache: systemInstruction completo + tools googleSearch?
  -> reconciliação PORTA
  -> finally: deleteWaterfallFoundationCache best-effort
```

<Info>
Quando `foundationCacheName` existe, `generateDossierModule` não envia `systemInstruction` nem `tools` no `generateContent`; o prompt dinâmico vai em `contents` e o contexto estático vem do `cachedContent`.
</Info>

Se a criação do cache falhar sem abort do usuário, o waterfall registra warning e continua sem cache. A limpeza no `finally` é fire-and-forget; se demorar mais de 15s, gera warning, mas não bloqueia a finalização visual do dossiê.

## Fachada `geminiService`

`services/geminiService.ts` preserva a superfície pública usada por `App.tsx`, `ChatInterface`, `LoadingSmart` e testes. A implementação interna fica em `services/gemini/*`.

| Export                       | Origem interna                                   | Uso                                              |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `sendMessageToGemini`        | `services/gemini/investigation-orchestration.ts` | Chat principal, follow-up e investigação         |
| `generateDossierModule`      | `services/gemini/investigation-orchestration.ts` | Módulos do waterfall                             |
| `generateContinuityQuestion` | `services/gemini/auxiliary.ts`                   | Sugestões finais                                 |
| `isMegaPromptRequest`        | `services/gemini/runtime.ts`                     | Detecção de dossiê completo                      |
| `GeminiRequestOptions`       | `services/gemini/contracts.ts`                   | Opções de grounding, thinking, callbacks e abort |

O cliente de baixo nível fica em `services/geminiProxy.ts`:

| Função                     | Ação ou rota                                         |
| -------------------------- | ---------------------------------------------------- |
| `proxyGenerateContent`     | `/api/gemini`, `action: "generateContent"`           |
| `proxyChatSendMessage`     | `/api/gemini`, `action: "chatSendMessage"`           |
| `proxyCreateCachedContent` | `/api/gemini`, `action: "createCachedContent"`       |
| `proxyDeleteCachedContent` | `/api/gemini`, `action: "deleteCachedContent"`       |
| `proxyGeminiHealth`        | `/api/gemini`, `action: "health"`                    |
| `proxyGerarDossie`         | `/api/gerar-dossie`                                  |
| `executeOpenWebSearchTool` | `/api/open-web-search` ou `VITE_OPEN_WEB_SEARCH_URL` |

## Timeout até body read

`services/geminiProxy.ts` não usa `response.json()` diretamente. O fluxo é:

1. Cria `AbortController`.
2. Agenda timeout global do proxy.
3. Executa `fetch`.
4. Lê `response.text()` com o mesmo sinal de abort.
5. Só depois faz `JSON.parse`.

Isso cobre o caso em que o servidor responde headers, mas o body fica pendente. Quando o timeout ocorre antes dos headers, o log marca `phase: "fetch"`. Quando ocorre durante `response.text()`, marca `phase: "body-read"` e lança `Gemini proxy body read timeout after ...ms`.

Os logs do proxy carregam `action`, `requestClass`, `endpoint`, `timeoutMs`, status HTTP e tamanho do body lido. `requestClass` separa chamadas `ai`, controles como cache/health e diagnósticos.

## Diagnósticos via `recordDiagnostics`

`recordDiagnostics` entra antes do schema Gemini. O payload precisa de `runId` e `events` não vazio. A API limita o lote a `MAX_EVENTS_PER_BATCH`, atualmente `100`.

<RequestExample>

```json
{
  "action": "recordDiagnostics",
  "runId": "lx7-run",
  "sessionId": "session-123",
  "operatorId": "operator-1",
  "environment": "production",
  "route": "/",
  "events": [
    {
      "at": "2026-06-08T20:00:00.000Z",
      "t": 1780000000000,
      "runId": "lx7-run",
      "area": "GeminiProxy",
      "event": "response:body-read",
      "severity": "info",
      "payload": {
        "action": "generateContent",
        "bodyChars": 4312
      }
    }
  ]
}
```

</RequestExample>

A persistência usa Supabase server-side com `SUPABASE_URL` ou `VITE_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Se Supabase não estiver configurado, a resposta é `200` degradada, com `inserted: 0`, para não quebrar o fluxo do frontend.

## Erros e fallback de chave

| Condição                              | Status esperado            | Observação                                            |
| ------------------------------------- | -------------------------- | ----------------------------------------------------- |
| Método diferente de `POST`            | `405`                      | `{ error: "Method not allowed" }`                     |
| Payload fora do schema                | `400`                      | `{ error: "Invalid request", details }`               |
| `generateContent` sem `contents` útil | `400`                      | `{ error: "Missing contents" }`                       |
| Cache foundation desligado            | `403`                      | Em `createCachedContent` e `deleteCachedContent`      |
| Sem `GEMINI_API_KEY`                  | `500`                      | Detalhe indica variável ausente                       |
| Quota ou rate limit Gemini            | `429` quando detectado     | Pode tentar `GEMINI_API_KEY_FALLBACK` antes de falhar |
| Billing ou permissão negada           | `403` ou fallback de chave | Fallback roda se houver segunda chave                 |
| Resposta não JSON no cliente proxy    | Exceção frontend           | `Gemini proxy returned invalid JSON`                  |

O fallback de chave só troca para `GEMINI_API_KEY_FALLBACK` quando o erro indica quota, rate limit, billing ou permissão negada. Outros erros da primeira chave são propagados.

## Validação recomendada

<CodeGroup>

```bash title="Testes focados do proxy"
npm test -- tests/services/geminiProxy.test.ts tests/api-gemini.test.ts tests/services/gemini/foundation-cache.test.ts tests/services/investigation-orchestration.test.ts
```

```bash title="Gates gerais"
npm run typecheck
npm run test:contracts
npm run build
```

</CodeGroup>

Use os testes focados quando alterar `api/gemini.ts`, `services/geminiProxy.ts`, cache foundation ou contratos de grounding. Para regressões de UX pós-waterfall, combine com E2E de painel branco ou preview Vercel, porque chamadas Gemini concluídas não provam que o dossiê ficou visível.

## Related pages

<CardGroup>
  <Card title="Referência de APIs serverless" href="/api-serverless-reference">
    Métodos, payloads, validação Zod, erros e runtime das rotas em `api/*.ts`.
  </Card>
  <Card title="Waterfall de dossiê" href="/dossie-waterfall">
    Pipeline modular que cria, usa e limpa o cache foundation durante a investigação.
  </Card>
  <Card title="Referência de configuração" href="/configuracao-reference">
    Variáveis `.env`, flags Vite, modelos, proxy local e fronteiras entre frontend e serverless.
  </Card>
  <Card title="Observabilidade e diagnósticos" href="/observabilidade">
    `scoutDiag`, flush para `/api/gemini`, Supabase diagnostics e sinais de investigação.
  </Card>
</CardGroup>

## Source files

- `api/gemini.ts`
- `services/geminiProxy.ts`
- `services/geminiService.ts`
- `services/gemini/contracts.ts`
- `services/gemini/runtime.ts`
- `services/gemini/foundation-cache.ts`
- `tests/services/geminiProxy.test.ts`
