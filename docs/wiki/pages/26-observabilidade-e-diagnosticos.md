---
grok_wiki: true
page_id: 'page-observabilidade'
title: 'Observabilidade e diagnósticos'
description: 'Sentry, heartbeat, visibility tracking, `scoutDiag`, flush para `/api/gemini`, Supabase diagnostics, eventos de operador e traces de layout.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'index.tsx'
  - 'utils/diagnosticLog.ts'
  - 'utils/serverDiagnostics.ts'
  - 'api/gemini.ts'
  - 'services/operatorTracking.ts'
  - 'utils/layoutTraceTelemetry.ts'
  - 'tests/utils/diagnosticLog.test.ts'
  - 'tests/services/operatorTracking.test.ts'
---

A observabilidade do Senior Scout 360 combina três trilhas independentes: Sentry para exceções React e replay, `scoutDiag` para telemetria estruturada com flush para `/api/gemini`, e tracking de operador em Supabase via `operator_sessions` e `operator_events`.

## Superfícies de runtime

```text
Browser React
  ├─ index.tsx
  │   ├─ Sentry.init(...)
  │   ├─ listeners globais: error / unhandledrejection
  │   ├─ setupVisibilityTracking()
  │   └─ setupHeartbeat()
  ├─ utils/diagnosticLog.ts
  │   ├─ scoutDiag.warn/error/info/debug/trace
  │   ├─ buffer em window.__SCOUT_DIAG_HISTORY__
  │   ├─ fallback localStorage
  │   └─ POST /api/gemini { action: "recordDiagnostics" }
  ├─ services/operatorTracking.ts
  │   └─ Supabase client anon: operator_sessions / operator_events
  └─ utils/layoutTraceTelemetry.ts
      └─ LayoutTrace / BlankPanelDebug / ancestry trace

Vercel serverless
  └─ api/gemini.ts
      └─ recordDiagnostics → utils/serverDiagnostics.ts → scout_diagnostics
```

<Note>
`recordDiagnostics` é tratado no começo de `/api/gemini`, antes da validação Zod das ações Gemini e antes da resolução de chaves do modelo. A rota funciona como canal de telemetria serverless, não como chamada de geração.
</Note>

## Configuração

