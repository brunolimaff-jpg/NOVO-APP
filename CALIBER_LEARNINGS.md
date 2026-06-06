# Caliber Learnings — Senior Scout 360

Padroes e anti-padroes aprendidos de sessoes anteriores. Tratados como regras do projeto.

## Padroes confirmados

- **Supabase + IDB como cache offline** [react, typescript, supabase, offline]
  Offline-first com sync queue: IDB para leitura/escrita instantanea, Supabase como source of truth.
  Stale-while-revalidate nas leituras, fila com retry exponencial nas escritas.
  Aplicado com sucesso — migracao completa de idb-keyval para Supabase.

- **Validar intencao de produto alem do evento tecnico** [ux, feedback, supabase, produto]
  Ao validar fluxos de produto, confirmar se o comportamento real representa a intencao esperada, nao apenas se o evento chegou no destino tecnico.
  Exemplo: feedback chegou no Supabase, mas cliques repetidos revelaram duplicacao e o clique negativo dependia de motivo + confirmacao.
  Validacao boa cruza banco, UX e semantica esperada antes de concluir que "funcionou".

- Prompts Gemini com XML delimiters tem menor taxa de alucinacao
- Score PORTA deve sempre ser gerado com temperatura 0.1 (factual)
- Search Grounding nunca deve ser cacheado — dados de empresa mudam
- Skeleton screens com dimensoes fixas eliminam layout shift no streaming
- Validar CNPJ antes de qualquer chamada IA evita desperdicio de tokens
- Pool de fontes cumulativo entre modulos do waterfall reduz alucinacao de links em modulos sem grounding
- Pipeline unico de integridade ao final (nao por modulo) e idempotente e evita duplicacao de fontes
- Tres categorias de fontes (citadas, consultadas, inferidas) dao transparencia completa ao usuario

## Anti-padroes identificados

- Prompt inline no componente: dificulta versionamento e teste
- catch vazio em chamadas Gemini: vendedor ve tela travada sem saber o motivo
- `any` em tipos de resposta da IA: propaga erros silenciosos para o dossier
- Cache de Search Grounding: dossier com dados desatualizados compromete credibilidade na reuniao
- `break` em fallback de busca web: um modulo degradado nao deve abortar o pipeline inteiro; `continue` preserva resiliencia e fontes de modulos anteriores
- `?? 'hero'` em `loadingVariant`: coerção de `undefined` para valor padrao ignora semantica do nulo; comparar explicitamente com `=== 'hero'`
- `useMemo` para strings primitivas: desnecessario e mais complexo que concatenacao direta de string — React ja compara `===` em deps de useEffect

- **Benchmark timeout reduzido para 20s** [performance, benchmark, timeout]
  `MODULAR_BENCHMARK_TIMEOUT_MS` de 45000 para 20000. Benchmark e etapa opcional — timeout curto evita travamento do loading.

- **completeLoadingProgress() no finally** [loading, react, safe]
  `setIsLoading(false)` no finally nao basta: o progress tracker interno do LoadingSmart precisa ser resetado com `completeLoadingProgress()`. Sem isso, o proximo request herda estado zombi.

- **Timeout aninhado multiplica tempo real** [api, timeout, anti-pattern]
  Camadas de retry (fetchWithRetry 3x, cold-start, withAutoRetry 3x) acumulam delay mesmo com timeout externo. Cada camada adiciona seu proprio tempo de execucao. Para etapas opcionais, 1 tentativa com timeout curto e melhor que multiplos retries.

- **Preview Vercel revela bugs de rede que testes nao pegam** [testing, deploy, vercel]
  Travamento do LoadingSmart so apareceu no preview Vercel. Testes unitarios nao cobrem comportamento real de HTTP (benchmark lento, cold-start). Preview deploy e gate obrigatorio antes de merge.

- **Evento + cleanup no mesmo ciclo destroi estado** [react, useEffect, evento]
  useEffect cleanup que limpa `completedDossier` roda antes da proxima render, mas se o event listener esta no mesmo ciclo, o cleanup executa antes do consumo. O componente nunca ve o estado.

