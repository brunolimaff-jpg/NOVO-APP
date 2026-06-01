# Active Context

Last updated: 2026-06-01 — Waterfall fixado, PRs #321 e #322 mergeados em main

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`

## Fase atual

**Waterfall de dossie completo e renderizando corretamente.**

O restart loop do waterfall foi eliminado com duas frentes:
- **PR #321 (WaterfallGuard):** Floodgate global `Map<sessionId, WaterfallGuardState>` + `globalActiveRunId` que impede waterfalls concorrentes. Diagnostico no Supabase via `scoutDiag.warn` com `generationCount`, `blockedCount`, timestamps.
- **PR #322 (Final Fixes):** `React.StrictMode` removido de producao (causa raiz do restart loop). Re-entry guard em `processMessage` (checa `isAnyWaterfallActive()` antes de `setIsLoading(true)`). `callerStack` diagnostic confirma origem React scheduler. `loadingVariant` resetado no `completeLoadingProgress`.

### Diagnostico: callerStack

O `processMessage:start` agora loga um `callerStack` no `scoutDiag`, revelando quem chamou o waterfall. O diagnostic confirmou que a origem era o scheduler interno do React (re-render induzido por StrictMode), nao acao do usuario.

### Licoes criticas

1. `React.StrictMode` duplica invocacoes de render em producao se configurado errado — causa restart loop que so aparece em ambiente real, nunca em testes.
2. Um guard global (`isAnyWaterfallActive()`) e mais robusto que trava local porque o restart loop cruzava sessoes.
3. `callerStack` no `scoutDiag` revelou a causa raiz sem precisar de breakpoints ou logs locais.
4. `completeLoadingProgress()` precisa resetar `loadingVariant` para `undefined` — senao o proximo loading herda o variant anterior.

### Pendencias de sessoes anteriores

| Item | Status |
|------|--------|
| P0 withTimeout AbortSignal (api/gemini.ts:416, :491) | **NAO CORRIGIDO** — documentado |
| Branch `feat/crm-supabase-migration` | Stashed, precisa decidir |
| Branches residuais restart-loop (3) | Locais, podem ser deletadas |
| `waterfallLogger.ts` nao removido | Confirmar com Bruno |
| Main local sync | OK — `0370a5ec` |

## Decisoes desta sessao

### PR #322 — 5 correcoes anti-restart-loop (APLICADO)

- **`React.StrictMode` removido da build de producao** (`index.tsx`): StrictMode duplica invocacao de renders intencionalmente, mas nao deve ir para producao. Era a causa raiz do restart loop.
- **Re-entry guard em `processMessage`:** `isAnyWaterfallActive()` check antes de `setIsLoading(true)`. Se `activeGenerationRef.current` ja estiver setado, retorna.
- **`loadingVariant` reset:** `completeLoadingProgress()` em `loading-progress.ts` seta `loadingVariant` para `undefined`.
- **`callerStack` diagnostic:** `new Error().stack` em `processMessage:start` loga a pilha de quem chamou o waterfall no `scoutDiag`.
- **`generationBefore/After` guard:** `processMessage` compara geracoes antes e depois para evitar `eventBus.emit('dossier:completed')` falso.
- **`messages-state-after-update` diagnostic:** loga o estado das mensagens apos update para confirmar persistencia.
- **`completeLoadingProgress` condicional:** so executa se `waterfallRan` estiver true.

## Proximo passo

1. Deletar branches residuais do restart-loop
2. Decidir sobre CRM migration stashed
3. Corrigir P0 withTimeout quando houver janela

## Ponteiros

- `HANDOFF_AI.md`
- WaterfallGuard: `features/dossier/waterfall-guard.ts`
- PR #321: `7aca0032`
- PR #322: `0370a5ec`
- Vault: `20-SESSOES/2026-06/2026-06-01T13-54-00-waterfall-final-fixes.md`
