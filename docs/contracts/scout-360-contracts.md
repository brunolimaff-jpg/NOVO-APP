# Contratos do Scout 360 — Proteção Anti-Regressão

## Estados Visuais do Painel Central

### Estados Válidos

| Estado    | data-testid                        | Significado                                    |
| --------- | ---------------------------------- | ---------------------------------------------- |
| `content` | `message-row` ou `dossier-content` | Mensagens ou dossiê renderizados               |
| `loading` | `loading-smart`                    | Geração em andamento                           |
| `error`   | `controlled-error`                 | Erro capturado pelo ChatErrorBoundary          |
| `empty`   | `empty-state`                      | Sessão ativa sem conteúdo (fallback explícito) |

### Estado Inválido

Painel central renderiza `chat-main-panel` mas **nenhum** dos 4 estados acima está visível.
Isso é considerado **tela branca** e o teste `blank-center-panel-regression.spec.ts` deve detectar.

## Como Diagnosticar Painel Branco

1. Verificar `app-breadcrumb` — se contém "→", existe sessão ativa
2. Verificar `chat-main-panel` — se existe mas está vazio, é falha
3. Coletar com `collectDiagnostics()`:
   - URL atual
   - Texto do breadcrumb
   - Conteúdo do painel central
   - Quantidade de `message-row`
   - Visibilidade de `loading-smart`, `controlled-error`, `empty-state`
   - Erros de console

## data-testid Padronizados

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
| `empty-state`         | Empty state intencional                  | ChatInterface.tsx                                  |
| `message-input`       | Área de composição de mensagem           | Composer.tsx                                       |
| `send-message-button` | Botão de enviar                          | Composer.tsx                                       |
| `session-sidebar`     | Sidebar de sessões                       | ChatShell.tsx                                      |
| `session-item`        | Item individual de sessão                | SessionsSidebar.tsx                                |

## Eventos de Tracking

| Evento                | Quando Dispara                 |
| --------------------- | ------------------------------ |
| `app_opened`          | App inicializa (1x por sessão) |
| `operator_registered` | Operador se registra           |
| `dossier_started`     | Geração de dossiê inicia       |
| `dossier_completed`   | Geração conclui com sucesso    |
| `dossier_failed`      | Geração falha                  |
| `dossier_opened`      | Dossiê é aberto para leitura   |
| `dossier_shared`      | Dossiê é compartilhado         |

## Tabelas Supabase Críticas

| Tabela              | Migration                        | RLS |
| ------------------- | -------------------------------- | --- |
| `operator_sessions` | `20260528_operator_tracking.sql` | Sim |
| `operator_events`   | `20260528_operator_tracking.sql` | Sim |

## Matriz de Proteção

| Tipo de Quebra               | Teste Protetor                        |
| ---------------------------- | ------------------------------------- |
| Tela branca com sessão ativa | `test:e2e:blank`                      |
| Loading infinito             | `test:e2e:loading`                    |
| Erro sem fallback            | `test:e2e:errors`                     |
| Estado inválido do painel    | `test:contracts` (renderState)        |
| Tracking quebrado            | `test:contracts` (operatorTracking)   |
| Migration sem RLS            | `test:contracts` (supabaseMigrations) |
| Regressão de tipo            | `typecheck`                           |

## Como Rodar

```bash
# Testes unitários
npm test

# Contratos
npm run test:contracts

# E2E específicos
npm run test:e2e:blank      # Anti-painel-branco
npm run test:e2e:loading    # Anti-loading-infinito
npm run test:e2e:errors     # Erro controlado

# Fluxo completo
npm run test:flow            # typecheck + unit + contracts + e2e:blank

# Validação pré-deploy
npm run validate:release     # typecheck + unit + contracts + todos E2E
```