- **Catch silencioso em consulta cria duplicata no Supabase** [supabase, catch, duplicata]
  `findExistingDossier` retorna `null` no catch. O caller interpreta null como "nao existe" e cria novo registro. Nunca usar `return null` em catch de funcao de consulta sem log ou fallback.

- **Cross-device: Supabase e IDB fora de sync** [offline, supabase, indexddb, sync]
  `findExistingDossier` consulta Supabase, `getDossier` so le IndexedDB. Em device B, o dossier existe no Supabase mas getDossier retorna null. Toda consulta entre fontes precisa de protocolo de sync claro.

- **Componente condicional sem `key` causa estado stale** [react, key, componente]
  `DossierShareBar` sem `key={dossierId}` faz React reutilizar a instancia do componente, exibindo dados do dossier anterior. Toda renderizacao condicional que depende de props mutaveis precisa de key.

- **Code review max-effort exige consolidacao pos-review** [code-review, qualidade]
  65 findings brutos precisam ser filtrados e agrupados. Sem consolidacao, a fila de correcao fica poluida com ruido. Findings repetidos (mesmo bug em arquivos diferentes) devem ser deduplicados antes de apresentar.

- **cnpjDigits guard aceita CPF (11 digitos)** [validacao, cnpj, cpf]
  `>= 11` aceita CPF. Validacao de CNPJ deve ser `=== 14`, nunca `>= 11`.

- **window.open sem noreferrer vaza token** [seguranca, compartilhamento]
  URL de compartilhamento pode conter params sensiveis. `window.open(url)` exige `noopener,noreferrer`.

- **CustomEvent sem tipo compartilhado quebra listener** [eventos, typescript, manutencao]
  Strings de evento como `dossier:completed` sao literais sem constante. Um typo quebra o listener silenciosamente. Todo CustomEvent deve ter seu tipo em `types.ts`.

- **isThinking:true persistido bloqueia renderizacao pos-reload** [supabase, hidratacao, ui-transiente]
  Estados transientes de UI (`isThinking`, `loadingVariant`, `isSourcesOpen`) sao persistidos no Supabase via `content` JSONB. No reload, `ChatInterface.tsx:296` filtra mensagens com `isThinking:true` → timeline vazia. Solucao: `stripTransientState()` no save, normalizacao no load.

- **Supabase .upsert() resolve com {error}, nunca rejeita** [supabase, promessas, anti-padrao]
  `Promise.allSettled` com upsert individual nunca detecta falhas porque o cliente Supabase resolve a Promise mesmo com erro. `r.status === 'rejected'` sempre captura zero. Solucao: bulk upsert (array no `.upsert()`) ou verificar `r.value.error` em cada fulfilled.

- **.single() gera erro falso PGRST116 no console** [supabase, ux, log]
  `.single()` do Supabase retorna erro HTTP quando registro nao existe — mesmo em fluxo normal de "dossier ainda nao criado". Trocar por `.maybeSingle()` elimina erro falso.

- **Migracao IDB→Supabase offline conta como sucesso** [migracao, offline, falha-silenciosa]
  `saveDossier` retorna void sem throw quando `!isSupabaseAvailable()`. Migracao incrementa contador e seta flag permanente sem verificar se upsert real ocorreu. Solucao: verificar `isSupabaseAvailable()` no topo da migracao, retornar sem setar flag.

- **deleteDossier nunca chamado pelo fluxo de UI** [delete, controller, persistencia]
  `handleDeleteSession` removia apenas do estado React. `storage.deleteDossier` existia mas nunca era chamado. Dossie "deletado" reaparecia no reload. Solucao: fire-and-forget `storage.deleteDossier(id)` no controller.

- **setState em hook nao consumido causa re-render colateral** [react, hook, loading]
  `isLoading`/`setIsLoading` no `useSessionStorage` nunca era consumido por nenhum componente. O `setIsLoading(false)` no finally da carga inicial disparava re-render que colidia com `completeLoadingProgress()` do LoadingSmart. Solucao: remover estado nao consumido.

