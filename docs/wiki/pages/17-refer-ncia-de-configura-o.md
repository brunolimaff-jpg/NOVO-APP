---
grok_wiki: true
page_id: "page-configuracao-reference"
title: "Referência de configuração"
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - ".env.example"
  - "vite.config.ts"
  - "config/models.ts"
  - "services/apiConfig.ts"
  - "config/localDevApiProxy.ts"
  - "lib/supabaseClient.ts"
  - "utils/featureFlags.ts"
---

---
title: "Referência de configuração"
description: "Variáveis `.env`, defaults, overrides Vite, flags, modelos, proxy local, Supabase, Sentry e fronteiras entre frontend e serverless."
---

A configuração do Senior Scout 360 fica dividida entre variáveis expostas pelo Vite no navegador, variáveis serverless lidas por `api/*.ts`, defaults versionados em módulos TypeScript e o proxy local que conecta o frontend Vite a rotas `/api` remotas ou locais.

## Fronteiras de configuração

```text
.env.local / Vercel Environment Variables
├─ Vite build/dev
│  ├─ import.meta.env.VITE_* entra no bundle do navegador
│  ├─ vite.config.ts gera __BUILD_SHA__, __VERCEL_ENV__, __BUILD_TS__
│  └─ server.proxy encaminha /api/* no npm run dev
├─ Frontend React
│  ├─ services/apiConfig.ts: URLs Apps Script e Open Web Search
│  ├─ services/geminiProxy.ts: fachada para /api/gemini e /api/gerar-dossie
│  ├─ lib/supabaseClient.ts: Supabase anon client opcional
│  └─ utils/featureFlags.ts: flags VITE_FF_* com fallback hardcoded
└─ Vercel Functions
   ├─ api/gemini.ts, api/gerar-dossie.ts, api/radar-scan.ts: GEMINI_API_KEY
   ├─ api/rag.ts, api/docs-rag.ts: Pinecone + Gemini embeddings
   ├─ utils/serverDiagnostics.ts: scout_diagnostics via service role
   └─ services/socio-search/cache.ts: cache persistente Supabase
```

<Warning>
Toda variável com prefixo `VITE_` pode ser inlineada no JavaScript final. Chaves secretas de IA, Pinecone, Supabase service role, Sentry auth token e bypass de Vercel devem ficar sem `VITE_` e ser lidas por `process.env` no servidor ou pelo `vite.config.ts` durante build/dev.
</Warning>

## Arquivos donos

| Arquivo | Papel |
| --- | --- |
| `.env.example` | Exemplo público de variáveis, com placeholders e alguns itens legados. |
| `.gitignore` | Ignora `.env`, `.env.local`, `.env.*`, `dist` e artefatos de teste. |
| `vite.config.ts` | Porta Vite, proxy local, build metadata, plugin Sentry e `version.json`. |
| `config/localDevApiProxy.ts` | Alvo default do proxy local e lista de rotas `/api/*` encaminhadas. |
| `services/apiConfig.ts` | Defaults de backend Apps Script, lookup e Open Web Search. |
| `services/geminiProxy.ts` | Endpoint Gemini client-side, timeout do proxy e overrides locais. |
| `config/models.ts` | IDs de modelo Gemini e seleção por tipo de mensagem. |
| `utils/featureFlags.ts` | Flags de produto com defaults e override por `VITE_FF_*`. |
| `lib/supabaseClient.ts` | Cliente Supabase anon opcional para storage remoto no frontend. |
| `utils/serverDiagnostics.ts` | Escrita server-side em `scout_diagnostics` com service role. |

## Variáveis de frontend e Vite

