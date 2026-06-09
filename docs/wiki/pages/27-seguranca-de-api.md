---
grok_wiki: true
page_id: "page-seguranca-api"
title: "Segurança de API"
description: "Chaves no servidor, headers comuns, CORS de CNPJ/Comex, SSRF guard, validação de URL pública, quotas Gemini e limites de payload."
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - "docs/SEGURANCA-API.md"
  - "api/_security-headers.ts"
  - "api/_gemini-key-utils.ts"
  - "utils/documentExtractor.ts"
  - "api/open-web-search.ts"
  - "api/extract-content.ts"
  - "tests/api/security-headers.test.ts"
  - "tests/utils/documentExtractor.test.ts"
---

A camada de API do Senior Scout 360 roda em Vercel Functions `nodejs`, concentra segredos em `process.env`, aplica headers comuns via `setSecurityHeaders(res)` e usa validação Zod nas rotas que recebem JSON. O navegador deve chamar os proxies locais (`/api/gemini`, `/api/cnpj`, `/api/open-web-search`, `/api/extract-content`, `/api/rag`, `/api/docs-rag`) em vez de chamar provedores externos com chaves ou URLs diretas.

## Fronteira de confiança

```text
Navegador React
  |  fetch('/api/...') sem chaves secretas
  v
Vercel Function Node.js
  |  process.env.GEMINI_API_KEY / PINECONE_API_KEY / SUPABASE_SERVICE_ROLE_KEY
  |  validação Zod, timeouts, SSRF guard, headers comuns
  v
Provedores externos
  Gemini, Pinecone, Supabase REST, BrasilAPI, CNPJ.ws, MinhaReceita, DuckDuckGo, CNPJ Aberto
```

