## Handoff — 03/06/2026 — PR #330 (painel branco pós-waterfall)

| Item | Valor |
| --- | --- |
| PR | https://github.com/brunolimaff-jpg/NOVO-APP/pull/330 (**OPEN**) |
| Branch | `fix/blank-panel-static-fallback-post-waterfall` |
| Último push | Review bots: delay blank-panel `750ms` (sem `0ms`); E2E operador placeholder |

### O que a PR faz

- `expectedBotCharsMax` inclui preview `isThinking` (`utils/expectedBotContent.ts`).
- Fallback timeline estática proativa se bot ≥ 4.000 chars ao fim do loading hero.
- E2E Scheffer com stubs (`tests-e2e/scheffer-cnpj-blank-panel.spec.ts`).

### Evidência Supabase (sessão Scheffer)

- `session_id`: `eac8d331-dc3c-4f79-b438-31afe1130e94`
- Preview: `scoutagro-git-fix-blank-panel-61a9e6-…vercel.app`
- Gemini 500 em Bordas de Controle → retry PORTA OK; waterfall `completed`; `proactive-static-fallback` ~29k chars; **sem** `blank-panel-detected` em 7d
- Burst CNPJ sócios: `signal is aborted without reason` pós-dossiê (não coberto pela #330)

### Sentry

7d sem errors/logs para `scout-360` neste fluxo — telemetria principal: `scout_diagnostics`.

### Próxima sessão

1. Smoke manual Scheffer no preview pós-push.
2. Marcar threads GitHub resolvidas.
3. MERGE com token **MERGE** se aprovado.
4. Opcional PR separada: timer etapa (`loadingBackoff`), `SocietaryMap` deps CNAE.

---

## Handoff pós-merge — 03/06/2026 — PR #329 em `main`

| Item | Valor |
| --- | --- |
| PR | https://github.com/brunolimaff-jpg/NOVO-APP/pull/329 (**MERGED** squash) |
| Commit em `main` | `2cd2cffa` |
| Validação | Bruno validou no preview Vercel |
| Reviews | Gemini 3 threads resolvidas (`d642f868`); Qodo walkthrough = já-enderecado |
| Skill | `gh-resolve-pr-comments` atualizada para Gemini **e** Qodo |

**Em produção após deploy Vercel:** freeze hero (timeline suspensa, stop robusto, SocietaryMap adiado). Monitorar `dossier_completed` e ausência de freeze em Compliance.

**Próxima sessão:** P0 `withTimeout` em `api/gemini.ts`; P1 `documentExtractor.ts`; migration `supabase/migrations/20260603_blank_panel_observability.sql` se ainda não aplicada.

---


# Handoff — [NOVO-APP] — 03/06/2026 — PR #327: Socio-search + Observabilidade de Painel Branco

## Atualização 03/06/2026 — fixes estruturais PR #327 (teia + CNPJ + UX)

### O que foi corrigido

**Phase 1 — P0 CNPJ proxy (fecha tabela/CNAE)**
- `SocietaryMap.tsx`: substituído `lookupCnpj` (chamadas CORS diretas ao browser) por `fetchCompanyByCnpj` (proxy `/api/cnpj`) no enriquecimento CNAE. `AbortController` integrado; `CnpjResult` import removido.
- `lib/cnpjLookup.ts`: comentário server-only adicionado (`// SERVER-ONLY: browser callers MUST use fetchCompanyByCnpj`).
- Novo teste: `SocietaryMap.test.tsx` → "usa fetchCompanyByCnpj (proxy) para enriquecimento CNAE — nao chama brasilapi.com.br diretamente".

**Phase 2 — P0 Preview waterfall (fecha branco inicial)**
- `ChatInterface.tsx`: `hasRenderableBotMessage` agora trata bot com `text.trim().length >= 200` como renderizável **mesmo com `isThinking=true`**, liberando `shouldSuspendVirtualizedList=false` durante o waterfall.
- Constante `WATERFALL_PREVIEW_MIN_CHARS = 200` extraída com comentário linkando para `waterfall-orchestrator.ts`.
- Testes atualizados: `loadingVariant.test.ts` + `ChatInterface.test.tsx` com cenário de preview waterfall.

**Phase 3 — P1 Performance (reduz freeze pós-waterfall)**
- `SocietaryMap.tsx`: CNAE enrichment deferido com `requestIdleCallback` (fallback `setTimeout 0`) — não bloqueia main thread ao montar dossiê.
- `SocietaryMatrix.tsx`: prop `isEnrichingCnae` adicionada; skeleton pulse no cabeçalho CNAE + `⏳` nas linhas enquanto enriquecimento está em andamento.
- `MessageTimeline.tsx`: `virtuosoOverscan` reduzido de 1400 → 600 quando mensagem contém "teia societaria" (evita re-montar SocietaryMap ao rolar).

**Phase 4 — Regression guards verificados**
- `git diff main...HEAD -- features/dossier/waterfall-orchestrator.ts` → **diff vazio** (arquivo não alterado na PR).
- Todos os guards PR #328 intactos: `registerWaterfallStart`, `sessionToPersist`, `sig.aborted`, `isAbortLikeError`.

### Validação local (03/06/2026)

```bash
npm test -- tests/features/dossier/SocietaryMap.test.tsx tests/utils/loadingVariant.test.ts tests/components/ChatInterface.test.tsx tests/features/dossier/waterfall-orchestrator.test.ts
# Resultado: 65/65 passaram

npm run typecheck
# Resultado: 0 erros

npm run build
# Resultado: built in 14.96s, PWA ok, Sentry sourcemaps enviados
```

### Passos manuais necessários

1. **Migration Supabase** — `supabase/migrations/20260603_blank_panel_observability.sql` deve ser aplicada manualmente no projeto Supabase antes de validar queries `scout_diagnostics`. Não executar em produção sem aprovação do usuário.
2. **Validação preview** — após push da PR, verificar no Vercel preview:
   - Zero CORS `brasilapi.com.br` no console do browser
   - Tabela CNAE preenchida com skeleton durante carregamento
   - Timeline visível incrementalmente durante waterfall (não mais tela branca)
   - Query Supabase: `SELECT * FROM scout_diagnostics WHERE area='BlankPanel' ORDER BY created_at DESC LIMIT 10`

### Objetivo da Próxima Sessão

Validar preview Vercel da PR #327 com as correções estruturais; confirmar zero CORS e preview incremental no fluxo real (CNPJ Scheffer `04733767000180`).

---

## Atualizacao 03/06/2026 — PR #327

### Follow-up 03/06 — interromper pesquisa nao pode gerar historico nem relatorio

Evidencia real do preview: apos clicar em **Interromper** durante a pesquisa, a UI ainda podia deixar uma sessao parcial no sidebar com a mensagem "Investigando..." e, em outra rodada, o waterfall continuou ate consolidar e salvar/renderizar um relatorio completo mesmo apos o abort.

Mudancas aplicadas:

- `features/chat/message-orchestrator.ts`: se a primeira investigacao for abortada antes de resposta de bot, a sessao temporaria e removida e `currentSessionId` volta para `null`.
- `features/chat/session-controller.ts`: clicar em **Nova investigacao** durante loading agora cancela a geracao e volta para home, sem criar sessao vazia.
- `features/dossier/waterfall-orchestrator.ts`: abort agora interrompe as etapas finais do waterfall antes de benchmark, reconciliacao PORTA, consolidacao, `updateSessionById` e `saveDossier`. O antigo `break` no loop de modulos permitia seguir para consolidacao parcial.

Contrato de produto: **se o usuario interrompeu a pesquisa, nada deve nascer no historico e nenhum relatorio deve ser gerado**. A tela deve voltar para o estado inicial.

Validacao local deste follow-up:

```bash
npm test -- tests/features/dossier/waterfall-orchestrator.test.ts tests/features/chat/message-orchestrator.test.ts tests/features/chat/session-controller.test.ts tests/components/ChatInterface.test.tsx
npm run typecheck
npm run build
```

Resultado no worktree da PR: unit/focused tests 62/62 passaram, typecheck OK, build Vite concluiu e sourcemaps foram enviados ao Sentry (`s-3j/scout-360`, release `v1.0.0`).

### O que mudou

- PR #327 continua na branch `refactor/socio-search-decompose`, agora com rastreio permanente para a regressão de tela branca.
- Adicionado `utils/blankPanelTelemetry.ts`: mede o DOM do `chat-main-panel` e dispara `BlankPanel/blank-panel-detected` quando há sessão ativa com bot final esperado, mas sem conteúdo de bot visível.
- Sentry agora recebe `captureMessage('Scout360 blank panel detected')` com tags `area`, `source`, `reason`, `session_id` e contexto `blank_panel`.
- `serverDiagnostics` passa a preservar métricas numéricas/booleanas seguras (`bodyLen`, `botTextMaxLen`, `mainPanelChars`, alturas, contagens), sem liberar strings de prompt/response/body/text/content.
- Migration Supabase `20260603_blank_panel_observability.sql` aplicada no projeto `vmqfcaoirjcfucvlnpig`, com índices em `scout_diagnostics` por sessão, área/evento, operador e índice parcial `BlankPanel`.
- E2E de painel branco/loading agora usa dossiê determinístico longo e exige `bot-message-content` visível, `data-text-length > 30000`, dimensões reais e ausência de placeholder/suspensão/erro/empty-state.

### Follow-up 03/06 — tela branca ainda ativa no preview

Nova evidência real do preview mostrou `messageCount=2`, `botMessageUpdated=true`, `waterfallFinalTextLen≈30k`, `panelState='content'`, `Virtuoso itemsRendered { firstIndex: 0, lastIndex: 1 }`, mas o painel central continuava visualmente branco. A assinatura indica que o estado e a virtualização reportavam sucesso, porém o DOM do conteúdo de bot não materializava.

Mudança aplicada: `ChatInterface` agora ativa `forceStaticTimelineFallback` quando há bot final esperado e o snapshot do painel não encontra nós/linhas de bot visíveis. `MessageTimeline` recebe essa flag e renderiza uma lista estática com `MessageRow`, pulando o Virtuoso apenas nesse caso anômalo. O fallback é resetado ao trocar sessão, voltar para loading, home ou suspensão.

Contrato novo: não confiar em `Virtuoso rangeChanged/itemsRendered` como prova de render. A prova de recuperação é `messages-static-fallback` ou `bot-message-content` visível no `chat-main-panel`.

### Evidencia local

```bash
npm run typecheck
npm test -- tests/utils/blankPanelTelemetry.test.ts tests/utils/serverDiagnostics.test.ts tests/contracts/supabaseMigrations.contract.test.ts tests/components/ChatInterface.test.tsx tests/components/chat/MessageTimeline.test.tsx tests/components/MessageRow.test.tsx tests/features/chat/message-orchestrator.test.ts
npm test -- tests/api-socio-search.test.ts tests/features/dossier/SocietaryMap.test.tsx
npm test -- tests/features/dossier/waterfall-orchestrator.test.ts tests/stores/chatStore.test.tsx tests/features/chat/message-orchestrator.test.ts
npm run test:e2e:blank
npm run test:e2e:loading
npm run build
```

Resultado: todos passaram. Build enviou sourcemaps para Sentry (`s-3j/scout-360`, release `v1.0.0`).

Evidência adicional do follow-up:

```bash
npm test -- tests/components/ChatInterface.test.tsx tests/components/chat/MessageTimeline.test.tsx tests/utils/blankPanelTelemetry.test.ts
npm run test:e2e:blank
npm run test:e2e:loading
```

Resultado: todos passaram; `blank-center-panel-regression` 3/3 e `loading-smart-recovery` 3/3.

### Como investigar se voltar a tela branca

1. Sentry: procurar mensagem `Scout360 blank panel detected`.
2. Supabase: consultar `scout_diagnostics` com `area = 'BlankPanel'` ou `session_id = <id_da_sessao>`.
3. Campos chave: `reason`, `rowCount`, `visibleRowCount`, `botNodeCount`, `visibleBotWithCharsCount`, `botCharsMax`, `mainPanelChars`, `panelRect`, `scrollerHeight`, `centerElementTestId`.
4. Não aceitar como evidência suficiente: dossiê salvo no Supabase, `document.body.textContent`, item no histórico/sidebar, `dossier-content` isolado ou `message-row` estrutural.

### LocalStorage

- Não foi removido nesta mudança porque a evidência atual não aponta `localStorage` como causa raiz: o dossiê real já estava no Supabase com mensagens finais e transientes limpos.
- Próxima limpeza possível: retirar fallback legado `scout360_sessions_v1` de `useSessionStorage` em uma PR separada, com migração/rollback próprios.

## Objetivo da Proxima Sessao

- **Validar novo CI remoto da PR #328** apos o follow-up de sessao orfa e confirmar que `Tests`, `Typecheck`, `Build` e `E2E Critical Browser` passam
- **Monitorar preview/Supabase diagnostics**: fluxo normal nao deve emitir `session-recovered-via-ref`; se houver clique/disparo duplicado inicial, deve aparecer `envio inicial duplicado bloqueado` e a sessao ativa deve continuar a mesma
- **Fechar PR #327** — socio-search decomposto, testes passando, typecheck limpo
- **Decompor 3 god modules restantes**: documentExtractor.ts (P1, 533L), textCleaners.ts (P2, 630L), clientLookupService.ts (P2, 741L)
- **P0 withTimeout** (api/gemini.ts:416, :491) — ainda nao corrigido

## Estado Atual

- **Branch:** `fix/waterfall-session-persist-race-condition` (PR #328)
- **PR #328:** **ABERTA** (https://github.com/brunolimaff-jpg/NOVO-APP/pull/328) — causa raiz primaria + sessao orfa por disparo duplicado corrigidas localmente, aguardando novo CI remoto/preview antes de merge
- **PR #327:** **ABERTA** (https://github.com/brunolimaff-jpg/NOVO-APP/pull/327) — mergeavel sem conflitos
- **PR #326:** **MERGEADA** em 01/06 (`7362af16`)
- **Testes:** 148 files, 1289 passando; E2E critico 9/9 passando localmente
- **Typecheck:** limpo (0 erros), Build: OK; CI novo `E2E Critical Browser`

## O que foi feito (PR #328 — 6 commits, 17 arquivos)

### Problema

Tela branca apos waterfall. O `updateSessionById` perde a sessao por React batching/race condition. O `sessionToPersist` fica null e o dossie nao renderiza.

### Arquivos alterados

| Arquivo                          | Mudanca                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `waterfall-orchestrator.ts`      | Fallback sessionsRef (Cenarios A+B), 10 diagnosticos, health-check, fire-and-forget timeout |
| `message-orchestrator.ts`        | Diagnostico PF4 (erro pulado por mismatch)                                                  |
| `App.tsx`                        | Diagnostico PF5 (aborto pelo usuario)                                                       |
| `chatStore.tsx`                  | Diagnostico PF10 (currentSession null com geracao ativa)                                    |
| `useAppInitialization.ts`        | Merge funcional `prev => merge(loaded, prev)`                                               |
| `session-controller.ts`          | `setSessions(newSessions)` vira `prev => prev.filter(...)`                                  |
| `useSessionStorage.ts`           | sessionsRef sync inline (render-phase, remove useEffect)                                    |
| `ChatInterface.tsx`              | Remove DossierShareBar, listener dossier:completed, estado completedDossier                 |
| `waterfall-orchestrator.test.ts` | 4 novos testes de fallback (Cenario A, B, ambos vazios, dossier:completed)                  |
| `session-controller.test.ts`     | Atualizado para merge funcional                                                             |
| `useAppInitialization.test.ts`   | 2 novos testes de merge                                                                     |

## Follow-up 02/06 — causa raiz primaria corrigida localmente

### Mudanca principal

O fluxo primario deixou de depender de side effects dentro de `setSessions`. Agora `setSessions` sincroniza `sessionsRef.current` antes de agendar o estado React, `updateSessionById` retorna a sessao atualizada de forma sincrona, e o waterfall usa esse retorno para persistir/renderizar o bot final. Isso transforma o fallback `sessionsRef` em airbag real, nao caminho normal.

### Arquivos novos/alterados neste follow-up

| Arquivo                                      | Mudanca                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `hooks/useSessionStorage.ts`                 | Wrapper `setSessions` sincroniza `sessionsRef.current` imediatamente    |
| `stores/chatStore.tsx`                       | `updateSessionById` retorna `ChatSession \| null` e atualiza a ref       |
| `waterfall-orchestrator.ts`                  | Usa retorno de `updateSessionById` como `sessionToPersist` primario      |
| `message-orchestrator.ts`                    | Limpa `activeGenerationRef` no `finally` para nao bloquear novo envio    |
| `tests-e2e/helpers/*`                        | Onboarding e Gemini stubs deterministicos para E2E critico              |
| `tests-e2e/*blank/errors/loading*.spec.ts`   | Fluxos criticos passam pelo onboarding atual e testid real do overlay    |
| `.github/workflows/ci.yml`                   | Novo job `E2E Critical Browser` em PR/push main                         |

### Validacao local

```bash
npm run typecheck
npm run test
npm run build
npx playwright test tests-e2e/blank-center-panel-regression.spec.ts tests-e2e/controlled-error-state.spec.ts tests-e2e/loading-smart-recovery.spec.ts
```

Resultado local: typecheck OK, build OK, 148 arquivos/1289 testes Vitest OK, E2E critico 9/9 OK.

## Follow-up 02/06 — sessao orfa por disparo inicial duplicado

### Evidencia do preview

Console real do preview (02/06 16:18 BRT, Grupo Scheffer):

- `WaterfallGuard waterfall:end status completed`
- `messages-state-after-update { messageCount: 2, botMessageUpdated: true }`
- `PostCompletion containsDossie: true`
- `Virtuoso totalItems: 1`
- sidebar com dois historicos: um dossie finalizado (`Scheffer`) e uma sessao ativa presa no placeholder (`Grupo Scheffer`)

Conclusao: o dossie nao estava sumindo. Uma segunda chamada inicial criava outra sessao antes do re-render aplicar `currentSessionId`; essa segunda chamada era bloqueada pelo waterfall global, mas ja tinha inserido a mensagem de usuario e selecionado a sessao orfa.

### Mudanca

`features/chat/message-orchestrator.ts` agora mantem `pendingInitialSendRef`. Enquanto a primeira investigacao inicial esta em andamento, uma nova chamada inicial apenas re-seleciona a sessao pendente e sai, sem criar outra sessao nem adicionar mensagem de usuario orfa. Tambem bloqueia criacao de sessao inicial quando ja existe waterfall global ativo sem sessao pendente local.

### Validacao local

```bash
npm test -- tests/features/chat/message-orchestrator.test.ts
npm run typecheck
npm test -- tests/components/ChatInterface.test.tsx tests/App.loadingVariant.test.tsx tests/features/chat/message-orchestrator.test.ts
npm test
npm run build
```

Resultado local: teste novo falhou antes do fix com `currentSessionId` virando `session-second`; apos o fix, 10/10 testes do orchestrator passaram, typecheck OK, 32 testes focados de chat/app/render OK, suite completa Vitest 148 arquivos/1290 testes OK e build OK com sourcemaps enviados ao Sentry.

### Status anterior — fallback salvava, causa raiz ainda aberta

Console real do preview Vercel (02/06 15:30 BRT, Scheffer 04.733.767/0001-80):

```
⚠ sessionToPersist VAZIO após updateSessionById
  sessionToPersistIsNull: true
  originalMsgCount: -1          ← callback NUNCA rodou
  persistMsgCount: 0
  persistBotUpdated: false
  waterfallFinalTextLen: 29724  ← dossiê foi gerado com sucesso
  botMessageId: b55bc971-ca9f-41d8-bf2e-805a4099cb32
→ session-recovered-via-ref (recoveredMsgCount: 2, sessionsSnapshotLen: 1)
→ health-check-final (sessionFoundInRef: true, botMsgFound: true, botMsgTextLen: 29724, ...)
→ Virtuoso renderizou 2 itens
→ Dossiê visível na UI (via fallback)
```

O diagnostico acima foi a pista decisiva: a sessao existia na ref e o Supabase persistia o dossie, mas o fluxo primario lia `sessionToPersist` a partir de um callback de estado React. O fix atual remove essa dependencia.

### Decisoes Tecnicas

1. **Fallback sessionsRef como airbag**: sessionsRef e sincrona e sempre tem o valor mais recente. Sync em render-phase (nao useEffect).
2. **Merge funcional em setSessions**: `prev => merge(loaded, prev)` em vez de `() => loaded` — preserva sessions existentes.
3. **Remover DossierShareBar**: banner "Dossie concluido" era codigo morto. ChatInterface simplificado.

## God Modules Pendentes

| Prioridade | Arquivo                            | Linhas | Status                     |
| ---------- | ---------------------------------- | ------ | -------------------------- |
| P1         | utils/documentExtractor.ts         | 533    | Pendente                   |
| P2         | utils/textCleaners.ts              | 630    | Pendente (34 consumidores) |
| P2         | services/clientLookupService.ts    | 741    | Pendente                   |
| P3         | components/SectionalBotMessage.tsx | 523    | Pendente                   |

## Riscos Tecnicos Residuais

1. **Validacao remota pendente**: localmente corrigido; ainda precisa confirmar CI remoto e preview da PR #328.
2. **P0 withTimeout (api/gemini.ts:416, :491)**: AbortController cria signal mas nao propaga. Documentado, nao corrigido.
3. **3 god modules restantes**: risco de merge conflict se outro PR mexer nos mesmos arquivos.
4. **Branch `feat/crm-supabase-migration` stashed**: ainda nao decidido (retomar ou descartar).

## Licoes Aprendidas

| #   | Licao                                                           | Anti-padrao                                           | Onde aplicar                                 |
| --- | --------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| 1   | Merge funcional previne perda de sessao na inicializacao        | `setSessions(() => data)` sobrescreve estado anterior | Toda chamada a setSessions que carrega dados |
| 2   | sessionsRef sync em render-phase e mais confiavel que useEffect | Sync em useEffect tem delay de 1 frame                | Hooks que precisam de ref sincrona           |
| 3   | Fallback como airbag: renderiza mesmo se fluxo primario falha   | Assumir que updateSessionById sempre funciona         | Todo ponto de falha critico merece fallback  |
| 4   | 10 diagnosticos revelaram exatamente onde o bug acontece        | Debug sem log = cego                                  | Todo bug P0 merece diagnostic pack           |
| 5   | Nao ler resultado final de callback de setState React           | Side effect dentro de updater para persistir fluxo    | Retornar snapshot sincronico de helpers      |
| 6   | E2E de CI deve ser deterministico                               | Usar Gemini real para regressao de loading            | Stub de `/api/gemini` em testes criticos     |
| 7   | Disparo inicial duplicado deve reaproveitar sessao pendente     | Criar nova sessao antes do re-render do currentSessionId | `handleSendMessage`/fluxos de primeira investigacao |

## Links

- **PR #328:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/328 (ABERTA)
- **PR #327:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/327 (ABERTA)
- **PR #326:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/326 (MERGEADA)
- **Vault:** `20-SESSOES/2026-06/2026-06-02T14-45-00-PR328-tela-branca-waterfall-fix.md`
- **Commits PR #328:** `dee6557c` (fallback inicial), `7ef4dbb4` (10 diagnosticos + health-check), `1f0c09b7` (4 testes), `44951b6b` (merge funcional), `ca0c5b59` (testes merge), `1a5100a9` (remove DossierShareBar), `82bc27bb` (snapshot sincrono + CI E2E critico), follow-up atual (sessao orfa por disparo duplicado)