| Variável | Default atual | Onde atua | Observação |
| --- | --- | --- | --- |
| `VITE_BACKEND_URL` | URL Google Apps Script hardcoded | `services/apiConfig.ts`, boot warning | Opcional; vazio usa fallback. |
| `VITE_LOOKUP_URL` | URL Google Apps Script hardcoded | `services/apiConfig.ts` | Opcional; vazio usa fallback. |
| `VITE_OPEN_WEB_SEARCH_URL` | `/api/open-web-search` | `services/apiConfig.ts`, `services/geminiProxy.ts` | Permite apontar busca web para endpoint alternativo. |
| `VITE_GEMINI_PROXY_URL` | vazio | `services/geminiProxy.ts` | Só altera `/api/gemini` e `/api/gerar-dossie` em host local. |
| `VITE_GEMINI_PROXY_TIMEOUT_MS` | `210000` | `services/geminiProxy.ts` | Timeout client-side do proxy, cobrindo chamadas longas. |
| `VITE_CNPJ_PROXY_URL` | vazio | `services/brasilApiService.ts` | Em localhost, permite substituir `/api/cnpj` por endpoint externo. |
| `VITE_SUPABASE_URL` | vazio | `lib/supabaseClient.ts`, server fallback | Necessária para cliente anon no navegador. |
| `VITE_SUPABASE_ANON_KEY` | vazio | `lib/supabaseClient.ts` | Sem ela, storage remoto frontend fica desativado. |
| `VITE_SENTRY_DSN` | vazio | `index.tsx` | Habilita Sentry no frontend. |
| `VITE_SENTRY_RELEASE` | fallback para `VITE_APP_VERSION` ou `VITE_VERCEL_GIT_COMMIT_SHA` | `index.tsx` | Define release client-side. |
| `VITE_VERBOSE_LOGS` | `false` | `utils/diagnosticLog.ts`, `services/clientLookupService.ts` | Ativa logs verbosos quando `true`. |
| `VITE_DEBUG_CONSOLE` | `false` | `utils/diagnosticLog.ts` | Ativa logs `[Scout360]` além de dev mode. |
| `VITE_SCOUT_DIAGNOSTICS_ENABLED` | localStorage `SCOUT_DIAG_ENABLED=1` | `utils/diagnosticLog.ts` | `true` força diagnóstico, `false` desliga. |
| `VITE_GEMINI_FOUNDATION_CACHE_ENABLED` | desligado | `services/gemini/foundation-cache.ts` | Deve ser `1` para o frontend tentar cache foundation. |
| `VITE_ENABLE_DEEP_DIVE` | desligado | `utils/featureAccess.ts` | Aceita `1`, `true`, `yes`, `on`; controla acesso deep dive. |
| `VITE_ENABLE_PREVIEW_DEMO` | desligado | `components/EmptyStateHome.tsx` | Preenche demo de preview se também houver empresa, cidade e UF. |

<Note>
`.env.example` ainda lista `VITE_CLERK_PUBLISHABLE_KEY`, mas o runtime atual usa autenticação local via `contexts/OperatorContext.tsx`; Clerk não é uma dependência ativa de boot. O mesmo exemplo lista `VITE_ROUTER_MODEL`, `VITE_TACTICAL_MODEL`, `VITE_DEEP_CHAT_MODEL` e `VITE_DEEP_RESEARCH_MODEL`, mas `config/models.ts` não lê esses overrides no checkout atual.
</Note>

## Variáveis serverless e de build

