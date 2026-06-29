# Arquitetura Tecnica - Senior Scout 360

Este documento resume o desenho tecnico atual da aplicacao e o estado arquitetural depois da Sprint 10 do programa de refatoracao.
O backlog estrutural da fase seguinte esta em `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`.

> Ultima atualizacao: 2026-05-16
> Fonte de verdade para status vivo da trilha: `docs/ai-context/refactor/02-BOARD.md`

## 1. Contexto

O sistema combina:

- interface conversacional em React 19 + TypeScript + Vite
- orquestracao de IA com Gemini + RAG interno/documental
- persistencia local/remota com IndexedDB, localStorage e Apps Script
- CRM interno, Score PORTA, War Room e Radar

## 2. Blocos principais

### Frontend SPA

- `index.tsx`
  - bootstrap do app e registro de providers globais
- `App.tsx`
  - orquestrador principal ainda ativo, mas reduzido pelas Sprints 3 a 8
- `features/chat/`
  - destino dos fluxos extraidos do chat
  - `loading-progress.ts`
  - `session-controller.ts`
  - `feedback-actions.ts`
  - `message-orchestrator.ts`
- `features/dossier/`
  - destino do runtime do dossie/waterfall
  - `waterfall-orchestrator.ts`
  - `benchmark-stage.ts`
  - `porta-reconciliation.ts`
- `components/chat/`
  - shell visual modular do chat
- `features/radar/`
  - boundary arquitetural oficial do Radar
  - `useRadar.ts` concentra estado, persistencia e orquestracao de scan
  - `service.ts` concentra o contrato frontend de `/api/radar-scan`
  - `index.ts` exporta hook, service, tipos e constantes estaveis

### Estado compartilhado

- `stores/chatStore.tsx`
  - sessao, mensagens, loading e refs operacionais do chat
- `stores/dossierStore.tsx`
  - exportacao, save remoto e payload derivado de dossie
- `contexts/OperatorContext.tsx`
  - perfil local-only do operador
  - estado do pipeline interno

### Servicos de dominio

- `services/geminiService.ts`
  - fachada publica estavel da camada Gemini
- `services/gemini/`
  - implementacao interna modular da orquestracao de investigacao
- `services/warRoomService.ts`
  - fachada publica estavel do War Room
- `services/war-room/`
  - implementacao interna modular do War Room
  - `contracts.ts`, `config.ts`, `history.ts`, `intent.ts`, `retrieval.ts`, `prompting.ts`, `sources.ts`, `query.ts`
- `services/ragService.ts`
  - cliente para RAG interno e documental
- `services/radarService.ts`
  - fachada de compatibilidade para `features/radar/service.ts`
- `services/sessionRemoteStore.ts`
  - persistencia remota de sessoes
- `services/feedbackRemoteStore.ts`
  - persistencia remota de feedback

### APIs serverless (Vercel)

- `api/gemini.ts`
  - proxy seguro da camada Gemini
- `api/rag.ts`
  - consulta vetorial do contexto interno
- `api/docs-rag.ts`
  - consulta vetorial da documentacao tecnica
- `api/link-status.ts`
  - validacao de links exibidos como fonte
- `api/radar-scan.ts`
  - suporte ao fluxo de Radar
- `api/open-web-search.ts`
  - busca aberta controlada

## 3. Fluxo principal de mensagem

```text
Usuario envia pergunta
  -> ChatInterface / ChatShell
  -> App.tsx delega para features/chat/message-orchestrator
  -> message-orchestrator resolve sessao, placeholder, abort/retry e roteamento
  -> services/geminiService.ts (fachada publica)
  -> services/gemini/* executa lookup, RAG, chamada ao modelo, parsing e recovery
  -> stores/contextos atualizam timeline, fontes, score, sugestoes e persistencia
```

## 4. Fluxo War Room

```text
Usuario abre War Room
  -> components/WarRoom.tsx
  -> parser compartilhado em services/war-room/intent.ts
  -> services/warRoomService.ts (fachada)
  -> services/war-room/query.ts orquestra retrieval, prompting, modelo e pos-processamento
  -> UI renderiza resposta, fontes e estados de bloqueio/cancelamento
```

Pontos importantes:

- a API publica de `services/warRoomService.ts` foi preservada na Sprint 8
- o parser duplicado saiu da UI e foi consolidado em `services/war-room/intent.ts`
- o fallback degradado e as heuristicas atuais de benchmark/concorrente foram mantidos

## 5. Persistencia

A camada de persistencia foi migrada para uma arquitetura offline-first com Supabase como source of truth e IndexedDB como cache local.

### Stack

- **Supabase** (Postgres gerenciado) — persistencia primaria remota
- **IndexedDB** (`scout360_v2`) — cache local offline para leitura e escrita instantanea
- **Storage service** (`services/storage.ts`) — interface unificada com ~24 metodos, abstrai Supabase e IDB
- **Sync queue** (`services/syncQueue.ts`) — fila offline com retry exponencial e debounce de 1s

### Arquitetura de dados

8 tabelas no schema `public` do Supabase:

