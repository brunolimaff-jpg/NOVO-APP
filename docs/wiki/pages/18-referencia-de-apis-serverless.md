---
grok_wiki: true
page_id: 'page-api-serverless-reference'
title: 'Referência de APIs serverless'
description: 'Métodos, payloads, validação Zod, erros, timeouts, runtime Node.js, headers comuns e respostas degradadas das rotas em `api/*.ts`.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'api/gemini.ts'
  - 'api/cnpj.ts'
  - 'api/comex.ts'
  - 'api/open-web-search.ts'
  - 'api/extract-content.ts'
  - 'api/link-status.ts'
  - 'api/radar-scan.ts'
  - 'api/socio-search.ts'
---

As rotas serverless do app ficam em `api/*.ts`, rodam com `runtime: "nodejs"` quando declarado e expõem contratos HTTP JSON consumidos pelo frontend Vite, por testes Vitest e pelo preview Vercel. A maioria das rotas aplica `setSecurityHeaders(res)` no início do handler; validação de body usa Zod nas rotas novas e validação manual nas rotas legadas de CNPJ, Comex e status de link.

<Note>
Em desenvolvimento local, `config/localDevApiProxy.ts` mantém a lista de rotas serverless usadas pelo app e aponta o alvo padrão para `https://scoutagro.vercel.app`. Validar uma rota em `localhost` pode exercitar backend remoto se o proxy local estiver ativo.
</Note>

## Inventário de rotas

| Rota                   | Métodos aceitos                          | Validação                                    | Limite declarado | Comportamento principal                                                              |
| ---------------------- | ---------------------------------------- | -------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `/api/gemini`          | `POST`                                   | Zod por `action`; `recordDiagnostics` manual | `300s`           | Proxy Gemini, cache foundation, tool call Open Web Search e ingestão de diagnósticos |
| `/api/gerar-dossie`    | `POST`                                   | Zod                                          | `300s`           | `generateContent` dedicado para dossiês longos                                       |
| `/api/open-web-search` | `POST`                                   | Zod                                          | `60s`            | Busca web ou extração de URL pública com resposta degradada em `200`                 |
| `/api/extract-content` | `POST`                                   | Zod                                          | `60s`            | Extração de URL, PDF, DOCX, HTML ou texto base64                                     |
| `/api/link-status`     | `POST`                                   | Manual                                       | padrão Vercel    | Validação defensiva de até 25 URLs, `HEAD` com fallback `GET`                        |
| `/api/radar-scan`      | `GET`, `POST`                            | Zod                                          | `120s`           | Varredura de RSS/Google News por categorias e classificação Gemini                   |
| `/api/socio-search`    | `POST`                                   | Zod em `services/socio-search/types.ts`      | `60s`            | Busca societária lateral, enriquecimento por CNPJ e cache volátil/persistente        |
| `/api/cnpj`            | `GET`, `OPTIONS`                         | Manual                                       | padrão Vercel    | Proxy CNPJ com CORS explícito e cache HTTP de 1 hora                                 |
| `/api/comex`           | `OPTIONS` e requisições com `query.cnpj` | Manual                                       | padrão Vercel    | Simulação determinística de exportador com cache HTTP de 24 horas                    |
| `/api/rag`             | `POST`                                   | Zod                                          | `60s`            | Consulta Pinecone genérica com embeddings Gemini                                     |
| `/api/docs-rag`        | `POST`                                   | Zod                                          | `60s`            | Consulta RAG documental com namespaces permitidos                                    |
| `/api/pulse-news`      | `POST`                                   | Zod                                          | padrão Vercel    | Resumo comercial Gemini por `companyName`                                            |

## Headers comuns

Todas as rotas principais chamam `setSecurityHeaders(res)` antes de responder:

| Header                   | Valor                             |
| ------------------------ | --------------------------------- |
| `X-Content-Type-Options` | `nosniff`                         |
| `X-Frame-Options`        | `DENY`                            |
| `X-XSS-Protection`       | `1; mode=block`                   |
| `Referrer-Policy`        | `strict-origin-when-cross-origin` |

