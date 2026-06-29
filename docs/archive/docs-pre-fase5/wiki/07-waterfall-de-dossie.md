---
grok_wiki: true
page_id: 'page-dossie-waterfall'
title: 'Waterfall de dossiê'
description: 'Pipeline modular de dossiê, módulos obrigatórios e opcionais, timeouts, guard anti-restart, reconciliação PORTA e finalização de UI.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'features/dossier/waterfall-orchestrator.ts'
  - 'features/dossier/waterfall-guard.ts'
  - 'features/dossier/benchmark-stage.ts'
  - 'features/dossier/porta-reconciliation.ts'
  - 'services/gemini/investigation-orchestration.ts'
  - 'constants/loadingStages.ts'
  - 'tests/features/dossier/waterfall-orchestrator.test.ts'
---

O waterfall de dossiê é executado pela fronteira `useDossierWaterfallOrchestrator`, acionada pelo orquestrador de mensagens quando a entrada normalizada contém `DOSSIE COMPLETO` fora do modo `deep_dive`. O fluxo gera blocos especializados, consolida Score PORTA, promove fontes verificadas, atualiza a mensagem de bot e força a finalização visual do loading no `finally`.

## Superfície de execução

| Superfície                                   | Papel                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `App.tsx`                                    | Instancia `useDossierWaterfallOrchestrator({ canUseLookup, resolvedOperatorName })`.                              |
| `features/chat/message-orchestrator.ts`      | Detecta megaprompt, cria placeholder `isThinking`, rastreia eventos de operador e chama `runMegaPromptWaterfall`. |
| `features/dossier/waterfall-orchestrator.ts` | Executa módulos, timeouts, fontes, PORTA, persistência e finalização de UI.                                       |
| `features/dossier/waterfall-guard.ts`        | Bloqueia restart simultâneo por sessão e globalmente.                                                             |
| `features/dossier/porta-reconciliation.ts`   | Reexecuta módulos donos de dimensões PORTA ausentes e aciona reconciliador final.                                 |
| `utils/finalizeWaterfallUI.ts`               | Zera loading React, refs e seletores DOM de overlay após conclusão ou falha do waterfall.                         |

### Entrada pública

`runMegaPromptWaterfall` recebe o contrato `RunMegaPromptWaterfallArgs`.

| Campo                                              | Tipo             | Uso                                                         |
| -------------------------------------------------- | ---------------- | ----------------------------------------------------------- |
| `sessionId`                                        | `string`         | Chave do guard, updates de sessão, logs e persistência.     |
| `text`                                             | `string`         | Prompt completo oculto usado como seed cadastral/radar.     |
| `safeVisibleText`                                  | `string`         | Texto visível usado no histórico das perguntas finais.      |
| `hintedCompany`                                    | `string \| null` | Empresa inferida antes da normalização.                     |
| `normalizedCompany`                                | `string`         | Empresa final para lookup, módulos e payload persistido.    |
| `historyToPass`                                    | `Message[]`      | Histórico entregue à geração de continuidade.               |
| `botMessageId`                                     | `string`         | Placeholder que será substituído pelo dossiê final.         |
| `signal`                                           | `AbortSignal`    | Cancelamento terminal do waterfall.                         |
| `isFirstInteraction`                               | `boolean`        | Define reset simples ou incremental da timeline de loading. |
| `sessionCnpjDigits`                                | `string`         | CNPJ normalizado para QSA, contexto e tracking.             |
| `operatorId`, `operatorEmail`, `operatorSessionId` | opcionais        | Repasse para tracking de custo e geração.                   |

## Fluxo runtime

```text
Mensagem "Dossiê completo"
  -> MessageOrchestrator cria bot placeholder
  -> WaterfallGuard registra runId
  -> contexto estático: seed + lookup Senior + evidência Senior + pesquisa Teia
  -> cache foundation opcional
  -> módulos obrigatórios e opcionais
  -> benchmark opcional
  -> reconciliação PORTA
  -> limpeza de markers, privacidade, fontes e markdown final
  -> sugestões de continuidade
  -> updateSessionById + fallback via sessionsRef
  -> saveDossier fire-and-forget
  -> registerWaterfallEnd
  -> finalizeWaterfallUI
```

<Note>
A persistência em Supabase não é pré-condição para a UI. O dossiê final entra primeiro no estado React; `storage.saveDossier` roda em fire-and-forget e só dispara `dossier:completed` quando conclui com sucesso.
</Note>

## Etapas modulares

