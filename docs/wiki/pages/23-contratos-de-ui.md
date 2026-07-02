---
grok_wiki: true
page_id: 'page-ui-contracts-reference'
title: 'Contratos de UI'
description: 'Estados válidos do painel, `data-testid` oficiais, shell de chat, composer, timeline, erro controlado e matriz de proteção anti-regressão.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'docs/contracts/scout-360-contracts.md'
  - 'components/chat/ChatShell.tsx'
  - 'components/chat/ChatPanels.tsx'
  - 'components/chat/MessageTimeline.tsx'
  - 'components/chat/Composer.tsx'
  - 'components/ErrorMessageCard.tsx'
  - 'tests-e2e/smoke.data-testids.spec.ts'
  - 'tests/contracts/renderState.contract.test.tsx'
---

Os contratos de UI do Senior Scout 360 ficam concentrados em `App.tsx`, `components/ChatInterface.tsx`, `components/chat/*`, `features/chat/ChatErrorBoundary.tsx` e nos gates Playwright/Vitest. `App` monta `app-shell` e decide o overlay de loading; `ChatInterface` classifica o estado do painel central; `ChatShell` organiza sidebar, header, timeline, composer e painéis lazy; `MessageTimeline` escolhe entre Virtuoso, fallback estático, placeholder e viewport suspensa.

<Note>
Os contratos são baseados em DOM, `data-testid`, Playwright, Vitest e telemetria local. Eles continuam portáveis em arquitetura BYOC/BYOK porque não dependem de um provedor de IA específico, de conector proprietário ou de uma plataforma hospedada de documentação.
</Note>

## Estados válidos do painel central

O painel central oficial é `chat-main-panel`. Com sessão ativa, ele não pode ficar visualmente vazio: precisa conter um estado válido, ou o fluxo é tratado como regressão de painel branco.

| Estado    | Condição de classificação                               | Sinal visual esperado                                                                                    | Observação                                                             |
| --------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `error`   | Há mensagem com `isError` ou erro de render no boundary | `error-message-card` ou `controlled-error`                                                               | Prioridade mais alta.                                                  |
| `loading` | `isLoading=true`                                        | `loading-smart-overlay`, `hero-loading-inline-fallback`, `chat-processing-indicator` ou botão de stop    | Loading vence conteúdo enquanto a geração ainda está ativa.            |
| `content` | Há mensagens ou `resumoDossie`                          | `message-row`, `bot-message-content`, `dossier-content`, `messages-static-fallback` ou timeline Virtuoso | Dossiê grande deve ficar visível no DOM.                               |
| `empty`   | Sem erro, sem loading, sem mensagens e sem dossiê       | `empty-state`                                                                                            | Só é fallback explícito quando há sessão ativa e não é a home inicial. |

A prioridade do classificador é fixa: `error > loading > content > empty`. O estado inválido é `chat-main-panel` renderizado sem nenhum sinal visual válido, especialmente quando o breadcrumb indica sessão ativa.

## Shell de chat

`ChatShell` recebe `timeline`, `composer` e `panels` como `ReactNode` e preserva a estrutura principal da tela.

| Área                   | `data-testid`       | Responsabilidade                                                       |
| ---------------------- | ------------------- | ---------------------------------------------------------------------- |
| App raiz               | `app-shell`         | Container full-height do runtime React.                                |
| Shell visual externo   | `messages-scroller` | Layout com sidebar e área principal.                                   |
| Área principal do chat | `chat-shell`        | Header, timeline e composer.                                           |
| Header                 | `app-header`        | Breadcrumb, toggle de sidebar, War Room, export, tema, sync e usuário. |
| Breadcrumb             | `app-breadcrumb`    | Mostra `Scout 360` e, quando há sessão, `→ {displayTitle}`.            |
| Sidebar                | `session-sidebar`   | Histórico de investigações.                                            |
| Item de sessão         | `session-item`      | Entrada individual do histórico.                                       |
| Toggle da sidebar      | `sidebar-toggle`    | Abre/fecha o histórico, inclusive no mobile.                           |

`ChatPanels` monta drawers e painéis auxiliares apenas quando os flags estão ativos: configurações, War Room, Radar e Radar Settings. Cada painel lazy fica dentro de `SuspenseWithError`; o fallback visual é nulo para não interferir no contrato do painel central.

## Timeline

`MessageTimeline` tem cinco caminhos visuais principais:

| Caminho           | Quando aparece                                                           | Sinais                                                               |
| ----------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Gate de operador  | `showOperatorGate=true`                                                  | Tela de boas-vindas de operador.                                     |
| Home inicial      | `showInitialHome=true`                                                   | Formulário inicial de investigação e ajuda flutuante.                |
| Fallback estático | `forceStaticTimelineFallback=true` após recovery final para bot `>= 60_000` caracteres | `messages-static-fallback`, `data-scout-virtuoso="static-fallback"`. |
| Viewport suspensa | `shouldSuspendVirtualizedList=true` e sem fallback estático              | `messages-viewport-suspended`.                                       |
| Virtuoso          | Caminho normal de mensagens                                              | `data-scout-virtuoso="timeline"` e linhas `message-row`.             |

