# Decisions

Last updated: 2026-06-01 — PR #322 mergeda: StrictMode removido, re-entry guard, callerStack

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