- **Phase 2 do useAppInitialization substitui sessoes (perda de dados)** [merge, inicializacao, legacy]
  `listRemoteSessions` (Apps Script legado) sempre retorna `messages: []`. `setSessions(() => remoteList)` substituia sessoes carregadas do Supabase na Fase 1 por lista vazia da Fase 2. Solucao: remover Fase 2 — Supabase ja e fonte unica.

- **Bulk upsert vs N chamadas individuais** [supabase, performance, rede]
  `saveAllDossiers` fazia N chamadas HTTP individuais via `Promise.allSettled`. Supabase suporta array no `.upsert()` — 1 unica requisicao. Reduz latencia e evita rate limit.

- **E2E com modal de migracao bloqueia cliques** [test, e2e, modal]
  Modal "Agora seus dados ficam salvos na nuvem!" intercepta pointer events e bloqueia clicks em testes E2E no preview. Solucao: `page.addInitScript(() => localStorage.setItem('scout360:supabase_migration_seen', 'true'))` antes de `page.goto()`.

- **Floodgate global previne restart loop melhor que trava local** [react, waterfall, restart-loop, concorrencia]
  O restart loop era causado por 3 waterfalls concorrentes disparados por re-render/re-entry. Uma trava local (checar se sessao ja esta rodando) nao bastava porque o problema era global — um waterfall de sessao A colidia com waterfall de sessao B. Solucao: `Map<sessionId, WaterfallGuardState>` + `globalActiveRunId` no modulo, `registerWaterfallStart()` bloquear se qualquer waterfall estiver ativo.

- **`let cleanupPostCompletion` perde referencia entre renders** [react, useRef, hook, cleanup]
  Uma variavel `let` declarada no corpo do hook (fora de useRef) tem seu valor perdido quando o hook re-renderiza. O `cleanupPostCompletion` nunca era chamado na proxima execucao porque a variavel ja era `null`. Solucao: usar `useRef<() => void>` para preservar a referencia atraves dos renders.

- **Restart loop so aparece em producao, nao em testes** [testing, debug, waterfall, restart-loop]
  O restart loop do waterfall nunca foi detectado em testes unitarios (1249 passando). So apareceu em preview Vercel e producao porque depende de timing real de re-render, estado de DOM, e latencia da API Gemini. Os diagnosticos via `scoutDiag.warn('PostCompletion', 'RESTART-DETECTED')` no Supabase revelaram o ponto exato sem precisar de breakpoints ou logs locais.

- **scoutDiag.warn para diagnostico em producao** [debug, supabase, log, producao]
  `scoutDiag.info()` em loops rapidos gera spam no Supabase. `scoutDiag.warn()` com payload rico (generationDelta, baselineGeneration, runId) e filtro condicional (so loga quando `isRestarting`) manteve os logs uteis e o volume baixo. Usar warn em vez de info para eventos de diagnostico que devem ser visiveis mesmo em ambiente com filtro de log.

- **React.StrictMode em producao causa double-invocation de renders** [react, strictmode, producao, restart-loop]
  `React.StrictMode` ativo em producao (`index.tsx`) faz React invocar renders duas vezes intencionalmente para detectar side effects. Isso disparava `processMessage` multiplas vezes, cada uma criando uma nova sessao de waterfall e setando `isLoading=true`, deixando a UI travada. O `callerStack` diagnostic no `processMessage:start` confirmou que a origem era o scheduler do React, nao acao do usuario. Solucao: `StrictMode` apenas em desenvolvimento (`process.env.NODE_ENV !== 'production'`).

- **Re-entry guard antes de setIsLoading** [react, guard, loading, restart-loop]
  Em `processMessage`, o guard `isAnyWaterfallActive()` deve vir ANTES de `setIsLoading(true)`. Se o guard estiver depois, o estado de loading ja foi setado e a UI fica em estado inconsistente mesmo que o waterfall seja bloqueado em seguida. Solucao: checar `activeGenerationRef.current || isAnyWaterfallActive()` no topo do `processMessage`, antes de qualquer mutacao de estado.