O total declarado do loading modular é `7`. As labels vêm de `MODULAR_DOSSIER_STAGES` e a etapa final de consolidação usa `MODULAR_DOSSIER_CONSOLIDATION_STAGE`.

| Ordem        | Label de loading                                   | Módulo ou operação                                                                           | Obrigatório         | Timeout                                 |
| ------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------- |
| 1            | `Mapeando conta real e teia societária...`         | `Teia Societaria — Identidade`; fallback para `Porte / Teia Societária` se identidade falhar | Sim                 | `90_000ms`                              |
| 1b           | Avança para operação/profundidade quando aplicável | `Teia Societaria — Profundidade` se complexidade `MEDIA` ou `ALTA`                           | Não                 | `90_000ms`                              |
| 2            | `Mapeando operação e cadeia de valor...`           | `Operação / Cadeia de Valor`                                                                 | Sim                 | `90_000ms`                              |
| 3            | `Identificando bordas de controle...`              | `Bordas de Controle`                                                                         | Não                 | `60_000ms`                              |
| 4            | `Verificando pressões e compliance...`             | `Riscos & Compliance`                                                                        | Não                 | `60_000ms`                              |
| 5            | `Mapeando caminho de venda...`                     | `Caminho de Venda`                                                                           | Não                 | `60_000ms`                              |
| 6            | `Cruzando referências de mercado...`               | `runDossierBenchmarkStage`                                                                   | Não                 | `20_000ms`                              |
| 7            | `Finalizando cards de auditoria...`                | Preparação para reconciliação e finalização                                                  | Sim para UI         | Controlado pelas fases seguintes        |
| Consolidação | `Consolidando informações...`                      | PORTA, fontes, markdown, sugestões e update final                                            | Sim para fechamento | PORTA `120_000ms`; sugestões `20_000ms` |

Módulos opcionais que falham entram em `optionalStepFailures`, incrementam `failureCount` e não derrubam a rodada. Ao final, o texto recebe uma nota operacional com as frentes não concluídas. Módulos obrigatórios e aborts propagam erro.

## Contexto e cache foundation

Antes dos módulos, o orquestrador monta:

- `dossierSeedContext` a partir de `Contexto cadastral obrigatório:` e `<radar_context>`.
- `waterfallLookupContext` via `lookupCliente` quando `canUseLookup` está ativo.
- `seniorEvidenceContext` com restrições de evidência Senior.
- `teiaResearchContext` com QSA oficial via CNPJ, concorrentes regionais e estado PORTA.

Quando `VITE_GEMINI_FOUNDATION_CACHE_ENABLED=1`, o frontend tenta criar um cache foundation com TTL `600s`. O servidor também precisa de `GEMINI_FOUNDATION_CACHE_ENABLED=1`; sem a flag server, a API rejeita criação de cache. Falha de criação registra `warn` e o waterfall continua sem cache.

| Configuração                             | Camada        | Efeito                                                                                 |
| ---------------------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| `VITE_GEMINI_FOUNDATION_CACHE_ENABLED=1` | Vite/frontend | Permite que o waterfall tente criar e reutilizar `foundationCacheName`.                |
| `GEMINI_FOUNDATION_CACHE_ENABLED=1`      | API Vercel    | Habilita actions de create/delete do cache.                                            |
| TTL `600s`                               | API/cache     | Dá margem para módulos, teia e reconciliação PORTA; delete é best-effort no `finally`. |

A implementação atual usa a fachada `services/geminiService.ts`. Para manter portabilidade BYOK/BYOC, qualquer adaptação de provedor deve preservar o contrato de `generateDossierModule`: `signal`, `timeoutMs`, `useGrounding`, callbacks de fontes, status de verificação e `foundationCacheName` opcional.

## Guard anti-restart

`WaterfallGuard` mantém estado em memória por sessão e um lock global.

| Condição                                               | Resultado                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| Outro waterfall global ativo                           | Bloqueia com reason `already_running`.                             |
| Mesma sessão já tem `activeRunId`                      | Bloqueia com reason `already_running` e incrementa `blockedCount`. |
| Menos de `5_000ms` desde conclusão global ou da sessão | Bloqueia com reason `cooldown`.                                    |
| Run permitido                                          | Gera `runId` no formato `sessionId-genN-timestampBase36`.          |
| `registerWaterfallEnd` com run divergente              | Registra `warn` e não limpa o estado esperado.                     |

Quando o guard bloqueia, o placeholder de bot criado para aquela tentativa é removido da sessão. O `message-orchestrator` compara `generationCount` antes e depois para não registrar `dossier_completed` quando a execução foi barrada.