`/api/cnpj` e `/api/comex` também aplicam CORS para `ALLOWED_ORIGIN`, preview Vercel, `https://scoutagro.vercel.app`, `http://localhost:5173` e `http://localhost:3000`. `/api/cnpj` permite `GET,OPTIONS`; `/api/comex` anuncia `GET,OPTIONS,POST` e inclui `Access-Control-Allow-Credentials: true`.

`Cache-Control` só é definido por rotas idempotentes específicas:

| Rota         | Cache                                   |
| ------------ | --------------------------------------- |
| `/api/cnpj`  | `public, max-age=3600, s-maxage=3600`   |
| `/api/comex` | `public, max-age=86400, s-maxage=86400` |

## Validação e erros padrão

| Caso                               | Resposta típica                                                           |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Método não aceito                  | `405 { "error": "Method not allowed" }`                                   |
| Body inválido em rota Zod          | `400 { "error": "Invalid request", "details": ... }`                      |
| CNPJ inválido em `/api/cnpj`       | `400 { "error": "CNPJ inválido — verifique os dígitos informados." }`     |
| CNPJ inválido em `/api/comex`      | `400 { "error": "CNPJ inválido." }`                                       |
| URL privada/restrita               | `403`, quando a rota bloqueia SSRF diretamente                            |
| Falha controlada com fallback útil | `200` com `degraded: true`, `context` vazio, `providerStatus` ou `detail` |

<Warning>
Nem toda falha operacional vira status HTTP de erro. `/api/open-web-search`, `/api/socio-search`, `/api/rag`, `/api/docs-rag` e `recordDiagnostics` preferem resposta degradada em `200` quando isso preserva o fluxo do usuário.
</Warning>

## Contratos por rota

:::endpoint POST /api/gemini Proxy Gemini, tool calls e diagnósticos
`/api/gemini` usa uma união discriminada por `action`. O handler rejeita métodos diferentes de `POST`, aplica headers de segurança e só lê chaves Gemini no servidor por `GEMINI_API_KEY` e `GEMINI_API_KEY_FALLBACK`.

### Ações aceitas

| `action`              | Campos principais                                                                                                              | Resposta                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `health`              | nenhum campo adicional                                                                                                         | `{ ok, text }`                                              |
| `generateContent`     | `model?`, `contents`, `config?`                                                                                                | `{ text, candidates, usageMetadata }`                       |
| `createCachedContent` | `model?`, `systemInstruction`, `ttl?`, `displayName?`, `tools?`                                                                | `{ name, expireTime, usageMetadata }`                       |
| `deleteCachedContent` | `name`                                                                                                                         | `{ ok: true }`                                              |
| `chatSendMessage`     | `model?`, `systemInstruction?`, `history?`, `message`, `useGrounding?`, `thinkingLevel?`, `thinkingMode?`, `useOpenWebSearch?` | `{ text, groundingChunks, groundingUsed }`                  |
| `recordDiagnostics`   | `runId`, `events`, metadados opcionais                                                                                         | `{ inserted }` ou `{ inserted: 0, degraded: true, reason }` |

`recordDiagnostics` é tratado antes do schema Gemini. O batch aceita até `MAX_EVENTS_PER_BATCH` eventos e grava em `scout_diagnostics` quando `SUPABASE_URL` ou `VITE_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` existem.

### Defaults e timeouts internos

| Item                                     | Valor                                        |
| ---------------------------------------- | -------------------------------------------- |
| Modelo padrão                            | `gemini-3-flash-preview`                     |
| `generateContent.config.temperature`     | `0.2`                                        |
| `generateContent.config.maxOutputTokens` | `65536`                                      |
| Chat com grounding                       | timeout local de `55_000ms`                  |
| Chat sem grounding                       | timeout local de `180_000ms`                 |
| Tool call `/api/open-web-search`         | `30_000ms`                                   |
| Frontend `services/geminiProxy.ts`       | `VITE_GEMINI_PROXY_TIMEOUT_MS` ou `210000ms` |

<RequestExample>

