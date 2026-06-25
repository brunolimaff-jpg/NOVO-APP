# Arquitetura Tecnica — Senior Scout 360 (Fase 5)

Este documento descreve o desenho arquitetural atual do Senior Scout 360 apos a migracao para pipeline hibrido com LiteLLM, experimentacao de modelos e eliminacao do offline-first.

> Ultima atualizacao: 2026-06-24
> Fase 5 — Pipeline hibrido com LiteLLM + DeepSeek + Claude Sonnet

## 1. Contexto

Senior Scout 360 e uma plataforma de inteligencia comercial e sales intelligence para agronegocio. O sistema combina:

- interface conversacional em React 19 + TypeScript + Vite
- orquestracao de IA com pipeline hibrido: LiteLLM proxy → Bedrock (Claude Sonnet) / DeepSeek
- persistencia em Supabase (Postgres) como unica fonte de verdade
- CRM interno, Score PORTA (5 dimensoes), War Room e Radar de Mercado
- monitoramento com Sentry + Supabase

### O que mudou da Fase 4 para a Fase 5

| Componente        | Antes (Fase 4)                 | Agora (Fase 5)                               |
| ----------------- | ------------------------------ | -------------------------------------------- |
| Provider IA       | Gemini API (exclusivo)         | LiteLLM proxy → Bedrock/DeepSeek             |
| Modelo padrao     | gemini-3-flash-preview         | deepseek-v4-flash / claude-sonnet-4-6        |
| Roteamento        | fixo (Gemini sempre)           | hibrido por modulo (HYBRID_MODEL_MAP)        |
| Cache             | foundation cache (Gemini)      | grounding sources comprometido — ver secao 7 |
| Persistencia      | offline-first (IDB + Supabase) | Supabase-only (IDB so para extract_cache)    |
| Timeout waterfall | hard-cap 330s                  | 120s por modulo, sem hard-cap geral          |
| Experimentacao    | nao existia                    | A/B com allowlist, traffic split, logging    |

## 2. Stack tecnologica

### Frontend

| Camada           | Tecnologia   | Versao |
| ---------------- | ------------ | ------ |
| Framework        | React        | 19     |
| Bundler          | Vite         | 6      |
| Linguagem        | TypeScript   | 5      |
| Estilizacao      | Tailwind CSS | 3      |
| Testes unitarios | Vitest       | —      |
| Testes E2E       | Playwright   | —      |

### IA e Modelos

| Componente             | Provedor                      | Funcao                                                |
| ---------------------- | ----------------------------- | ----------------------------------------------------- |
| LiteLLM proxy          | litellm.homolog.seniorlabs.io | Roteamento para modelos Bedrock/DeepSeek              |
| Claude Sonnet 4.6      | Bedrock (AWS)                 | Modulos premium (Operacao, Caminho de Venda)          |
| DeepSeek V3.2          | Bedrock                       | Modulos operacionais (Teia, Tech-Stack, Riscos, etc.) |
| DeepSeek V4 Flash/Pro  | Huawei                        | Modelo standard / alternativo                         |
| Gemini 3 Flash Preview | Google                        | Fallback implicito em `api/gemini.ts`                 |

### Infraestrutura

| Componente     | Provedor            | Observacao                    |
| -------------- | ------------------- | ----------------------------- |
| Hosting        | Vercel (Hobby)      | SPA + Serverless Functions    |
| Banco de dados | Supabase (Postgres) | 10 tabelas no schema public   |
| Busca vetorial | Pinecone            | Namespace `consultasocio`     |
| Monitoramento  | Sentry + Supabase   | Erros, performance, auditoria |
| CI             | Vitest + Playwright | Testes unitarios e E2E        |

### Limites de execucao (Vercel Hobby)

| Funcao                   | maxDuration |
| ------------------------ | ----------- |
| `api/gemini.ts`          | 300s        |
| `api/gerar-dossie.ts`    | 300s        |
| `api/radar-scan.ts`      | 120s        |
| `api/open-web-search.ts` | 60s         |
| `api/extract-content.ts` | 60s         |
| `api/link-status.ts`     | 15s         |

