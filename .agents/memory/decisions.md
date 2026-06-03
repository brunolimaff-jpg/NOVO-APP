# Decisions

Last updated: 2026-06-03 — PR #327: Observabilidade + fallback de Painel Branco

## 2026-06-03 — Fallback estatico quando Virtuoso nao materializa o DOM (APLICADO LOCALMENTE)

Decision: quando existe sessão ativa com bot final esperado, `isLoading=false`, `panelState='content'`, mas o snapshot do `chat-main-panel` não encontra linhas/nós de bot visíveis, `ChatInterface` ativa `forceStaticTimelineFallback`. `MessageTimeline` recebe a flag e renderiza `MessageRow` em lista estática com scroll próprio, pulando o Virtuoso somente nessa anomalia.

Reason: nova evidência do preview mostrou `messageCount=2`, bot final com ~30k caracteres, waterfall finalizado, `Virtuoso itemsRendered { firstIndex: 0, lastIndex: 1 }` e painel visualmente branco. Portanto `rangeChanged/itemsRendered` não prova que o DOM útil foi materializado.

Contract: regressões de tela branca devem testar dois níveis: (1) detector/observabilidade captura ausência de conteúdo visível; (2) fallback estático recupera a UI quando a virtualização falha. Fallback deve resetar em troca de sessão, novo loading, home ou suspensão. Não ativar fallback por persistência Supabase, texto no body ou item no histórico/sidebar.

Refs: `components/ChatInterface.tsx`, `components/chat/MessageTimeline.tsx`, `tests/components/ChatInterface.test.tsx`, `tests/components/chat/MessageTimeline.test.tsx`, PR #327.

## 2026-06-03 — Painel branco precisa de rastreio visual, nao so persistencia (APLICADO LOCALMENTE)

Decision: bugs de tela branca devem emitir um evento explícito `BlankPanel/blank-panel-detected` quando existe sessão ativa com texto final de bot esperado, mas o painel central não mostra conteúdo de bot visível. O detector mede somente sinais seguros do DOM (`rowCount`, `visibleBotWithCharsCount`, alturas, scroll, `centerElementTestId`) e envia `captureMessage('Scout360 blank panel detected')` para Sentry com tags `area`, `source`, `reason` e `session_id`.

Reason: no preview da PR #327/PR #328, Supabase e waterfall indicavam sucesso (`messageCount=2`, bot final persistido, Virtuoso montado), mas a UI podia ficar visualmente branca. `document.body.textContent` e `dossier-content` não bastam porque sidebar/histórico e wrappers estruturais podem esconder o problema real do painel central.

Contract: validação de tela branca deve provar conteúdo de bot pintado no `chat-main-panel`: `bot-message-content` visível, `data-text-length > 30000`, dimensões reais, sem `empty-state`, sem `controlled-error`, sem placeholder/suspensão e com área visível positiva. Supabase deve preservar métricas numéricas/booleanas seguras mesmo quando o nome da chave contém `body/text/content`, mas continuar removendo strings de prompt, response, body e conteúdo.

Refs: `utils/blankPanelTelemetry.ts`, `components/ChatInterface.tsx`, `features/chat/message-orchestrator.ts`, `tests-e2e/blank-center-panel-regression.spec.ts`, `tests-e2e/loading-smart-recovery.spec.ts`, `supabase/migrations/20260603_blank_panel_observability.sql`, PR #327.

## 2026-06-02 — Trava de envio inicial pendente contra sessao orfa (APLICADO LOCALMENTE)

Decision: enquanto a primeira investigacao inicial esta em andamento, `handleSendMessage` deve reaproveitar a sessao pendente em vez de criar outra sessao quando `currentSessionId` ainda nao re-renderizou. `pendingInitialSendRef` guarda a sessao criada e uma segunda chamada inicial apenas chama `setCurrentSessionId(pendingSessionId)` e retorna.