```bash
curl -sS -X POST /api/gemini \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "chatSendMessage",
    "message": "Analise a empresa alvo",
    "useGrounding": true,
    "thinkingLevel": "high",
    "useOpenWebSearch": true
  }'
```

</RequestExample>

<ResponseExample>

```json
{
  "text": "Resposta final do modelo",
  "groundingChunks": [],
  "groundingUsed": false
}
```

</ResponseExample>

### Erros específicos

| Condição                                                                               | Status                                                   |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `GEMINI_API_KEY` ausente                                                               | `500` com `Gemini proxy failed`                          |
| quota, rate limit ou billing na chave primária com fallback disponível                 | tenta `GEMINI_API_KEY_FALLBACK`                          |
| `createCachedContent` ou `deleteCachedContent` sem `GEMINI_FOUNDATION_CACHE_ENABLED=1` | `403 Foundation cache disabled`                          |
| erro Gemini com código HTTP detectável                                                 | propaga `429`, `403` ou outro status entre `400` e `599` |

:::

:::endpoint POST /api/gerar-dossie Geração longa de dossiê
Rota dedicada para `generateContent` sem campo `action`. Aceita `model?`, `contents` e `config?`, usa `gemini-3-flash-preview` por padrão e reaproveita `GEMINI_API_KEY_FALLBACK` em erro de quota, billing ou permissão.

<RequestExample>

```json
{
  "model": "gemini-3-flash-preview",
  "contents": "Prompt consolidado do dossiê",
  "config": {
    "temperature": 0.2,
    "maxOutputTokens": 65536,
    "tools": [{ "googleSearch": {} }]
  }
}
```

</RequestExample>

Responde `400` para body inválido ou `contents` ausente. Em falha total, retorna `{ "error": "Falha ao gerar dossie. Tente novamente em instantes.", "detail": "..." }` com status derivado do erro Gemini.
:::

:::endpoint POST /api/open-web-search Busca web e extração de URL pública
Aceita `query`, `url` ou ambos. O schema exige pelo menos um dos campos. Quando `url` é informado, a rota bloqueia URL não pública via `isValidPublicUrl`, faz `fetch` com `User-Agent: Mozilla/5.0 ScoutAgro/1.0` e timeout de `10000ms`, extrai HTML e retorna `source: "OpenWebSearch/URL"`.

<RequestExample>

```json
{
  "query": "Grupo Piccini RRP Energia Tapurah"
}
```

</RequestExample>

<ResponseExample>

```json
{
  "content": "Título: ...\nURL: ...\nResumo: ...",
  "source": "OpenWebSearch/DuckDuckGo",
  "sources": [],
  "degraded": false,
  "providerStatus": [{ "provider": "duckduckgo", "ok": true }]
}
```

</ResponseExample>

Se a busca não encontra conteúdo ou o provedor falha, a rota ainda retorna `200`:

```json
{
  "content": "",
  "source": "OpenWebSearch/DdgDegraded",
  "sources": [],
  "degraded": true,
  "detail": "Search failed: 503",
  "providerStatus": [{ "provider": "duckduckgo", "ok": false, "reason": "unknown" }]
}
```

URLs restritas retornam `403 { "error": "Forbidden: Restricted URL" }`.
:::

:::endpoint POST /api/extract-content Extração universal de conteúdo
Aceita uma URL pública ou conteúdo base64 com `mimeType`. O limite do campo `base64Content` é `13_600_000` caracteres.

<ParamField body="url" type="string">
URL `http` ou `https` pública. Bloqueia `localhost`, loopback, redes privadas, `169.254.*`, `.local` e `.internal`.
</ParamField>

<ParamField body="base64Content" type="string">
Conteúdo codificado em base64. Deve vir junto com `mimeType`.
</ParamField>

<ParamField body="mimeType" type="string">
Suporta `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/html` e `text/plain`.
</ParamField>

A extração por URL usa timeout de `20000ms` e retorna:

```json
{
  "text": "conteúdo limpo",
  "length": 1234
}
```

Quando `universalExtract` retorna erro de URL restrita, o handler responde `403`; outros erros de extração viram `500`.
:::

