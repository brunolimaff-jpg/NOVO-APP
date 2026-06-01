# Active Context

Last updated: 2026-06-01 — Sentry integrado, WaterfallGuard + StrictMode resolvidos

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`

## Fase atual

**Sentry integrado para monitoramento de erros em producao. Waterfall de dossie completo e renderizando corretamente.**

### Branch atual: `feature/sentry-error-monitoring`

3 commits a frente de `main`:

- **`e60aa89f`** — WaterfallGuard backport (pre-PR #321). Floodgate global + diagnostics.
- **`e34ee919`** — Sentry init + 3 ErrorBoundaries + env. `@sentry/react` com `browserTracingIntegration()`. Tags: `chat`, `dossier`, `global`.
- **`061cccbe`** — Merge main: traz PRs #321 (WaterfallGuard oficial) e #322 (5 correcoes anti-restart-loop, incluindo remocao de React.StrictMode em prod).

### O restart loop do waterfall foi eliminado com duas frentes:

- **PR #321 (WaterfallGuard + Sentry backport):** Floodgate global `Map<sessionId, WaterfallGuardState>` + `globalActiveRunId` que impede waterfalls concorrentes. Diagnostico no Supabase via `scoutDiag.warn` com `generationCount`, `blockedCount`, timestamps.
- **PR #322 (Final Fixes + merge main):** `React.StrictMode` removido de producao (causa raiz do restart loop). Re-entry guard em `processMessage` (checa `isAnyWaterfallActive()` antes de `setIsLoading(true)`). `callerStack` diagnostic confirma origem React scheduler. `loadingVariant` resetado no `completeLoadingProgress`.

### Sentry Error Monitoring

- `Sentry.init()` em `index.tsx` com `browserTracingIntegration()`
- `tracesSampleRate`: 0.1 em prod, 1.0 em dev
- Desabilitado se `VITE_SENTRY_DSN` nao estiver configurado
- 3 ErrorBoundaries integrados: global (`components/ErrorBoundary.tsx`), chat (`features/chat/ChatErrorBoundary.tsx`), dossier (`features/dossier/DossierErrorBoundary.tsx`)
- Sentry MCP server adicionado ao `.mcp.json` (unstaged)

### Licoes criticas (waterfall)

1. `React.StrictMode` duplica invocacoes de render em producao se configurado errado — causa restart loop que so aparece em ambiente real, nunca em testes.
2. Um guard global (`isAnyWaterfallActive()`) e mais robusto que trava local porque o restart loop cruzava sessoes.
3. `callerStack` no `scoutDiag` revelou a causa raiz sem precisar de breakpoints ou logs locais.
4. `completeLoadingProgress()` precisa resetar `loadingVariant` para `undefined` — senao o proximo loading herda o variant anterior.

### Pendencias de sessoes anteriores

| Item                                                 | Status                                 |
| ---------------------------------------------------- | -------------------------------------- |
| P0 withTimeout AbortSignal (api/gemini.ts:416, :491) | **NAO CORRIGIDO** — documentado        |
| Branch `feat/crm-supabase-migration`                 | Stashed, precisa decidir               |
| Branches residuais restart-loop (3) + outras (2+)    | Locais, podem ser deletadas            |
| `waterfallLogger.ts` nao removido                    | Confirmar com Bruno                    |
| Sentry DSN real no .env                              | Pendente — desabilitado ate configurar |
| Branch `feature/sentry-error-monitoring` sem PR      | Local, sem tracking remoto             |

## Decisoes desta sessao

### Sentry — Monitoramento de Erros no Frontend (APLICADO)

Adicionar `@sentry/react` com `Sentry.init()` em `index.tsx`. DSN publico via `VITE_SENTRY_DSN`. Integrar nos 3 ErrorBoundaries existentes. Adicionar Sentry MCP server para debug de erros.

### WaterfallGuard backport (APLICADO — mergeado com PR oficial)

Commit `e60aa89f` feito antes do merge do PR #321 em main. Mesmo escopo. Merge `061cccbe` trouxe a versao oficial, mantendo compatibilidade.

## Proximo passo

1. Configurar DSN real do Sentry no .env
2. Deletar branches residuais (restart-loop + outras)
3. Decidir sobre CRM migration stashed
4. Corrigir P0 withTimeout quando houver janela
5. Abrir PR da branch `feature/sentry-error-monitoring`

## Ponteiros

- `HANDOFF_AI.md`
- Branch: `feature/sentry-error-monitoring`
- Commit Sentry: `e34ee919`
- Sentry MCP: `.mcp.json` (unstaged)
- Sentry init: `index.tsx`
- ErrorBoundaries: `components/ErrorBoundary.tsx`, `features/chat/ChatErrorBoundary.tsx`, `features/dossier/DossierErrorBoundary.tsx`
- WaterfallGuard: `features/dossier/waterfall-guard.ts`
- Vault: `docs/obsidian/daily/2026-06-01.md`