- **callerStack diagnostic revela origem do restart** [debug, diagnostic, waterfall, restart-loop]
  `new Error().stack` em `processMessage:start` logado no `scoutDiag` revelou que o waterfall era disparado pelo scheduler do React (re-render), nao por clique do usuario. Sem esse diagnostico, a causa raiz (StrictMode em producao) teria sido muito mais dificil de encontrar. Solucao: manter `callerStack` como parte do diagnostic pack do waterfall — debug barato que elimina hipoteses rapidamente.

- **generationBefore/After guard evita dossier:completed falso** [eventbus, guard, waterfall, restart-loop]
  `processMessage` salvava `generationBefore` no inicio e comparava com `generationAfter` antes de emitir `dossier:completed`. Se a geracao mudou durante a execucao (outro waterfall foi iniciado), o evento nao e emitido. Isso evita que o consumidor receba um `dossier:completed` de uma sessao que ja foi substituida.

- **loadingVariant zera no finally, não em completeLoadingProgress** [loading, freeze, hero, virtuoso]
  `completeLoadingProgress()` só finaliza etapas. `setLoadingVariant(undefined)` junto de `setIsLoading(false)` no `finally`. Overlay/timeline usam `isLoading && variant !== 'inline'` para cobrir janela com variant undefined.

- **lookupCnpj é server-only — browser deve usar fetchCompanyByCnpj via /api/cnpj** [cnpj, cors, browser, proxy]
  `lib/cnpjLookup.ts:lookupCnpj` chama APIs externas (BrasilAPI, CNPJ.ws, MinhaReceita) diretamente — causa CORS garantido quando chamado do browser. Sintoma: console com "Access-Control-Allow-Origin", coluna CNAE vazia, "todas as fontes falharam". Solucao: no browser, sempre usar `fetchCompanyByCnpj` de `services/brasilApiService` que roteia via `/api/cnpj` (proxy Vercel). O `lookupCnpj` deve ser usado apenas em contexto server (API routes ou scripts Node). Adicionado comentario server-only em `lib/cnpjLookup.ts` e guardas no codigo.

- **hasRenderableBotMessage deve incluir preview isThinking com texto suficiente** [waterfall, preview, timeline, blank-panel]
  `hasRenderableBotMessage` original exigia `!isThinking`, portanto bloqueava a timeline durante TODO o waterfall mesmo com preview de >200 chars disponivel. `shouldSuspendHeroMessageTimeline` ficava `true` → painel central vazio (blank panel) durante waterfall. Fix: considerar renderizavel quando `!isThinking || text.trim().length >= 200` (WATERFALL_PREVIEW_MIN_CHARS). O overlay hero continua visivel (via `shouldShowHeroLoadingOverlay`), mas a timeline mostra preview incremental.

- **CNAE enrichment deve ser deferido com requestIdleCallback para nao bloquear main thread pos-waterfall** [performance, cnae, requestIdleCallback, freeze]
  Quando o waterfall termina e isLoading vai a false, o React monta o dossie completo + SocietaryMap dispara 6x `/api/socio-search` + CNAE enrichment em paralelo. Isso saturava o main thread e causava "Pagina sem resposta". Fix: encapsular o enrich() em `requestIdleCallback` (com fallback `setTimeout(fn, 0)`) para que o enriquecimento CNAE ocorra em tempo ocioso. Tambem usa AbortController para cancelar na desmontagem.

- **virtuosoOverscan 1400 agrava freeze quando dossie tem SocietaryMap** [performance, virtuoso, overscan, teia]
  `virtuosoOverscan=1400` para dossies longos causava re-montagem do SocietaryMap ao rolar, disparando novos lotes de QSA + CNAE. Fix: detectar mensagens com "teia societaria" e reduzir overscan para 600 nesses casos.

- **Não fazer flushWaterfallPreview por módulo no waterfall** [performance, freeze, virtuoso]
  Re-render da sessão inteira a cada módulo (>200 chars) montava Virtuoso durante hero loading. Remover flush por módulo; consolidar no final.

