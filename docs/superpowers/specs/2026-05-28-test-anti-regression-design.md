# Spec: Estrutura de Testes Anti-Regressão — Senior Scout 360

**Data:** 2026-05-28
**Status:** aguardando aprovação
**Branch alvo:** feat/operator-tracking-supabase

## 1. Problema

O app renderiza header, breadcrumb, input inferior e footer corretamente, mas o painel central
fica completamente vazio. O breadcrumb pode mostrar empresa ativa ("SCHEFFER & CIA LTDA"),
mas não aparecem mensagens, dossiê, LoadingSmart, erro controlado nem empty state.

Esse estado é inválido e precisa ser detectado automaticamente.

## 2. Objetivo

Impedir tela branca parcial, loading infinito, erro silencioso e divergência entre sessão ativa
e conteúdo renderizado. Toda falha deve gerar diagnóstico útil antes do deploy.

## 3. Restrições

- Não alterar prompt Gemini
- Não alterar regra de negócio do dossiê
- Não fazer refactor grande
- Não redesenhar UI
- Não criar fallback genérico que esconda bug
- Pode adicionar data-testid
- Pode criar helpers pequenos de estado
- Pode criar fallback visual controlado (com as condições da seção 4.2)
- Pode criar testes unitários, contratos e E2E

## 4. Design

### 4.1 Camada de Identificação Visual (data-testid)

Nomes oficiais padronizados. Nenhum outro nome é permitido sem justificativa no spec.

| data-testid           | Local                                    | Arquivo                                            |
| --------------------- | ---------------------------------------- | -------------------------------------------------- |
| `app-shell`           | Container raiz do App                    | App.tsx                                            |
| `app-header`          | Header com breadcrumb + toggle           | ChatShell.tsx                                      |
| `app-breadcrumb`      | Breadcrumb de sessão ativa               | ChatShell.tsx                                      |
| `chat-main-panel`     | Painel central (MessageTimeline wrapper) | ChatInterface.tsx                                  |
| `message-list`        | Lista de mensagens                       | MessageTimeline.tsx                                |
| `dossier-content`     | Conteúdo do dossiê                       | DossierErrorBoundary.tsx / SectionalBotMessage.tsx |
| `loading-smart`       | Overlay de carregamento                  | LoadingSmart.tsx                                   |
| `controlled-error`    | Fallback de erro controlado              | ChatErrorBoundary.tsx                              |
| `empty-state`         | Empty state intencional                  | ChatInterface.tsx (EmptyStateFallback inline)      |
| `message-input`       | Campo de entrada de texto                | Composer.tsx                                       |
| `send-message-button` | Botão de enviar                          | Composer.tsx                                       |
| `session-sidebar`     | Sidebar de sessões                       | ChatShell.tsx                                      |
| `session-item`        | Item individual de sessão                | ChatShell.tsx                                      |

Testids já existentes que conflitam e serão renomeados:

- `chat-shell` → substituído por `app-shell` no escopo do App.tsx (ChatShell.tsx:101 mantém `chat-shell` pois é o shell interno do chat, não o app-shell)
- `chat-header-breadcrumb-home` e `chat-header-breadcrumb-session` → wrappados por `app-breadcrumb`
- `chat-input` → mantido (não conflita com `message-input`, são elementos diferentes: Composer vs input isolado)
- `chat-send-button` → renomeado para `send-message-button`
- `chat-stop-button` → renomeado para `send-message-button` quando for enviar (o stop é um estado diferente, mantém `chat-stop-button`)
- `chat-error-boundary` → renomeado para `controlled-error`
- `loading-smart-overlay` → renomeado para `loading-smart`

Decisão: `chat-input` e `message-input` coexistem. `chat-input` é o elemento textarea no Composer.
`message-input` será adicionado como wrapper semântico do compose area. Ambos são válidos.

### 4.2 Fallback Visual Controlado (EmptyStateFallback)

**Condições de ativação (TODAS precisam ser verdadeiras):**

1. Existe sessão ativa (`currentSession !== null`)
2. `messages.length === 0` (ou array vazio/undefined)
3. `!hasDossierContent` (nenhum bloco de dossiê renderizável)
4. `!isLoading` (não está carregando)
5. `!hasError` (não há erro controlado ativo)

**Comportamento:**

- Renderiza `<div data-testid="empty-state">` com mensagem "Nenhum conteúdo disponível"
- **Apenas em desenvolvimento/teste**: registra no console diagnóstico com:
  - `activeSessionId`
  - `activeCompanyName`
  - `messages.length`
  - `hasDossierContent`
  - `isLoading`
  - `lastKnownStep` (última etapa conhecida do fluxo)
  - `window.location.pathname`
- Em produção: renderiza o empty-state sem log visível, mas o data-testid permanece

**O que NÃO é:**

- Não é um fallback genérico que suprime erros
- Não substitui ChatErrorBoundary ou DossierErrorBoundary
- Não aparece quando há loading, erro ou conteúdo real

### 4.3 Classificador de Estado (renderStateClassifier.ts)