## Reconciliação PORTA

A primeira consolidação usa `resolvePortaScore(accumulatedText)`. Se dimensões faltam, `reconcileWaterfallPorta` segue três níveis:

1. Reexecuta módulos donos das dimensões faltantes:
   - `P` -> `Porte / Teia Societária`
   - `O` -> `Operação / Cadeia de Valor`
   - `R` -> `Riscos & Compliance`
   - `T` -> `Bordas de Controle`
   - `A` -> `Caminho de Venda`
2. Aciona `Reconciliação PORTA` para emitir apenas markers faltantes.
3. Reavalia o score consolidado.

Se todas as cinco dimensões continuam ausentes, o fluxo entra em `portaIntegrityHold`: o dossiê textual pode ser entregue, mas `scorePorta` fica ausente e `scoreOportunidade` anterior da sessão é preservado. Se a reconciliação falha ou estoura o timeout externo de `120_000ms`, o orquestrador continua com o texto acumulado, marca `porta-reconciliation` como falha opcional e mantém score nulo.

<Warning>
Não force um score quando `portaIntegrityHold` estiver ativo. O contrato atual prefere entregar o dossiê sem score a persistir um Score PORTA sem todas as dimensões mínimas.
</Warning>

## Fontes e verificação web

Cada módulo especializado pode retornar fontes de grounding. O waterfall deduplica URLs normalizadas, monta `sessionSourcePool` e calcula `webVerificationStatus`.

| Status              | Quando aparece                                                           |
| ------------------- | ------------------------------------------------------------------------ |
| `verified`          | Há fontes de grounding e nenhuma fonte de fallback domina.               |
| `fallback_verified` | Há fonte promovida por fallback ou status de módulo `fallback_verified`. |
| `unverified`        | Módulo com grounding não retornou fontes verificáveis.                   |
| `not_applicable`    | Não houve grounding nem sinal de fonte pendente.                         |

Após preparar o texto final, `validateInlineSourcesForPromotion` tenta promover links públicos inline via `POST /api/link-status`. Essa etapa é opcional e defensiva:

- Extrai no máximo `40` candidatos.
- Usa timeout total de `30_000ms`.
- Lê `response.text()` com timeout dedicado de `15_000ms`.
- Faz `JSON.parse` manual para lidar com body truncado.
- Retorna `[]` em timeout, HTTP não OK, JSON inválido, fetch ausente ou falta de candidatos.

Quando não há fontes no pool nem grounding, o dossiê recebe uma nota avisando que busca web/grounding ficou indisponível e que citações ficaram limitadas.

## Finalização de sessão e UI

O payload final remove markers PORTA com `stripPortaMarkers`, aplica privacidade, reforça evidência Senior, finaliza markdown auditável e atualiza o bot placeholder:

| Campo da mensagem de bot | Valor final                                                                      |
| ------------------------ | -------------------------------------------------------------------------------- |
| `text`                   | Markdown final do dossiê.                                                        |
| `scorePorta`             | Score consolidado, exceto em hold de integridade.                                |
| `clienteSeniorData`      | Dados extraídos do lookup Senior, quando disponíveis.                            |
| `groundingSources`       | Fontes verificadas ou fallback.                                                  |
| `webVerificationStatus`  | Status consolidado da rodada.                                                    |
| `groundingUsed`          | `true` para `verified` ou `fallback_verified`; indefinido para `not_applicable`. |
| `suggestions`            | Quatro perguntas finais, geradas ou preenchidas por fallback contextual.         |
| `isThinking`             | `false`.                                                                         |

Se `updateSessionById` não retorna uma sessão persistível ou não encontra `botMessageId`, o orquestrador tenta recuperar a sessão em `chatStore.sessionsRef.current` e reaplicar o update via `setSessions`. Essa recuperação existe para cobrir batching/race de React em primeira carga.

`finalizeWaterfallUI` roda no fechamento do waterfall permitido e zera:

- `setIsLoading(false)`
- `setLoadingVariant(undefined)`
- `completeLoadingProgress()`
- `setFailureCount(0)`
- `activeGenerationRef.current[sessionId]`
- DOM selectors `loading-smart-overlay`, `messages-viewport-suspended` e `loading-stop-button` por `requestAnimationFrame` duplo

O helper não limpa `abortController`; esse ownership fica no `processMessage:finally`.

## Observabilidade operacional

Logs úteis para investigar regressões:

| Área                 | Eventos importantes                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WaterfallGuard`     | `waterfall:start`, `waterfall:end`, floodgate por `already_running` ou `cooldown`.                                                                             |
| `WaterfallLifecycle` | `pre-benchmark`, `pos-benchmark`, `pre-porta-reconciliation`, `pos-porta-reconciliation`, `messages-state-after-update`, `health-check-final`, `ui-finalized`. |
| `FreezeDiag`         | Marcos de validação inline, pré/pós markdown e pré/pós continuidade.                                                                                           |
| `DossierModule`      | Início, conclusão, prompt elevado, `usage metadata`, status de fontes.                                                                                         |
| `FoundationCache`    | Criação, remoção e falha de remoção do cache.                                                                                                                  |
| `TeiaSocietaria`     | Falhas de QSA/contexto, ajuste de complexidade e warnings de validação CNPJ.                                                                                   |

`health-check-final` é o snapshot mais importante após o waterfall. Ele registra presença de sessão/ref, texto do bot, `isLoading`, `loadingVariant`, `domHasBotContent`, `domHasLoadingOverlay`, composer desabilitado e se o dossiê foi persistido em memória.

## Falhas comuns

| Sintoma                                     | Verificação                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Nova geração não começa                     | Procure `WaterfallGuard` com `already_running` ou `cooldown`; aguarde o cooldown de 5s ou confirme se há run global ativo.             |
| Etapa opcional some do dossiê               | Verifique `optionalStepFailures`; a nota operacional deve listar o módulo ignorado.                                                    |
| Score não aparece                           | Veja `portaIntegrityHold`, `missingDimensions` e logs `ModularDossier` de reconciliação. Score antigo da sessão deve ser preservado.   |
| Congelamento entre PORTA e sugestões        | Use `FreezeDiag` em `pre-validate-inline`, `post-validate-inline`, `pre-continuity-question` e timeout de continuidade.                |
| Dossiê salvo no estado, mas não no Supabase | Procure `falha ao persistir dossiê final; mantendo sessão em memória`; a UI não depende desse save.                                    |
| Overlay ou composer ficam presos            | Verifique `ui-finalize-state`, `ui-finalize-post-render`, `health-check-final` e os contratos de painel/loading.                       |
| Fontes desaparecem                          | Cheque `webVerificationStatus`, `/api/link-status`, timeouts de body read e se `finalizeDossierMarkdown` removeu links não auditáveis. |

## Validação

Use testes focados quando alterar módulos, timeouts, guard, PORTA, fontes ou finalização visual.

```bash title="Validação focada do waterfall"
npm run typecheck
npm test -- tests/features/dossier/waterfall-orchestrator.test.ts tests/features/dossier/porta-reconciliation.test.ts tests/features/validate-inline-sources-freeze-diag.test.ts
```

```bash title="Gates complementares"
npm run test:contracts
npm run test:e2e:blank
npm run test:e2e:errors
```

Se a mudança tocar prompts de investigação, rode também:

```bash title="Gate de prompts"
npm run validate:prompts
```

Para regressões de preview, validação local não substitui Vercel. O estado esperado depois de um dossiê grande é conteúdo visível no painel, ausência de overlay hero, composer habilitado e mensagem de bot com `isThinking=false`.

## Related pages

<CardGroup>
  <Card title="Score PORTA" href="/score-porta">
    Dimensões, markers, integridade e consolidação do score comercial.
  </Card>
  <Card title="Loading e estados visuais" href="/loading-estados-visuais">
    Contrato de overlay, timeline, fallback estático e recuperação pós-waterfall.
  </Card>
  <Card title="Depurar painel branco" href="/depurar-painel-branco">
    Procedimento para investigar painel vazio, `PostCompletion`, `FreezeDiag` e DOM final.
  </Card>
  <Card title="Proxy Gemini" href="/gemini-proxy-reference">
    Fachada de geração, grounding, cache foundation e timeouts de leitura de body.
  </Card>
  <Card title="Testes e gates" href="/testes-gates">
    Comandos npm, Vitest, Playwright e critérios por tipo de mudança.
  </Card>
</CardGroup>

## Source files

- `features/dossier/waterfall-orchestrator.ts`
- `features/dossier/waterfall-guard.ts`
- `features/dossier/benchmark-stage.ts`
- `features/dossier/porta-reconciliation.ts`
- `services/gemini/investigation-orchestration.ts`
- `constants/loadingStages.ts`
- `tests/features/dossier/waterfall-orchestrator.test.ts`