- **Stop sem AbortController deve invalidar activeGenerationRef** [abort, stop, waterfall]
  `handleStopGeneration` limpa UI e delete `activeGenerationRef[sessionId]`; waterfall checa antes de `updateSessionById` final.

- **expectedBotCharsMax deve incluir texto em isThinking** [blank-panel, virtuoso, telemetria]
  `computeExpectedBotContent` ignorava preview do bot com `isThinking:true`. Timers e fallback proativo subestimavam o dossiê em formação. Incluir `isThinking` na contagem de chars.

- **Fallback estático proativo para dossiês grandes (≥4k chars)** [virtuoso, blank-panel, performance]
  Ao fim do loading hero, se o bot já tem ≥4.000 caracteres, ativar timeline estática antes do Virtuoso. Evita painel branco pós-waterfall em Scheffer (~30k chars) sem depender só do detector reativo.

- **Primeiro delay de blank-panel em 750ms, não 0ms** [virtuoso, false-positive, blank-panel]
  Checagem em 0ms pega Virtuoso antes de montar `message-row` → falsos positivos de fallback. O proativo já cobre dossiês grandes; manter `[750, 2000, 5000, 9000]`.

- **Virtuoso mount com viewport 0×0 no handoff pós-loading** [virtuoso, blank-panel, diagnostico]
  Logs: `virtuoso:mount` com `viewportWidth/Height: 0` seguido de `static-fallback-rendered`. `itemsRendered` não prova DOM visível — validar `PostCompletion` e fallback.

- **Gemini 500 em módulo opcional não aborta waterfall** [gemini, modular-dossier, resiliencia]
  Bordas de Controle 500 → ignorado; retry PORTA depois conclui. Não confundir erro de módulo opcional com falha total do dossiê.

- **Burst CNPJ sócios com AbortSignal pós-dossiê** [cnpj, societary-map, react]
  Após fim do loading, dezenas de `iniciando lookup` + `signal is aborted without reason` em CNPJs de sócios. Causa provável: effect com `[graph, cnaeMap]` remontando e abortando batch — PR separada.

- **Sentry vazio não invalida incidente de UI** [sentry, supabase, observabilidade]
  7d sem eventos Sentry para blank/gemini; tudo em `scout_diagnostics`. Triagem de regressão visual: Supabase primeiro.

- **E2E sem PII real nos defaults** [e2e, seguranca, playwright]
  Defaults `E2E Operator` / `e2e.operator@example.com`; identidade real só via env em smoke local.

- **Service Worker CacheFirst bloqueia atualizações em produção** [pwa, service-worker, cache, deploy]
  CacheFirst para bundles JS/CSS em SPA com deploy frequente prende usuários em versões antigas. Preview sem SW nunca reproduz o bug. Solução: remover PWA/SW ou usar NetworkFirst com asset versioning.

- **Preview sem SW vs Produção com SW cria falsa confiança** [pwa, validacao, homologacao]
  Concluir que "preview funcionou = produção vai funcionar" sem checar configuração de SW/PWA é enganoso. Toda validação pré-produção deve verificar se o cache de SW está ativo.

- **DOM cleanup com .remove() quebra reconciliação do React** [react, dom, overlay, cleanup]
  Remover elemento do DOM via `.remove()` sem React saber causa desync entre virtual DOM e real DOM. Overlay continua visualmente presente mesmo com `setIsLoading(false)`. Usar `display:none` no elemento raiz.

- **useMemo deve ser puro; side effects pertencem ao useEffect** [react, usememo, performance]
  `useMemo` é para computação derivada síncrona. Colocar manipulação de DOM, chamadas assíncronas ou leitura de `window.location` dentro de `useMemo` quebra o contrato do React.

- **Optional chaining deve ir até o fim da cadeia** [typescript, null-safety, optional-chaining]
  `text?.trim()` não previne erro se `trim` retornar null. Cadeia completa: `text?.trim()?.length`. O último acesso também precisa de `?.`.

