# Handoff — NOVO-APP — 01/06/2026 — Waterfall fixado, PRs #321 e #322 mergeados

## Estado Atual

- **Branch:** `main` (commit `0370a5ec`)
- **Origin/main:** `0370a5ec` (sync ok)
- **PRs abertas:** Nenhuma
- **Working tree:** doc changes pendentes (unstaged) + 2 untracked (`.superpowers/`, `utils/promptLeakShield.ts`)
- **Waterfall:** Completo e renderizando corretamente. Minor UX issues em stage transitions — nao bloqueantes.

## O que foi concluido

### PR #321 — WaterfallGuard + Diagnostics (7aca0032, +674/-435)

- `features/dossier/waterfall-guard.ts` (NEW): floodgate global `Map<sessionId, WaterfallGuardState>` + `globalActiveRunId` que permite apenas 1 waterfall por vez em todo o app. Cooldown de 5s apos conclusao.
- `features/dossier/waterfall-orchestrator.ts`: `registerWaterfallStart()` no topo, `registerWaterfallEnd()` no finally, `WaterfallLifecycle` diagnostics em cada etapa pos-modulo.
- `features/chat/message-orchestrator.ts`: `PostCompletion` com restart detection via `generationCount` baseline vs atual. `cleanupPostCompletion` migrado de `let` para `useRef`.

### PR #322 — Final Fixes (0370a5ec, +81/-28, 6 arquivos)

- **Root Cause descoberto:** `React.StrictMode` estava ativo em producao (`index.tsx`), causando double-invocation de renders que disparava multiplos `processMessage`.
- **Re-entry guard em `processMessage`:** `isAnyWaterfallActive()` check ANTES de `setIsLoading(true)`. Se houver waterfall ativo, retorna imediatamente.
- **`loadingVariant` reset:** `completeLoadingProgress()` em `loading-progress.ts` agora reseta `loadingVariant` para `undefined` ao concluir.
- **Guard block propagation:** `processMessage` passou a comparar `generationBefore/After` para evitar `dossier_completed` falso.
- **`callerStack` diagnostic:** `processMessage:start` loga stack trace da chamada no `scoutDiag`, confirmando que o waterfall era disparado pelo scheduler do React, nao por cliques do usuario.
- **`messages-state-after-update` diagnostic:** verifica persistencia real da mensagem bot apos update.
- **Code review fixes:** `completeLoadingProgress` condicional (so executa se `waterfallRan`), tipo `loadingVariant` em `VisibilityState`.

## Arquivos alterados

| Arquivo | Mudanca | PR |
|---------|---------|----|
| `features/dossier/waterfall-guard.ts` | Novo — floodgate global anti-concorrencia | #321 |
| `features/dossier/waterfall-orchestrator.ts` | Guard integration + diagnostics + guard propagation | #321, #322 |
| `features/chat/message-orchestrator.ts` | PostCompletion restart detection + useRef + re-entry guard + callerStack | #321, #322 |
| `features/chat/loading-progress.ts` | completeLoadingProgress reset loadingVariant + conditional | #322 |
| `index.tsx` | React.StrictMode removido de producao | #322 |
| `utils/diagnosticLog.ts` | Ajuste menor | #322 |

## Root Cause (documentado)

O restart loop era causado por `React.StrictMode` ativo em producao. StrictMode invoca renders duas vezes intencionalmente (para detectar side effects), o que disparava `processMessage` multiplas vezes. Cada chamada criava uma nova sessao de waterfall e setava `isLoading=true`, deixando a UI travada.

O `callerStack` diagnostic no `processMessage:start` confirmou que a origem era o scheduler do React, nao acao do usuario.

O WaterfallGuard (`isAnyWaterfallActive`) + re-entry guard (`activeGenerationRef`) agora impedem waterfalls concorrentes mesmo sem StrictMode.

## Riscos Tecnicos Residuais

1. **P0 withTimeout (api/gemini.ts:416, :491):** AbortController cria signal mas nao propaga para `chat.sendMessage()`. Documentado, nao corrigido.
2. **Branch `feat/crm-supabase-migration`:** Stashed, precisa decidir (retomar ou descartar).
3. **1 falha pre-existente:** Teste `warRoomService` — nao relacionada ao waterfall.
4. **Minor UX transitions:** Stage transitions no waterfall podiam ser mais suaves — nao bloqueante.

## Proximo Passo

1. Deletar branches residuais do restart-loop (3 branches locais: `fix/waterfall-95pct-restart-loop`, `fix/waterfall-postcompletion-restart-loop`, `fix/waterfall-restart-loop-v2`)
2. Decidir sobre `feat/crm-supabase-migration` stashed
3. Corrigir P0 withTimeout quando houver janela

## Links

- **PR #321:** `7aca0032` — WaterfallGuard (floodgate + restart detection + diagnostics)
- **PR #322:** `0370a5ec` — 5 correcoes (StrictMode, re-entry guard, callerStack, loadingVariant)
- **WaterfallGuard:** `features/dossier/waterfall-guard.ts`
- **Orchestrator:** `features/dossier/waterfall-orchestrator.ts`
- **PostCompletion:** `features/chat/message-orchestrator.ts`