Helper puro, sem efeitos colaterais:

```ts
type PanelState = 'empty' | 'loading' | 'content' | 'error';

function classifyPanelState(params: {
  messages: unknown[];
  hasDossierContent: boolean;
  isLoading: boolean;
  hasError: boolean;
  hasActiveSession: boolean;
}): PanelState;
```

Regras:

- `hasError === true` → `'error'`
- `isLoading === true` → `'loading'`
- `messages.length > 0 || hasDossierContent === true` → `'content'`
- caso contrário → `'empty'`

Nunca retorna `null` ou `undefined`.

### 4.4 Testes E2E

#### 4.4.1 blank-center-panel-regression.spec.ts

**Valida:**

- App abre (greeting ou chat shell visível)
- `app-shell` está presente
- `message-input` está presente
- `chat-main-panel` está presente
- Sem `console.error` (com allowlist de erros conhecidos)
- Sem `pageerror`
- Sem `unhandledrejection`
- Se `app-breadcrumb` contém texto de empresa → `chat-main-panel` precisa conter um dos estados válidos
- `chat-main-panel` não pode ficar vazio por mais de 8 segundos

**Diagnóstico na falha (log automático):**

- `page.url()`
- `app-breadcrumb` textContent
- `chat-main-panel` textContent
- Quantidade de `[data-testid="message-row"]`
- `loading-smart` visível?
- `controlled-error` visível?
- `empty-state` visível?
- Erros de console capturados

#### 4.4.2 loading-smart-recovery.spec.ts

**Valida:**

- Usuário inicia fluxo de geração (via input + send)
- `loading-smart` aparece
- `loading-smart` desaparece dentro de 120s (timeout configurável)
- Após desaparecer, aparece `message-list`, `dossier-content` ou `controlled-error`
- `message-input` continua acessível
- Sem erro silencioso no console

#### 4.4.3 controlled-error-state.spec.ts

**Valida (usando page.route para injetar falha):**

- Intercepta chamada à API Gemini e retorna 500
- Falha não gera tela branca
- `message-input` continua acessível
- `loading-smart` não fica visível por mais de 30s após a falha
- `controlled-error` aparece visível
- Usuário consegue clicar em retry (se houver botão)
- `chat-main-panel` mantém texto visível (mensagens anteriores ou erro)

### 4.5 Contratos (tests/contracts/)

#### 4.5.1 renderState.contract.test.tsx

Testa `classifyPanelState()` com todas as combinações:

- `hasError` prioritário sobre `isLoading`
- `isLoading` prioritário sobre `content`
- `content` detectado por messages OU dossier
- `empty` é o fallback explícito (nunca null/undefined)
- Sessão ativa sem conteúdo → `empty`
- Sessão ativa com loading → `loading`
- Sessão ativa com erro → `error`
- Sem sessão ativa + sem conteúdo → `empty`

#### 4.5.2 operatorTracking.contract.test.ts

Amplia o teste existente `tests/services/operatorTracking.test.ts` com validações de contrato:

- Eventos permitidos: conjunto fechado de 7 valores
- Payload de sessão: somente campos esperados (whitelist)
- Payload de evento: somente campos esperados (whitelist)
- Metadata sensível: `apiKey`, `token`, `password`, `secret` são removidos
- Strings > 1000 chars são truncadas
- Falha no Supabase não quebra UX (erro é logado, não propagado)
- `session_id` é UUID v4 válido
- `start_session` não duplica insert no mesmo `sessionStorage`
- `app_opened` dispara exatamente 1 vez por init de sessão

Eventos permitidos:

- `app_opened`
- `operator_registered`
- `dossier_started`
- `dossier_completed`
- `dossier_failed`
- `dossier_opened`
- `dossier_shared`

#### 4.5.3 supabaseMigrations.contract.test.ts

Valida (leitura de arquivos, sem acesso ao banco):

- `supabase/migrations/` existe e contém pelo menos 1 arquivo `.sql`
- `20260528_operator_tracking.sql` existe
- Toda migration que contém `CREATE TABLE` deve conter `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` ou ter justificativa documentada em comment SQL
- Toda migration que cria política (`CREATE POLICY`) referencia uma tabela criada na mesma migration ou em migration anterior
- `operator_sessions` e `operator_events` têm colunas documentadas (via comment SQL ou arquivo de schema)

### 4.6 Scripts (package.json)

```json
{
  "test:contracts": "vitest run tests/contracts/",
  "test:e2e:blank": "playwright test tests-e2e/blank-center-panel-regression.spec.ts",
  "test:e2e:loading": "playwright test tests-e2e/loading-smart-recovery.spec.ts",
  "test:e2e:errors": "playwright test tests-e2e/controlled-error-state.spec.ts",
  "test:flow": "npm run typecheck && npm run test && npm run test:contracts && npm run test:e2e:blank",
  "validate:release": "npm run typecheck && npm run test && npm run test:contracts && npm run test:e2e"
}
```

### 4.7 Documentação

#### docs/contracts/scout-360-contracts.md