- **Sempre incluir hostname em logs de diagnóstico** [debug, logging, ambiente]
  Logs de produção e preview parecem idênticos sem o hostname. Incluir `window.location.hostname` em todo log de diagnóstico que depende de ambiente.

- **Hard invariant como airbag contra UI quebrada** [react, invariante, ui, safety-net, waterfall]
  Quando o estado React pode falhar (race condition, desync), um hard invariant que forçadamente libera o estado (setIsLoading(false) + display:none) funciona como última barreira. Deve ser acionado por condições observáveis (waterfallEndStatus completed/failed/partial, botMsgTextLen > 0), não por chain de estado.

- **NUNCA nullificar abortControllerRef fora do processMessage:finally** [waterfall, abort, processmessage, bleeding-edge]
  `finalizeWaterfallUI` (chamado no `finally` do `processMessage`) não deve nullificar `abortControllerRef`. Se o ref é limpo antes do `processMessage:finally` terminar, `isAbort=true` detecta abort falso e `flushDiagnosticsNow` nunca é chamado. O `abortControllerRef` pertence ao ciclo de vida do `processMessage`, não ao helper de UI.

- **NUNCA usar TreeWalker/document.body scan para DOM cleanup** [performance, dom, treewalker, main-thread]
  `document.createTreeWalker(document.body)` percorre o DOM inteiro em busca de seletores — bloqueia a main thread por dezenas de ms em arvores grandes. Substituir por `querySelector` direto com 3 seletores alvo, sem escanear o body inteiro.

- **DOM cleanup DOM display:none é safety net; React render condition é primário** [react, dom, cleanup, overlay, safety-net]
  O `requestAnimationFrame` + `querySelector` + `style.display='none'` no DOM existe como safety net para casos onde o React não conseguiu renderizar (erro, crash). Mas o mecanismo PRIMÁRIO de liberação do overlay é a condição de renderização React (`shouldShowHeroLoadingOverlay` retornando `false`). DOM cleanup nunca deve ser o fluxo principal.

- **hasRenderableBotMessage como condição em TODOS os gates de loading** [waterfall, loading, overlay, gate]
  `hasRenderableBotMessage` deve ser verificado em qualquer gate que decida mostrar ou esconder overlay/hero. Se a mensagem do bot já é renderizável (texto >= WATERFALL_PREVIEW_MIN_CHARS), o overlay não deve mais bloquear, independente de `isLoading` ainda ser `true`.

## Bug P0 overlay hero (Junho 2026) — 14 novos aprendizados

- **Service Worker CacheFirst bloqueia atualizações em produção** [pwa, service-worker, cache, deploy]
  CacheFirst para bundles JS/CSS em SPA com deploy frequente prende usuários em versões antigas. Preview sem SW nunca reproduz o bug. Solução: remover PWA/SW ou usar NetworkFirst com asset versioning.

- **Preview sem SW vs Produção com SW cria falsa confiança** [pwa, validacao, homologacao]
  Concluir que "preview funcionou = produção vai funcionar" sem checar configuração de SW/PWA é enganoso. Toda validação pré-produção deve verificar se o cache de SW está ativo.

- **DOM cleanup com .remove() quebra reconciliação do React** [react, dom, overlay, cleanup]
  Remover elemento do DOM via `.remove()` sem React saber causa desync entre virtual DOM e real DOM. Overlay continua visualmente presente mesmo com `setIsLoading(false)`. Usar `display:none` no elemento raiz.

- **NUNCA nullificar abortControllerRef fora do processMessage:finally** [waterfall, abort, processmessage, bleeding-edge]
  `finalizeWaterfallUI` (chamado no `finally` do `processMessage`) não deve nullificar `abortControllerRef`. Se o ref é limpo antes do `processMessage:finally` terminar, `isAbort=true` detecta abort falso e `flushDiagnosticsNow` nunca é chamado. O `abortControllerRef` pertence ao ciclo de vida do `processMessage`, não ao helper de UI.

- **NUNCA usar TreeWalker/document.body scan para DOM cleanup** [performance, dom, treewalker, main-thread]
  `document.createTreeWalker(document.body)` percorre o DOM inteiro em busca de seletores — bloqueia a main thread por dezenas de ms em árvores grandes. Substituir por `querySelector` direto com 3 seletores alvo, sem escanear o body inteiro.

