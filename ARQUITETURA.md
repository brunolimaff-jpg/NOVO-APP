# Arquitetura Tecnica — 🦅 Senior Scout 360

Este documento detalha o desenho tecnico da aplicacao, os modulos principais e os fluxos de execucao.

> **Ultima atualizacao:** 2026-04-14 — reflete o estado apos Sprints 1, 2 e 3 (ativo) do programa de refatoracao.
> Para o estado vivo do programa, consulte `docs/ai-context/refactor/02-BOARD.md`.

## 1. Contexto

O sistema combina:

- **Interface conversacional** (React);
- **Orquestracao de IA** (Gemini + RAG);
- **Persistencia local/remota** (IDB/localStorage + Apps Script);
- **Gestao de oportunidade** (mini CRM kanban).

## 2. Blocos principais

### Frontend (SPA)

- **`index.tsx`**
  - Bootstrap do app e registro dos providers globais.
- **`App.tsx`**
  - Orquestrador de estado em reducao progressiva. Responsabilidades sendo extraidas para `features/*`.
- **`features/chat/`** *(novo — Sprint 3)*
  - Modulos autonomos extraidos do `App.tsx`:
    - `loading-progress.ts` — estado e progresso de loading do chat
    - `session-controller.ts` — ciclo de vida de sessao e save remoto
    - `feedback-actions.ts` — handlers de feedback, section feedback, toggle de fontes, report de erro
    - `message-orchestrator.ts` — orquestracao do envio padrao *(em andamento)*
- **`components/*`**
  - Camada de interface (chat, mensagens, barra lateral, modais, war room, CRM).
- **`contexts/*`**
  - Perfil do operador (`OperatorContext`) e dados de CRM.
- **`hooks/*`**
  - Persistencia local, tema, status online/offline, toast, notificacao de atualizacao.

### Auth

- **Local-only** via `contexts/OperatorContext.tsx`.
- Nome do operador e obrigatorio, salvo localmente por dispositivo.
- `operatorId` estavel por dispositivo para rastreabilidade remota.
- `@clerk/react` foi removido no Sprint 1.

### Servicos de dominio

- **`services/geminiService.ts`** *(fachada publica estavel)*
  - Motor principal de perguntas/respostas com IA. Delega para `services/gemini/`.
- **`services/gemini/`** *(novo — Sprint 2)*
  - Orquestracao interna decomposta:
    - `investigation-orchestration.ts`, `porta.ts`, `sources.ts`, `sanitization.ts`
    - `status.ts`, `recovery.ts`, `runtime.ts`, `auxiliary.ts`, `config.ts`, `contracts.ts`
- **`services/ragService.ts`**
  - Cliente para funcoes serverless de RAG.
- **`services/sessionRemoteStore.ts`**
  - Operacoes de sessao remota (list/get/save).
- **`services/feedbackRemoteStore.ts`**
  - Envio de feedback de respostas.
- **`services/clientLookupService.ts`**
  - Lookup e benchmark de clientes.

### APIs serverless (Vercel)

- **`api/rag.ts`** — Embedding + consulta vetorial para contexto interno.
- **`api/docs-rag.ts`** — Embedding + consulta vetorial para documentacao tecnica.
- **`api/link-status.ts`** — Validacao de links exibidos como fonte.

## 3. Sequencia do fluxo de mensagem (estado atual)

```text
Usuario envia pergunta
   ↓
ChatInterface.onSendMessage
   ↓
App.handleSendMessage
   ↓ (delegando progressivamente para features/chat/message-orchestrator)
App.processMessage
   ├─ useChatLoadingProgress (features/chat/loading-progress.ts)
   ├─ useSessionManager (features/chat/session-controller.ts)
   ├─ useSessionRemoteSave (features/chat/session-controller.ts)
   ├─ useChatFeedbackActions (features/chat/feedback-actions.ts)
   └─ chama sendMessageToGemini
          ↓
      geminiService.sendMessageToGemini (fachada)
       ├─ scanInput (promptGuard)
       ├─ analyzeUserIntent
       ├─ lookup + benchmark + concorrentes
       ├─ RAG interno + docs RAG
       ├─ chamada ao modelo (stream)
       └─ parse de marcadores (STATUS/PORTA) [services/gemini/porta.ts]
          ↓
App atualiza sessao/mensagem
   ├─ texto final
   ├─ fontes
   ├─ sugestoes
   └─ metadados (score, ghost, etc.)
```

## 4. Persistencia

### Local

- Hook `useSessionStorage`:
  - prioridade para IndexedDB (`scout360_sessions_v2`);
  - fallback para localStorage legado (`scout360_sessions_v1`).

### Remota

- `sessionRemoteStore` envia payload para Apps Script com acoes:
  - `listSessions`
  - `getSession`
  - `saveSession`

### CRM

- `CRMContext` persiste cards em localStorage (`scout360_crm_cards_v1`) e em IDB por card.

## 5. Seguranca e resiliencia implementadas

- **Prompt guard** com:
  - sanitizacao de unicode;
  - deny-list de jailbreak;
  - rate-limit por sessao;
  - canary token para deteccao de vazamento;
  - sanitizacao de conteudo externo (RAG).

- **Resiliencia de rede**
  - retries exponenciais (`withAutoRetry`);
  - timeouts explicitos;
  - fallback silencioso quando RAG falha;
  - tratamento de abort/cancelamento.

- **Chaves de IA:** gerenciadas via variaveis de ambiente Vercel. Nao expostas no frontend.

## 6. Contratos relevantes

### Resposta principal de IA (resumo)

Campos consumidos no app:

- `text`: texto final
- `sources`: array de `{ title, url }`
- `suggestions`: perguntas de continuidade
- `scorePorta`: score estruturado (quando existir)
- `statuses`: status de progresso
- `ghostReason`: motivo de resposta fantasma (ex.: timeout)

### Tipos base

Concentrados em `types.ts`:

- `Message`, `ChatSession`, `CRMCard`, `ScorePortaData`, `AppError`.

## 7. Debito tecnico ativo

> Para o rastreamento vivo de debitos e riscos, consulte `docs/ai-context/refactor/03-OPEN-ITEMS.md`.

| Item | Status | Previsto em |
|---|---|---|
| `App.tsx` concentra muitas responsabilidades | Em reducao — Sprint 3/4 ativo | Sprints 3-4 |
| `constants.ts` monolitico (prompts + constantes de UI) | Abertura feita com `constants/loadingStages.ts` | Sprint 7 |
| `npm run lint` vermelho por backlog historico | Aberto (OI-005) | Passada dedicada |
| `prompts/megaPrompts.ts` com `@ts-nocheck` | Aberto | Sprint 6 |
| `hooks/useChat.ts` legado sem remocao | Guardrail ativo, remocao pendente | Sprint 7 |

## 8. Estrategia de evolucao (programa de refatoracao)

Programa de 8 sprints em andamento. Ver `docs/ai-context/refactor/01-MASTER-PLAN.md` para sequencia completa.

- Sprint 1 (done): remocao de Clerk/auth, migracao para `OperatorContext`
- Sprint 2 (done): extracao interna da camada Gemini para `services/gemini/`
- Sprint 3 (active): extracao do fluxo de chat para `features/chat/`
- Sprint 4 (planned): extracao do fluxo de dossie para `features/dossier/`
- Sprint 5 (planned): modularizacao de `components/ChatInterface.tsx`
- Sprint 6 (planned): divisao de `prompts/megaPrompts.ts`
- Sprint 7 (planned): constantes e legado
- Sprint 8 (planned): War Room e documentacao final