Reason: no preview da PR #328, o waterfall completava, persistia e atualizava uma sessao com 2 mensagens, mas a UI ativa renderizava `Virtuoso totalItems: 1`. A sidebar mostrava dois historicos: o dossie finalizado e uma sessao orfa com apenas "Investigando...". Isso aconteceu porque a segunda chamada inicial chegava antes do re-render aplicar `currentSessionId`; o guard global bloqueava o waterfall, mas a sessao orfa ja tinha sido criada e selecionada.

Contract: fluxo de primeira investigacao nao pode criar nova sessao se ja houver uma sessao inicial pendente ou waterfall global ativo. Duplicatas devem ser bloqueadas antes de inserir mensagem de usuario. Toda regressao deve cobrir duas chamadas iniciais na mesma renderizacao do hook.

Refs: `features/chat/message-orchestrator.ts`, `tests/features/chat/message-orchestrator.test.ts`, PR #328.

## 2026-06-02 — Snapshot sincrono para estado critico de sessao (APLICADO LOCALMENTE)

Decision: atualizacoes criticas de sessao devem retornar o snapshot resultante de forma sincrona. `setSessions` sincroniza `sessionsRef.current` antes de agendar o estado React; `updateSessionById` retorna `ChatSession | null`; o waterfall usa esse retorno para preencher `sessionToPersist`.

Reason: o bug da PR #328 persistia porque o fluxo lia `sessionToPersist` por side effect dentro de callback de `setState`. Com React batching, esse callback podia nao rodar a tempo ou nao rodar quando a sessao sumia do `prev`. A ref ja continha a sessao recuperavel, e o Supabase persistia o dossie, mas o fluxo primario ficava quebrado.

Contract: nao depender de side effects dentro de updater React para resultado que precisa ser persistido/renderizado no mesmo fluxo async. Helpers de escrita critica devem devolver o objeto atualizado e manter a ref sincronizada.

Refs: `hooks/useSessionStorage.ts`, `stores/chatStore.tsx`, `features/dossier/waterfall-orchestrator.ts`, PR #328.

## 2026-06-02 — CI deve travar regressao de tela branca/loading (APLICADO LOCALMENTE)

Decision: adicionar check `E2E Critical Browser` ao GitHub Actions, rodando `blank-center-panel-regression`, `controlled-error-state` e `loading-smart-recovery`.

Reason: as PRs anteriores passavam sem cobrir browser real; o preview smoke era HTTP-only e nao pegava tela branca, composer travado, overlay preso ou drift de onboarding/testid. A suite critica usa onboarding atual e stub deterministico de `/api/gemini`, evitando depender de Gemini real para CI.

Contract: PR que mexe no fluxo de investigacao/loading deve passar typecheck, unit tests, build e `E2E Critical Browser` antes de merge. Se habilitar branch protection/ruleset, incluir esse check como required.

Refs: `.github/workflows/ci.yml`, `tests-e2e/helpers/`, PR #328.

## 2026-06-01 — Barrel export: padrao de decomposicao sem breaking changes (APLICADO)

Decision: ao decompor um god module em modulos menores, criar uma pasta com `index.ts` que re-exporta tudo via barrel export. Nao quebrar imports existentes — consumidores continuam importando do caminho original.

Reason: storage.ts (464 linhas) foi decomposto em 9 modulos dentro de `services/storage/`. Cada modulo tem responsabilidade unica (dossiers, userContext, favorites, radar, sharedDossiers, extractCache, audit, types). O `index.ts` re-exporta todas as funcoes e tipos, mantendo compatibilidade total com quem importa de `services/storage`. Zero arquivos precisaram ter imports atualizados.

Contract: todo god module decomposto deve seguir o padrao: 1 pasta com `index.ts` barrel. Nao remover o arquivo original ate o barrel estar no ar. Testes e typecheck devem passar sem alteracao.

Refs: `services/storage/`, PR #326, commits `f214ebc1`..`4a6e20b2`.

## 2026-06-01 — `storageGet()`: helper tipado para localStorage (APLICADO)