## 3. Arquitetura de IA — Pipeline Hibrido

### Visao geral

O pipeline de IA da Fase 5 substituiu o provider unico (Gemini) por um proxy LiteLLM que roteia requisicoes para diferentes modelos conforme o modulo e a configuracao de experimento.

```text
Browser (React)
  -> Vite dev / build
  -> api/gemini.ts (serverless function, 300s)
     |
     |-- isLiteLLMEnabled() ? callLiteLLM() : callGemini()
     |
     -> LiteLLM proxy (litellm.homolog.seniorlabs.io)
        |
        |-- Bedrock (AWS)
        |   |-- Claude Sonnet 4.6 (premium)
        |   |-- DeepSeek V3.2 (operacional)
        |   |-- Claude Haiku 4.5 (leve)
        |   |-- Kimi K2 Thinking (experimental)
        |
        |-- Huawei (via Bedrock)
        |   |-- DeepSeek V4 Flash (standard)
        |   |-- DeepSeek V4 Pro (pesado)
        |   |-- GLM-5 (experimental)
        |
        |-- Oracle (via Bedrock)
            |-- Grok 4.1 Fast
            |-- Grok 4 Fast Reasoning
```

### Provedor (LLM_PROVIDER)

A variavel de ambiente `LLM_PROVIDER` determina o provider ativo:

- `'litellm'` — usa `callLiteLLM()` para todas as chamadas (produção atual)
- `'gemini'` — usa SDK Google GenAI diretamente (fallback/desenvolvimento)

A fachada `api/_llm-client.ts` implementa o cliente LiteLLM com:

- Timeout configuravel via `LITELLM_REQUEST_TIMEOUT_MS` (padrao 38s, maximo 180s)
- Retry exponencial (max 2 tentativas, base 500ms)
- Normalizacao de output (strip `<redacted_thinking>`, `<reasoning>`, prefacios)
- AbortSignal propagation para cancelamento
- **Zero Gemini**: `isFallbackEnabled()` retorna `false` — nao ha fallback automatico

### HYBRID_MODEL_MAP — Roteamento por Modulo

Definido em `utils/llm/modelRouter.ts`. Mapeia nome do modulo de dossie para modelo especifico:

| Modulo            | Modelo            | Justificativa                              |
| ----------------- | ----------------- | ------------------------------------------ |
| operacao          | Claude Sonnet 4.6 | Critico — analise financeira e operacional |
| caminho-venda     | Claude Sonnet 4.6 | Critico — recomendacao de acao             |
| teia-societaria   | DeepSeek V3.2     | Operacional — estrutura societaria         |
| tech-stack        | DeepSeek V3.2     | Operacional — tecnologia                   |
| riscos-compliance | DeepSeek V3.2     | Operacional — conformidade                 |
| radar-expansao    | DeepSeek V3.2     | Operacional — expansao                     |
| rh-sindicatos     | DeepSeep V3.2     | Operacional — RH                           |
| decisores         | DeepSeek V3.2     | Operacional — tomada de decisao            |

Ativado por `HYBRID_PIPELINE_ENABLED=true`. Quando ativo, o `selectExperimentModel()` retorna o modelo do mapa em vez de usar o mecanismo de experimento.

### Catalogo de Modelos

Definido em `utils/llm/modelCatalog.ts` com 13 entradas + fallback. Cada modelo tem:

- `variant` — letra unica (S, Z, A, B, C, D, E, F, G, H, I, J, K)
- `displayName` — nome legivel
- `inputPricePerMillion` / `outputPricePerMillion` — custo por milhao de tokens
- `reasoning` — se o modelo suporta raciocinio explicito

Modelos em uso ativo no pipeline hibrido:

- **S** (Claude Sonnet 4.6) — premium, $3.3/$16.5 por milhao
- **Z** (DeepSeek V3.2 Bedrock) — operacional, $0.62/$1.85 por milhao
- **B** (DeepSeek V4 Flash) — standard, $0.14/$0.27 por milhao (deprecado por timeout)
- **K** (Claude Haiku 4.5) — leve, $1.1/$5.5 por milhao