| Área                    | Chave                                                                   | Uso                                                                          |
| ----------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Sentry client           | `VITE_SENTRY_DSN`                                                       | Ativa `Sentry.init`; sem DSN, o client fica desabilitado.                    |
| Sentry release          | `VITE_SENTRY_RELEASE`, `VITE_APP_VERSION`, `VITE_VERCEL_GIT_COMMIT_SHA` | Resolvem `release` e `dist` do evento Sentry.                                |
| Sentry sourcemaps       | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `APP_VERSION`      | Ativam `sentryVitePlugin` no build e upload de sourcemaps.                   |
| Console detalhado       | `VITE_VERBOSE_LOGS`, `VITE_DEBUG_CONSOLE`                               | Ativam logs `info`/`debug` do `scoutDiag` fora de DEV.                       |
| Diagnóstico persistente | `VITE_SCOUT_DIAGNOSTICS_ENABLED`                                        | `true` ativa flush persistente; `false` desativa mesmo se houver flag local. |
| Diagnóstico local       | `localStorage.SCOUT_DIAG_ENABLED = "1"`                                 | Ativa persistência em preview/local quando a env não foi definida.           |
| Trace seletivo          | `?scoutTrace=teia`, `?scoutTrace=all`, `?scoutTrace=off`                | Persiste ou limpa o alvo em `localStorage.scoutTrace`.                       |
| Supabase client         | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`                           | Usado no browser para eventos de operador.                                   |
| Supabase server         | `SUPABASE_URL` ou `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`      | Usado no serverless para inserir `scout_diagnostics`.                        |

## Sentry

`index.tsx` inicializa Sentry com `browserTracingIntegration()` e `replayIntegration()`. Em produção, `tracesSampleRate` é `0.05` e `replaysSessionSampleRate` é `0.1`; em desenvolvimento, ambos sobem para `1.0`. `replaysOnErrorSampleRate` permanece `1.0`.

O replay está configurado com:

```ts
maskAllText: false;
blockAllMedia: false;
```

## Risco de privacidade pendente

O Sentry Replay utiliza atualmente `maskAllText: false` e `blockAllMedia: false`. Como a aplicação pode exibir nomes, CNPJs, pesquisas, relatórios e informações comerciais, essa configuração deve ser revisada em uma PR técnica separada, considerando LGPD, mascaramento de texto, bloqueio de mídia e máscaras seletivas. Esta Wiki descreve a configuração atual e não a considera aprovada como segura.

`beforeSend` descarta erros de chunk conhecidos, incluindo `ChunkLoadError`, `Loading chunk` e `Failed to fetch dynamically imported module`. URLs de extensões de navegador também são negadas.

`components/ErrorBoundary.tsx` captura erros React no boundary raiz, persiste auditoria local, imprime relatório técnico no console e envia a exceção ao Sentry com a tag `error-boundary=root`.

<Warning>
Para regressões de painel branco, overlay preso ou freeze de UI, Sentry é sinal complementar. O contrato operacional do repo prioriza `scout_diagnostics`, `operator_events`, DOM snapshot e validação visual em browser real.
</Warning>

## `scoutDiag` e níveis de log

`scoutDiag` é a fachada de diagnóstico client-side em `utils/diagnosticLog.ts`.

| Método                                              | Console                                        | Persistência                                                                     |
| --------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `scoutDiag.error(scope, message, details?)`         | Sempre visível.                                | Entra no buffer se diagnóstico persistente estiver ativo e força flush imediato. |
| `scoutDiag.warn(scope, message, details?)`          | Sempre visível.                                | Entra no buffer se diagnóstico persistente estiver ativo.                        |
| `scoutDiag.info(scope, message, details?)`          | Apenas DEV ou flags verbosas.                  | Entra no buffer quando chamado e diagnóstico persistente está ativo.             |
| `scoutDiag.debug(scope, message, details?)`         | Apenas DEV ou flags verbosas.                  | Entra no buffer quando chamado e diagnóstico persistente está ativo.             |
| `scoutDiag.trace(target, scope, message, details?)` | Só quando `scoutTrace` contém o alvo ou `all`. | Registra evento `debug` com `traceTarget`.                                       |
| `scoutDiag.startTimer(scope, label)`                | Mede `end()` e `fail()`.                       | `fail()` loga erro no console.                                                   |

O buffer mantém até 500 eventos em memória e salva os 50 mais recentes em `localStorage.scout_diag_fallback`. Falhas de flush geram chaves timestampadas `scout_diag_fallback_*`, podadas para no máximo 5.

### Helpers no browser

```js
window.__SCOUT_DUMP_DIAG__();
window.__SCOUT_FLUSH_DIAG__('motivo-manual');
```

`__SCOUT_DUMP_DIAG__()` imprime uma tabela com os 50 eventos mais recentes e retorna o buffer. `__SCOUT_FLUSH_DIAG__()` força envio para `/api/gemini`.

## Flush para `/api/gemini`

:::endpoint POST /api/gemini recordDiagnostics

Registra lote de eventos em `scout_diagnostics`.

<ParamField body="action" type='"recordDiagnostics"' required>
Ação especial tratada antes das ações Gemini.
</ParamField>

<ParamField body="runId" type="string" required>
Identificador do run de diagnóstico gerado no client.
</ParamField>

<ParamField body="sessionId" type="string">
Sessão de chat ou investigação associada.
</ParamField>

<ParamField body="operatorId" type="string">
Operador local lido de `localStorage.scout360:operator_id`.
</ParamField>

<ParamField body="environment" type="string">
Modo do Vite ou ambiente informado pelo client.
</ParamField>

<ParamField body="route" type="string">
`window.location.pathname` no momento do flush.
</ParamField>

<ParamField body="userAgent" type="string">
User agent do navegador.
</ParamField>

<ParamField body="events" type="array" required>
Eventos de diagnóstico. O servidor aceita no máximo `MAX_EVENTS_PER_BATCH`, atualmente `100`.
</ParamField>

<RequestExample>

```json
{
  "action": "recordDiagnostics",
  "runId": "mabc1234-x9z8y7",
  "sessionId": "4186a7b8-24f0-4929-9195-d740c0971212",
  "operatorId": "op_123",
  "environment": "production",
  "route": "/",
  "userAgent": "Mozilla/5.0 ...",
  "events": [
    {
      "at": "2026-06-08T20:00:00.000Z",
      "t": 12345,
      "runId": "mabc1234-x9z8y7",
      "sessionId": "4186a7b8-24f0-4929-9195-d740c0971212",
      "area": "PostCompletion",
      "event": "check:10000ms",
      "severity": "info",
      "payload": {
        "bodyLen": 65000,
        "containsDossie": true,
        "loadingOverlayExists": false,
        "botTextMaxLen": 36654
      }
    }
  ]
}
```

</RequestExample>

<ResponseExample>

```json
{ "inserted": 1 }
```

</ResponseExample>

Se Supabase server-side não estiver configurado, a resposta é degradada e não quebra a UX:

```json
{ "inserted": 0, "degraded": true, "reason": "Supabase not configured" }
```

:::

O client agenda flush a cada 5 segundos para eventos abaixo do batch, faz flush imediato em erro e usa timeout de 3 segundos. Quando `force=true` chega durante outro flush, o módulo agenda um dreno posterior em vez de iniciar escrita concorrente.

## Sanitização e tabela `scout_diagnostics`

`utils/serverDiagnostics.ts` limita o que chega ao Supabase:

| Regra                          | Valor  |
| ------------------------------ | ------ |
| Eventos por lote               | `100`  |
| Profundidade máxima de payload | `4`    |
| Comprimento máximo de string   | `2000` |
| Itens por array                | `50`   |
| Chaves por objeto              | `30`   |

Campos sensíveis são removidos quando a chave contém `token`, `key`, `secret`, `password`, `auth`, `credential`, `prompt`, `response`, `content`, `text` ou `body`. Métricas e rótulos seguros são preservados, por exemplo `bodyLen`, `botTextMaxLen`, `visibleBotWithCharsCount`, `centerElementTestId`, `reason`, `state`, `source`, `variant` e `branch`.

A gravação usa REST Supabase em:

```text
POST {SUPABASE_URL}/rest/v1/scout_diagnostics
Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
Prefer: return=minimal
```

A migration `20260603_blank_panel_observability.sql` não cria a tabela; ela adiciona índices de leitura para investigação:

| Índice                                      | Uso                                                             |
| ------------------------------------------- | --------------------------------------------------------------- |
| `idx_scout_diagnostics_session_created`     | Consultar timeline por `session_id`.                            |
| `idx_scout_diagnostics_area_event_created`  | Filtrar por área/evento, como `PostCompletion` ou `FreezeDiag`. |
| `idx_scout_diagnostics_operator_created`    | Cruzar incidência por operador.                                 |
| `idx_scout_diagnostics_blank_panel_created` | Buscar eventos de área `BlankPanel`.                            |

## Heartbeat e visibility tracking

`setupHeartbeat()` envia evento `Diagnostic / heartbeat` a cada 30 segundos quando o diagnóstico persistente está ativo. O payload inclui `bufferLen`, `elapsed` e `url`, seguido de flush imediato.

`setupVisibilityTracking()` registra:

| Evento               | Severidade | Flush                                      |
| -------------------- | ---------- | ------------------------------------------ |
| `visibility:hidden`  | `info`     | `flushDiagnosticsNow("visibility-change")` |
| `visibility:visible` | `info`     | `flushDiagnosticsNow("visibility-change")` |
| `pagehide`           | `warn`     | `flushDiagnosticsNow("pagehide", true)`    |
| `pageshow`           | `info`     | `flushDiagnosticsNow("pageshow")`          |
| `freeze`             | `warn`     | `flushDiagnosticsNow("freeze", true)`      |
| `resume`             | `info`     | `flushDiagnosticsNow("resume")`            |

O payload de visibilidade lê o estado sincronizado por `useChatLoadingProgress()`:

```ts
{
  (isLoading, loadingVariant, requestKind, visibilityState, bodyLen, containsDossie, containsLoading);
}
```

Além do buffer principal, os últimos 20 eventos de visibilidade são salvos em `localStorage.scout_diag_visibility` para sobreviver a descarte de aba.

## Eventos de operador

`services/operatorTracking.ts` registra métricas de uso sem bloquear a interface. Se Supabase estiver indisponível ou `operatorId` vier vazio, a chamada retorna sem lançar exceção.

### Sessões

`startOperatorSession(operatorId, email?)` faz `upsert` em `operator_sessions` com ID gerado no client e salvo em `sessionStorage.scout:current_session_id`. Reentradas na mesma aba chamam `touchOperatorSession()` e atualizam `last_seen_at`.

`endOperatorSession(reason)` atualiza `ended_at`, `ended_reason`, `duration_seconds` e `last_seen_at`. O `OperatorContext` chama essa finalização em `pagehide`; troca de aba não encerra sessão.

### Eventos

Eventos aceitos pelo tipo `OperatorEventName`:

| Evento                | Origem típica                                           |
| --------------------- | ------------------------------------------------------- |
| `app_opened`          | `initSessionTracking()` após sessão do operador.        |
| `operator_registered` | Registro inicial no `OperatorContext`.                  |
| `dossier_started`     | Início do waterfall de dossiê.                          |
| `dossier_completed`   | Waterfall executado e concluído.                        |
| `dossier_failed`      | Falha em dossiê.                                        |
| `dossier_opened`      | Seleção de sessão existente.                            |
| `dossier_shared`      | Compartilhamento via UI ou link persistente.            |
| `dossier_reopened`    | Reabertura de dossiê duplicado.                         |
| `dossier_override`    | Substituição de dossiê duplicado por nova investigação. |

`metadata` remove chaves com `prompt`, `gemini`, `response`, `token`, `secret`, `key` ou `password`. Strings são truncadas em aproximadamente 200 caracteres, arrays em 10 itens e objetos são sanitizados recursivamente.

A migration `20260528_operator_tracking.sql` cria `operator_sessions` e `operator_events`, habilita RLS e permite à role `anon` apenas INSERT/UPDATE em sessões e INSERT em eventos. SELECT e DELETE não são liberados para o client anon.

## Traces de loading, painel e layout

A instrumentação de layout vive em `utils/layoutTraceTelemetry.ts` e é temporária para diagnóstico de painel branco pós-waterfall.

| Área/evento                                    | Origem                         | Sinal                                                                                             |
| ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `App / overlay:render-decision`                | `App.tsx`                      | Decisão de mostrar ou esconder overlay, contagem de mensagens e texto máximo de bot.              |
| `App / overlay-stuck-after-loading`            | `App.tsx`                      | Overlay ainda no DOM 500 ms após `isLoading=false`; o elemento é escondido defensivamente.        |
| `PostCompletion / check:{delay}ms`             | `message-orchestrator.ts`      | Estado do DOM em `0`, `100`, `500`, `1000`, `3000` e `10000` ms após finalização.                 |
| `PostCompletion / RESTART-DETECTED:*`          | `message-orchestrator.ts`      | Waterfall reiniciou após baseline de geração.                                                     |
| `PostCompletion / blank-panel-detected:*`      | `message-orchestrator.ts`      | Snapshot detectou painel branco; força flush.                                                     |
| `Virtuoso / static-fallback-rendered`          | `MessageTimeline.tsx`          | Fallback estático renderizado, principalmente para dossiê grande.                                 |
| `Virtuoso / static-fallback-display-recovery`  | `MessageTimeline.tsx`          | Safety net detectou `display:none` no fallback e forçou `display:block !important` se necessário. |
| `LayoutTrace / static-fallback-mount`          | `MessageTimeline.tsx`          | Dimensões de raízes críticas após mount do fallback.                                              |
| `LayoutTrace / chat-interface-static-fallback` | `ChatInterface.tsx`            | Snapshot de painel quando fallback estático está ativo.                                           |
| `BlankPanelDebug / probe:*`                    | `debugStaticFallbackDisplay()` | Probes em `sync`, `raf1`, `raf2`, `timeout50ms` e `timeout500ms`.                                 |
| `MessageRow / commit:invisible-bot-content`    | `MessageRow.tsx`               | Texto de bot existe, mas o nó está invisível ou com dimensão zero.                                |
| `MessageRow / commit:zero-dimension-ancestor`  | `MessageRow.tsx`               | Primeiro ancestral com dimensão zero encontrado.                                                  |

### Campos úteis em `PostCompletion`

```ts
{
  (sessionId,
    storeIsLoading,
    storeLoadingVariant,
    bodyLen,
    containsDossie,
    containsLoading,
    loadingOverlayExists,
    botMessageCount,
    botTextMaxLen,
    composerDisabled,
    scrollerHeight,
    scrollerScrollHeight,
    blankPanelDetected,
    blankPanelReason,
    mainPanelChars,
    panelVisible,
    rowCount,
    visibleRowCount,
    visibleBotNodeCount,
    visibleBotWithCharsCount,
    centerElementTestId,
    documentReadyState,
    activeElement,
    waterfallGenCount,
    waterfallActiveRunId,
    waterfallBlockedCount);
}
```

### Critérios práticos para regressão visual

<Steps>
<Step title="Localize a sessão">
Use `session_id`, `operator_id` e horário aproximado para consultar `scout_diagnostics` e `operator_events`.
</Step>

<Step title="Cheque finalização real">
Procure `PostCompletion / check:10000ms`. Um `health-check` imediato com overlay ainda visível não prova recuperação final.
</Step>

<Step title="Cruze sinais de layout">
Verifique `blank-panel-detected`, `BlankPanelDebug`, `LayoutTrace`, `MessageRow / commit:invisible-bot-content` e `Virtuoso / static-fallback-display-recovery`.
</Step>

<Step title="Confirme a UX visível">
A sessão só está recuperada quando há conteúdo visível no painel, composer liberado e ausência de overlay preso. Persistência no Supabase não substitui validação do DOM final.
</Step>
</Steps>

## ServerWaterfall

`api/gemini.ts` também grava eventos server-side `ServerWaterfall / module:start` e `ServerWaterfall / module:end` quando a ação `generateContent` recebe conteúdo que permite extrair o nome do módulo por `bloco de ...`. Esses eventos usam `insertDiagnosticsBatch()` diretamente e entram em `scout_diagnostics` com `route: "/api/gemini"`.

## Testes e gates

Use testes focados quando alterar observabilidade, tracking, flush, Supabase ou regressões visuais:

```bash
npx vitest run tests/utils/diagnosticLog.test.ts
npx vitest run tests/utils/serverDiagnostics.test.ts
npx vitest run tests/services/operatorTracking.test.ts
npm run test:contracts
npm run test:e2e:blank
npm run test:e2e:loading
npm run typecheck
npm run build
```

| Mudança                           | Gate mínimo                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `scoutDiag`, buffer ou flush      | `tests/utils/diagnosticLog.test.ts`                                                             |
| Sanitização ou insert server-side | `tests/utils/serverDiagnostics.test.ts`                                                         |
| Eventos de operador               | `tests/services/operatorTracking.test.ts` e `tests/contracts/operatorTracking.contract.test.ts` |
| Migrations Supabase               | `tests/contracts/supabaseMigrations.contract.test.ts`                                           |
| Painel branco ou fallback visual  | `npm run test:e2e:blank`                                                                        |
| Overlay/loading                   | `npm run test:e2e:loading`                                                                      |
| Release amplo                     | `npm run validate:release`                                                                      |

## Falhas esperadas e comportamento degradado

| Falha                                    | Comportamento                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `VITE_SENTRY_DSN` ausente                | Sentry fica desabilitado.                                                              |
| `SENTRY_AUTH_TOKEN` ausente              | Build não ativa upload de sourcemaps pelo plugin.                                      |
| `VITE_SCOUT_DIAGNOSTICS_ENABLED=false`   | Diagnóstico persistente fica desligado mesmo com flag local.                           |
| `/api/gemini` retorna erro no flush      | Eventos voltam para fallback em `localStorage`.                                        |
| Supabase server-side sem service role    | `recordDiagnostics` responde `200` com `degraded: true`.                               |
| Supabase anon indisponível               | Tracking de operador não lança exceção e não bloqueia UX.                              |
| Evento crítico chega durante flush ativo | `force=true` agenda dreno posterior, preservando eventos finais como `PostCompletion`. |

## Related pages

<CardGroup>
<Card title="Loading e estados visuais" href="/loading-estados-visuais">
Contrato visual de overlay, timeline, fallback estático e sinais de recuperação pós-waterfall.
</Card>
<Card title="Depurar painel branco" href="/depurar-painel-branco">
Procedimento de investigação com `PostCompletion`, `FreezeDiag`, `LayoutTrace` e validação visual final.
</Card>
<Card title="Configurar Supabase" href="/configurar-supabase">
Variáveis, tabelas críticas, degradação e persistência relacionada a diagnósticos e operadores.
</Card>
<Card title="Referência de APIs serverless" href="/api-serverless-reference">
Contratos das rotas em `api/*.ts`, incluindo comportamento degradado e validação.
</Card>
<Card title="Testes e gates" href="/testes-gates">
Comandos de Vitest, Playwright, contratos e critérios por tipo de mudança.
</Card>
</CardGroup>

## Source files

- `index.tsx`
- `utils/diagnosticLog.ts`
- `utils/serverDiagnostics.ts`
- `api/gemini.ts`
- `services/operatorTracking.ts`
- `utils/layoutTraceTelemetry.ts`
- `tests/utils/diagnosticLog.test.ts`
- `tests/services/operatorTracking.test.ts`