Decision: criar funcao `storageGet<T>(key, fallback?)` em `utils/localStorage.ts` para substituir `JSON.parse(localStorage.getItem(key))` espalhado pelo codigo.

Reason: o padrao antigo gerava codigo repetitivo, sujeito a erros de null check e sem tipagem. O helper centraliza parsing JSON, fallback default, e tipagem generica. Reduz duplicacao e risco de ReferenceError em runtime.

Contract: usar `storageGet<T>(key, defaultValue)` para leitura e `storageSet(key, value)` para escrita. Handoff de migracao pendente: substituir chamadas espalhadas em outros arquivos.

Refs: `utils/localStorage.ts`, PR #326.

## 2026-06-01 — `await + {error}`: padrao de erro Supabase sem try/catch (APLICADO)

Decision: operacoes Supabase devem usar `await` e verificar `{error}` no retorno. Nao usar `try/catch` (Supabase nunca rejeita promessas em operacoes normais). Nao usar `fire-and-forget` (Supabase calls sem await).

Reason: Supabase client retorna `{data, error}` — nunca lanca excecao (a menos que seja erro de rede na camada HTTP, que e raro). O `try/catch` em userContext.ts era codigo morto que escondia erros reais. O fire-and-forget (`supabase.from('x').upsert(...)` sem await) perdia erros silenciosamente. Com `await` + `if (error)`, todo erro de upsert/select e visivel no console e tratavel.

Contract: todo Supabase call deve usar `const { data, error } = await supabase.from(...)...`. Se `error` for truthy, logar com `console.error('[Storage]', error)`. Nao usar `try/catch` em operacoes Supabase normais (excecao: operacoes que fazem fetch HTTP customizado).

Refs: `services/storage/userContext.ts`, PR #326, commit `f214ebc1`.

## 2026-06-01 — Rename `idbStorage.ts` para `localStorage.ts` (APLICADO)

Decision: renomear `utils/idbStorage.ts` para `utils/localStorage.ts`. O nome original era enganoso — o arquivo sempre usou `localStorage` do browser, nunca IndexedDB.

Reason: durante a auditoria da sessao, identificamos que `idbStorage.ts` so usava `localStorage` (window.localStorage). Nao havia operacoes IDB. O nome "idb" confundia novos desenvolvedores (e agents) que assumiam suporte a async/transactions. O rename elimina a confusao.

Contract: alias de export mantido temporariamente para compatibilidade (`export { localStorage as idbStorage }`). Remover alias apos proxima sessao se nenhum import externo quebrar.

Refs: `utils/idbStorage.ts` -> `utils/localStorage.ts`, PR #326.

## 2026-06-01 — Waterfall intocado durante rebase (CONFIRMADO)

Decision: confirmar que `waterfall-orchestrator.ts` esta 100% identico ao main apos o rebase da branch `refactor/decompose-and-optimize`.

Reason: a branch original (`fix/waterfall-95pct-restart-loop`) continha o fix WaterfallGuard. Ao renomear para `refactor/decompose-and-optimize` e rebasear no main (que ja tem WaterfallGuard + anti-restart-loop + Sentry), havia risco de conflito. A verificacao pos-rebase confirmou que o arquivo esta identico ao main — sem regressao no fix do restart loop.

Contract: sempre verificar `waterfall-orchestrator.ts` apos rebase para confirmar que fixes de restart loop nao foram perdidos. `git diff main -- waterfall-orchestrator.ts` deve retornar vazio.

Refs: commit `c41f001a`, PR #326.

## 2026-05-31 — Vercel AI Gateway + Cron + Queues: plano cancelado (ARQUIVADO)

Decision: nao implementar AI Gateway, Cron Jobs e Queues no momento. Plano completo escrito e arquivado em `docs/superpowers/plans/2026-05-31-vercel-ai-gateway-cron-queues.md`.

Reason: projeto esta no plano Hobby do Vercel, que limita a 12 funcoes serverless (plano precisaria de 16). AI Gateway e Queues requerem Pro. Cron Jobs funcionariam parcialmente (2 crons diarios), mas ganho nao justifica refatoracao de 6 arquivos.