### Tres Tiers Conceituais

O sistema opera com tres niveis de capacidade, embora o roteamento atual seja binario (Sonnet vs DeepSeek):

| Tier         | Modelo                            | Uso                                        |
| ------------ | --------------------------------- | ------------------------------------------ |
| **Standard** | DeepSeek V4 Flash                 | Modulos operacionais de baixa complexidade |
| **Premium**  | Claude Sonnet 4.6 / DeepSeek V3.2 | Modulos criticos e analise profunda        |
| **Max**      | Claude Fable 5 (planejado)        | Cenarios futuros de maxima qualidade       |

A diferenciacao atual acontece via `HYBRID_MODEL_MAP`. A expansao para 3 tiers completos esta no backlog.

## 4. Pipeline principal de mensagem

### Fluxo de mensagem (chat)

```text
Usuario envia pergunta
  -> ChatInterface / ChatShell (components/chat/)
  -> features/chat/message-orchestrator
     resolve sessao, placeholder, abort/retry e roteamento
  -> services/geminiService.ts (fachada publica — barrel)
  -> services/gemini/investigation-orchestration.ts
     orquestracao principal: lookup, RAG, chamada ao modelo, parsing
  -> api/gemini.ts (serverless)
     |-- LiteLLM ativo? -> callLiteLLM() -> LiteLLM proxy -> Bedrock/DeepSeek
     |-- Gemini ativo?   -> GoogleGenAI SDK -> Gemini API
  -> stores/contextos atualizam timeline, fontes, score, sugestoes
```

### Fluxo de dossie (waterfall)

```text
Usuario solicita dossie
  -> components/DossierPanel.tsx
  -> features/dossier/waterfall-orchestrator.ts
     orquestra N modulos em paralelo (ate 8 modulos, 120s cada)
  -> Para cada modulo:
     selectExperimentModel({ moduleName }) -> HYBRID_MODEL_MAP ou experimento
     api/gemini.ts -> callLiteLLM() -> LiteLLM proxy
     normalizeModelOutput() -> strip reasoning tags
     quality check (ReportQualityInput)
  -> features/dossier/porta-reconciliation.ts
     reconcilia markers PORTA entre modulos
  -> stores/dossierStore.tsx
     exportacao, save remoto (Supabase), payload derivado
```

### Timeouts

| Componente                         | Timeout                 | Configuracao                                                    |
| ---------------------------------- | ----------------------- | --------------------------------------------------------------- |
| Chamada individual LiteLLM         | 38s (padrao) / ate 180s | `LITELLM_REQUEST_TIMEOUT_MS` / `MAX_LITELLM_REQUEST_TIMEOUT_MS` |
| Timeout cliente Vite (browser)     | 120s                    | `VITE_LITELLM_CLIENT_TIMEOUT_MS=120000`                         |
| Maximo serverless (execucao total) | 300s                    | `maxDuration` no `vercel.json`                                  |
| Waterfall por modulo               | 120s                    | Por modulo, sem hard-cap geral                                  |
| Chat message                       | 55s                     | `CHAT_TIMEOUT_MS` em `api/gemini.ts`                            |

## 5. Blocos principais

### Frontend SPA

- `index.tsx` — bootstrap e registro de providers globais
- `App.tsx` — orquestrador principal reduzido (apos Sprints 3-8)
- `features/chat/` — fluxo de chat modularizado
  - `loading-progress.ts`, `session-controller.ts`, `feedback-actions.ts`, `message-orchestrator.ts`
- `features/dossier/` — runtime do dossie/waterfall
  - `waterfall-orchestrator.ts`, `benchmark-stage.ts`, `porta-reconciliation.ts`
- `features/radar/` — boundary oficial do Radar
  - `useRadar.ts`, `service.ts`, `index.ts`
- `components/chat/` — shell visual modular do chat

### Estado compartilhado

- `stores/chatStore.tsx` — sessao, mensagens, loading
- `stores/dossierStore.tsx` — exportacao, save remoto, payload
- `contexts/OperatorContext.tsx` — perfil local-only do operador