:::endpoint POST /api/link-status Validação defensiva de links
Recebe `{ "urls": string[] }`, descarta itens não string e limita a `25` URLs por request. Cada URL passa pelo mesmo bloqueio SSRF de `isValidPublicUrl`.

A validação tenta `HEAD` com timeout de `5000ms`; se o servidor responder `405` ou `403`, tenta `GET` com o mesmo timeout.

<ResponseExample>

```json
{
  "results": {
    "https://example.com": {
      "status": "valid",
      "httpStatus": 200
    },
    "https://example.com/404": {
      "status": "broken",
      "httpStatus": 404,
      "note": "Link indisponível (404)."
    }
  }
}
```

</ResponseExample>

Falhas de rede e URLs restritas não derrubam a rota; o item volta como `unknown`.
:::

:::endpoint POST /api/socio-search Busca societária lateral
O schema exige:

<ParamField body="socioName" type="string" required>
Nome do sócio, entre 3 e 160 caracteres.
</ParamField>

<ParamField body="rootCompanyName" type="string" required>
Empresa raiz, entre 2 e 180 caracteres.
</ParamField>

<ParamField body="rootCnpj" type="string">
CNPJ raiz opcional. O cache normaliza esse valor.
</ParamField>

<ParamField body="trace" type="boolean">
Quando `true`, inclui diagnóstico ampliado de cache, provedores e rejeições.
</ParamField>

A rota usa cache em memória com TTL de 7 dias e limite de 250 entradas. Em produção ou Vercel, tenta cache persistente em Supabase quando `SUPABASE_SERVICE_ROLE_KEY` está configurada; se não estiver, registra aviso e continua com busca viva/cache volátil.

<ResponseExample>

```json
{
  "companies": [
    {
      "name": "Empresa Exemplo LTDA",
      "cnpj": "00111222000181",
      "partnerName": "Nome do Sócio",
      "sourceUrl": "https://...",
      "sourceTitle": "Fonte",
      "snippet": "Trecho sanitizado",
      "confidence": "medium",
      "evidenceType": "registry",
      "relationshipScope": "partner_other_cnpj",
      "rootContext": false,
      "rootCompanyName": "Empresa Raiz"
    }
  ],
  "rejected": [],
  "degraded": false,
  "cached": false,
  "diagnostics": {
    "queriesRun": ["cnpjaberto.com/companies_by_owner"],
    "pagesFetched": 0,
    "cacheSource": "none",
    "rejectedCount": 0
  }
}
```

</ResponseExample>

Limites internos importantes: deadline de busca `45_000ms`, até `60` empresas, até `5` enriquecimentos oficiais de CNPJ e até `4` páginas candidatas. Em falha inesperada, responde `200` com `companies: []`, `degraded: true` e `detail: "Busca societaria indisponivel no momento."`.
:::

:::endpoint GET /api/cnpj Consulta cadastral por CNPJ
Recebe `cnpj` em query string, normaliza os dígitos e valida o CNPJ antes de chamar `lookupCnpj`.

<RequestExample>

```bash
curl -sS '/api/cnpj?cnpj=04.252.011/0001-10'
```

</RequestExample>

| Condição                 | Status                                         |
| ------------------------ | ---------------------------------------------- |
| CNPJ válido e encontrado | `200` com os dados retornados por `lookupCnpj` |
| CNPJ inválido            | `400`                                          |
| CNPJ não encontrado      | `404`                                          |
| falha de fonte externa   | `503` com mensagem recuperável e `detail`      |

O frontend espera que dados de QSA retornados pelo proxy sejam preservados.
:::

:::endpoint GET /api/comex Consulta Comex simulada
A rota usa `query.cnpj`, valida o CNPJ e consulta `lookupCnpj` apenas para obter contexto cadastral. O resultado de exportador é uma regra determinística baseada na soma dos dígitos do CNPJ; não é integração real MDIC.

<ResponseExample>

```json
{
  "isExportador": true,
  "cnpj": "04252011000110",
  "anoReferencia": 2025,
  "faixaValorEstimado": "US$ 1 milhão a US$ 10 milhões",
  "principaisNCMs": ["Soja em grãos", "Farelo de Soja"]
}
```

