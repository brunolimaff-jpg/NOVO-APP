## 2026-06-05 — Static fallback: parent flex-col + child flex-1 (APLICADO na PR #342)

Decision: o container outer de MessageTimeline deve ser `flex-col` (nao `display:block`) e o filho static-fallback deve usar `flex-1` (nao `h-full`).

Reason: o outer container recebia altura via `flex-1` (flex-basis:0%). O filho usava `h-full` (height:100%). Como o pai tinha altura calculada de 0px (flex-basis:0%), `height:100%` do filho = 0px. O browser colapsava o elemento com `display:none`. Isso fazia a timeline ficar vazia e o overlay permanecer preso.

Contract: filhos de flex container com `flex-1` devem usar `flex-1` para herdar altura real, nunca `h-full`. `absolute inset-0` tambem deve ser evitado nesses contextos; preferir `h-full w-full`.

Refs: PR #342, `components/MessageTimeline.tsx`.

---

## 2026-06-05 — LayoutTrace como ferramenta de diagnostico (APLICADO na PR #342)

Decision: adicionar `LayoutTrace` — instrumentacao que loga dimensoes do container de mensagens (`MessageTimeline.tsx`) apos cada render, para diagnosticar painel branco pos-waterfall.

Reason: sem a instrumentacao, nao era possivel saber se o Virtuoso estava montado com viewport 0x0, se o fallback estatico estava invisivel, ou se o overlay hero continuava bloqueando. LayoutTrace revelou que o static-fallback tinha display:none e viewport zero.

Contract: LayoutTrace deve ser ativado apenas em desenvolvimento ou com flag explicita, nunca em producao.

Refs: PR #342, `components/MessageTimeline.tsx`.

---

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

## 2026-06-05 — flushDiagnosticsNow deferred com setTimeout(0); agendar ANTES do setState (APLICADO na PR #343)

Decision: `flushDiagnosticsNow('processMessage:finally', true)` deve ser deferido com `setTimeout(0)` e agendado ANTES de `setIsLoading(false)`, nao depois.

Reason: o codigo original chamava `flushDiagnosticsNow` sincronamente no mesmo tick que `setIsLoading(false)`. O setState disparava React re-render síncrono, mas o flushDiagnosticsNow executava antes do render completar, bloqueando a main thread. Com o `setTimeout(0)` agendado ANTES do setState, o timer ja esta na macrotask queue quando o React comeca a renderizar. O React render ocorre. Quando o render termina e o controle volta ao event loop, o setTimeout dispara. Playwright confirmou: sem o defer, zero eventos pos-render (static-fallback-rendered, MessageRow commit).

Contract: todo `flushDiagnosticsNow` no hot path de `processMessage:finally` deve ser deferido com `setTimeout(0)`. O setTimeout deve ser agendado ANTES do setState para garantir que o timer ja esteja na fila. NUNCA depois.

Refs: PR #343, `features/chat/message-orchestrator.ts`.

---

## 2026-06-06 — Foundation Cache habilitado em producao (MITIGACAO)

Decision: ativar `GEMINI_FOUNDATION_CACHE_ENABLED=1` e `VITE_GEMINI_FOUNDATION_CACHE_ENABLED=1` em producao.

Reason: reduz latencia das chamadas Gemini, diminuindo probabilidade de timeout/abort que contribui para o freeze intermitente pos-waterfall. Mitigacao, nao causa raiz.

Contract: se foundationCacheName retornar null em producao, a feature falha silenciosamente (cache nao e critico). Bug separado registrado.

Refs: env vars em Vercel, `services/gemini/auxiliary.ts`.

---

## 2026-06-06 — freezeDiag.ts e TEMPORARIO

Decision: modulo `freezeDiag.ts` com `performance.mark()`, `PerformanceObserver(longtask)`, watchdog heartbeat, e render counter deve ser removido ou condicionado a `__DEV__` antes de qualquer PR da branch `fix/diagnostic-render-freeze`.

Reason: instrumentacao adiciona overhead de `console.info()` e `performance.mark()` em cada render. Em producao, `console.info` persiste nos logs do Sentry e `performance.mark` acumula entradas no buffer.

Contract: remover importacoes de freezeDiag de todos os componentes, ou criar gate `if (import.meta.env.DEV)`. Nao mergear instrumentacao em producao.

Refs: `utils/freezeDiag.ts`, `components/*.tsx`, `features/chat/*.ts`.

---

## 2026-06-05 — Dossie nao deve depender de Pinecone; War Room sim (APLICADO LOCALMENTE)

Decision: remover `buscarContextoPinecone` e `buscarContextoDocsPinecone` apenas do fluxo do dossie (`features/dossier/waterfall-orchestrator.ts` e `services/gemini/investigation-orchestration.ts`), mantendo War Room com RAG Pinecone. O health check passa a tratar RAG como check opcional do War Room; resultado vazio/degradado nao conta mais como sucesso do fluxo principal.

Reason: a investigacao do incidente Scheffer mostrou duas trilhas separadas. A causa raiz do overlay preso esta no handoff pos-`finally`/telemetria; ja o Pinecone em producao apresenta warnings recorrentes de indice invalido e adiciona ruido ao dossie sem ser necessario para fechar o relatorio. Misturar a correcao do overlay com uma dependencia RAG instavel manteria hipotese aberta desnecessariamente.

Contract: dossie deve operar com lookup/CNPJ/QSA, benchmark, concorrentes, PORTA, grounding e contexto acumulado dos modulos. War Room continua chamando `/api/rag` e `/api/docs-rag`. Validacao local obrigatoria: War Room ainda emite RAG; dossie nao emite mais `/api/rag`/`/api/docs-rag`.

Refs: `docs/handoffs/2026-06-05-dossier-root-fix-force-flush-pinecone.md`, `features/dossier/waterfall-orchestrator.ts`, `services/gemini/investigation-orchestration.ts`, `components/SystemHealthCheck.tsx`.