### Servicos

- `services/geminiService.ts` — fachada publica (barrel re-export)
  - implementacao real em `services/gemini/` (5 modulos)
- `services/warRoomService.ts` — fachada publica do War Room
  - implementacao real em `services/war-room/` (8 modulos)
- `services/storage/` — 10 modulos de persistencia Supabase
- `services/ragService.ts` — cliente RAG (Pinecone + Google)
- `services/radarService.ts` — fachada de compatibilidade
- `services/feedbackRemoteStore.ts` — persistencia remota de feedback

### Utilitarios LLM

- `utils/llm/modelCatalog.ts` — catalogo de 13 modelos com precos
- `utils/llm/modelRouter.ts` — config, allowlist, HYBRID_MODEL_MAP, selecao
- `utils/llm/types.ts` — tipos do sistema de experimento

## 6. APIs serverless (Vercel)

Todas em `/Users/brunolima/Documents/NOVO-APP/api/`. Organizadas em privadas (`_` prefixo) e publicas:

### Privadas (compartilhadas)

| Arquivo                | Funcao                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `_llm-client.ts`       | `callLiteLLM()` — cliente HTTP com retry, timeout, normalizacao |
| `_experiment-auth.ts`  | Autenticacao HMAC + Supabase + allowlist para experimentos      |
| `_cors-headers.ts`     | `applyCors()` — headers CORS                                    |
| `_cache-headers.ts`    | `cacheHeaders()` — cache para GET idempotentes                  |
| `_allowed-origins.ts`  | `ALLOWED_ORIGINS` + `isVercelPreview()`                         |
| `_gemini-key-utils.ts` | Deteccao de quota exhausted / billing denied                    |

### Publicas (endpoints)

| Endpoint                       | Metodo   | Timeout | Funcao                                                |
| ------------------------------ | -------- | ------- | ----------------------------------------------------- |
| `/api/gemini`                  | POST     | 300s    | Orquestrador principal — chat, dossie, cached content |
| `/api/gerar-dossie`            | POST     | 300s    | Geracao de dossie completo (Gemini SDK direto)        |
| `/api/radar-scan`              | POST     | 120s    | Scan de radar de inteligencia continua                |
| `/api/open-web-search`         | POST     | 60s     | Busca web (Brave/DuckDuckGo)                          |
| `/api/rag`                     | POST     | —       | Busca vetorial Pinecone (namespace consultasocio)     |
| `/api/socio-search`            | GET      | —       | Busca societaria multi-provedor                       |
| `/api/cnpj`                    | GET      | —       | Lookup de CNPJ                                        |
| `/api/extract-content`         | POST     | 60s     | Extracao de conteudo de URL                           |
| `/api/link-status`             | GET      | 15s     | Validacao de URL (valido/quebrado/desconhecido)       |
| `/api/llm-experiment`          | POST/GET | —       | Logging e reports de experimentos LLM                 |
| `/api/ping-litellm`            | GET      | —       | Health check do proxy LiteLLM                         |
| `/api/cron-email-confirmation` | POST     | 30s     | Cron diario (00:00 UTC)                               |

## 7. Persistencia e dados

### Arquitetura de dados

Supabase (Postgres) como unica fonte de verdade. 10 tabelas no schema `public`:

| Tabela                   | Finalidade                                         |
| ------------------------ | -------------------------------------------------- |
| `dossies`                | Dossies gerados por operador (CRUD + upsert)       |
| `user_context`           | Contexto do operador (email, preferencias, estado) |
| `radar_alerts`           | Alertas do Radar de Mercado                        |
| `radar_configs`          | Configuracoes de monitoramento do Radar            |
| `extract_cache`          | Cache de extracao de conteudo (7d TTL)             |
| `audit_log`              | Log de auditoria de operacoes                      |
| `favorites`              | CNPJs favoritados pelo operador                    |
| `shared_dossiers`        | Dossies compartilhados entre operadores            |
| `llm_experiment_runs`    | Logging de runs de experimento LLM                 |
| `llm_model_daily_report` | Relatorios diarios de desempenho por modelo        |

### Acesso a dados