- **DOM cleanup DOM display:none é safety net; React render condition é primário** [react, dom, cleanup, overlay, safety-net]
  O `requestAnimationFrame` + `querySelector` + `style.display='none'` no DOM existe como safety net. Mas o mecanismo PRIMÁRIO de liberação do overlay é a condição de renderização React (`shouldShowHeroLoadingOverlay` retornando `false`). DOM cleanup nunca deve ser o fluxo principal.

- **h-full não funciona em filho de flex item com flex-basis:0%** [css, flexbox, layout, display-none]
  `height:100%` de um pai com `flex-basis:0%` (via `flex-1`) = 0px. Browser colapsa o elemento com `display:none`. O filho deve usar `flex-1` em vez de `h-full` para herdar altura real.

- **absolute inset-0 causa display:none em certos contextos de flex** [css, flexbox, layout, display-none]
  `absolute inset-0` como fallback de layout pode colapsar em contextos de flex container. Testar sempre com conteúdo real grande (>20KB). Preferir `h-full w-full` + `flex-col` parent.

- **Preview Vercel revela bugs de layout que testes unitários não pegam** [css, layout, testing, vercel]
  Layout rendering, CSS cascata, flex box só aparecem em browser real com dados reais. Smoke visual no preview é gate obrigatório antes de merge para mudanças de CSS/layout.

- **Mock de scoutDiag precisa incluir debug: vi.fn()** [testing, mock, debug, scoutDiag]
  Se `scoutDiag.debug()` é adicionado ao código de produção, os mocks nos testes precisam incluir `debug: vi.fn()` senão a chamada quebra silenciosamente. Toda vez que adicionar `scoutDiag.debug()`, verificar/atualizar os mocks.

- **Sempre incluir hostname em logs de diagnóstico** [debug, logging, ambiente]
  Logs de produção e preview parecem idênticos sem o hostname. `scoutagro.vercel.app` alias pode servir código sem estar no projeto. Incluir `window.location.hostname` em todo log de diagnóstico.

- **Vercel alias órfão pode servir código sem estar no projeto** [vercel, deploy, domains, alias]
  O alias `scoutagro.vercel.app` servia o mesmo código mas não estava listado nos domains do projeto Vercel. Verificar dashboard Vercel > Domains para confirmar quais alias estão registrados.

- **flushDiagnosticsNow sincrono pos-setState bloqueia React re-render** [react, setstate, render, settimeout, freeze]
	  `flushDiagnosticsNow` chamado sincronamente no mesmo tick depois de `setIsLoading(false)` bloqueava o React re-render. O setState dispara render sincrono, mas o flush monopoliza a main thread. Playwright mostrou zero eventos pos-render. Solucao: `setTimeout(0)` com o flush, agendado ANTES do setState.

- **Agendar setTimeout ANTES do setState, nao depois** [react, settimeout, macrotask, event-loop]
	  Se o `setTimeout` com `flushDiagnosticsNow` for agendado DEPOIS do `setState`, o callback nunca roda ate o render terminar. Agendando ANTES, o timer ja esta na macrotask queue quando o React comeca a renderizar, e dispara assim que o render sincrono termina. O `setTimeout(0)` vira ponto de handoff entre render sincrono e flush assincrono.

- **createDeferred polyfill para Promise.withResolvers** [node, vitest, compatibilidade, polyfill]
		  `Promise.withResolvers()` e API Node 22+. CI do GitHub Actions roda Node 20. Testes que usam `Promise.withResolvers()` quebram em runtime com `TypeError`. Solucao: helper `createDeferred<T>()` local com `new Promise` + resolve/reject manuais. Nao basta `ES2024` no `lib` do tsconfig — isso so resolve typecheck, nao runtime.

	<!-- caliber:managed:learnings -->

_Atualizado automaticamente pelo Caliber apos sessoes de agente._

<!-- /caliber:managed:learnings -->
