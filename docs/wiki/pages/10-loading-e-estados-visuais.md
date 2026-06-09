---
grok_wiki: true
page_id: "page-loading-estados-visuais"
title: "Loading e estados visuais"
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - "components/LoadingSmart.tsx"
  - "components/chat/MessageTimeline.tsx"
  - "components/ChatInterface.tsx"
  - "utils/loadingStatus.ts"
  - "utils/blankPanelTelemetry.ts"
  - "docs/ai-context/refactor/loading-panel-contract.md"
  - "tests-e2e/loading-smart-recovery.spec.ts"
---

---
title: "Loading e estados visuais"
description: "Contrato de overlay, timeline, fallback estático, painel branco, estados válidos, testids críticos e sinais de recuperação pós-waterfall."
---

O contrato visual do chat central é dividido entre `App.tsx`, `components/ChatInterface.tsx`, `components/chat/MessageTimeline.tsx`, `components/LoadingSmart.tsx` e utilitários de diagnóstico. O overlay fullscreen é decidido no app, o estado do painel é classificado no chat, a timeline escolhe entre Virtuoso, suspensão e fallback estático, e os sinais pós-waterfall confirmam se existe conteúdo útil no DOM.

## Superfície do contrato

```text
App.tsx
  decide loading-smart-overlay
  aplica safety net se overlay existir com isLoading=false

ChatInterface.tsx
  classifica panelState
  calcula expectedBotCharsMax
  decide suspensão da timeline e forceStaticTimelineFallback
  agenda snapshots BlankPanel e watchdog pós-waterfall

MessageTimeline.tsx
  renderiza static fallback, suspended viewport, placeholder ou Virtuoso
  recupera messages-static-fallback quando computed display fica none

LoadingSmart.tsx
  renderiza overlay hero, progresso, etapas, curiosidades e botão Interromper

PostCompletion / BlankPanel / LayoutTrace
  medem DOM real, não intenção de estado React
```

<Warning>
Não trate `Virtuoso` montado, `PostCompletion` persistido ou texto em memória como prova suficiente de UX válida. O contrato fecha apenas quando o painel central exibe um estado visível: bot com texto, erro controlado, empty state legítimo ou fallback hero visível durante loading.
</Warning>

## Estados válidos do painel

`panelState` aceita somente `empty`, `loading`, `content` e `error`.

| Estado | Condição esperada | DOM aceitável | DOM inválido |
| --- | --- | --- | --- |
| `empty` | Sem sessão ativa renderizável ou sessão ativa sem conteúdo | `empty-state` quando há sessão ativa vazia fora da home | Painel invisível ou sessão ativa sem fallback |
| `loading` | `isLoading=true` | `loading-smart-overlay`, fallback inline, ou timeline suspensa antes de conteúdo renderizável | Overlay cobrindo bot já renderizável |
| `content` | Há mensagens ou `resumoDossie` | `bot-message-content` visível com `data-text-length > 0`, via Virtuoso ou `messages-static-fallback` | `messages-viewport-placeholder` ou `messages-viewport-suspended` pós-waterfall |
| `error` | Mensagem de erro ou boundary controlada | `error-message-card` no chat; `controlled-error` no boundary do shell | Overlay infinito ou painel branco após falha |

## Overlay hero

A decisão de mostrar `loading-smart-overlay` usa `shouldShowHeroLoadingOverlay(isLoading, loadingVariant, hasRenderableBotMessage)`.

| Regra | Comportamento |
| --- | --- |
| `isLoading=false` | Overlay não pode existir. O app aplica safety net depois de 500 ms se encontrar o DOM preso. |
| `loadingVariant='inline'` | Overlay fullscreen não aparece. Follow-up deve usar carregamento inline. |
| `loadingVariant='hero'` ou `undefined` | Overlay aparece enquanto não houver bot renderizável. |
| Bot renderizável presente | Overlay não bloqueia a tela, mesmo se `isLoading` ainda estiver `true`. |

Um bot é renderizável quando é mensagem de bot, não é erro, tem texto e não está em `isThinking`, ou quando está em `isThinking` com pelo menos `200` caracteres de preview waterfall.