`services/storage/` modularizado em 10 arquivos com barrel via `index.ts`:

- `dossiers.ts`, `extractCache.ts`, `userContext.ts`, `audit.ts`, `favorites.ts`, `radar.ts`, `sharedDossiers.ts`
- Operam exclusivamente via Supabase (sem cache offline)
- Excecao: `extractCache.ts` usa `idb-keyval` para cache local de 7 dias com espelho no Supabase

### Search Grounding

O sistema usa grounding via ferramentas de busca do Google na camada Gemini. **Bug P0 conhecido**: quando foundation cache esta ativo, `groundingSources` retorna 0 mesmo quando fontes foram usadas — o cache descarta as tools de grounding. Este bug e monitorado e tem workaround (desabilitar cache para modulos que exigem grounding).

### Framework PORTA

Score de 5 dimensoes (Porte, Operacao, Retorno, Tecnologia, Adocao) com temperatura 0.1. Parsing de markers `[[PORTA]]` no output dos modelos, reconciliado em `features/dossier/porta-reconciliation.ts`.

## 8. Seguranca e resiliencia

### Autenticacao

- **OperatorContext**: autenticacao local-only (sem provedor externo)
- **Experiment API**: autenticacao dupla — token Bearer (Supabase Auth) OU header `x-experiment-operator-email` + allowlist
- **Allowlist**: operadores explicitamente listados em `LLM_ALLOWLIST` (emails separados por virgula)

### Protecao de chaves

- Chaves de IA protegidas em variaveis de ambiente da Vercel
- `GEMINI_API_KEY`, `GEMINI_API_KEY_FALLBACK`, `LITELLM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — nunca expostas ao cliente
- `SUPABASE_URL` e `SUPABASE_ANON_KEY` sao publicas (necessario para cliente Supabase no browser)

### Resiliencia

- Retry exponencial em `callLiteLLM()` (max 2 tentativas, base 500ms, dobro a cada falha)
- Timeouts explicitos com `AbortSignal` propagation
- Budget de tempo por request (deadline controlada)
- Fallback Gemini via `api/gemini.ts` quando `LLM_PROVIDER=gemini` (nao automatico)
- Deteccao de quota exhausted (`isQuotaExhausted`, `isBillingOrPermissionDenied`)
- Validacao de CNPJ antes de chamadas IA

### Feature Flags

- Defini das em `utils/featureFlags.ts`
- Override por `VITE_FF_*` no ambiente Vercel
- Cada flag declara `removeBy` com sprint-alvo de remocao

## 9. Experimentacao de modelos

### Mecanismo

O sistema de experimento permite testar diferentes modelos de LLM em producao com controle granular:

1. **Modos de experimento** (`LLM_EXPERIMENT_MODE`):
   - `off` — experimento desativado, usa modelo padrao
   - `fixed` — modelo fixo definido por `LLM_MODEL_DEFAULT`
   - `random` — A/B testing com `trafficSplit` entre modelos do `EXPERIMENT_MODELS`

2. **Allowlist**: apenas operadores em `LLM_ALLOWLIST` participam do experimento
3. **Pipeline hibrido**: quando `HYBRID_PIPELINE_ENABLED=true`, sobrepoe o experimento e roteia por modulo

### Fluxo de selecao de modelo

```text
selectExperimentModel({ moduleName })
  |
  |-- Pipeline hibrido ativo E moduleName definido?
  |     -> HYBRID_MODEL_MAP[moduleName] (roteamento por modulo)
  |
  |-- ExperimentMode = 'random'?
  |     -> pickWeightedModel() (A/B com traffic split)
  |
  |-- Senao:
        -> defaultModel (LLM_MODEL_DEFAULT ou primeiro do EXPERIMENT_MODELS)