Contract: se fizer upgrade para Pro (US$ 20/mes), o plano esta pronto para execucao. Basta ler o arquivo e seguir as 3 fases.

Refs: commit `424faab5`, plano `docs/superpowers/plans/2026-05-31-vercel-ai-gateway-cron-queues.md`.

## 2026-05-31 — PR #317 squash-mergeada em main (APLICADO)

Decision: PR #317 foi squash-mergeada em main via GitHub (commit `7773173`). 18 commits locais foram squashados em 1 commit pelo GitHub. Branch `refactor/remove-idb-storage` agora esta mergeada.

Reason: PR passou por code review max-effort (9 angulos, 15 findings corrigidos), 1249 testes passando, 0 erros typecheck. Nao precisou de rebase — estava limpa e sem conflitos.

Contract: branch local pode ser deletada. Main local precisa de `git pull origin main` para sincronizar com `7773173`.

Refs: PR #317, commit `77731735`, vault `2026-05-31T01-30-00-merge-pr317.md`.

## 2026-05-30 - Supabase como fonte unica da verdade (APLICADO)

Decision: remover a camada offline-first (IDB + sync queue + retry + merge) e acessar Supabase diretamente. Supabase e agora a fonte unica da verdade. IDB mantido APENAS para extract cache (TTL 7 dias).

Reason: a arquitetura offline-first foi construida para "vendedor em campo sem sinal" — cenario que nunca se materializou. Custo real: 1709 linhas de codigo + 1211 de testes + 89 commits desde abril. storage.ts era um God Object de 872 linhas com cache, sync, fila, retry, merge e debounce. Features simples como share link levavam 5-10 commits para estabilizar por causa da sync queue.

Arquitetura nova: 1 camada (Supabase direto) em vez de 2 (IDB -> sync queue -> Supabase). Leitura e escrita vao direto ao banco. Debounce de 1s no hook evita upsert a cada setSessions durante waterfall.

Contract: `storage.saveDossier()` faz upsert direto no Supabase. `storage.getDossiers()` faz select direto no Supabase. `storage.saveAllDossiers()` itera com debounce no hook. Extract cache ainda vai para IDB (leitura rapida) e tambem para Supabase `extract_cache` (cross-device, TTL 7 dias).

Refs: docs/superpowers/specs/2026-05-29-simplificacao-supabase-design.md, services/storage.ts, PR #317.

## 2026-05-30 - Migracao IDB -> Supabase com flag de controle (APLICADO)

Decision: script `lib/migration/idbToSupabase.ts` executa 1x na primeira carga, migrando sessions do IndexedDB para Supabase via upsert. Flag `scout360:migration_v2_complete` no localStorage controla execucao. Se falhar, flag NAO e setada e o app continua tentando no proximo load.

Reason: usuarios existentes tem dados no IndexedDB que precisam ser migrados para o Supabase sem intervencao manual. A migracao assincrona e segura: se falhar (Supabase offline, erro de rede), o app continua funcionando normalmente e tenta de novo.

Contract: `runIdbToSupabaseMigration()` retorna numero de sessions migradas. Upsert via `storage.saveDossier()`. Se IDB esta vazio ou indisponivel, seta flag e pula. Nunca bloqueia o carregamento inicial.

Refs: `lib/migration/idbToSupabase.ts`, `tests/lib/migration/idbToSupabase.test.ts`, commit `7773173`.

## 2026-05-30 - SyncIndicator vira indicador de status de conexao (APLICADO)

Decision: SyncIndicator de 198 linhas (com fila, contador, progresso, botoes) reduzido para ~50 linhas: mostra apenas "Conectado" / "Offline" / "Nuvem indisponivel" com bola verde/vermelha/ambar.

Reason: sem sync queue, nao ha o que sincronizar. O indicador anterior tinha estado complexo (fila pendente, erro, progresso, ultima sync) que agora e irrelevante. O novo componente reflete a realidade: ou o Supabase esta disponivel ou nao.

