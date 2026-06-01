# Decisions

Last updated: 2026-06-01 — Sentry integrado, branch feature/sentry-error-monitoring, merge main

## 2026-06-01 — Sentry Error Monitoring no Frontend (APLICADO)

Decision: Adicionar `@sentry/react` para monitoramento de erros em producao. `Sentry.init()` em `index.tsx` com DSN publico via `VITE_SENTRY_DSN`. Integrar nos 3 ErrorBoundaries existentes (global, chat, dossier) com tags para identificar o componente. Adicionar Sentry MCP server no `.mcp.json` para debug de erros via ferramenta MCP.

Reason: O app nao tinha telemetria de erro do lado do cliente. Erros em producao (como o restart loop do waterfall) so eram detectados por relato de usuario. Com Sentry, cada erro capturado nos ErrorBoundaries gera stack trace, contexto e sessao, permitindo diagnostico proativo.

Contract:

- `Sentry.init()` chamado antes do `createRoot()` em `index.tsx`
- DSN obrigatorio via `VITE_SENTRY_DSN` (publico por design — Vite inlineia no bundle JS)
- Desabilitado (noop) se DSN nao configurado — `enabled: Boolean(import.meta.env.VITE_SENTRY_DSN)`
- `tracesSampleRate`: 0.1 em prod, 1.0 em dev
- `browserTracingIntegration()` ativa para tracing de performance
- 3 ErrorBoundaries com `scope.setTag()` para identificar origem
- `@sentry/react` v8+ adicionado ao `package.json`

Refs: commit `e34ee919`, `index.tsx`, `components/ErrorBoundary.tsx`, `features/chat/ChatErrorBoundary.tsx`, `features/dossier/DossierErrorBoundary.tsx`, `.mcp.json`.

## 2026-06-01 — Merge main na branch feature/sentry-error-monitoring (APLICADO)

Decision: Fazer merge de `main` na branch `feature/sentry-error-monitoring` para trazer as correcoes das PRs #321 (WaterfallGuard oficial) e #322 (5 correcoes anti-restart-loop), incluindo a remocao de `React.StrictMode` de producao.

Reason: A branch Sentry foi criada antes das PRs #321/#322 serem mergeadas em main. O merge garante que a branch Sentry tenha as correcoes oficiais (nao apenas o backport `e60aa89f`). O conflito principal foi em `index.tsx` (StrictMode vs Sentry.init).

Contract: `index.tsx` resultante tem Sentry.init() mas NAO tem React.StrictMode. Mensagem de merge: "merge main — resolve conflitos em waterfall files".

Refs: commit `061cccbe`.

## 2026-06-01 — PR #322 5 correcoes anti-restart-loop mergeda (APLICADO)

Decision: remover React.StrictMode da build de producao (index.tsx). Adicionar re-entry guard em processMessage (isAnyWaterfallActive check antes de setIsLoading). Resetar loadingVariant em completeLoadingProgress. Adicionar callerStack diagnostic (new Error().stack) em processMessage:start. Adicionar generationBefore/After guard para evitar dossier:completed falso.

Reason: React.StrictMode estava ativo em producao, causando double-invocation de renders que disparava multiplos processMessage. Cada chamada criava nova sessao de waterfall e setava isLoading=true, deixando UI travada. O callerStack diagnostic confirmou origem no scheduler do React. O guard generationBefore/After evita que o eventBus emita dossier:completed quando a geracao mudou durante a execucao (outro waterfall iniciou).

Contract: index.tsx usa StrictMode apenas em dev (process.env.NODE_ENV !== 'production'). processMessage checa activeGenerationRef no topo. completeLoadingProgress reseta loadingVariant. callerStack logado no scoutDiag apenas quando isRestarting esta true.

Refs: PR #322, commit 0370a5ec, index.tsx, features/chat/message-orchestrator.ts, features/chat/loading-progress.ts.

## 2026-06-01 — PR #321 WaterfallGuard squash-mergeada (APLICADO)

Decision: adicionar WaterfallGuard — floodgate global que permite apenas 1 waterfall por vez no app inteiro. Map em memoria rastreia activeRunId, generationCount, blockedCount por sessao. Cooldown de 5s apos conclusao. PostCompletion aprimorado com deteccao de restart (compara generationCount baseline vs atual). cleanupPostCompletion migrado de let para useRef.

Reason: o restart loop era causado por 3 waterfalls concorrentes disparados por re-render/re-entry — um efeito colateral apos conclusao do waterfall re-disparava runMegaPromptWaterfall para a mesma sessao. O floodgate bloqueia execucoes duplicadas no inicio, antes de qualquer chamada a API. Os diagnosticos revelaram o ponto exato de crash. O useRef eliminou a perda de referencia do cleanupPostCompletion entre renders.

Contract: registerWaterfallStart() no topo de runMegaPromptWaterfall; registerWaterfallEnd() no finally. Se bloqueado, retorna sem executar. PostCompletion loga RESTART-DETECTED (warn) no Supabase se genDelta > 0.

Refs: PR #321, commit 7aca0032, features/dossier/waterfall-guard.ts, features/dossier/waterfall-orchestrator.ts, features/chat/message-orchestrator.ts.