| Tabela            | Finalidade                                         |
| ----------------- | -------------------------------------------------- |
| `user_context`    | Contexto do operador (email, preferencias, estado) |
| `dossies`         | Dossies gerados por operador                       |
| `radar_alerts`    | Alertas do Radar de Mercado                        |
| `radar_configs`   | Configuracoes de monitoramento do Radar            |
| `extract_cache`   | Cache de extracao de conteudo                      |
| `audit_log`       | Log de auditoria de operacoes                      |
| `favorites`       | Itens favoritados pelo operador                    |
| `shared_dossiers` | Dossies compartilhados entre operadores            |

### Fluxo offline-first

```
Escrita: componente -> storage.ts -> IDB (instantaneo) -> syncQueue -> Supabase (background, debounce 1s)
Leitura: componente -> storage.ts -> IDB (stale-while-revalidate) -> Supabase (atualizacao em background)
```

- Toda escrita vai primeiro para o IDB, garantindo resposta instantanea ao usuario
- A sync queue processa em background com retry exponencial (max 5 tentativas)
- Leitura usa stale-while-revalidate: retorna dado do cache imediatamente, atualiza em background
- RLS com `operator_id IS NOT NULL` como politica provisoria (transicao para Auth completa no futuro)

### Seguranca

- `lib/supabaseClient.ts` — cliente browser com graceful degradation (app funciona offline)
- `components/SyncIndicator.tsx` — badge visual no header indicando status da sincronizacao
- `services/syncQueue.ts` — pendencia de escrita acumulada exibida ao usuario

### Servicos migrados de idb-keyval para storage.ts

- `hooks/useSessionStorage.ts`
- `features/radar/useRadar.ts` (e hooks/useRadar.ts legado)
- `services/extractContentService.ts`
- `contexts/OperatorContext.tsx` — adicionado email + sync Supabase

### CRM

- `CRMContext`
  - persiste cards em localStorage e IndexedDB (ainda nao migrado para Supabase)

## 6. Seguranca e resiliencia

- prompt guard com sanitizacao, deny-list, canary e controle de vazamento
- retries exponenciais via `withAutoRetry`
- timeouts explicitos e tratamento de `AbortSignal`
- fallback quando RAG falha
- chaves de IA protegidas em variaveis de ambiente da Vercel

### Feature Flags

- Flags simples vivem em `utils/featureFlags.ts`.
- A avaliacao acontece em runtime do frontend, com override opcional via `import.meta.env.VITE_FF_*`.
- Quando nao ha override, cada flag usa fallback hardcoded versionado no proprio modulo.
- Nao ha remote config nesta fase; overrides de producao devem ser configurados no ambiente Vercel.
- Cada flag declara `removeBy` com a sprint-alvo de remocao ou reavaliacao, e flags vencidas devem virar item de close-out.
- O app e interno/fechado; `VITE_PINECONE_*` permanece aceito no frontend por decisao operacional, e nao e tratado como blocker de seguranca na Sprint 9.

## 7. Contratos relevantes

### Tipos centrais

Continuam centralizados em `types.ts`, incluindo:

- `Message`
- `ChatSession`
- `ScorePortaData`
- `RadarConfig`
- `RadarAlert`
- `RadarCategory`

### Fachadas publicas estabilizadas

- `services/geminiService.ts`
- `services/warRoomService.ts`
- `components/ChatInterface.tsx`
- `constants.ts`
- `prompts/megaPrompts.ts`

## 8. Debito tecnico ativo

> Para o rastreamento vivo de riscos e warnings, consulte `docs/ai-context/refactor/03-OPEN-ITEMS.md`.

| Item                                                | Status     | Observacao                                                              |
| --------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `App.tsx` ainda e hotspot                           | em reducao | Sprint 9 reduziu shell; Sprint 10 trocou Radar para import de feature   |
| `mobile-responsive.css` separado de `index.css`     | aberto     | segue como OI-045                                                       |
| backlog de warnings do `npm run lint`               | aberto     | baseline atual varia por sprint; ver `03-OPEN-ITEMS.md`                 |
| warning de chunking em `utils/idbStorage.ts`        | aceito     | segue como OI-003                                                       |
| componentes visuais do Radar ainda em `components/` | aberto     | runtime ja esta em `features/radar`; UI pode ser movida em fatia futura |

## 9. Programa de refatoracao

- Sprint 1: done - auth local-only com `OperatorContext`
- Sprint 2: done - quebra interna de `services/geminiService.ts`
- Sprint 3: done - extracao do fluxo de chat para `features/chat/`
- Sprint 4: done - extracao do dossie, `stores/*` e boundaries
- Sprint 5: done - modularizacao de `components/chat/*`
- Sprint 6: done - divisao de `prompts/megaPrompts.ts`
- Sprint 7: done - constantes, links Senior e remocao de legado
- Sprint 8: done - War Room modular + stub inicial de `features/radar/`
- Sprint 9: done - App shell decoupling + governanca
- Sprint 10: em andamento - runtime do Radar movido para `features/radar/` com facades compatíveis

## 10. Regras arquiteturais vigentes

- nao quebrar fachadas publicas em sprint estrutural
- novas responsabilidades Gemini entram em `services/gemini/`, nao na fachada
- novas responsabilidades War Room entram em `services/war-room/`, nao na fachada
- novas responsabilidades Radar entram em `features/radar/`, nao em `hooks/` ou `services/` legados
- `types.ts` continua centralizado ate haver ROI claro para divisao
- `hooks/useChat.ts` foi removido e nao deve ser recriado
- validacao manual final acontece em preview/producao da Vercel, nao em `npm run dev`