Refs: `components/SyncIndicator.tsx`, PR #317.

## 2026-05-30 - Radar lastScanAt/metaInsight migram para localStorage (APLICADO)

Decision: `features/radar/useRadar.ts` passa a usar localStorage para `lastScanAt` e `metaInsight` em vez de Supabase/IDB.

Reason: sao valores pequenos (1 numero + 1 string curta) que nao precisam de persistencia remota. Sao efemeros: se o usuario limpar localStorage, o radar sera executado novamente na proxima visita. Isso reduz chamadas ao Supabase e simplifica o codigo.

Refs: `features/radar/useRadar.ts`, PR #317.

## 2026-05-30 - Debounce de 1s no persist do useSessionStorage (APLICADO)

Decision: `hooks/useSessionStorage.ts` adiciona debounce de 1000ms no persist. Compara fingerprint de IDs (sorted JSON) para skipar persistencia quando a lista de sessions nao mudou.

Reason: durante o waterfall de dossie, `setSessions` pode ser chamado dezenas de vezes em segundos. Cada chamada anterior disparava upsert no Supabase imediatamente. O debounce agrupa multiplas atualizacoes em uma unica escrita. A comparacao de fingerprint evita escrita quando apenas a ordem mudou.

Contract: `lastPersistedRef.current` armazena fingerprint da ultima persistencia. Se o fingerprint nao mudou, o debounce e pulado (economiza 1s de espera). Cleanup do timer no unmount.

Refs: `hooks/useSessionStorage.ts`, PR #317.

## 2026-05-30 - Console.error obrigatorio em catch de consulta (APLICADO)

Decision: todo catch de erro em operacoes de consulta ao Supabase deve incluir `console.error()` com prefixo `[Storage]`.

Reason: durante a auditoria da simplificacao, encontramos catches silenciosos que escondiam erros de upsert — criando duplicatas no banco sem o operador ou o desenvolvedor saberem. O console.error garante visibilidade no dev tools mesmo que o erro nao quebre o fluxo do usuario.

Refs: `services/storage.ts`, PR #317.

## 2026-05-29 - Code review max-effort deve preceder merge de branches com +500 linhas (APLICADO)

Decision: realizar code review multi-angulo (9 angulos: tipos, null-safety, async, lifecycle, lado-efeito, consistencia dados, seguranca, performance, acessibilidade) com consolidacao pos-review (65 brutos -> 15 findings) antes de abrir PR de branches com +500 linhas.

Reason: o review encontrou 3 P0 que teriam ido para PR sem deteccao. A consolidacao de findings evitou que 50 itens de baixo valor poluissem a fila de correcao. O custo do review e baixo comparado ao risco de merge com P0 de seguranca ou arquiteturais.

Refs: branch `feat/dossier-lifecycle`, vault `2026-05-29T17-30-00-code-review-dossier-lifecycle-pr313.md`.

## 2026-05-29 - Supabase fallback quando IDB retorna null em cross-device (APLICADO)

Decision: quando `findExistingDossier` (Supabase) confirma existencia de um dossie mas `storage.getDossier` (IndexedDB) retorna null (ex: operador mudou de dispositivo), o acesso ao dossie existente deve usar fallback para Supabase em vez de bloquear o fluxo.

Reason: `getDossier` le apenas IndexedDB local. Em um cenario cross-device, o dossie existe no Supabase (persistido de outro dispositivo) mas nao no IDB local. Usar IDB como guard criava falso negativo que impedia o operador de acessar o proprio dossie. O fallback mantem consistencia: Supabase e a source of truth, IDB e cache.

Contract: `handleAccessExistingDossier` tenta IDB primeiro; se null, faz fetch do Supabase via `storageApi.getDossier`. Nao bloquear o fluxo porque IDB esta vazio -- a fonte confiavel e o Supabase.

Refs: `components/ChatInterface.tsx:230`, commit `0486897`, vault `2026-05-29T20-00-00-pr313-merge-p0-fixes.md`.