- Lista de estados visuais válidos e inválidos
- Como diagnosticar painel branco
- Eventos de tracking documentados
- Tabelas Supabase críticas
- Matriz: qual teste protege qual tipo de quebra
- Como rodar cada grupo de testes

#### docs/contracts/PR-CHECKLIST.md

Checklist obrigatório para PRs que tocam:

- App.tsx, ChatShell.tsx, ChatPanels.tsx, MessageTimeline.tsx
- LoadingSmart.tsx, storage.ts, supabase, tracking
- session-controller, message-orchestrator, fluxo de geração, dossiê

Itens:

- [ ] `typecheck` passou
- [ ] `npm test` passou
- [ ] `npm run test:contracts` passou
- [ ] `npm run test:e2e:blank` passou
- [ ] `npm run test:e2e:loading` passou
- [ ] Sem `console.error` no fluxo principal
- [ ] Nenhum estado visual sem fallback

## 5. Arquivos

### 5.1 Criar (10 arquivos)

| #   | Arquivo                                                            | Tipo                |
| --- | ------------------------------------------------------------------ | ------------------- |
| 1   | `utils/renderStateClassifier.ts`                                   | Helper              |
| 2   | `tests/contracts/renderState.contract.test.tsx`                    | Contract test       |
| 3   | `tests/contracts/operatorTracking.contract.test.ts`                | Contract test       |
| 4   | `tests/contracts/supabaseMigrations.contract.test.ts`              | Contract test       |
| 5   | `tests-e2e/blank-center-panel-regression.spec.ts`                  | E2E test            |
| 6   | `tests-e2e/loading-smart-recovery.spec.ts`                         | E2E test            |
| 7   | `tests-e2e/controlled-error-state.spec.ts`                         | E2E test            |
| 8   | `docs/contracts/scout-360-contracts.md`                            | Documentação        |
| 9   | `docs/contracts/PR-CHECKLIST.md`                                   | Documentação        |
| 10  | `docs/superpowers/specs/2026-05-28-test-anti-regression-design.md` | Spec (este arquivo) |

### 5.2 Alterar (6 arquivos)

| #   | Arquivo                          | Mudança                                                                           |
| --- | -------------------------------- | --------------------------------------------------------------------------------- |
| 11  | `App.tsx`                        | Adicionar `data-testid="app-shell"` na div raiz                                   |
| 12  | `components/chat/ChatShell.tsx`  | Adicionar `app-header`, `app-breadcrumb`, `session-sidebar`, `session-item`       |
| 13  | `components/chat/ChatPanels.tsx` | Adicionar `chat-main-panel`, `empty-state` com EmptyStateFallback                 |
| 14  | `components/chat/Composer.tsx`   | Adicionar `message-input`, renomear `chat-send-button` para `send-message-button` |
| 15  | `components/LoadingSmart.tsx`    | Renomear `loading-smart-overlay` para `loading-smart`                             |
| 16  | `package.json`                   | Adicionar 6 scripts                                                               |

## 6. Ordem de Implementação

### Fase 1 — Fundação (helpers + data-testid)

1. Criar `utils/renderStateClassifier.ts`
2. Adicionar data-testid nos componentes (App, ChatShell, ChatPanels, Composer, LoadingSmart)
3. Criar EmptyStateFallback inline no ChatPanels.tsx

### Fase 2 — Contratos

4. Criar `tests/contracts/renderState.contract.test.tsx`
5. Criar `tests/contracts/operatorTracking.contract.test.ts`
6. Criar `tests/contracts/supabaseMigrations.contract.test.ts`
7. Rodar `npm run test:contracts` — garantir que passam

### Fase 3 — E2E

8. Criar `tests-e2e/blank-center-panel-regression.spec.ts`
9. Criar `tests-e2e/loading-smart-recovery.spec.ts`
10. Criar `tests-e2e/controlled-error-state.spec.ts`
11. Rodar cada spec individualmente

### Fase 4 — Scripts + Documentação

12. Atualizar `package.json` com novos scripts
13. Criar `docs/contracts/scout-360-contracts.md`
14. Criar `docs/contracts/PR-CHECKLIST.md`

### Fase 5 — Validação final

15. Rodar `npm run typecheck`
16. Rodar `npm test`
17. Rodar `npm run test:contracts`
18. Rodar `npm run test:e2e:blank`
19. Rodar `npm run test:e2e:loading`
20. Rodar `npm run test:e2e:errors`

## 7. Observações

- O data-testid `chat-shell` em ChatShell.tsx:101 é mantido. Ele identifica o shell interno do chat.
  `app-shell` identifica o container raiz da aplicação. São elementos diferentes em níveis diferentes.
- `chat-input` (Composer.tsx:202) é mantido. Representa o textarea. `message-input` será adicionado
  como wrapper do compose area completo. Ambos são válidos e não conflitam.
- `chat-stop-button` mantido como identificador do botão de parar (estado diferente de enviar).
- `chat-error-boundary` será renomeado para `controlled-error` no ChatErrorBoundary.tsx:55.