</ResponseExample>

`CnpjNotFoundError` retorna `200` com `isExportador: false`; erros inesperados retornam `500`.
:::

:::endpoint POST /api/radar-scan Varredura de Radar
Aceita `POST` com `categories` e `estados`. Também aceita `GET`, que usa todas as categorias válidas e `estados: []`.

<ParamField body="categories" type="array" required>
Lista de 1 a 6 categorias: `concorrentes`, `regulatorio`, `mercado`, `ma_expansao`, `agro_tech`, `rh_trabalho`.
</ParamField>

<ParamField body="estados" type="array">
Lista de UFs com 2 caracteres, até 27 itens. Default `[]`.
</ParamField>

A rota busca Google News RSS e feeds fixos, deduplica títulos e usa Gemini para classificar alertas. Falha por categoria entra em `partialFailures`; falha do resumo Gemini dentro de uma categoria usa fallback com itens RSS brutos classificados como `relevance: "media"`.

<ResponseExample>

```json
{
  "alerts": [],
  "metaInsight": null,
  "scannedAt": "2026-06-08T00:00:00.000Z",
  "partialFailures": [],
  "categoryStats": [
    {
      "category": "mercado",
      "sourceItems": 12,
      "generatedAlerts": 3,
      "ok": true
    }
  ]
}
```

</ResponseExample>

`GEMINI_API_KEY` ausente retorna `500 { "error": "Missing GEMINI_API_KEY" }`.
:::

## RAG e documentação

`/api/rag` e `/api/docs-rag` usam embeddings Gemini (`gemini-embedding-001`) e Pinecone. Ambas retornam `200` degradado em falhas operacionais para não quebrar o War Room.

| Rota            | Entrada                                     | Saída de sucesso                          | Degradação                                                                         |
| --------------- | ------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `/api/rag`      | `{ "query": string }`                       | `{ "context": string }`                   | `{ "context": "", "degraded": true, "detail": "..." }`                             |
| `/api/docs-rag` | `{ "query": string, "namespace"?: string }` | `{ "context": string, "matches": [...] }` | `{ "context": "", "degraded": true, "detail": "..." }` ou sinal explícito sem docs |

`/api/docs-rag` só aceita namespaces `senior-erp-docs` e `competitor-pdfs`; namespace inválido retorna `400 { "error": "Invalid namespace", "allowed": [...] }`. Matches abaixo de `0.6` ou sem texto indexado retornam o sinal:

```text
[SEM DOCUMENTAÇÃO ENCONTRADA — NÃO complete com suposições. Informe que não há dados verificados disponíveis.]
```

## Pulse News

`/api/pulse-news` recebe `{ "companyName": string }` com mínimo de 2 caracteres, cria um chat Gemini no modelo `gemini-3-flash-preview` e retorna `{ "summary": string }`. Body inválido retorna `400 { "error": "Nome da empresa inválido" }`; falhas Gemini retornam `500 { "error": "Erro ao buscar Pulse360", "details": "..." }`.

## Variáveis de ambiente server-side

