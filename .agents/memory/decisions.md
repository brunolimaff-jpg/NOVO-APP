## 2026-06-05 — abortControllerRef nao deve ser nullificado no finalizeWaterfallUI (APLICADO na PR #342)

Decision: remover `delete activeAbortControllerRef.current[sessionId]` do `finalizeWaterfallUI()`. O `abortControllerRef` so deve ser nullificado no proprio `processMessage:finally`, NUNCA no helper de finalizacao de UI.

Reason: `finalizeWaterfallUI` e chamado no `finally` do `processMessage`. Se ele nullifica `abortControllerRef` antes do `processMessage:finally` rodar, o `isAbort` detecta `abortControllerRef.current[sessionId] === undefined` como abort, e `flushDiagnosticsNow` nunca e chamado. O diagnostico fica preso, mascarando outros problemas.

Contract: `finalizeWaterfallUI` manipula apenas estados de UI (isLoading, loadingVariant, loadingProgress, failureCount, activeGeneration). `abortControllerRef` pertence ao ciclo de vida do `processMessage` e deve ser gerenciado exclusivamente por ele.

Refs: PR #342, `features/dossier/waterfall-orchestrator.ts`.

---

## 2026-06-05 — PWA/SW removido em favor de bundles frescos (APLICADO)

Decision: remover VitePWA plugin, `vite-plugin-pwa`, `public/sw.js` manual e `public/manifest.json`. Substituir por kill-switch `public/sw.js` que apenas desregistra caches antigos.

Reason: Service Worker com CacheFirst servia bundles JS/CSS antigos em producao a partir do cache, mesmo quando novos deploys estavam no ar. Preview nunca registrava SW, entao o bug era invisivel em homologacao. Para um app SPA com deploy frequente (multiplas vezes ao dia durante desenvolvimento ativo), cache de service worker e contraproducente — usuarios ficam presos em versoes antigas sem saber.

Contract: app sem PWA. Se no futuro houver necessidade de offline/instalacao, implementar com NetworkFirst (nao CacheFirst) e asset versioning explicito. Kill-switch sw.js mantido por 1-2 releases para limpar caches de usuarios existentes.

Refs: PR #334, `vite.config.ts`, `public/sw.js`.

---

## 2026-06-05 — Hard invariant no waterfall como airbag contra overlay preso (APLICADO)

Decision: ao final do waterfall, se `waterfallEndStatus` for `completed`, `failed` ou `partial`, OU `botMsgTextLen > 0`, forcadamente chamar `setIsLoading(false)` + `setLoadingVariant(undefined)` + `display:none` no elemento DOM do overlay. Isso independe do fluxo normal de `processMessage:finally`.

Reason: a cadeia de estado React (setIsLoading -> re-render -> overlay some) pode falhar por race condition, react batching, ou desync DOM/estado. O hard invariant usa condicoes observaveis do proprio waterfall (status final, texto do bot) para garantir que o overlay nunca fique preso. Funciona como airbag: se o fluxo normal falha, o invariant forcadamente desobstrui a UI.

Contract: hard invariant deve ser acionado por condicoes observaveis, nao por chain de estado. Nao deve depender de `isLoading` ou `loadingVariant` para decidir. Logar `overlay-force-removed` quando acionado.

Refs: `features/dossier/waterfall-orchestrator.ts`, PR #334.

---

## 2026-06-05 — Dossie nao deve depender de Pinecone; War Room sim (APLICADO LOCALMENTE)

Decision: remover `buscarContextoPinecone` e `buscarContextoDocsPinecone` apenas do fluxo do dossie (`features/dossier/waterfall-orchestrator.ts` e `services/gemini/investigation-orchestration.ts`), mantendo War Room com RAG Pinecone. O health check passa a tratar RAG como check opcional do War Room; resultado vazio/degradado nao conta mais como sucesso do fluxo principal.

Reason: a investigacao do incidente Scheffer mostrou duas trilhas separadas. A causa raiz do overlay preso esta no handoff pos-`finally`/telemetria; ja o Pinecone em producao apresenta warnings recorrentes de indice invalido e adiciona ruido ao dossie sem ser necessario para fechar o relatorio. Misturar a correcao do overlay com uma dependencia RAG instavel manteria hipotese aberta desnecessariamente.

Contract: dossie deve operar com lookup/CNPJ/QSA, benchmark, concorrentes, PORTA, grounding e contexto acumulado dos modulos. War Room continua chamando `/api/rag` e `/api/docs-rag`. Validacao local obrigatoria: War Room ainda emite RAG; dossie nao emite mais `/api/rag`/`/api/docs-rag`.

Refs: `docs/handoffs/2026-06-05-dossier-root-fix-force-flush-pinecone.md`, `features/dossier/waterfall-orchestrator.ts`, `services/gemini/investigation-orchestration.ts`, `components/SystemHealthCheck.tsx`.