Para dossiê abaixo de `60_000` caracteres, a recuperação preferida é remount controlado da viewport virtualizada. Static fallback vence a viewport suspensa apenas como último recurso para dossiê `>= 60_000`.

### Regras de fallback estático

- O limite de static fallback final é `60_000` caracteres de texto de bot.
- Abaixo de `60_000`, blank panel reativo deve acionar `timelineRecoveryNonce`, não `messages-static-fallback`.
- `messages-static-fallback` renderiza `MessageRow` diretamente, sem depender da materialização do Virtuoso.
- A safety net `static-fallback-display-recovery` verifica se o fallback está com `display:none`; se estiver, limpa `style.display` e força `display: block !important`.
- O recovery é defensivo e idempotente. Ele não substitui investigação de causa raiz quando `display:none` reaparecer.
- `messages-viewport-placeholder` e `messages-viewport-suspended` são estados intermediários; após waterfall finalizado com bot esperado, eles não são estado final válido.

### Mensagens e conteúdo de bot

| `data-testid`                  | Uso                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `message-row`                  | Linha de mensagem, com `data-message-id`, `data-sender` e `data-text-length`.                     |
| `bot-message-content`          | Nó interno da resposta do Scout, usado para validar visibilidade real e tamanho do dossiê.        |
| `dossier-content`              | Wrapper do `DossierErrorBoundary` quando o bloco renderiza sem erro.                              |
| `hero-loading-inline-fallback` | Linha visível de fallback quando o overlay hero deveria cobrir o loading, mas a timeline aparece. |

## Loading e handoff pós-waterfall

O overlay principal é `loading-smart-overlay`. Ele aparece quando `isLoading=true`, `loadingVariant` não é `inline` e ainda não há conteúdo de bot renderizável. Se já existe resposta de bot renderizável, o overlay não deve bloquear o painel.

| Variante                         | Comportamento                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `hero`                           | Pode mostrar overlay fullscreen `loading-smart-overlay`.                         |
| `inline`                         | Não mostra overlay fullscreen; usa placeholder inline.                           |
| `undefined` com `isLoading=true` | Tratado como hero para evitar painel branco durante janelas de finalização.      |
| `isLoading=false`                | Overlay não deve permanecer no DOM; há check defensivo que oculta overlay preso. |

O pós-waterfall agenda verificações `PostCompletion` em `0`, `100`, `500`, `1000`, `3000` e `10000` ms. Cada check mede overlay, composer, bot visível, tamanho máximo de texto, scroller, painel e motivo de painel branco. Para dossiê grande, o watchdog pós-waterfall roda após `2000` ms e força fallback estático se o DOM ainda estiver em placeholder, suspenso ou blank.

## Composer

`Composer` fica oculto na home inicial e no gate de operador. Fora desses estados, ele preserva a entrada inferior da investigação.

| Elemento           | `data-testid`               | Contrato                                                                              |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------- |
| Wrapper            | `message-input`             | Deve permanecer visível durante e após loading.                                       |
| Textarea           | `chat-input`                | Desabilita durante `isLoading`; `Enter` envia e `Shift+Enter` quebra linha.           |
| Enviar             | `send-message-button`       | Só habilita com texto não vazio e sem loading.                                        |
| Parar              | `chat-stop-button`          | Substitui o botão de envio durante loading.                                           |
| Indicador inferior | `chat-processing-indicator` | Mostra etapa atual, etapas concluídas e tentativas quando `processing` está presente. |

O composer escuta o evento customizado `scout:prefill` para preencher e focar a textarea. Após `onStop`, exibe um aviso local com ação de retry; esse aviso não altera o contrato do painel central.

## Erro controlado

Há dois níveis de erro visual:

| Superfície         | `data-testid`            | Quando aparece                                      | Contrato                                                                               |
| ------------------ | ------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Boundary do shell  | `controlled-error`       | Crash de renderização dentro de `ChatErrorBoundary` | Mantém o restante do app montado e oferece remontar o chat ou recarregar.              |
| Card de mensagem   | `error-message-card`     | Falha controlada convertida em mensagem de erro     | Remove loading, mostra mensagem amigável, permite retry e opcionalmente reportar erro. |
| Boundary de dossiê | `dossier-error-boundary` | Falha ao renderizar bloco de dossiê ou chunk stale  | Preserva o restante do chat e oferece recuperação local.                               |

Falha de `/api/gemini` não deve produzir painel branco. O estado esperado é: `app-shell` visível, `chat-main-panel` visível, `error-message-card` visível, `loading-smart-overlay` ausente e `chat-input` habilitado para nova interação.

## `data-testid` oficiais

Use estes identificadores como superfície pública de teste e diagnóstico do shell de chat:

| Camada          | Identificadores oficiais                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| App e shell     | `app-shell`, `messages-scroller`, `chat-shell`, `app-header`, `app-breadcrumb`, `sidebar-toggle`                                                     |
| Sidebar         | `session-sidebar`, `session-item`                                                                                                                    |
| Painel central  | `chat-main-panel`, `empty-state`, `controlled-error`, `error-message-card`                                                                           |
| Loading         | `loading-smart-overlay`, `chat-processing-indicator`, `hero-loading-inline-fallback`, `messages-viewport-suspended`, `messages-viewport-placeholder` |
| Timeline        | `messages-static-fallback`, `message-row`, `bot-message-content`, `dossier-content`                                                                  |
| Composer        | `message-input`, `chat-input`, `send-message-button`, `chat-stop-button`                                                                             |
| Ações do header | `chat-war-room-button`, `chat-war-room-icon`, `chat-theme-toggle`                                                                                    |

<Warning>
Não use `message-list`, `chat-header-title` ou `loading-smart` como novo contrato de UI. Eles aparecem em testes, mocks ou planos antigos, mas o componente atual lido para a superfície real usa `loading-smart-overlay` e não expõe `message-list` nem `chat-header-title` como `data-testid` de produção.
</Warning>

## Matriz anti-regressão

| Risco                          | Gate principal                                                    | Verificação esperada                                                                                  |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Estado de painel inválido      | `npm run test:contracts`                                          | `VALID_PANEL_STATES` contém exatamente `empty`, `loading`, `content`, `error`; prioridade preservada. |
| Painel branco com sessão ativa | `npm run test:e2e:blank`                                          | `chat-main-panel` visível e `bot-message-content` com área, texto e `display !== "none"`.             |
| Loading infinito               | `npm run test:e2e:loading`                                        | `loading-smart-overlay` aparece, desaparece e o painel final contém dossiê visível.                   |
| Falha sem fallback visual      | `npm run test:e2e:errors`                                         | API falha, `error-message-card` aparece, overlay some e input continua habilitado.                    |
| Regressão de dossiê grande     | `npx playwright test tests-e2e/scheffer-cnpj-blank-panel.spec.ts` | CNPJ Scheffer stubado gera dossiê longo, sem placeholder/suspended final.                             |
| Drift de tipos                 | `npm run typecheck`                                               | Contratos TS de props, loading e mensagens continuam válidos.                                         |
| Fluxo mínimo composto          | `npm run test:flow`                                               | Typecheck, unit, contracts e E2E de blank panel.                                                      |
| Pré-release amplo              | `npm run validate:release`                                        | Typecheck, unit, contracts e todos E2E.                                                               |

## Procedimento para mudanças de UI

<Steps>
  <Step title="Preserve o painel central">
    Qualquer mudança em `ChatInterface`, `MessageTimeline`, `LoadingSmart`, `MessageRow`, `Composer` ou boundaries precisa manter `chat-main-panel` com um dos estados válidos. Placeholder e viewport suspensa só são aceitáveis como transição.
  </Step>
  <Step title="Atualize testids com teste junto">
    Se trocar ou remover `data-testid`, atualize E2E, contratos, telemetria e mocks no mesmo diff. Evite criar aliases silenciosos para identificadores legados.
  </Step>
  <Step title="Valide DOM, não só estado técnico">
    Para bugs visuais, `isLoading=false`, persistência em storage ou logs de Virtuoso não provam sucesso. Confirme `bot-message-content` visível dentro de `chat-main-panel`, com dimensões positivas e texto esperado.
  </Step>
  <Step title="Reforce dossiês grandes">
    Quando o fluxo pode gerar resposta longa, valide `messages-static-fallback` ou `data-scout-virtuoso="timeline"` e confirme ausência de `messages-viewport-placeholder` e `messages-viewport-suspended` após o waterfall.
  </Step>
</Steps>

## Related pages

<CardGroup>
  <Card title="Loading e estados visuais" href="/loading-estados-visuais">
    Contrato específico de overlay, timeline, fallback estático e recuperação pós-waterfall.
  </Card>
  <Card title="Depurar painel branco" href="/depurar-painel-branco">
    Procedimento de investigação para `PostCompletion`, `FreezeDiag`, `LayoutTrace` e validação visual final.
  </Card>
  <Card title="Testes e gates" href="/testes-gates">
    Comandos npm, Vitest, Playwright, E2E críticos e critérios por tipo de mudança.
  </Card>
  <Card title="Observabilidade e diagnósticos" href="/observabilidade">
    Eventos `scoutDiag`, Sentry, Supabase diagnostics e traces usados para fechar regressões visuais.
  </Card>
</CardGroup>

## Source files

- `docs/contracts/scout-360-contracts.md`
- `components/chat/ChatShell.tsx`
- `components/chat/ChatPanels.tsx`
- `components/chat/MessageTimeline.tsx`
- `components/chat/Composer.tsx`
- `components/ErrorMessageCard.tsx`
- `tests-e2e/smoke.data-testids.spec.ts`
- `tests/contracts/renderState.contract.test.tsx`
