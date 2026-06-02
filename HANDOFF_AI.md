# Handoff — [NOVO-APP] — 02/06/2026 — PR #328: Tela Branca Pos-Waterfall

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