`finalizeWaterfallUI` é a rotina de fechamento forte do waterfall: zera `isLoading`, limpa `loadingVariant`, completa o progresso, reseta `failureCount`, remove geração ativa e agenda ocultação por DOM de `loading-smart-overlay`, `messages-viewport-suspended` e `loading-stop-button`.

## Timeline, suspensão e fallback estático

`ChatInterface` calcula `shouldSuspendVirtualizedList` com `shouldSuspendHeroMessageTimeline`. A timeline só pode suspender durante hero loading sem conteúdo de bot renderizável. Se o bot já é renderizável, a timeline permanece disponível.

O fallback estático é preferido para dossiês grandes. O limite é `LARGE_DOSSIER_STATIC_FALLBACK_CHARS = 4000`.

| Sinal | Resultado |
| --- | --- |
| `expectedBotCharsMax >= 4000`, sessão existente e fora da home | `forceStaticTimelineFallback` é ativado proativamente. |
| `preferStaticForLargeDossier=true` após loading | A timeline renderiza `messages-static-fallback` no mesmo render. |
| `shouldSuspendVirtualizedList=true` e fallback estático ativo | O fallback estático vence a suspensão. |
| Virtuoso não materializa conteúdo | Snapshots podem ativar `static-timeline-fallback-activated`. |

`MessageTimeline` escolhe nesta ordem:

1. `showOperatorGate`
2. `showInitialHome`
3. `messages-static-fallback`
4. `messages-viewport-suspended`
5. Virtuoso com `messages-viewport-placeholder` até a viewport ficar pronta

<Check>
Depois do waterfall, `messages-viewport-placeholder` e `messages-viewport-suspended` não são estados finais válidos quando existe bot esperado. Eles são estados transitórios ou sinais de stuck handoff.
</Check>

## Painel branco

`blankPanelTelemetry` mede o DOM real em `chat-main-panel`. A verificação só dispara quando há `sessionId`, existe bot esperado, `isLoading=false`, não é home inicial e a timeline não deveria estar suspensa.

Razões conhecidas de painel branco:

| `reason` | Interpretação |
| --- | --- |
| `main-panel-not-visible` | O painel central não tem área visível. |
| `stuck-viewport-placeholder` | Virtuoso ficou no placeholder depois do conteúdo esperado. |
| `stuck-viewport-suspended` | A timeline permaneceu suspensa depois do conteúdo esperado. |
| `no-message-rows-in-panel` | Não há linhas de mensagem no painel. |
| `message-rows-not-visible` | Há linhas, mas nenhuma visível. |
| `no-bot-nodes-in-panel` | Não há `bot-message-content`. |
| `bot-nodes-have-no-visible-chars` | Há nó de bot, mas nenhum texto visível. |

`dossier-content` vazio não comprova renderização. A prova visual principal é `bot-message-content` visível com texto.

## Recovery pós-waterfall

A recuperação combina três camadas:

| Camada | Delay | Ação |
| --- | --- | --- |
| `PostCompletion` | `0`, `100`, `500`, `1000`, `3000`, `10000` ms | Captura overlay, bot, composer, scroller, painel branco e geração waterfall. |
| `BlankPanel` no `ChatInterface` | `750`, `2000`, `5000`, `9000` ms | Reporta para diagnósticos/Sentry e pode ativar fallback estático. |
| Watchdog pós-waterfall | `2000` ms | Para dossiê grande, força static fallback se o DOM ainda está preso em placeholder/suspensão. |

`MessageTimeline` também tem safety net específico para `messages-static-fallback`: se o elemento montar com `computedStyle.display === 'none'`, o recovery limpa `style.display`; se continuar `none`, aplica `display: block !important` e emite `static-fallback-display-recovery`.

<Note>
A origem do `display:none` no fallback estático foi mitigada, mas não identificada. Preserve a safety net até existir causa raiz confirmada e validação visual em preview/produção.
</Note>

## Testids críticos