| Variável                                  | Usada por                                                                                         | Observação                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GEMINI_API_KEY`                          | `gemini`, `gerar-dossie`, `radar-scan`, `rag`, `docs-rag`, `pulse-news`, busca web via utilitário | Obrigatória nas rotas que chamam Gemini diretamente                |
| `GEMINI_API_KEY_FALLBACK`                 | `gemini`, `gerar-dossie`                                                                          | Usada em quota, billing ou permissão quando a chave primária falha |
| `GEMINI_FOUNDATION_CACHE_ENABLED`         | `gemini`                                                                                          | Deve ser `1` para `createCachedContent` e `deleteCachedContent`    |
| `SUPABASE_URL` ou `VITE_SUPABASE_URL`     | `recordDiagnostics`, cache persistente de `socio-search`                                          | URL REST Supabase                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`               | `recordDiagnostics`, cache persistente de `socio-search`                                          | Chave server-side; não expor no frontend                           |
| `PINECONE_API_KEY` ou `PINECONE_DOCS_KEY` | `rag`, `docs-rag`                                                                                 | Chave Pinecone                                                     |
| `PINECONE_INDEX` ou `PINECONE_DOCS_INDEX` | `rag`, `docs-rag`                                                                                 | Índice inválido cai para `scout-arsenal`                           |
| `PINECONE_NAMESPACE`                      | `rag`, fallback de `docs-rag`                                                                     | Namespace opcional                                                 |
| `PINECONE_DOCS_NAMESPACE`                 | `docs-rag`                                                                                        | Default efetivo para docs quando permitido                         |
| `CNPJABERTO_API_KEY`                      | `socio-search` via `documentExtractor`                                                            | Habilita busca estruturada por sócio                               |
| `ALLOWED_ORIGIN` e `VERCEL_URL`           | `cnpj`, `comex`                                                                                   | Compõem lista CORS permitida                                       |

## Respostas degradadas por design

| Superfície                        | Resposta degradada                                       | Motivo                                                        |
| --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `/api/open-web-search`            | `200`, `content: ""`, `degraded: true`, `providerStatus` | Busca pública é enriquecimento, não deve travar o dossiê      |
| `/api/socio-search`               | `200`, `companies: []`, `degraded: true`, `detail`       | Drill-down societário lateral deve falhar de forma controlada |
| `/api/rag`                        | `200`, `context: ""`, `degraded: true`                   | War Room pode seguir sem contexto RAG                         |
| `/api/docs-rag`                   | `200` com sinal sem documentação ou `degraded: true`     | Evita completar resposta com fonte fraca ou ausente           |
| `/api/gemini` `recordDiagnostics` | `200`, `inserted: 0`, `degraded: true`                   | Ausência de Supabase não deve quebrar telemetria do cliente   |
| `/api/link-status`                | item `unknown`                                           | Validação de fonte é opcional e revisável manualmente         |
| `/api/radar-scan`                 | `partialFailures` ou fallback de RSS bruto               | Falha parcial por categoria não invalida o scan inteiro       |

## Verificação local

Use testes focados quando mudar rota, schema, timeout ou fallback:

```bash
npm run typecheck
npm test -- tests/api-gemini.test.ts
npm test -- tests/api-open-web-search.test.ts
npm test -- tests/api-extract.test.ts
npm test -- tests/api/comex.test.ts
npm test -- tests/api-docs-rag.test.ts
npm test -- tests/api-socio-search.test.ts
npm test -- tests/api/security-headers.test.ts
```

Para validar comportamento integrado no app, prefira preview Vercel quando a mudança tocar CORS, runtime serverless, variáveis reais, body-read longo, Supabase, Pinecone ou APIs externas. O `npm run dev` é conveniência de frontend e não reproduz todos os limites de produção.

## Related pages

<CardGroup>
  <Card title="Proxy Gemini" href="/gemini-proxy-reference">
    Ações de `/api/gemini`, cache foundation, grounding, Open Web Search tool e fachada `geminiService`.
  </Card>
  <Card title="Referência de RAG" href="/rag-reference">
    Contratos detalhados de `/api/rag` e `/api/docs-rag`, namespaces e sinal sem documentação.
  </Card>
  <Card title="Busca societária" href="/socio-search-reference">
    Schema, cache, deadline, enriquecimento por CNPJ, trace diagnostics e rejeições.
  </Card>
  <Card title="Segurança de API" href="/seguranca-api">
    Chaves server-side, CORS, SSRF guard, headers comuns e limites de payload.
  </Card>
  <Card title="Preview e deploy Vercel" href="/preview-deploy-vercel">
    Validação em runtime real, bypass de proteção e limites do ambiente local.
  </Card>
</CardGroup>

## Source files

- `api/gemini.ts`
- `api/cnpj.ts`
- `api/comex.ts`
- `api/open-web-search.ts`
- `api/extract-content.ts`
- `api/link-status.ts`
- `api/radar-scan.ts`
- `api/socio-search.ts`