<Warning>
Nunca coloque segredo em variável `VITE_*`. O Vite inlineia `VITE_*` no bundle JavaScript entregue ao navegador. Use `GEMINI_API_KEY`, `GEMINI_API_KEY_FALLBACK`, `PINECONE_API_KEY`, `PINECONE_DOCS_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `CNPJABERTO_API_KEY` apenas em serverless, scripts CLI ou ambiente de build controlado.
</Warning>

O padrão é BYOK/BYOC: o contrato importante é manter a chave no backend e expor uma fachada HTTP controlada. As rotas atuais usam Gemini e Pinecone, mas o desenho de fronteira não depende de um conector proprietário no cliente.

## Headers comuns

`api/_security-headers.ts` define quatro headers para respostas de API:

| Header | Valor |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

Todas as rotas públicas em `api/*.ts` chamam `setSecurityHeaders(res)` no início do handler. Esse helper não configura CORS nem CSP; CORS fica nas rotas que precisam receber chamadas cross-origin específicas, como `/api/cnpj` e `/api/comex`.

## Chaves no servidor

| Superfície | Chaves usadas no servidor | Observação operacional |
| --- | --- | --- |
| `/api/gemini` | `GEMINI_API_KEY`, `GEMINI_API_KEY_FALLBACK` | Proxy principal do frontend para `generateContent`, chat, cache foundation e diagnósticos. |
| `/api/gerar-dossie` | `GEMINI_API_KEY`, `GEMINI_API_KEY_FALLBACK` | Geração longa com `maxDuration = 300`. |
| `/api/open-web-search` | `GEMINI_API_KEY` opcional via `performWebSearch`; fallback DuckDuckGo | Não usa `BRAVE_SEARCH_API_KEY` no runtime atual. |
| `/api/rag` | `GEMINI_API_KEY`, `PINECONE_API_KEY` ou `PINECONE_DOCS_KEY` | Embedding Gemini + consulta Pinecone no servidor. |
| `/api/docs-rag` | `GEMINI_API_KEY`, `PINECONE_DOCS_KEY` ou `PINECONE_API_KEY` | Restringe namespace de documentação. |
| `/api/socio-search` | `CNPJABERTO_API_KEY` opcional, `SUPABASE_SERVICE_ROLE_KEY` opcional para cache | Se cache persistente não estiver configurado, degrada para cache em memória. |
| `/api/cnpj` e `/api/comex` | Sem chave de provedor no handler | Centralizam chamadas CNPJ no servidor para evitar CORS no navegador. |

## CORS de CNPJ e Comex

`/api/cnpj` e `/api/comex` aplicam allowlist de origem:

| Origem | Como entra na allowlist |
| --- | --- |
| `process.env.ALLOWED_ORIGIN` | Override explícito. |
| `https://${process.env.VERCEL_URL}` | Preview atual da Vercel. |
| `https://scoutagro.vercel.app` | Produção conhecida. |
| `http://localhost:5173` | Vite local. |
| `http://localhost:3000` | Dev local alternativo. |
| `https://*.vercel.app` | Regex para previews de PR. |

`/api/cnpj` aceita `GET` e `OPTIONS`, permite apenas o header `Content-Type` em CORS e responde `405` para métodos diferentes de `GET`. Em sucesso, aplica `Cache-Control` com TTL de `3600` segundos.

`/api/comex` responde `OPTIONS`, permite `GET,OPTIONS,POST`, habilita `Access-Control-Allow-Credentials: true` e aceita uma lista maior de headers (`X-CSRF-Token`, `X-Requested-With`, `Accept`, `Content-Length`, `Content-MD5`, `Content-Type`, `Date`, `X-Api-Version`). O handler atual lê `req.query.cnpj` em qualquer request não-`OPTIONS`; trate `GET ?cnpj=` como o contrato efetivo.

<Note>
CORS aqui não é autenticação. Como previews `*.vercel.app` são permitidos, essas rotas não devem expor segredos nem executar ações privilegiadas baseadas apenas em origem.
</Note>

## Proxy CNPJ

O navegador usa `fetchCompanyByCnpj()` em `services/brasilApiService.ts`, que resolve para `/api/cnpj` por padrão. O código evita chamadas diretas do browser para `brasilapi.com.br`, `publica.cnpj.ws` ou `minhareceita.org` porque essas fontes devem passar pelo proxy serverless.

`/api/cnpj` normaliza e valida dígitos de CNPJ antes de consultar `lookupCnpj()`. O lookup server-side tenta, em ordem:

1. `BrasilAPI`
2. `CNPJ.ws`
3. `MinhaReceita`

A resposta preserva `qsa` quando a fonte retorna quadro societário. Documentos completos de sócio só são repassados se estiverem mascarados ou não parecerem CPF/CNPJ completo.

## Validação de URL pública e SSRF guard

`isValidPublicUrl(url)` é a guarda central para URLs recebidas do usuário ou vindas de grounding. Ela aceita apenas `http:` e `https:` e rejeita:

| Bloqueio | Exemplos |
| --- | --- |
| Protocolos não HTTP | `ftp://`, `file://`, `javascript:` |
| Loopback | `localhost`, `127.0.0.1`, `[::1]` |
| Faixas privadas | `10.*`, `192.168.*`, `172.16.*` a `172.31.*` |
| Link-local | `169.254.*` |
| Domínios internos | `*.local`, `*.internal` |
| Strings inválidas | texto que não parseia como `URL` |

A guarda é usada em `/api/open-web-search`, `/api/extract-content` via `universalExtract()` e nos chunks retornados por Gemini Search Grounding antes de buscar páginas externas.

<Warning>
A validação atual opera sobre protocolo e hostname textual. Ela não resolve DNS para bloquear domínio público que aponta para IP privado em tempo de request. Para entrada externa de alto risco, adicione resolução DNS/IP antes do `fetch`.
</Warning>

## Extração de conteúdo

`/api/extract-content` aceita `POST` com uma destas formas:

<ParamField body="url" type="string">
URL pública `http` ou `https`. A URL passa pelo SSRF guard antes do download.
</ParamField>

<ParamField body="base64Content" type="string">
Conteúdo codificado em base64. O schema limita a `13_600_000` caracteres, aproximadamente 10 MB binários.
</ParamField>

<ParamField body="mimeType" type="string">
Obrigatório quando `base64Content` é usado.
</ParamField>

Mime-types suportados:

| Mime-type | Extração |
| --- | --- |
| `application/pdf` | `pdf-parse` |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `mammoth.extractRawText` |
| `text/html` | `extractHtml()` |
| `text/plain` | texto bruto com normalização posterior |

`universalExtract()` usa `limit = 15000` por padrão, remove caracteres nulos, normaliza whitespace e corta o texto final no limite. Para URL externa, o download tem timeout de `20000 ms`.

`extractHtml()` remove `script`, `style`, `nav`, `footer`, `iframe`, `noscript`, `.ads` e `#ads`, prioriza `article`, `main`, `.content`, `#content`, `.post` e `.article`, e só então cai para `body`.

<RequestExample>
```bash
curl -X POST https://<host>/api/extract-content \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/page"}'
```
</RequestExample>

<ResponseExample>
```json
{
  "text": "Conteúdo público extraído e normalizado...",
  "length": 42
}
```
</ResponseExample>

## Open Web Search

`/api/open-web-search` aceita `POST` com `query`, `url` ou ambos. O schema exige pelo menos um campo.

| Campo | Regra |
| --- | --- |
| `query` | `string` não vazia, opcional |
| `url` | `string.url()`, opcional, validada também por `isValidPublicUrl()` |
| método | Apenas `POST` |
| duração | `maxDuration = 60` |
| resposta degradada | `200` com `degraded: true` quando busca falha sem crash crítico |

Quando `url` é enviado, a rota tenta extrair a página diretamente com timeout de `10000 ms`. Se o fetch falhar, usa `query || url` como fallback de busca. Quando só há `query`, `performWebSearch()` tenta Gemini Search Grounding se `GEMINI_API_KEY` estiver disponível e cai para DuckDuckGo Lite quando necessário.

A resposta inclui `providerStatus` para diferenciar sucesso, `empty_result` e falha desconhecida do provedor.

## Gemini proxy

`/api/gemini` é o proxy principal da IA. Ele exige `POST`, aplica schema por `action` e usa `maxDuration = 300`.

| Action | Limites principais |
| --- | --- |
| `health` | Sem payload adicional; ainda precisa de chave Gemini configurada. |
| `generateContent` | `model` até 200 chars; `contents` é `unknown`; `config` é record livre. |
| `createCachedContent` | `systemInstruction` até 500000 chars; `ttl` até 32; `displayName` até 128; requer `GEMINI_FOUNDATION_CACHE_ENABLED=1`. |
| `deleteCachedContent` | `name` de 1 a 512 chars; requer `GEMINI_FOUNDATION_CACHE_ENABLED=1`. |
| `chatSendMessage` | `systemInstruction` até 100000 chars; `message` de 1 a 200000 chars; `thinkingLevel` em `low`, `medium`, `high`. |
| `recordDiagnostics` | Early return antes da validação Gemini; limita eventos pelo `MAX_EVENTS_PER_BATCH`. |

Defaults importantes:

| Configuração | Valor atual |
| --- | --- |
| Modelo default | `gemini-3-flash-preview` |
| `generateContent.config.temperature` | `0.2` |
| `generateContent.config.maxOutputTokens` | `65536` |
| Chat com grounding | timeout interno de `55000 ms` |
| Chat sem grounding | timeout interno de `180000 ms` |
| Function calls no chat | até 3 iterações |
| Chamada interna para `/api/open-web-search` | timeout de `30000 ms` |

Quando `config.cachedContent` é enviado em `generateContent`, o proxy repassa `cachedContent` e ignora `systemInstruction`, `tools` e `toolConfig` desse mesmo request. As ferramentas devem ser vinculadas no `createCachedContent` ou enviadas em `generateContent` sem `cachedContent`.

## Quotas e fallback de chave Gemini

`GEMINI_API_KEY_FALLBACK` só é tentada quando a chave atual falha por quota, rate limit, billing ou permissão. A classificação reconhece mensagens/status como:

| Caso | Sinais reconhecidos |
| --- | --- |
| Quota/rate limit | `RESOURCE_EXHAUSTED`, `check quota`, `rate limit`, `rate-limit`, JSON com `"code": 429` |
| Billing/permissão | status `403`, `PERMISSION_DENIED`, `billing`, `dunning` |

Se não houver fallback ou se o erro não for desses tipos, a rota retorna erro. Para quota Gemini, o status HTTP exposto tende a ser `429`; para erros sem status explícito, o fallback é `500`.

<Info>
Fallback de chave não é quota de produto. O handler atual não impõe limite por operador, sessão ou empresa; ele apenas reage aos limites do provedor e preserva disponibilidade quando existe chave secundária.
</Info>

## Diagnósticos e sanitização

`recordDiagnostics` em `/api/gemini` grava batches em `scout_diagnostics` via Supabase REST quando `SUPABASE_SERVICE_ROLE_KEY` está configurada. Se o Supabase não estiver configurado, retorna `200` com `{ inserted: 0, degraded: true, reason: "Supabase not configured" }`.

A sanitização server-side remove chaves sensíveis cujo nome contenha `token`, `key`, `secret`, `password`, `auth`, `credential`, `prompt`, `response`, `content`, `text` ou `body`, exceto métricas/labels de telemetria explicitamente seguros. Também aplica:

| Limite | Valor |
| --- | --- |
| Profundidade de payload | 4 |
| Tamanho de string | 2000 chars |
| Tamanho de array | 50 itens |
| Número de chaves por objeto | 30 |
| Eventos por batch | `MAX_EVENTS_PER_BATCH` |

## Risco de privacidade pendente

O Sentry Replay utiliza atualmente `maskAllText: false` e `blockAllMedia: false`. Como a aplicação pode exibir nomes, CNPJs, pesquisas, relatórios e informações comerciais, essa configuração deve ser revisada em uma PR técnica separada, considerando LGPD, mascaramento de texto, bloqueio de mídia e máscaras seletivas. Esta Wiki descreve a configuração atual e não a considera aprovada como segura.

## Limites de payload por rota

| Rota | Método | Runtime | Limites e comportamento |
| --- | --- | --- | --- |
| `/api/gemini` | `POST` | `nodejs`, `maxDuration=300` | Schema por `action`; mensagens até 200000 chars; cache foundation protegido por flag. |
| `/api/gerar-dossie` | `POST` | `nodejs`, `maxDuration=300` | `model` até 200 chars; `contents` obrigatório; `config` livre com defaults seguros. |
| `/api/extract-content` | `POST` | `nodejs`, `maxDuration=60` | `base64Content` até 13.6M chars; URL pública ou base64+mimeType. |
| `/api/open-web-search` | `POST` | `nodejs`, `maxDuration=60` | `query` ou `url`; URL pública; falha de provedor vira resposta degradada. |
| `/api/socio-search` | `POST` | `nodejs`, `maxDuration=60` | `socioName` 3-160; `rootCompanyName` 2-180; deadline interno 45s; até 60 empresas. |
| `/api/cnpj` | `GET`, `OPTIONS` | `nodejs` | CNPJ com dígitos válidos; cache 3600s em sucesso; erros 400/404/503. |
| `/api/comex` | `OPTIONS` e requests com `cnpj` query | serverless Node implícito | CNPJ válido; resposta mockada determinística; cache 86400s. |
| `/api/rag` | `POST` | `nodejs`, `maxDuration=60` | `query` 1-10000; Pinecone server-side; resposta degradada em erro. |
| `/api/docs-rag` | `POST` | `nodejs`, `maxDuration=60` | `query` 1-10000; `namespace` até 120; namespaces permitidos: `senior-erp-docs`, `competitor-pdfs`. |

## Busca societária e budget serverless

`/api/socio-search` tem limites internos para preservar a função serverless:

| Limite | Valor |
| --- | --- |
| Cache em memória | 250 entradas |
| TTL do cache | 7 dias |
| Deadline de busca | 45000 ms |
| Páginas extraídas por busca | 4 |
| Timeout de lookup CNPJ oficial | 3500 ms |
| Lookups CNPJ oficiais por busca | 5 |
| Empresas aceitas por resposta | 60 |
| Versão semântica de cache | `v7-structured-lateral-cnpj` |

Quando o resultado atinge `MAX_COMPANIES` ou estoura deadline com dados parciais, a resposta marca `diagnostics.truncated` e `truncatedReason` como `company_limit` ou `deadline`.

## Erros esperados

| Condição | Resposta |
| --- | --- |
| Método inválido em rotas com guarda | `405 { "error": "Method not allowed" }` |
| JSON fora do schema | `400 { "error": "Invalid request", "details": ... }` |
| URL restrita em `/api/open-web-search` | `403 { "error": "Forbidden: Restricted URL" }` |
| URL restrita em `/api/extract-content` | `403 { "error": "URL restrita ou inválida por segurança." }` |
| Mime-type não suportado | `500` em `/api/extract-content` com mensagem do extractor |
| CNPJ inválido | `400` |
| CNPJ não encontrado | `404` em `/api/cnpj`; `200 isExportador:false` em `/api/comex` quando lookup informa not found |
| Provedor de busca sem resultado | `200 degraded:true` |
| RAG indisponível | `200 degraded:true` |
| Gemini sem chave | `500` com detalhe de env ausente |
| Gemini quota/rate limit | `429` quando reconhecido pelo proxy |

## Checklist para alterar rotas de API

<Steps>
<Step title="Mantenha segredo fora do bundle">
Use `process.env` em `api/*.ts` ou scripts Node. Não crie `VITE_*` para chaves Gemini, Pinecone, Supabase service role ou provedores de busca.
</Step>

<Step title="Aplique headers antes de responder">
Chame `setSecurityHeaders(res)` no início do handler, antes de qualquer `res.status().json()`.
</Step>

<Step title="Valide payload com limites explícitos">
Use Zod com `min`, `max`, enums e `refine` quando a rota aceitar JSON. Evite `z.unknown()` sem compensar com validações internas quando o payload puder crescer muito.
</Step>

<Step title="Bloqueie URL não pública antes do fetch">
Use `isValidPublicUrl()` em qualquer URL vinda do usuário, do modelo ou de fonte externa. Para risco maior, complemente com resolução DNS/IP.
</Step>

<Step title="Defina timeout para rede e leitura de body">
Use `AbortController`/`AbortSignal.timeout` e trate a fase de leitura do body quando o fluxo depender de respostas grandes.
</Step>

<Step title="Teste o contrato de segurança">
Rode os testes focados e depois a validação geral adequada ao escopo.
</Step>
</Steps>

```bash
npm run typecheck
npm test -- tests/api/security-headers.test.ts tests/utils/documentExtractor.test.ts tests/api-open-web-search.test.ts tests/api-gemini.test.ts
npm run test:contracts
```

## Related pages

<CardGroup>
  <Card title="Referência de APIs serverless" href="/api-serverless-reference">
    Métodos, payloads, validação Zod, timeouts e respostas degradadas das rotas em `api/*.ts`.
  </Card>
  <Card title="Proxy Gemini" href="/gemini-proxy-reference">
    Ações aceitas por `/api/gemini`, fallback de chave, grounding, cache foundation e fachada `geminiService`.
  </Card>
  <Card title="Referência de configuração" href="/configuracao-reference">
    Variáveis `.env`, fronteiras entre frontend e serverless, flags, modelos e proxy local.
  </Card>
  <Card title="Busca societária" href="/socio-search-reference">
    Schema, cache, deadline, enriquecimento por CNPJ, trace diagnostics e razões de rejeição.
  </Card>
  <Card title="Observabilidade e diagnósticos" href="/observabilidade">
    Sentry, `scoutDiag`, Supabase diagnostics, eventos de operador e traces de layout.
  </Card>
</CardGroup>

## Source files

- `docs/SEGURANCA-API.md`
- `api/_security-headers.ts`
- `api/_gemini-key-utils.ts`
- `utils/documentExtractor.ts`
- `api/open-web-search.ts`
- `api/extract-content.ts`
- `tests/api/security-headers.test.ts`
- `tests/utils/documentExtractor.test.ts`