| Testid | Responsabilidade |
| --- | --- |
| `chat-main-panel` | Região central avaliada por snapshots e E2E. |
| `loading-smart-overlay` | Overlay hero fullscreen. Não pode persistir com `isLoading=false`. |
| `loading-stop-button` | Botão de interrupção do overlay; escondido no finalize pós-waterfall. |
| `messages-static-fallback` | Timeline não virtualizada para dossiês grandes ou recovery. |
| `messages-viewport-suspended` | Estado transitório durante hero loading sem bot renderizável. |
| `messages-viewport-placeholder` | Placeholder da viewport antes do Virtuoso ficar pronto. |
| `message-row` | Linha renderizada da timeline. |
| `bot-message-content` | Prova principal de resposta visível; expõe `data-text-length`. |
| `hero-loading-inline-fallback` | Linha fallback quando preview hero aparece dentro da timeline. |
| `empty-state` | Fallback controlado para sessão ativa sem conteúdo renderizável. |
| `error-message-card` | Falha de investigação renderizada como erro controlado no chat. |
| `controlled-error` | Boundary do shell do chat. |
| `message-input` e `chat-input` | Acessibilidade do composer durante e após loading/falha. |

## Validação recomendada

<CodeGroup>

```bash title="Gates principais"
npm run typecheck
npm test
npm run build
```

```bash title="Regressões visuais de loading"
npm run test:e2e:loading
npm run test:e2e:blank
npm run test:e2e:errors
npx playwright test tests-e2e/scheffer-cnpj-blank-panel.spec.ts
```

</CodeGroup>

Critérios mínimos para fechar uma mudança nesse contrato:

- `loading-smart-overlay` aparece no início do hero loading e desaparece antes do estado final.
- `chat-main-panel` permanece visível.
- `messages-viewport-placeholder` e `messages-viewport-suspended` somem após o waterfall.
- O último `bot-message-content` fica visível, tem texto esperado e `data-text-length` acima do mínimo do teste.
- O composer continua acessível por `message-input` ou `chat-input`.
- Falha de API renderiza `error-message-card`, sem overlay infinito.
- Dossiê grande usa `messages-static-fallback` ou Virtuoso funcional; nunca painel branco.

## Operação e depuração

<Steps>
<Step title="Confirme o estado pretendido">
Verifique `isLoading`, `loadingVariant`, `panelState`, `expectedBotCharsMax`, `shouldSuspendVirtualizedList` e `forceStaticTimelineFallback`.
</Step>

<Step title="Confirme o DOM real">
Inspecione `chat-main-panel`, `loading-smart-overlay`, `messages-static-fallback`, `messages-viewport-placeholder`, `messages-viewport-suspended` e o último `bot-message-content`.
</Step>

<Step title="Cruze telemetria pós-waterfall">
Procure `WaterfallLifecycle/ui-finalized`, `WaterfallLifecycle/ui-finalize-post-render`, `PostCompletion/check:10000ms`, `BlankPanel/blank-panel-detected`, `SpinnerStuck/post-waterfall-watchdog` e `Virtuoso/static-fallback-display-recovery`.
</Step>

<Step title="Valide a intenção do fluxo">
A validação só passa quando o operador vê conteúdo, erro controlado ou empty state legítimo. Persistência no banco, callback de render ou check verde isolado não fecha regressão visual.
</Step>
</Steps>

## Related pages

<CardGroup>
<Card title="Waterfall de dossiê" href="/dossie-waterfall">
Pipeline que dispara, finaliza e entrega o conteúdo para a UI.
</Card>
<Card title="Depurar painel branco" href="/depurar-painel-branco">
Procedimento focado em overlay travado, fallback invisível e sinais `PostCompletion`.
</Card>
<Card title="Contratos de UI" href="/ui-contracts-reference">
Matriz de estados e seletores estáveis para regressões de interface.
</Card>
<Card title="Observabilidade e diagnósticos" href="/observabilidade">
Eventos, traces e fontes operacionais usados para investigar stuck states.
</Card>
</CardGroup>

## Related pages

- page-depurar-painel-branco
- page-ui-contracts-reference


## Source files

- `components/LoadingSmart.tsx`
- `components/chat/MessageTimeline.tsx`
- `components/ChatInterface.tsx`
- `utils/loadingStatus.ts`
- `utils/blankPanelTelemetry.ts`
- `docs/ai-context/refactor/loading-panel-contract.md`
- `tests-e2e/loading-smart-recovery.spec.ts`