## 2026-05-29 - PR #313 precisa de rebase antes do merge (APLICADO)

Decision: PR #313 (`fix/remove-web-search-fallback`) esta com MergeStateStatus: DIRTY e precisa de `git rebase main` antes do merge. Nao mergear com DIRTY.

Reason: o rebase evita conflito de merge e mantem historia linear. O merge state DIRTY indica que a branch divergiu da base e o GitHub nao consegue fazer fast-forward.

Refs: PR #313, branch `fix/remove-web-search-fallback`.

## 2026-05-29 - Fechar PR #314 e abrir nova PR limpa (DECIDIDO)

Decision: fechar PR #314 (`feat/dossier-lifecycle`), corrigir os 3 novos bugs encontrados no preview (2 P0 + 1 P2), squash commits em 3-4 commits semanticos, e abrir nova PR limpa.

Reason: a PR #314 ja tem 11 commits e 15 findings de code review pendentes. Novos bugs no preview (operator_email null, tela branca na transicao, dynamic import) adicionariam mais commits difficeis de revisar. Uma nova PR com commits semanticos e conteudo limpo facilita o review e reduz risco de merge com bugs.

Findings novos identificados:

1. **P0 - operator_email null**: `saveDossier()` e `saveAllDossiers()` em `services/storage.ts:153-218` nao incluem `operator_email` no upsert Supabase. Precisa ler de `localStorage.getItem('scout360:operator_email')`.
2. **P0 - Tela branca transicao LoadingSmart**: `classifyPanelState` em `utils/renderStateClassifier.ts` retorna `'empty'` quando `messages` vazio e `resumoDossie` null, causando `showEmptyStateFallback` apos investigacao concluir.
3. **P2 - Dynamic import**: `components/DossierShareBar.tsx:22` usa `await import('../services/storage')` em vez de static import.

Contract: 3-4 commits semanticos na nova PR (ex: fix/operator-email, fix/tela-branca-loading, feat/dossier-lifecycle-clean). Nao incluir findings do code review que nao sao bugs (discutir com Bruno).

Refs: PR #314, vault `2026-05-29T20-30-00-novos-bugs-preview-fechamento-pr314.md`, `services/storage.ts:153-218`, `utils/renderStateClassifier.ts`, `components/DossierShareBar.tsx:22`.

## 2026-06-01 — sessionsRef fallback para updateSessionById (APLICADO)

Decision: quando `updateSessionById` (waterfall-orchestrator.ts) falha ao encontrar a sessao (retorna undefined por React batching / race condition), usar `sessionsRef.current` como fallback sincrono para reconstruir o dossier.

Reason: durante o waterfall, o React pode fazer batch de sets de estado. Se o cache de sessions esta limpo (primeira carga), `updateSessionById` olha o estado React que ainda nao foi atualizado. Como `sessionsRef` e uma ref sincrona, ela sempre tem o valor mais recente. O fallback busca a sessao na ref e reconstroi o dossier completo.

Contract: (1) tentar `updateSessionById(sessionId, partial)`. (2) Se retornar undefined, buscar em `sessionsRef.current`. (3) Se encontrou na ref, chamar `handleSessionUpdate` manualmente com os dados ja montados. (4) Se nem na ref existe, logar erro e retornar sem dossier — nao travar o loading.

Refs: `waterfall-orchestrator.ts:1059`, commit `365373bd`, PR #327.

## 2026-06-01 — Socio-search: entrypoint HTTP puro + logica em services/ (APLICADO)

Decision: ao decompor `api/socio-search.ts` (1350L), manter o entrypoint HTTP como unico handler (`api/socio-search.ts`, 149L). Toda a logica de negocio extraida para `services/socio-search/` (6 modulos: types, cache, parser, scoring, orchestration, barrel).

Reason: Vercel conta cada `api/*.ts` como uma function. Criar novos handlers multipliicaria o numero de functions. A decomposicao para services/ (modulos internos, sem HTTP) mantem 15 `api/*.ts` — mesmo numero de antes. Nenhum custo adicional de infra. O barrel `services/socio-search/index.ts` re-exporta tudo, mantendo compatibilidade.