```

### Logging

Cada run de experimento e registrada em:

- `llm_experiment_runs` — dados de execucao (modelo, latencia, tokens, qualidade)
- `llm_model_daily_report` — agregacao diaria por modelo
- `api/llm-experiment.ts` — endpoints POST (criar run) e GET (relatorios)

## 10. Decisoes arquiteturais recentes

### Por que LiteLLM em vez de Gemini direto?

**Decisao (2026-05)**: Substituir Google Gemini como provider exclusivo por um proxy LiteLLM que roteia para Claude Sonnet (via Bedrock) e DeepSeek.

**Motivacao**: Qualidade inferior do Gemini para analise comercial estruturada, necessidade de comparar modelos em paralelo (experimentacao), e custo mais baixo do DeepSeek para modulos operacionais.

**Risco residual**: Camada extra de latencia (LiteLLM proxy), dependencia de proxy homologado (`litellm.homolog.seniorlabs.io`).

### Por que HYBRID_MODEL_MAP?

**Decisao (2026-06)**: Roteamento por modulo em vez de modelo unico para todo o dossie.

**Motivacao**: Modulos criticos (Operacao, Caminho de Venda) exigem maxima qualidade; modulos operacionais (Teia Societaria, Tech-Stack) podem usar modelo mais rapido e barato sem perda de qualidade percebida.

### Por que remover offline-first?

**Decisao (2026-05)**: Eliminar IndexedDB como cache offline e operar apenas com Supabase.

**Motivacao**: Complexidade desnecessaria para um app que nunca opera offline (webapp B2B). `storage.ts` unificado com 24 metodos foi substituido por modulos especializados em `services/storage/`. IDB mantido apenas para `extract_cache` (cache de extracao de 7 dias).

### Por que timeout de 120s por modulo sem hard-cap geral?

**Decisao (2026-06)**: Remover o hard-cap de 330s no waterfall e adotar timeout de 120s por modulo.

**Motivacao**: Modulos independentes executam em paralelo; o timeout por modulo e suficiente para evitar espera infinita. O hard-cap geral cortava prematuremente modulos que ainda estavam processando.

### Rollout gradual

A migracao para LiteLLM segue rollout controlado por allowlist:

```text
Fase 1 (2026-05): Proxy homologado + timeouts 38s -> 38s travava (bug)
Fase 2 (2026-06): MAX_LITELLM_REQUEST_TIMEOUT_MS 38s -> 180s
Fase 3 (2026-06): Timeout cliente 38s -> 120s (VITE_LITELLM_CLIENT_TIMEOUT_MS)
Fase 4 (2026-06): Remocao hard-cap 330s do waterfall
```

## 11. Debito tecnico ativo

| Item                                          | Status   | Observacao                                   |
| --------------------------------------------- | -------- | -------------------------------------------- |
| `App.tsx` ainda e hotspot                     | reduzido | Sprints 3-8 reduziram shell                  |
| Pipeline hibrido apenas 2 modelos             | ativo    | HYBRID_MODEL_MAP so mapeia Sonnet + DeepSeek |
| Bug P0 groundingSources com cache             | aberto   | Foundation cache descarta tools de grounding |
| `gerar-dossie.ts` ainda usa Gemini SDK        | aceito   | Endpoint legado mantido para compatibilidade |
| Componentes visuais do Radar em `components/` | aberto   | Runtime ja em `features/radar/`              |
| Catalogo com 13 modelos, so 2 em uso          | aceito   | Demais sao para experimentacao futura        |

## 12. Regras arquiteturais vigentes

- nao quebrar fachadas publicas (`geminiService.ts`, `warRoomService.ts`, `ChatInterface.tsx`, `constants.ts`)
- novas responsabilidades Gemini entram em `services/gemini/`, nao na fachada
- novas responsabilidades War Room entram em `services/war-room/`, nao na fachada
- novas responsabilidades Radar entram em `features/radar/`, nao em `hooks/` ou `services/` legados
- `types.ts` continua centralizado ate haver ROI claro para divisao
- constantes de modelo vivem em `utils/llm/`, nao em `constants.ts`
- validacao manual final em preview/producao da Vercel, nao em `npm run dev`
- provider IA configurado por env var (`LLM_PROVIDER`), nunca hardcoded
- chamadas LiteLLM sempre passam por `callLiteLLM()` com retry e timeout
- experimentos exigem allowlist explicita — nenhum operador participa sem configuracao