| Variável | Camada | Uso |
| --- | --- | --- |
| `GEMINI_API_KEY` | Serverless | Obrigatória em `/api/gemini`, `/api/gerar-dossie`, `/api/radar-scan`, `/api/rag`, `/api/docs-rag` e scripts de ingestão. |
| `GEMINI_API_KEY_FALLBACK` | Serverless | Chave reserva para `/api/gemini` e `/api/gerar-dossie` em quota, billing ou permission denied. |
| `GEMINI_FOUNDATION_CACHE_ENABLED` | Serverless | `1` libera ações `createCachedContent` e `deleteCachedContent` em `/api/gemini`; sem ela retorna `403`. |
| `PINECONE_API_KEY` | Serverless/scripts | Chave principal de RAG. |
| `PINECONE_DOCS_KEY` | Serverless/scripts | Chave alternativa para RAG documental; tem prioridade em `/api/docs-rag`. |
| `PINECONE_INDEX` | Serverless | Índice usado por `/api/rag`; fallback para `PINECONE_DOCS_INDEX`. |
| `PINECONE_DOCS_INDEX` | Serverless/scripts | Índice documental; default `scout-arsenal` quando ausente ou inválido. |
| `PINECONE_NAMESPACE` | Serverless | Namespace opcional de `/api/rag`; também fallback de `/api/docs-rag`. |
| `PINECONE_DOCS_NAMESPACE` | Serverless | Namespace default de `/api/docs-rag`; fallback `senior-erp-docs`. |
| `SUPABASE_URL` | Serverless | URL preferida para diagnostics e cache server-side; fallback aceita `VITE_SUPABASE_URL`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Serverless | Necessária para `scout_diagnostics` e cache persistente de busca societária. |
| `SENTRY_AUTH_TOKEN` | Build Vite | Habilita upload de sourcemaps pelo `@sentry/vite-plugin`. |
| `SENTRY_ORG` | Build Vite/scripts | Default `s-3j` no plugin e script MCP. |
| `SENTRY_PROJECT` | Build Vite/scripts | Default `scout-360`. |
| `LOCAL_DEV_API_PROXY_TARGET` | Vite dev | Override do alvo remoto do proxy local. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vite dev/scripts | Adiciona header `x-vercel-protection-bypass` no proxy e smoke de preview. |
| `ALLOWED_ORIGIN` | Serverless | Origem extra permitida por `/api/cnpj` e `/api/comex`. |
| `VERCEL_URL` | Vercel runtime | Origem de preview permitida em CORS e build metadata indireto. |

`BRAVE_SEARCH_API_KEY` aparece no exemplo e em scripts de checagem, mas `/api/open-web-search` no código atual usa DuckDuckGo e extração direta de URL. Não trate Brave como dependência operacional da busca web sem confirmar uma mudança no handler.

## Defaults do Vite

| Configuração | Valor |
| --- | --- |
| Porta dev | `3000` |
| Host dev | `0.0.0.0` |
| Proxy default | `https://scoutagro.vercel.app` |
| Header opcional do proxy | `x-vercel-protection-bypass` quando `VERCEL_AUTOMATION_BYPASS_SECRET` existe |
| Build sourcemap | `true` |
| React Compiler | Apenas fora de `production` |
| `version.json` | Gerado em `dist/version.json` durante build com versão do `package.json` e timestamp |
| Build globals | `__BUILD_SHA__`, `__VERCEL_ENV__`, `__BUILD_TS__` |

Rotas proxadas no `npm run dev`:

```text
/api/gemini
/api/radar-scan
/api/gerar-dossie
/api/cnpj
/api/comex
/api/open-web-search
/api/link-status
/api/extract-content
/api/rag
/api/docs-rag
/api/socio-search
```

<Info>
Por padrão, o frontend local em `localhost:3000` pode falar com o backend remoto de produção via proxy Vite. Em diagnóstico de comportamento divergente entre código local e resposta de API, confirme primeiro o valor de `LOCAL_DEV_API_PROXY_TARGET` e qual processo está atendendo a porta.
</Info>

## Modelos Gemini

`config/models.ts` centraliza todos os papéis no mesmo ID atual: `gemini-3-flash-preview`.

| Papel | Constante | Seleção |
| --- | --- | --- |
| Router | `ROUTER_MODEL_ID` | Recuperação, auxiliares e curiosidade de loading. |
| Tactical | `TACTICAL_MODEL_ID` | Resposta direta forçada. |
| Deep chat | `DEEP_CHAT_MODEL_ID` | Chat padrão quando não há deep dive nem resposta direta forçada. |
| Deep research | `STABLE_RESEARCH_MODEL_ID` | Deep dive, mega prompt, War Room e waterfall. |
| Loading curiosity | `LOADING_CURIOSITY_MODEL_ID` | Alias do router. |