Contract: (1) `api/socio-search.ts` so faz parse do request, delegar para orchestration, e retornar resposta. (2) Nao criar novos `api/*.ts` durante decomposicao. (3) Usar barrel export em `services/socio-search/index.ts`. (4) Preservar `export const config` e `maxDuration` no entrypoint.

Refs: `api/socio-search.ts` -> `services/socio-search/`, commit `d7a4bc55`, PR #327.

## 2026-06-02 — sessionsRef fallback como airbag (APLICADO)

Decision: quando `updateSessionById` (waterfall-orchestrator.ts) falha ao encontrar a sessao (retorna undefined por React batching / race condition), usar `sessionsRef.current` como fallback sincrono para reconstruir o dossier. sessionsRef sync agora e feita em render-phase (inline no hook), nao em useEffect.

Reason: durante o waterfall, o React pode fazer batch de sets de estado. Se o cache de sessions esta limpo (primeira carga), `updateSessionById` olha o estado React que ainda nao foi atualizado. sessionsRef e uma ref sincrona — sempre tem o valor mais recente, independente do ciclo de render. O sync em render-phase (vs useEffect) elimina o delay de 1 frame e evita stale closure. O fallback busca a sessao na ref e reconstroi o dossier completo.

Contract: (1) tentar `updateSessionById(sessionId, partial)`. (2) Se retornar undefined, buscar em `sessionsRef.current`. (3) Se encontrou na ref, chamar handleSessionUpdate manualmente. (4) Se nem na ref existe, logar erro e retornar sem dossier. (5) Manter sync inline em render-phase (nao useEffect).

Refs: `hooks/useSessionStorage.ts`, `waterfall-orchestrator.ts`, commit `7ef4dbb4` e `dee6557c`, PR #328.

## 2026-06-02 — Merge funcional em setSessions (APLICADO)

Decision: ao carregar sessions do localStorage ou Supabase, usar `setSessions(prev => merge(loaded, prev))` em vez de `setSessions(() => loaded)`. O operador funcional com merge preserva sessions existentes que podem ter sido carregadas concorrentemente.

Reason: `setSessions(() => localSessions)` no `useAppInitialization` sobrescrevia sessions carregadas do Supabase pelo `useSessionStorage`. Em `session-controller.ts:251`, `setSessions(newSessions)` (array direto) filtrava sessoes mas perdia a referencia ao escopo fechado — o `newSessions` vinha de um stale closure, descartando sessions adicionadas entre a criacao do closure e sua execucao. O merge funcional com `prev` garante que sessions existentes nunca sejam perdidas.

Contract: toda chamada a `setSessions` que carrega dados de fonte externa (localStorage, Supabase) deve usar `prev => merge(loaded, prev)`. Chamadas de toggle/update local (marcar como lida, favoritar) podem continuar usando array direto.

Refs: `hooks/useAppInitialization.ts`, `features/chat/session-controller.ts:251`, commit `44951b6b`, PR #328.

## 2026-06-02 — Remover DossierShareBar do ChatInterface (APLICADO)

Decision: remover o componente `DossierShareBar` e todo o estado associado (`completedDossier`, listener `dossier:completed`) do `ChatInterface.tsx`.

Reason: o banner "Dossie concluido" no rodape gerava estado morto. O listener `dossier:completed` setava `completedDossier` que nunca era consumido por nada apos a remocao do fluxo de compartilhamento. Era codigo frio que adicionava complexidade sem valor. A funcionalidade de compartilhamento de dossie nao e mais parte do fluxo pos-waterfall.

Contract: `ChatInterface.tsx` nao deve mais importar nem referenciar `DossierShareBar`, `completedDossier`, ou `dossier:completed`. Se a funcionalidade de compartilhamento for reintroduzida, deve ser como componente independente, nao acoplado ao ChatInterface.

Refs: `components/ChatInterface.tsx`, commit `1a5100a9`, PR #328.
