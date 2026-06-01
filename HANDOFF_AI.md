# Handoff — NOVO-APP — 01/06/2026 — Sentry integrado, WaterfallGuard + StrictMode resolvidos

## Estado Atual

- **Branch:** `feature/sentry-error-monitoring`
- **HEAD:** `061cccbe` (merge main — resolve conflitos em waterfall files)
- **Origin/main:** `9f49ab6d` (sync ok, doc atualizada)
- **Main (local):** `9f49ab6d` (sync com origin)
- **Branch commits vs main:** 2 unicos + 1 merge = 3 commits a frente
- **PRs abertas:** Nenhuma
- **Working tree:** 4 arquivos modificados (formatacao tabelas docs + `.mcp.json`) + 2 untracked (`.superpowers/`, `utils/promptLeakShield.ts`)
- **Waterfall:** Completo, renderizando corretamente. Restart loop eliminado.

## O que foi concluido

### Sentry — Monitoramento de Erros no Frontend (e34ee919, +418/-109, 12 arquivos)

- **`@sentry/react`** adicionado ao `package.json` + `package-lock.json`
- **`index.tsx`:** `Sentry.init()` com DSN publico via `VITE_SENTRY_DSN`. Environment: `production` ou `development`. `tracesSampleRate`: 0.1 em prod, 1.0 em dev. Desabilitado se DSN ausente.
- **`components/ErrorBoundary.tsx`:** Sentry integrado no `componentDidCatch`
- **`features/chat/ChatErrorBoundary.tsx`:** Sentry com tag `error-boundary: chat`
- **`features/dossier/DossierErrorBoundary.tsx`:** Sentry com tag `error-boundary: dossier`
- **`.env.example`:** Adicionado `VITE_SENTRY_DSN` com comentario explicativo
- **`.mcp.json`** (unstaged): Adicionado Sentry MCP server (`https://mcp.sentry.dev/mcp`)
- **`React.StrictMode` removido** via merge de main (PR #322) — `index.tsx` sem StrictMode em prod

### WaterfallGuard (e60aa89f, +290/-107, 5 arquivos) — Backport pre-PR #321

Commit feito nesta branch ANTES das PRs #321/#322 serem mergeadas em main. Mesmo escopo do PR #321:

- `features/dossier/waterfall-guard.ts` (NEW): Floodgate global anti-concorrencia
- `features/dossier/waterfall-orchestrator.ts`: Guard integration + diagnostics
- `features/chat/message-orchestrator.ts`: PostCompletion restart detection
- Apos merge de main, o codigo ficou consistente com as PRs originais

### Merge Main (061cccbe)

Trouxe as correcoes oficiais das PRs #321 (WaterfallGuard) e #322 (5 correcoes anti-restart-loop), incluindo a remocao de `React.StrictMode` da build de producao.

## Arquivos alterados

| Arquivo                                      | Mudanca                                                 | Commit   |
| -------------------------------------------- | ------------------------------------------------------- | -------- |
| `index.tsx`                                  | `Sentry.init()` + ErrorBoundaries + StrictMode removido | e34ee919 |
| `components/ErrorBoundary.tsx`               | Sentry integration no componentDidCatch                 | e34ee919 |
| `features/chat/ChatErrorBoundary.tsx`        | Sentry + tag `error-boundary: chat`                     | e34ee919 |
| `features/dossier/DossierErrorBoundary.tsx`  | Sentry + tag `error-boundary: dossier`                  | e34ee919 |
| `package.json`                               | `@sentry/react` adicionado                              | e34ee919 |
| `.env.example`                               | `VITE_SENTRY_DSN` adicionado                            | e34ee919 |
| `.mcp.json`                                  | Sentry MCP server adicionado (unstaged)                 | —        |
| `features/dossier/waterfall-guard.ts`        | Novo — floodgate global anti-concorrencia               | e60aa89f |
| `features/dossier/waterfall-orchestrator.ts` | Guard integration + diagnostics                         | e60aa89f |
| `features/chat/message-orchestrator.ts`      | PostCompletion restart detection + useRef               | e60aa89f |

## Riscos Tecnicos Residuais

1. **P0 withTimeout (api/gemini.ts:416, :491):** AbortController cria signal mas nao propaga para `chat.sendMessage()`. Documentado, nao corrigido.
2. **Branch `feat/crm-supabase-migration`:** Stashed, precisa decidir (retomar ou descartar).
3. **1 falha pre-existente:** Teste `warRoomService` — nao relacionada ao waterfall nem Sentry.
4. **Branches residuais (5+):** Restart-loop (3), CRM migration, e outras branches locais nao limpas.
5. **Sentry DSN nao configurado:** `.env` local ainda nao tem `VITE_SENTRY_DSN` real. Sentry fica desabilitado ate configurar.
6. **Merge sem push:** Branch local a frente de `origin/feature/sentry-error-monitoring` (se existir) ou branch sem tracking remoto.

## Proximo Passo

1. Configurar DSN real do Sentry no .env (se houver projeto Sentry)
2. Deletar branches residuais (restart-loop + outras)
3. Decidir sobre `feat/crm-supabase-migration` stashed
4. Corrigir P0 withTimeout quando houver janela
5. Abrir PR da branch `feature/sentry-error-monitoring`

## Links

- **Commit Sentry:** `e34ee919` — Sentry init + 3 ErrorBoundaries + env
- **Commit WaterfallGuard:** `e60aa89f` — backport pre-PR #321
- **Merge main:** `061cccbe` — resolve conflitos, traz PRs #321/#322
- **Main PR #321:** `7aca0032` — WaterfallGuard oficial
- **Main PR #322:** `0370a5ec` — 5 correcoes anti-restart-loop (StrictMode removido)
- **WaterfallGuard:** `features/dossier/waterfall-guard.ts`
- **Orchestrator:** `features/dossier/waterfall-orchestrator.ts`
- **PostCompletion:** `features/chat/message-orchestrator.ts`
