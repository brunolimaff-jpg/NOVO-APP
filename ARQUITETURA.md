# Arquitetura Tecnica - Senior Scout 360

Este documento resume o desenho tecnico atual da aplicacao e o estado arquitetural depois da Sprint 8 do programa de refatoracao.
O backlog estrutural da fase seguinte esta em `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`.

> Ultima atualizacao: 2026-04-23
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
  - boundary arquitetural oficial do Radar, criado na Sprint 8 como stub

### Estado compartilhado

- `stores/chatStore.tsx`
  - sessao, mensagens, loading e refs operacionais do chat
- `stores/dossierStore.tsx`
  - exportacao, save remoto e payload derivado de dossie
- `contexts/OperatorContext.tsx`
  - perfil local-only do operador
- `contexts/CRMContext.tsx`
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
  - runtime atual do Radar
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

### Local

- `useSessionStorage`
  - prioriza IndexedDB (`scout360_sessions_v2`)
  - fallback para localStorage legado (`scout360_sessions_v1`)

### Remota

- `sessionRemoteStore`
  - `listSessions`
  - `getSession`
  - `saveSession`

### CRM

- `CRMContext`
  - persiste cards em localStorage e IndexedDB

## 6. Seguranca e resiliencia

- prompt guard com sanitizacao, deny-list, canary e controle de vazamento
- retries exponenciais via `withAutoRetry`
- timeouts explicitos e tratamento de `AbortSignal`
- fallback quando RAG falha
- chaves de IA protegidas em variaveis de ambiente da Vercel

## 7. Contratos relevantes

### Tipos centrais

Continuam centralizados em `types.ts`, incluindo:

- `Message`
- `ChatSession`
- `CRMCard`
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

| Item | Status | Observacao |
|---|---|---|
| `App.tsx` ainda e hotspot | aberto | reduzir novos acoplamentos fora da trilha |
| `mobile-responsive.css` separado de `index.css` | aberto | segue como OI-045 |
| backlog de warnings do `npm run lint` | aberto | baseline atual: `180` warnings |
| warning de chunking em `utils/idbStorage.ts` | aceito | segue como OI-003 |
| runtime real do Radar ainda fora de `features/radar/` | aberto | stub arquitetural criado; migracao fica para fatia propria |

## 9. Programa de refatoracao

- Sprint 1: done - auth local-only com `OperatorContext`
- Sprint 2: done - quebra interna de `services/geminiService.ts`
- Sprint 3: done - extracao do fluxo de chat para `features/chat/`
- Sprint 4: done - extracao do dossie, `stores/*` e boundaries
- Sprint 5: done - modularizacao de `components/chat/*`
- Sprint 6: done - divisao de `prompts/megaPrompts.ts`
- Sprint 7: done - constantes, links Senior e remocao de legado
- Sprint 8: implementada, validada e documentada; aguardando merge da PR `#241`

## 10. Regras arquiteturais vigentes

- nao quebrar fachadas publicas em sprint estrutural
- novas responsabilidades Gemini entram em `services/gemini/`, nao na fachada
- novas responsabilidades War Room entram em `services/war-room/`, nao na fachada
- `types.ts` continua centralizado ate haver ROI claro para divisao
- `hooks/useChat.ts` foi removido e nao deve ser recriado
- validacao manual final acontece em preview/producao da Vercel, nao em `npm run dev`