`selectMainChatModelId()` aplica a prioridade: deep dive ou mega prompt vence, resposta direta forçada vem depois, e o fallback é deep chat. Se houver troca de provedor ou BYOK, preserve a fronteira: views chamam fachadas e constantes; credenciais e SDKs ficam no serverless ou em módulos de serviço, não em componentes React.

## Feature flags

| Flag | Default | Override | Remover/reavaliar |
| --- | --- | --- | --- |
| `deepDive` | `true` | `VITE_FF_DEEP_DIVE` | Sprint 14 |
| `warRoom` | `true` | `VITE_FF_WAR_ROOM` | Sprint 14 |
| `newExportFlow` | `false` | `VITE_FF_NEW_EXPORT` | Sprint 12 |
| `radarV2` | `false` | `VITE_FF_RADAR_V2` | Sprint 13 |

`getFlag()` aceita apenas os strings exatos `true` e `false`. Qualquer outro valor, incluindo `1`, `0` ou `maybe`, cai no default versionado da flag. `utils/featureAccess.ts` é separado: ele controla `deepDive` de acesso por `VITE_ENABLE_DEEP_DIVE` e aceita valores booleanos textuais mais amplos.

## Supabase

O frontend só cria `supabase` quando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` existem. Sem essas variáveis, o módulo emite warning e `isSupabaseAvailable()` retorna `false`; fluxos de storage remoto devem degradar para fallback local.

No servidor, duas áreas exigem service role:

| Área | Variáveis | Efeito sem configuração |
| --- | --- | --- |
| Diagnósticos | `SUPABASE_URL` ou `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `recordDiagnostics` retorna `{ inserted: 0, degraded: true, reason: "Supabase not configured" }`. |
| Busca societária | `SUPABASE_URL` ou `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Cache persistente fica indisponível; em produção/Vercel o handler espera cache persistente e registra fallback volátil. |

## Sentry

Sentry frontend inicializa em `index.tsx` somente quando `VITE_SENTRY_DSN` existe. A configuração usa ambiente `production` em build prod e `development` nos demais modos, com `browserTracingIntegration()` e Replay habilitado.

| Configuração | Valor atual |
| --- | --- |
| `tracesSampleRate` | `0.05` em produção, `1.0` em desenvolvimento |
| `replaysSessionSampleRate` | `0.1` em produção, `1.0` em desenvolvimento |
| `replaysOnErrorSampleRate` | `1.0` |
| Replay text masking | `maskAllText: false` |
| Chunk errors | `ChunkLoadError`, `Loading chunk` e dynamic import failure são descartados em `beforeSend` |
| Sourcemaps | Enviados no build apenas com `SENTRY_AUTH_TOKEN` |

Sentry é observabilidade de erro, não prova final de saúde visual. Incidentes de overlay, timeline ou painel branco também dependem de `scout_diagnostics`, eventos de operador, DOM visível e validação de preview.

## RAG e Pinecone

`/api/rag` e `/api/docs-rag` leem Pinecone apenas por `process.env`. O frontend não precisa de chave Pinecone.

| Rota | Chaves | Índice | Namespace | Degradação |
| --- | --- | --- | --- | --- |
| `/api/rag` | `PINECONE_API_KEY` ou `PINECONE_DOCS_KEY` | `PINECONE_INDEX` ou `PINECONE_DOCS_INDEX`, fallback `scout-arsenal` | `PINECONE_NAMESPACE` opcional | Retorna `{ context: "", degraded: true, detail }` em erro. |
| `/api/docs-rag` | `PINECONE_DOCS_KEY` ou `PINECONE_API_KEY` | `PINECONE_DOCS_INDEX` ou `PINECONE_INDEX`, fallback `scout-arsenal` | `PINECONE_DOCS_NAMESPACE`, `PINECONE_NAMESPACE` ou `senior-erp-docs`; aceita também `competitor-pdfs` | Retorna sinal explícito de sem documentação quando não há matches válidos. |

## Exemplo mínimo local

```bash title=".env.local"
GEMINI_API_KEY=...
PINECONE_API_KEY=...
PINECONE_DOCS_INDEX=scout-arsenal

VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=...

VITE_SENTRY_DSN=
VITE_DEBUG_CONSOLE=false
VITE_VERBOSE_LOGS=false
```

Para apontar o frontend local para outro backend Vercel:

```bash title=".env.local"
LOCAL_DEV_API_PROXY_TARGET=https://<preview>.vercel.app
VERCEL_AUTOMATION_BYPASS_SECRET=...
```

## Troubleshooting

| Sintoma | Checagem |
| --- | --- |
| `/api/gemini` retorna `Missing required env var: GEMINI_API_KEY` | Configure `GEMINI_API_KEY` no runtime serverless ou no shell que executa o backend local. |
| `createCachedContent` retorna `Foundation cache disabled` | Configure `GEMINI_FOUNDATION_CACHE_ENABLED=1` no servidor e `VITE_GEMINI_FOUNDATION_CACHE_ENABLED=1` no build/frontend. |
| CNPJ local retorna HTML ou `Invalid JSON` | Rode com proxy válido, use `vercel dev` ou configure `VITE_CNPJ_PROXY_URL`. |
| Diagnóstico retorna `Supabase not configured` | Configure `SUPABASE_SERVICE_ROLE_KEY` e uma URL Supabase no runtime serverless. |
| Busca societária não persiste cache em produção | Confirme `SUPABASE_SERVICE_ROLE_KEY` e tabela `extract_cache`. |
| Sourcemaps não aparecem no Sentry | Confirme `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` e `SENTRY_PROJECT` no ambiente de build. |
| Comportamento local não bate com o checkout | Verifique `LOCAL_DEV_API_PROXY_TARGET`; o Vite pode estar usando backend remoto. |

## Verificação

```bash title="Gates úteis para mudanças de configuração"
./check-exports.command
npm run typecheck
npm run test
npm run test:contracts
npm run build
npx vitest run tests/config/models.test.ts tests/config/localDevApiProxy.test.ts tests/utils/featureFlags.test.ts
```

Use `npm run test:contracts` sem `--runInBand`; o runner é Vitest e esse flag não faz parte do contrato atual do repo.

## Related pages

<CardGroup>
  <Card title="Instalação" href="/installation">
    Pré-requisitos, instalação npm, variáveis locais, porta Vite e sinais de boot.
  </Card>
  <Card title="Configurar Supabase" href="/configurar-supabase">
    Variáveis, degradação, tabelas críticas e persistência remota.
  </Card>
  <Card title="Proxy Gemini" href="/gemini-proxy-reference">
    Ações de `/api/gemini`, fallback de chave, cache foundation e Open Web Search tool.
  </Card>
  <Card title="Referência de APIs serverless" href="/api-serverless-reference">
    Métodos, payloads, validação, headers, timeouts e respostas degradadas de `api/*.ts`.
  </Card>
  <Card title="Observabilidade e diagnósticos" href="/observabilidade">
    Sentry, `scoutDiag`, Supabase diagnostics, eventos de operador e traces de layout.
  </Card>
  <Card title="Segurança de API" href="/seguranca-api">
    Chaves no servidor, CORS, SSRF guard, quotas e limites de payload.
  </Card>
</CardGroup>

## Related pages

- page-installation
- page-gemini-proxy-reference
- page-seguranca-api


## Source files

- `.env.example`
- `vite.config.ts`
- `config/models.ts`
- `services/apiConfig.ts`
- `config/localDevApiProxy.ts`
- `lib/supabaseClient.ts`
- `utils/featureFlags.ts`
