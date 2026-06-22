# Caliber Learnings — Senior Scout 360

Padroes e anti-padroes aprendidos de sessoes anteriores. Tratados como regras do projeto.

## Padroes confirmados

- **Supabase + IDB como cache offline** [react, typescript, supabase, offline] ⚠️ HISTORICO
  Offline-first com sync queue: IDB para leitura/escrita instantanea, Supabase como source of truth.
  Stale-while-revalidate nas leituras, fila com retry exponencial nas escritas.
  ~~Aplicado com sucesso — migracao completa de idb-keyval para Supabase.~~
  **Removido na PR #317 (31/05/2026).** Substituido por Supabase direto como fonte unica.

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

- **[HISTORICO] Cross-device: Supabase e IDB fora de sync** [offline, supabase, indexddb, sync]
  ~~`findExistingDossier` consulta Supabase, `getDossier` so le IndexedDB. Em device B, o dossier existe no Supabase mas getDossier retorna null. Toda consulta entre fontes precisa de protocolo de sync claro.~~
  Este anti-padrao era especifico da arquitetura IDB removida na PR #317. O principio geral (nao ter duas fontes de verdade) permanece valido.

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
  Estados transientes de UI (`isThinking`, `loadingVariant`, `isSourcesOpen`) sao persistidos no Supabase via `content` JSONB. No reload, `ChatInterface.tsx:296` filtra mensagens com `isThinking:true` -> timeline vazia. Solucao: `stripTransientState()` no save, normalizacao no load.

- **Supabase .upsert() resolve com {error}, nunca rejeita** [supabase, promessas, anti-padrao]
  `Promise.allSettled` com upsert individual nunca detecta falhas porque o cliente Supabase resolve a Promise mesmo com erro. `r.status === 'rejected'` sempre captura zero. Solucao: bulk upsert (array no `.upsert()`) ou verificar `r.value.error` em cada fulfilled.

- **.single() gera erro falso PGRST116 no console** [supabase, ux, log]
  `.single()` do Supabase retorna erro HTTP quando registro nao existe — mesmo em fluxo normal de "dossier ainda nao criado". Trocar por `.maybeSingle()` elimina erro falso.

- **[HISTORICO] Migracao IDB->Supabase offline conta como sucesso** [migracao, offline, falha-silenciosa]
  ~~`saveDossier` retorna void sem throw quando `!isSupabaseAvailable()`. Migracao incrementa contador e seta flag permanente sem verificar se upsert real ocorreu. Solucao: verificar `isSupabaseAvailable()` no topo da migracao, retornar sem setar flag.~~
  Migracao concluida. Flag permanente ja setada. Nao aplicavel ao codigo atual.

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

- **loadingVariant zera no finally, nao em completeLoadingProgress** [loading, freeze, hero, virtuoso]
  `completeLoadingProgress()` so finaliza etapas. `setLoadingVariant(undefined)` junto de `setIsLoading(false)` no `finally`. Overlay/timeline usam `isLoading && variant !== 'inline'` para cobrir janela com variant undefined.

- **lookupCnpj e server-only — browser deve usar fetchCompanyByCnpj via /api/cnpj** [cnpj, cors, browser, proxy]
  `lib/cnpjLookup.ts:lookupCnpj` chama APIs externas (BrasilAPI, CNPJ.ws, MinhaReceita) diretamente — causa CORS garantido quando chamado do browser. Sintoma: console com "Access-Control-Allow-Origin", coluna CNAE vazia, "todas as fontes falharam". Solucao: no browser, sempre usar `fetchCompanyByCnpj` de `services/brasilApiService` que roteia via `/api/cnpj` (proxy Vercel). O `lookupCnpj` deve ser usado apenas em contexto server (API routes ou scripts Node). Adicionado comentario server-only em `lib/cnpjLookup.ts` e guardas no codigo.

- **hasRenderableBotMessage deve incluir preview isThinking com texto suficiente** [waterfall, preview, timeline, blank-panel]
  `hasRenderableBotMessage` original exigia `!isThinking`, portanto bloqueava a timeline durante TODO o waterfall mesmo com preview de >200 chars disponivel. `shouldSuspendHeroMessageTimeline` ficava `true` -> painel central vazio (blank panel) durante waterfall. Fix: considerar renderizavel quando `!isThinking || text.trim().length >= 200` (WATERFALL_PREVIEW_MIN_CHARS). O overlay hero continua visivel (via `shouldShowHeroLoadingOverlay`), mas a timeline mostra preview incremental.

- **CNAE enrichment deve ser deferido com requestIdleCallback para nao bloquear main thread pos-waterfall** [performance, cnae, requestIdleCallback, freeze]
  Quando o waterfall termina e isLoading vai a false, o React monta o dossie completo + SocietaryMap dispara 6x `/api/socio-search` + CNAE enrichment em paralelo. Isso saturava o main thread e causava "Pagina sem resposta". Fix: encapsular o enrich() em `requestIdleCallback` (com fallback `setTimeout(fn, 0)`) para que o enriquecimento CNAE ocorra em tempo ocioso. Tambem usa AbortController para cancelar na desmontagem.

- **virtuosoOverscan 1400 agrava freeze quando dossie tem SocietaryMap** [performance, virtuoso, overscan, teia]
  `virtuosoOverscan=1400` para dossies longos causava re-montagem do SocietaryMap ao rolar, disparando novos lotes de QSA + CNAE. Fix: detectar mensagens com "teia societaria" e reduzir overscan para 600 nesses casos.

- **Nao fazer flushWaterfallPreview por modulo no waterfall** [performance, freeze, virtuoso]
  Re-render da sessao inteira a cada modulo (>200 chars) montava Virtuoso durante hero loading. Remover flush por modulo; consolidar no final.

- **Stop sem AbortController deve invalidar activeGenerationRef** [abort, stop, waterfall]
  `handleStopGeneration` limpa UI e delete `activeGenerationRef[sessionId]`; waterfall checa antes de `updateSessionById` final.

- **expectedBotCharsMax deve incluir texto em isThinking** [blank-panel, virtuoso, telemetria]
  `computeExpectedBotContent` ignorava preview do bot com `isThinking:true`. Timers e fallback proativo subestimavam o dossier em formacao. Incluir `isThinking` na contagem de chars.

- **Fallback estatico proativo para dossies grandes (>=4k chars)** [virtuoso, blank-panel, performance]
  Ao fim do loading hero, se o bot ja tem >=4.000 caracteres, ativar timeline estatica antes do Virtuoso. Evita painel branco pos-waterfall em Scheffer (~30k chars) sem depender so do detector reativo.

- **Primeiro delay de blank-panel em 750ms, nao 0ms** [virtuoso, false-positive, blank-panel]
  Checagem em 0ms pega Virtuoso antes de montar `message-row` -> falsos positivos de fallback. O proativo ja cobre dossies grandes; manter `[750, 2000, 5000, 9000]`.

- **Virtuoso mount com viewport 0x0 no handoff pos-loading** [virtuoso, blank-panel, diagnostico]
  Logs: `virtuoso:mount` com `viewportWidth/Height: 0` seguido de `static-fallback-rendered`. `itemsRendered` nao prova DOM visivel — validar `PostCompletion` e fallback.

- **Gemini 500 em modulo opcional nao aborta waterfall** [gemini, modular-dossier, resiliencia]
  Bordas de Controle 500 -> ignorado; retry PORTA depois conclui. Nao confundir erro de modulo opcional com falha total do dossier.

- **Burst CNPJ socios com AbortSignal pos-dossier** [cnpj, societary-map, react]
  Apos fim do loading, dezenas de `iniciando lookup` + `signal is aborted without reason` em CNPJs de socios. Causa provavel: effect com `[graph, cnaeMap]` remontando e abortando batch — PR separada.

- **Sentry vazio nao invalida incidente de UI** [sentry, supabase, observabilidade]
  7d sem eventos Sentry para blank/gemini; tudo em `scout_diagnostics`. Triagem de regressao visual: Supabase primeiro.

- **E2E sem PII real nos defaults** [e2e, seguranca, playwright]
  Defaults `E2E Operator` / `e2e.operator@example.com`; identidade real so via env em smoke local.

- **Service Worker CacheFirst bloqueia atualizacoes em producao** [pwa, service-worker, cache, deploy]
  CacheFirst para bundles JS/CSS em SPA com deploy frequente prende usuarios em versoes antigas. Preview sem SW nunca reproduz o bug. Solucao: remover PWA/SW ou usar NetworkFirst com asset versioning.

- **Preview sem SW vs Producao com SW cria falsa confianca** [pwa, validacao, homologacao]
  Concluir que "preview funcionou = producao vai funcionar" sem checar configuracao de SW/PWA e enganoso. Toda validacao pre-producao deve verificar se o cache de SW esta ativo.

- **DOM cleanup com .remove() quebra reconciliacao do React** [react, dom, overlay, cleanup]
  Remover elemento do DOM via `.remove()` sem React saber causa desync entre virtual DOM e real DOM. Overlay continua visualmente presente mesmo com `setIsLoading(false)`. Usar `display:none` no elemento raiz.

- **useMemo deve ser puro; side effects pertencem ao useEffect** [react, usememo, performance]
  `useMemo` e para computacao derivada sincrona. Colocar manipulacao de DOM, chamadas assincronas ou leitura de `window.location` dentro de `useMemo` quebra o contrato do React.

- **Optional chaining deve ir ate o fim da cadeia** [typescript, null-safety, optional-chaining]
  `text?.trim()` nao previne erro se `trim` retornar null. Cadeia completa: `text?.trim()?.length`. O ultimo acesso tambem precisa de `?.`.

- **Sempre incluir hostname em logs de diagnostico** [debug, logging, ambiente]
  Logs de producao e preview parecem identicos sem o hostname. Incluir `window.location.hostname` em todo log de diagnostico que depende de ambiente.

- **Hard invariant como airbag contra UI quebrada** [react, invariante, ui, safety-net, waterfall]
  Quando o estado React pode falhar (race condition, desync), um hard invariant que forcadamente libera o estado (setIsLoading(false) + display:none) funciona como ultima barreira. Deve ser acionado por condicoes observaveis (waterfallEndStatus completed/failed/partial, botMsgTextLen > 0), nao por chain de estado.

- **NUNCA nullificar abortControllerRef fora do processMessage:finally** [waterfall, abort, processmessage, bleeding-edge]
  `finalizeWaterfallUI` (chamado no `finally` do `processMessage`) nao deve nullificar `abortControllerRef`. Se o ref e limpo antes do `processMessage:finally` terminar, `isAbort=true` detecta abort falso e `flushDiagnosticsNow` nunca e chamado. O `abortControllerRef` pertence ao ciclo de vida do `processMessage`, nao ao helper de UI.

- **NUNCA usar TreeWalker/document.body scan para DOM cleanup** [performance, dom, treewalker, main-thread]
  `document.createTreeWalker(document.body)` percorre o DOM inteiro em busca de seletores — bloqueia a main thread por dezenas de ms em arvores grandes. Substituir por `querySelector` direto com 3 seletores alvo, sem escanear o body inteiro.

- **DOM cleanup DOM display:none e safety net; React render condition e primario** [react, dom, cleanup, overlay, safety-net]
  O `requestAnimationFrame` + `querySelector` + `style.display='none'` no DOM existe como safety net para casos onde o React nao conseguiu renderizar (erro, crash). Mas o mecanismo PRIMARIO de liberacao do overlay e a condicao de renderizacao React (`shouldShowHeroLoadingOverlay` retornando `false`). DOM cleanup nunca deve ser o fluxo principal.

- **hasRenderableBotMessage como condicao em TODOS os gates de loading** [waterfall, loading, overlay, gate]
  `hasRenderableBotMessage` deve ser verificado em qualquer gate que decida mostrar ou esconder overlay/hero. Se a mensagem do bot ja e renderizavel (texto >= WATERFALL_PREVIEW_MIN_CHARS), o overlay nao deve mais bloquear, independente de `isLoading` ainda ser `true`.

- **AbortSignal.timeout() cobre apenas conexao, nao leitura do body** [fetch, timeout, abort, body-read]
  `fetch(url, { signal: AbortSignal.timeout(N) })` aborta apenas a fase de conexao (TCP handshake + TLS + response headers). `response.json()` le todo o body apos os headers — e essa leitura nao tem timeout proprio. Se o servidor envia headers rapido mas o corpo demora (ou e grande), `response.json()` fica bloqueada indefinidamente. Solucao: `AbortController` explicito para timeout total + `response.text()` com race contra timeout dedicado + `JSON.parse()` manual.

- **Fire-and-forget com auth async pode nunca disparar o fetch** [llm, supabase, observabilidade, waterfall]
  No PR #386, o waterfall LiteLLM completava e renderizava (`ui-finalized`, ~38k chars), mas `finalizeRun` nunca aparecia no Network e `llm_experiment_runs` ficava `running`. Causa provavel: `finalizeExperimentRun` fire-and-forget chamava `getSupabaseAuthHeaders()` no fim do waterfall; se `supabase.auth.getSession()` pendurasse, o fetch nem era iniciado e nao havia HTTP/catch para observar. Fix: capturar os headers no `createRun` e reutilizar no `finalizeRun`, alem de logar `finalizando llm_experiment_run` antes da chamada e sucesso/falha depois. Afeta: `utils/llm/experiment.ts`, `features/dossier/waterfall-orchestrator.ts`, PR #386.

## Auth Migration Supabase (12 Jun 2026) — licoes consolidadas

- **Sessao Supabase salva nao exige cache proprio de identidade** [supabase, auth, localstorage, security]
  Depois do login, a persistencia correta fica no token do Supabase Auth. Gravar `operator_id`, nome ou email autenticados no localStorage proprio do app cria alerta de clear-text storage e mistura cache com autoridade. Solucao aplicada na PR #372: remover `scout360:operator_*` para usuarios autenticados e resolver identidade por `auth.uid() -> profiles.operator_id`.

- **RLS de auth precisa cobrir o primeiro saveUserContext pos-login** [supabase, rls, auth, user_context]
  Login bem-sucedido nao prova que o contexto do operador ficou salvo. No preview, a conta autenticava e validava CNPJ, mas `saveUserContext` falhava com row-level security. Solucao: policy authenticated para ler legado pelo proprio email, escrever apenas o `operator_id` do profile e aguardar `link_legacy_operator` antes do upsert.

- **execute_sql do Supabase MCP e stateless** [supabase, migration, execute_sql, mcp]
  Cada chamada do `execute_sql` no Supabase MCP abre uma nova sessao de banco. `CREATE TEMP TABLE` nao sobrevive entre chamadas. Scripts multi-passo precisam usar tabelas REAIS (com prefixo `_migration_`) para manter estado intermediario. Na versao final, criou-se `_migration_canonical` como tabela real + safety net (passo 5) para restaurar canonicos em caso de erro.

- **Migration de dados precisa de safety net pos-DELETE** [supabase, migration, safety-net]
  DELETE em producao sem passo de restauracao e risco critico. O script de consolidacao tinha PASSO 5 que restaurava registros canonicos via `profiles` em caso de remocao incorreta. Toda migracao que remove dados deve ter um passo de rollback automatico.

- **error.code e mais estavel que error.message no Supabase Auth** [supabase, auth, error-handling]
  `error.message` do Supabase pode mudar entre versoes (ex: "User already registered" vs "User already exists"). `error.code` (ex: `user_already_exists`) e estavel e documentado. Sempre preferir `error.code` para identificar erros de autenticacao.

- **AuthGate com graceful fallback sem provider** [react, auth, fallback, component]
  Componente de gate de acesso nao deve assumir que seu contexto sempre existe. Se AuthContext estiver ausente (erro, fallback, loading), o AuthGate deve renderizar `children` em vez de travar ou mostrar modal vazio. OperatorProvider usa `operatorContext.ok || userContext` como fallback.

- **Modelo hibrido de auth equilibra experiencia e seguranca** [auth, saas, strategy]
  Auto-confirm total e conveniente mas nao valida emails. Confirmacao estrita bloqueia usuarios de teste. Modelo hibrido (auto-confirm ativo + cron que remove contas nao confirmadas apos 48h) equilibra os dois. Prazo de migracao (deadline 18/06) com deadline clara forca acao sem quebrar experiencia atual.

- **Fragmentacao de identidade e inevitavel sem auth real** [auth, identity, localStorage, fragmentacao]
  `localStorage` como unica fonte de identidade gera um novo `operator_id` toda vez que o storage e perdido (cache limpo, outro dispositivo). 430 operator_ids para 117 emails unicos (292 IDs para 1 usuario). Auth real (Supabase Auth com UID estavel) elimina a fragmentacao na origem.

## P0 producao travada vs preview OK (Junho 2026) — licoes consolidadas

- **Timeout de operacao termina depois do body + parse** [fetch, timeout, body-read]
  `fetch()` resolver com headers nao significa que a operacao acabou. Qualquer chamada critica deve cobrir conexao, `response.text()`, parse e fallback.

- **Promise.race sem abort real e mitigacao falsa** [abort, gemini, waterfall]
  Encerrar a espera local sem abortar a request deixa Gemini rodando em background e pode manter recursos/telemetria pendentes. Sempre propagar `AbortSignal`.

- **Abort pode nao resolver promise pendente; adicione race local por tentativa** [abort, fallback, resiliencia]
  Mesmo apos abort, uma promise pode nao liquidar na janela esperada. Etapas opcionais como continuity-question precisam de timeout local por tentativa e fallback deterministico.

- **Diagnostics nao pode bloquear finalizacao de UI** [telemetria, loading, supabase]
  `recordDiagnostics` e flush devem ser fire-and-forget. `PostCompletion` precisa persistir, mas a UI nao pode depender da chamada para liberar overlay/input.

- **PostCompletion check:10000ms e gate obrigatorio para loading P0** [observabilidade, supabase, ui]
  Para regressao de overlay/blank panel, validar `PostCompletion=6` com `check:10000ms=1`. Sem isso, a sessao pode ter finalizado cedo demais para provar recuperacao real.

- **Separar IA, controle/cache e diagnostics na telemetria** [observabilidade, gemini]
  Logs de `/api/gemini` precisam carregar `action`, `requestClass` e `phase`; senao uma chamada de diagnostic parece uma chamada de IA travada.

- **Virtuoso renderizado nao prova bot visivel** [virtuoso, blank-panel, ux]
  `itemsRendered` e `rangeChanged` podem existir com painel ainda inutil. Validar `bot-message-content` visivel ou `messages-static-fallback`.

- **Fallback estatico para dossie gigante e safety net de produto** [virtuoso, performance, ux]
  Para bot >=4k chars, preferir static fallback quando a viewport virtualizada esta suspensa evita dossie no DOM porem invisivel.

- **Stage timer usa chave canonica, nao texto da label** [loading, telemetry]
  Labels equivalentes como "Verificando pressoes e compliance..." precisam mapear para chave `compliance`; o timer da etapa deve acompanhar `processing.stage`.

- **Preview OK nao prova producao se SW/cache/deploy divergem** [vercel, producao, pwa]
  Antes de reabrir waterfall, confirmar bundle real, service worker/cache e release em producao. Preview pode estar correto e producao antiga.

- **Sentry vazio nao encerra incidente visual** [sentry, supabase, ui]
  Freeze de main thread, overlay preso e blank panel podem nao gerar evento Sentry. `scout_diagnostics` e browser real sao fonte primaria.

- **E2E de erro controlado e contrato de produto** [playwright, error-recovery]
  Falha controlada de `/api/gemini` deve mostrar `error-message-card`, remover overlay e liberar input. Nao ajustar teste para aceitar estado preso.

- **Modulo opcional deve falhar aberto** [waterfall, resiliencia]
  `validate-inline-sources`, benchmark e continuity-question nao podem bloquear todo o dossier. Timeout retorna fallback seguro.

- **Validacao final deve confirmar intencao de produto** [ux, validacao]
  Checks verdes, Supabase persistido e logs saudaveis nao bastam. Fechamento exige overlay fora, input habilitado, cards/bot visiveis e ausencia de stuck/blank.

### Sessao 2026-06-08 — resolucao PR #347 e investigacao tela branca

- **Nunca commitar codigo visual sem antes commitar as dependencias** [commit, ci, typecheck]
  `MessageTimeline.tsx` importava `debugStaticFallbackDisplay` de `layoutTraceTelemetry.ts`, mas o arquivo de util nao foi commitado. CI quebrou com typecheck. Sempre verificar `git status` antes do commit para garantir que todos os arquivos novos estao inclusos.

- **git merge com working tree sujo contamina o merge commit** [git, merge, working-tree, auto-merge]
  Ao fazer merge com `origin/main`, arquivos modificados no working tree (gemini_usage) vazaram para o merge via `--ours`. `waterfall-orchestrator.ts` ganhou `operatorId` que quebrou typecheck porque `types.ts` nao tinha o campo. Sempre fazer merge com working tree limpa ou usar `git stash`.

- **display:none em flex colapsado foi REFUTADO** [css, layout, debug, flexbox]
  A hipotese de que o browser computa `display:none` automaticamente em flex items com `flex-basis:0%` + `min-h-0` e FALSA. Reproducao minima provou que `getComputedStyle(el).display` permanece `block`/`flex`. O `display:none` real encontrado no Supabase tem origem externa (Vercel preview, injecao de runtime, ou race condition com React hydration).

- **traceFullAncestorChain e superior a trace de culpado unico** [diagnostico, debug, layout]
  `findFirstZeroDimensionAncestor` retorna apenas um no. `traceFullAncestorChain` captura TODOS os ancestrais com `computedStyle` completo (display, width, height, visibility), permitindo identificar exatamente onde `display:none` ou dimensao zero aparece. Preferir cadeia completa sobre busca de culpado unico em diagnosticos de layout.

- **CodeQL nao bloqueia merge quando nao e check obrigatorio** [ci, codeql, merge, pr]
  30 alertas pre-existentes em main nao impediram merge porque CodeQL nao esta na lista de `required status checks`. Ao avaliar bloqueios de merge, verificar a configuracao de branch protection, nao apenas o estado do check.

## Bug P0 overlay hero (Junho 2026) — 14 novos aprendizados

- **Service Worker CacheFirst bloqueia atualizacoes em producao** [pwa, service-worker, cache, deploy]
  CacheFirst para bundles JS/CSS em SPA com deploy frequente prende usuarios em versoes antigas. Preview sem SW nunca reproduz o bug. Solucao: remover PWA/SW ou usar NetworkFirst com asset versioning.

- **Preview sem SW vs Producao com SW cria falsa confianca** [pwa, validacao, homologacao]
  Concluir que "preview funcionou = producao vai funcionar" sem checar configuracao de SW/PWA e enganoso. Toda validacao pre-producao deve verificar se o cache de SW esta ativo.

- **DOM cleanup com .remove() quebra reconciliacao do React** [react, dom, overlay, cleanup]
  Remover elemento do DOM via `.remove()` sem React saber causa desync entre virtual DOM e real DOM. Overlay continua visualmente presente mesmo com `setIsLoading(false)`. Usar `display:none` no elemento raiz.

- **NUNCA nullificar abortControllerRef fora do processMessage:finally** [waterfall, abort, processmessage, bleeding-edge]
  `finalizeWaterfallUI` (chamado no `finally` do `processMessage`) nao deve nullificar `abortControllerRef`. Se o ref e limpo antes do `processMessage:finally` terminar, `isAbort=true` detecta abort falso e `flushDiagnosticsNow` nunca e chamado. O `abortControllerRef` pertence ao ciclo de vida do `processMessage`, nao ao helper de UI.

- **NUNCA usar TreeWalker/document.body scan para DOM cleanup** [performance, dom, treewalker, main-thread]
  `document.createTreeWalker(document.body)` percorre o DOM inteiro em busca de seletores — bloqueia a main thread por dezenas de ms em arvores grandes. Substituir por `querySelector` direto com 3 seletores alvo, sem escanear o body inteiro.

- **DOM cleanup DOM display:none e safety net; React render condition e primario** [react, dom, cleanup, overlay, safety-net]
  O `requestAnimationFrame` + `querySelector` + `style.display='none'` no DOM existe como safety net. Mas o mecanismo PRIMARIO de liberacao do overlay e a condicao de renderizacao React (`shouldShowHeroLoadingOverlay` retornando `false`). DOM cleanup nunca deve ser o fluxo principal.

- **h-full nao funciona em filho de flex item com flex-basis:0%** [css, flexbox, layout, display-none]
  `height:100%` de um pai com `flex-basis:0%` (via `flex-1`) = 0px. Browser colapsa o elemento com `display:none`. O filho deve usar `flex-1` em vez de `h-full` para herdar altura real.

- **absolute inset-0 causa display:none em certos contextos de flex** [css, flexbox, layout, display-none]
  `absolute inset-0` como fallback de layout pode colapsar em contextos de flex container. Testar sempre com conteudo real grande (>20KB). Preferir `h-full w-full` + `flex-col` parent.

- **Preview Vercel revela bugs de layout que testes unitarios nao pegam** [css, layout, testing, vercel]
  Layout rendering, CSS cascata, flex box so aparecem em browser real com dados reais. Smoke visual no preview e gate obrigatorio antes de merge para mudancas de CSS/layout.

- **Mock de scoutDiag precisa incluir debug: vi.fn()** [testing, mock, debug, scoutDiag]
  Se `scoutDiag.debug()` e adicionado ao codigo de producao, os mocks nos testes precisam incluir `debug: vi.fn()` senao a chamada quebra silenciosamente. Toda vez que adicionar `scoutDiag.debug()`, verificar/atualizar os mocks.

- **Sempre incluir hostname em logs de diagnostico** [debug, logging, ambiente]
  Logs de producao e preview parecem identicos sem o hostname. `scoutagro.vercel.app` alias pode servir codigo sem estar no projeto. Incluir `window.location.hostname` em todo log de diagnostico.

- **Vercel alias orfao pode servir codigo sem estar no projeto** [vercel, deploy, domains, alias]
  O alias `scoutagro.vercel.app` servia o mesmo codigo mas nao estava listado nos domains do projeto Vercel. Verificar dashboard Vercel > Domains para confirmar quais alias estao registrados.

- **flushDiagnosticsNow sincrono pos-setState bloqueia React re-render** [react, setstate, render, settimeout, freeze]
  `flushDiagnosticsNow` chamado sincronamente no mesmo tick depois de `setIsLoading(false)` bloqueava o React re-render. O setState dispara render sincrono, mas o flush monopoliza a main thread. Playwright mostrou zero eventos pos-render. Solucao: `setTimeout(0)` com o flush, agendado ANTES do setState.

- **Agendar setTimeout ANTES do setState, nao depois** [react, settimeout, macrotask, event-loop]
  Se o `setTimeout` com `flushDiagnosticsNow` for agendado DEPOIS do `setState`, o callback nunca roda ate o render terminar. Agendando ANTES, o timer ja esta na macrotask queue quando o React comeca a renderizar, e dispara assim que o render sincrono termina. O `setTimeout(0)` vira ponto de handoff entre render sincrono e flush assincrono.

- **createDeferred polyfill para Promise.withResolvers** [node, vitest, compatibilidade, polyfill]
  `Promise.withResolvers()` e API Node 22+. CI do GitHub Actions roda Node 20. Testes que usam `Promise.withResolvers()` quebram em runtime com `TypeError`. Solucao: helper `createDeferred<T>()` local com `new Promise` + resolve/reject manuais. Nao basta `ES2024` no `lib` do tsconfig — isso so resolve typecheck, nao runtime.

---

## Auditoria por exploracao paralela

- Dividir a auditoria por territorios aumenta a cobertura e reduz a navegacao sequencial.
- Cada explorador deve informar os arquivos efetivamente lidos.
- Resultados paralelos precisam ser consolidados sem duplicidade.
- Toda auditoria deve terminar com uma etapa de autorrefutacao.
- Codigo suspeito nao e automaticamente bug.
- Uma cadeia de concorrencia precisa ser alcancavel, nao apenas teoricamente imagina-
  vel.
- Timer sem cleanup nao e defeito sem efeito colateral demonstravel.
- Documentacao gerada por IA deve ser confrontada com codigo e testes.

## Classificacao de incidentes mitigados

Nao classificar automaticamente como P0 ativo um incidente que:

- ocorreu historicamente;
- possui recovery funcional;
- nao reincidiu apos a mitigacao;
- continua apenas com causa raiz aberta.

A classificacao adequada e `incidente mitigado com causa aberta`, acompanhada de gatilhos objetivos de reabertura.

## Fidelidade dos testes de interface

- jsdom nao reproduz integralmente layout, CSS computado, ResizeObserver e timing do navegador.
- Virtuoso mockado nao comprova comportamento do virtual scroller real.
- RAF sincrono em teste pode esconder condicoes temporais do navegador.
- Incidentes de geometria e renderizacao devem ser confirmados por E2E em navegador real quando houver reincidencia.

## Auth Remediation PR #372 (13 Jun 2026) — licoes consolidadas

- **Doc handoff duravel vai para Bruno Vault, nao para mktemp** [handoff, memoria, bruno-vault, agentes]
  Para projeto ativo, `mktemp` e apenas scratch. O artefato duravel deve ir em `Bruno Vault/20-SESSOES/YYYY-MM/...`, o indice mensal precisa ser atualizado, e qualquer correcao de processo deve gerar licao em `30-LICOES/` com ponteiro aqui no Caliber. Licao canonica: `/Users/brunolima/Documents/Bruno Vault/30-LICOES/LICOES-DOC-HANDOFF-BRUNO-VAULT-2026-06-14.md`.

- **Contrato de identidade: auth.uid como autoridade unica, localStorage como cache** [auth, identidade, supabase, react]
  O app autenticava via Supabase mas usava `operator_id` do localStorage como autoridade de dados. Isso criava risco de dossies invisiveis (se o localStorage tivesse um ID diferente do auth.uid) e bypass de autorizacao. A cadeia correta e: `auth.uid() -> profiles.operator_id -> user_context -> dados de negocio`. localStorage deve ser apenas cache, nunca fonte de verdade para identidade. `resolveOperatorFromAuth()` implementa essa cadeia com fallback para user_context por email.

- **profiles.operator_id deve ser imutavel apos criacao** [supabase, rls, seguranca, migration]
  Se `profiles.operator_id` pode ser atualizado, qualquer funcao com acesso a tabela pode alterar o vinculo de identidade de um usuario, permitindo acesso cruzado a dossies. `REVOKE UPDATE on profiles` + `GRANT UPDATE(name) only from auth.users` + RPC `link_legacy_operator` com `SECURITY DEFINER` protege a integridade. Toda migration que toca coluna de identidade deve verificar permissoes.

- **RPC SECURITY DEFINER com anti-IDOR obrigatorio** [supabase, rpc, seguranca, idor]
  `link_legacy_operator` usa `SECURITY DEFINER` (executa como dono da funcao, nao como quem chamou). Sem verificacao explicita de `auth.uid()`, QUALQUER usuario autenticado poderia chamar o RPC com qualquer `target_user_id` e roubar o vinculo de outro operador. A verificacao `auth.uid() = (SELECT id FROM auth.users WHERE email = p_email)` previne ataque IDOR (Insecure Direct Object Reference). Todo RPC com SECURITY DEFINER deve verificar auth.uid() contra o recurso acessado.

- **Vercel Hobby limita serverless functions a 12** [vercel, deploy, limite, hobby]
  O plano Hobby da Vercel permite no maximo 12 serverless functions. NOVO-APP tem 11 apos remover `api/link-status.ts`. Ao adicionar novas rotas em `api/`, e necessario verificar o total atual. Se bater o limite, o deploy falha silenciosamente. Solucoes: consolidar rotas, migrar para plano Pro, ou remover funcoes nao utilizadas.

- **Cron Vercel Hobby: maximo 1 schedule por projeto, 1x/dia** [vercel, cron, hobby, schedule]
  O plano Hobby da Vercel suporta apenas 1 cron job por projeto com frequencia maxima de 1 vez ao dia (`0 0 * * *`). O schedule original `0 */6 * * *` (4x/dia) funciona no plano Pro mas e ignorado no Hobby. A documentacao da Vercel sobre limites do Hobby e pouco explicita — validar no dashboard apos configurar.

- **Handler de cron deve aceitar GET e POST** [vercel, cron, api, handler]
  O Vercel Cron Jobs pode disparar requests como GET ou POST dependendo da configuracao. Se o handler so aceita POST, o cron falha silenciosamente quando o Vercel envia GET. O handler `api/cron-email-confirmation.ts` foi corrigido para aceitar ambos os metodos e validar `CRON_SECRET` via header `Authorization: Bearer`.

- **GRANT EXECUTE ON FUNCTION TO service_role para cron SQL** [supabase, cron, permission, service_role]
  Funcoes chamadas por cron precisam de `GRANT EXECUTE ON FUNCTION ... TO service_role` para executar no contexto do servico. Sem isso, a funcao lancaria `permission denied for function` quando chamada pelo cron mesmo com `SECURITY DEFINER`.

## Sessao 2026-06-15 — PR #376: 4 bugs, Sentry, E2E

- **activeGenerationRef nao pode ser deletado antes dos probes capturarem generationValid** [waterfall, loading, probes, safety-net]
  `finalizeWaterfallUI` deletava `activeGenerationRef.current` no inicio. `scheduleLoadingStuckProbes` (os probes) nunca conseguiam validar geracao porque o ref ja era `null`. A safety net ficou desarmada por 6 dias — o Sentry nunca alertava loading travado. Solucao: capturar `generationValid` como parametro ANTES de limpar o ref, passar para os probes por closure. O observer nao depende mais do ref.

- **"Consolidando informacoes..." e rotulo de UI, nao etapa de loading** [loading, progress, ui, contador]
  `finalizeLoadingProgress` contava "Consolidando informacoes..." como etapa de progresso. Como esse rotulo aparece apos todas as etapas reais, o contador exibia "8/7" (7 etapas + 1 rotulo). Solucao: finalizeLoadingProgress ignora esse rotulo especifico. `Math.min(completed, total)` como safety cap contra overflow.

- **Bolha inline trada deve degradar silenciosamente, nao mostrar erro** [inline-loading, stale-thinking, ux, degradacao]
  Quando o estado de loading fica stale (isThinking=true apos waterfall terminar), a bolha inline mostra "thinking..." para sempre. Em vez de mostrar erro ou mensagem alarmista, o guard `data.isLoading + stale-thinking` retorna `null` (nada renderizado). O `graceExpired` reseta entre ciclos via useEffect. O usuario nunca ve erro falso.

- **OperatorContext deve restaurar operator_id no localStorage apos resolucao de auth** [auth, operator, localStorage, sidebar-vazia]
  `storageRemove()` no inicio do login limpava `scout360:operator_id`. `getOperatorId()` so lia do localStorage. `resolveOperatorFromAuth()` encontrava o operator_id correto pelo Supabase mas nao o escrevia de volta. Resultado: sidebar vazia apos criar conta. Solucao: `storageSet(OPERATOR_ID_KEY, resolved.operatorId)` apos resolucao de auth.

- **Sentry de loading travado precisa de probes funcionais como pre-requisito** [sentry, observabilidade, monitoramento]
  4 novos alertas Sentry foram adicionados (loading stuck timeout, waterfall UI leak, session persist failed, generation ref cleared). Mas o alerta de loading travado so funciona se os probes (`scheduleLoadingStuckProbes`) conseguirem rodar — o que estava quebrado pelo Bug A. Sentry alerta sem probe funcional = falso negativo.

- **E2E auth flow precisa de helper dedicado** [e2e, playwright, auth, supabase]
  `setupE2EAuth` + `loginViaSupabase` no `tests-e2e/helpers/auth.ts` padronizam o fluxo de login E2E. Antes, cada teste lidava com auth de forma diferente. Helper unico com force clicks, timeouts configurados e API stubs reduziu falhas intermitentes. 10 arquivos E2E atualizados, 6/6 passando no preview Vercel.

## Sessao 2026-06-16 — Fix CNPJ limit + consultasocio complementar

- **Testar com dados reais antes de planejar** [debug, planejamento, adversarial, workflow]
  O planner criou um plano complexo de 5 passos (timeout, deadline, paralelizacao, UI truncada, busca incremental), mas o teste com CNPJ real (FGR INCORPORACOES S/A) mostrou que o problema era muito mais simples: limit=50 artificial e consultasocio como fallback apenas. Se tivessemos testado contra a API real antes de planejar, teriamos economizado 2 agentes (planner + adversarial review). O teste real matou o plano.
  Afeta: fluxo de debug de busca societaria, workflow de diagnostico.

- **Adversarial review revela premissas falsas que o planejador nao viu** [adversarial, review, premissas, planejamento]
  O planner sugeriu deadline 9s para o frontend. A adversarial review mostrou que isso era tiro no pe porque as APIs externas (CNPJ Aberto, consultasocio, BrasilAPI) levam 8-15s cada. 9s de deadline significava que a maioria das buscas falharia antes mesmo de completar. A review redirecionou todo o plano para uma abordagem mais simples: ajustar limites e fontes.
  Afeta: qualquer sugestao de timeout/deadline em fluxo com API externa.

- **CNPJ Aberto e consultasocio sao fontes complementares, nao hierarquicas** [cnpj, busca-societaria, fontes, arquitetura]
  O codigo em orchestration.ts:374 tratava CNPJ Aberto como fonte primaria e consultasocio como fallback ("se CNPJ Aberto retornou algo, nao precisa de consultasocio"). Mas as duas fontes tem dados diferentes: CNPJ Aberto tem cobertura ampla, consultasocio tem dados que CNPJ Aberto nao cobre. A condicao correta e rodar ambas sempre (para pessoas fisicas) e consolidar os resultados. Isso aumentou cobertura de descoberta de forma significativa.
  Afeta: `services/socio-search/orchestration.ts`, arquitetura de busca societaria.

- **Limites artificiais de resultado escondem capacidade real** [constantes, limite, configuracao, desempenho]
  limit=50 no documentExtractor.ts e MAX_COMPANIES=60 em types.ts pareciam numeros razoaveis para "protecao contra overflow". Mas para grupos empresariais grandes (construcao civil com 150+ CNPJs), esses limites cortavam ~70% dos dados. O usuario via o Mapa de Poder Societario incompleto sem saber que um teto artificial estava filtrando. Sempre validar constantes de limite contra dados reais do maior caso de uso, nao contra o caso medio.
  Afeta: `utils/documentExtractor.ts:406`, `services/socio-search/types.ts:134`.

- **Cache key version e acoplada a constantes de limite** [cache, versionamento, deploy, invalidacao]
  Mudar MAX_COMPANIES de 60 para 200 (ou limit de 50 para 200) exige invalidar o cache existente porque entries antigas tem dados parciais. A CACHE_KEY_VERSION em types.ts:136 e o mecanismo que faz isso: cada vez que uma constante de limite muda, a cache key precisa ser incrementada. De v7 para v8 neste caso. Sem esse bump, usuarios veriam dados parciais do cache antigo mesmo com o novo codigo.
  Afeta: `services/socio-search/types.ts:136`.

## Sessao 2026-06-15 — 3 bugs de historico apos login

- **RLS policy deve cobrir `authenticated` alem de `anon`** [supabase, rls, auth, authenticated]
  Usuarios logados no Supabase usam role `authenticated`, nao `anon`. Politicas criadas so com `TO anon` bloqueiam silenciosamente qualquer usuario autenticado, retornando `[]` sem erro. `ALTER POLICY ... TO anon, authenticated` corrige. Network request mostra `content-length: 2` com payload `[]` — sinal diagnostico.
  Afeta: `supabase/migrations/20260615_fix_dossies_rls_authenticated.sql`, toda policy RLS futura.

- **`content-length: 2` em resposta Supabase = RLS bloqueando** [supabase, debug, network, rls]
  Quando o body da resposta Supabase e `[]` (2 bytes) mas voce sabe que ha dados, a causa e RLS filtrando as rows. O Supabase nao gera erro HTTP — apenas retorna 0 rows. Verificar content-length no network panel e o primeiro passo diagnostico.
  Afeta: debug de queries Supabase.

- **`window.dispatchEvent` em efeito pai NUNCA alcanca listeners em efeitos filhos** [react, useEffect, evento, dispatch, race-condition]
  React executa useEffect dos pais antes dos efeitos dos filhos. Eventos sincronos (`new CustomEvent`) disparados no useEffect pai sao perdidos porque os listeners dos filhos ainda nao foram registrados. Solucao: `setTimeout(() => window.dispatchEvent(...), 0)` ou `queueMicrotask`.
  Afeta: `contexts/OperatorContext.tsx`, qualquer pai-filho com event dispatch.

- **`getOperatorId()` depende exclusivamente de localStorage** [auth, localStorage, operator, sidebar-vazia]
  `getOperatorId()` so le de `localStorage`. Se o `storageSet` nao for chamado apos resolucao de auth (porque `storageRemove` limpou no inicio do fluxo), toda a camada de storage falha silenciosamente retornando arrays vazios. Toda funcao que le storage precisa de fallback ou reconhecimento de que o dado pode nao estar la.
  Afeta: `contexts/OperatorContext.tsx`.

- **Sidebar vazia com dados intactos = 3 bugs em cadeia** [debug, diagnostico, cadeia, sidebar]
  Nenhum bug individual explica a sidebar vazia. Sao 3 bugs que se mascaram: (1) localStorage vazio porque operator_id nao foi restaurado, (2) query com temp operator_id retorna [], (3) RLS filtra o que restava. Cada um parece inofensivo isoladamente. Debuggar a network layer (nao apenas o state React) e essencial para quebrar a cadeia.
  Afeta: fluxo de diagnostico de sidebar/historico vazio.

## Sessao 2026-06-16 — Sentry-Vercel + incidente de vazamento

- **Env vars manuais tem internal: true e bloqueiam integracao Vercel Marketplace** [vercel, sentry, env-vars, marketplace]
  Env vars adicionadas manualmente no Vercel Dashboard tem `internal: true` por padrao. Isso faz com que integracoes de terceiros (como Sentry Marketplace) nao consigam injetar suas proprias env vars. A integracao falha silenciosamente — o Sentry nunca recebe erros das serverless functions. Solucao: remover env vars manuais relacionadas a integracao (SENTRY_DSN, etc.) e deixar o Marketplace gerenciar.
  Afeta: configuracao de integracoes Vercel Marketplace.

- **Vite define expoe variaveis ao client sem prefixo VITE\_** [vite, build, env, config]
  `define` no `vite.config.ts` substitui strings em tempo de compilacao. Diferente de `import.meta.env.VITE_*`, o `define` expoe o valor SEMPRE, inclusive em testes. Para variaveis que so existem em producao (como SENTRY_DSN), usar condicional `!process.env.VITEST` no define, ou usar `import.meta.env.VITE_SENTRY_DSN` com env var real prefixada.
  Afeta: `vite.config.ts`, build config.

- **Vercel Hobby nao tem log drains — serverless functions nao enviam erros ao Sentry** [vercel, hobby, log-drains, sentry, observabilidade]
  O plano Hobby da Vercel nao suporta log drains. Isso significa que erros lancados dentro de serverless functions (`api/*.ts`) NAO sao capturados pelo Sentry — mesmo com a integracao Marketplace ativa e a DSN configurada. O Sentry so captura erros do lado cliente (browser). Para cobertura completa de server-side, e necessario plano Pro (log drains) ou implementar fallback manual (`scout_diagnostics` Supabase).
  Afeta: observabilidade de serverless functions, planos Vercel.

- **Vercel CLI 54.14.0 Preview --non-interactive bug** [vercel, cli, bug, preview]
  `vercel env add --non-interactive --preview <env>` nao funciona na Vercel CLI 54.14.0 para ambientes Preview. O CLI recusa o valor mesmo com `--non-interactive`. Solucao: usar `--environment preview` (singular, sem `s`) em vez de `--preview`. Para ambientes Production e Development funciona normalmente com `--non-interactive`.
  Afeta: scripts automatizados de env vars para preview deployments.

- **CRITICO: Nunca usar backticks em comandos gh api com -f body — shell expande como comando** [seguranca, shell, gh, github, token, incidente]
  `gh api ... -f body='text with \`command\` backticks'`faz o shell expandir os backticks como`$(comando)` — executando o conteudo e expondo stdout como argumento. Se o corpo contem tokens ou comandos (`gh auth token`, variaveis), eles sao executados e o resultado aparece publicamente no comentario GitHub. A gravidade: tokens do ambiente ficam visiveis em URL publica. **Solucao obrigatoria:** sempre usar heredocs com aspa simples: `cat <<'EOF' | gh api --input -`. A aspa simples no delimitador ('EOF') impede qualquer expansao de shell.
Afeta: qualquer comando `gh api`ou`gh pr` com corpo gerado dinamicamente.

### Sessao 2026-06-19 — PR #383 Fase D + PR Gate IA

- **E2E blocking no GitHub nao substitui preview Vercel para UX critica** [e2e, vercel, ci, testing-trophy]
  CI localhost/Docker diverge de modal dossie, Supabase real e serverless. Preview manual 5/5 ~1,7 min; CI E2E cancelou em 15 min. Decisao: PR Gate IA — E2E fora dos required checks; validacao sob demanda no preview. Afeta: branch protection, `.github/workflows/`, AGENTS.md.

- **Playwright CI: imagem Docker noble, nao playwright-github-action em Ubuntu 24.04** [playwright, ci, docker, github-actions]
  `microsoft/playwright-github-action@v1` quebra com `Cannot install dependencies for this linux distribution` no Ubuntu 24.04. Solucao: `mcr.microsoft.com/playwright:v1.59.1-noble`. Afeta: jobs E2E em `ci.yml`.

- **Testing Trophy no topo — poucos E2E criticos no preview, vitest/coverage no CI** [testing-trophy, e2e, vitest]
  Expandir para 17 testes E2E blocking em 2 jobs violou o trophy. Rede principal: vitest + coverage + golden. E2E: projeto `critical-ux` sob demanda no preview. Afeta: Fase D T-D.2.

- **Workflow timeout deve cobrir install + suite completa** [ci, timeout, playwright]
  Job E2E preview com limite 15 min cancelou antes de 14 testes. Timeout >= tempo medido + margem de install. Afeta: `e2e-preview.yml`.

- **Responder thread de review antes de marcar resolved** [github, pr, review]
  Marcar threads resolvidas sem comentario de tratativa quebra confianca do review. Obrigatorio: skill `gh-resolve-pr-comments`. Afeta: fluxo PR Gate.

- **Commits de memoria na branch da PR ativa** [git, worktree, agents]
  AGENTS.md continual-learning commitado na branch errada exigiu cherry-pick. Verificar branch antes de docs de memoria. Afeta: worktrees, handoff.

- **console.error strict em E2E quebra com telemetria debug Scout360** [e2e, playwright, console, telemetria]
  Specs com `page.on('console', msg => expect(msg.type()).not.toBe('error'))` falham quando o app emite logs debug legitimos (`scoutDiag`, telemetria Scout360). Solucao: allowlist de padroes conhecidos ou filtrar por origem. Afeta: `tests-e2e/`, specs `critical-ux`.

- **PR Gate IA e gate definitivo para app Vercel+Supabase — CI E2E localhost nao substitui** [vercel, supabase, e2e, pr-gate, ci]
  Para apps com preview Vercel + Supabase real + serverless, o gate de merge e: CI rapido verde + Playwright `critical-ux` no preview (agente) + comentario evidencia + **MERGE**. CI E2E Docker/localhost e instavel e nao representa UX real. Aprovado PR #383: 11/11 SHA `63f1c85e`. Afeta: branch protection, `AGENTS.md`, fluxo merge.

<!-- caliber:managed:learnings -->

_Atualizado automaticamente pelo Caliber apos sessoes de agente._

<!-- /caliber:managed:learnings -->

# Sessao 2026-06-18 - Playbook nao bloqueante e cron fail-safe

- **Roadmap de qualidade nao pode virar trava global de trabalho** [processo, agentes, planejamento]
  Um plano prioritario deve orientar ordem e prova, sem impedir mudanca explicita de objetivo, fechamento documental ou resposta a incidentes. Decisoes substituidas ficam marcadas como `SUPERADA`, preservando o historico.

- **Cron destrutivo deve iniciar em dry-run** [vercel, cron, auth, seguranca operacional]
  Configurar apenas o segredo de autenticacao pode ativar uma versao que exclui dados imediatamente. Primeiro publicar `dry-run` como padrao, revisar candidatos e so depois habilitar uma flag destrutiva separada.

- **Hook de baixo risco pede contrato minimo, nao revisao desproporcional** [processo, hooks, validacao, agentes]
  Automacao consultiva deve ser validada pelo contrato essencial e liberar o gate principal. O hook de conclusao avisa pendencias com `decision: null`; ele nao pode criar loop nem consumir revisao desproporcional ao risco.

### Sessao 2026-06-18 — PR #379 mergeada (P0 conclusao + Codex revert)

- **Branch protection required_conversation_resolution bloqueia merge mesmo com threads resolvidas** [github, branch-protection, merge, pr]
  `required_conversation_resolution: true` impede merge mesmo quando todas as threads foram resolvidas via GraphQL API. O GitHub trata resolucao via API de forma diferente de resolucao via interface web. Para mergear PR com esta protecao, desabilitar temporariamente a regra, fazer o merge e reabilitar. Afeta: fluxo de merge de PRs com revisao obrigatoria de conversas.

- **Vercel GitHub App cria deployment environments orfaos que bloqueiam merge** [vercel, github, deploy, environments]
  O Vercel GitHub App registra automaticamente environments de deploy ("Preview - novo-app", "Production - novo-app") no repositorio. Isso bloqueia merge para branches que exigem `required deployment environments`. Solucao: no dashboard GitHub > Settings > Environments, deletar os environments orfaos. Afeta: merge de PRs em projetos com Vercel integration.

- **OAuth Vercel MCP expira entre sessoes — CLI e mais confiavel** [vercel, mcp, auth, sessao]
  O token OAuth do MCP Vercel expira quando a sessao do Claude termina. Na sessao seguinte, comandos como `vercel env add` falham silenciosamente. A CLI Vercel (`vercel --token`) com token pessoal e mais confiavel para operacoes entre sessoes. Afeta: scripts de deploy e configuracao de env vars entre sessoes.

- **gh api -F envia strings — para boolean/array usar --input com JSON puro** [github, gh, api, shell, json]
  `gh api -F auto_merge=false` envia o valor como string "false", nao como boolean `false`. A API do GitHub rejeita porque espera boolean. Para enviar tipos corretos (boolean, array, objeto), usar `--input -` com pipe de JSON puro: `printf '{"auto_merge":false}' | gh api --input -`. Afeta: qualquer comando `gh api` que precise de tipos booleanos ou arrays.

- **Branch protection strict mode bloqueia push mesmo de docs** [github, branch-protection, push, docs]
  `required_status_checks.strict: true` bloqueia push se checks obrigatorios nao rodaram na branch. Para push de documentacao: desabilitar checks temporariamente -> push -> reabilitar. Afeta: fluxo de push de documentacao em branches protegidas.

### Sessao 2026-06-18 — Sprint 1: CNPJ QSA + catch log (PR #380)

- **Fix incompleto e pior que fix nenhum — valide o pipeline completo** [fix, validacao, pipeline, dado]
  T-B.2 inicial so adicionava CNPJs validados ao Set em `knownCnpjs`, mas `validateTeiaCnpjsOutput` extrai CNPJs do `partnerText` por regex, nao do Set. Falsos-positivos continuavam porque faltava formatar o documento validado dentro do partnerText. Licao: sempre trace o fluxo completo do dado (Set -> consumidores) antes de declarar corrigido. Afeta: `services/socio-search/extractors/teia/extractTeiaFromSsRequest.ts`, fluxo de validacao.

- **Documentos de QSA podem ser CPF mascarado — validar 14 digitos** [cnpj, qsa, validacao, cpf]
  `partner.document` vem de `pickPublicDocument` que suprime IDs completos por seguranca. CPFs mascarados (`***.123.456-**`) tem 11+ caracteres e passavam como "CNPJ" para `deriveObjectiveComplexity`. Sempre validar `length === 14` antes de tratar como CNPJ. Afeta: `services/socio-search/extractors/teia/extractTeiaFromSsRequest.ts`, `deriveObjectiveComplexity`.

- **Codex/CodeRabbit nao deve modificar .mcp.json, nimbalyst-local/ ou .claude/plugins/** [codex, codereview, config, infra]
  Bot review agents poluiram o projeto com arquivos de configuracao de agente: .mcp.json (substituiu deepseek, vercel, sentry), ai-actions.md, manifest.json, 4 planos do nimbalyst, CODEX.md (duplicata de CLAUDE.md). Tudo revertido manualmente. Afeta: `.mcp.json`, `nimbalyst-local/`, `.claude/plugins/`.

- **Vercel deploy poll em 2s e mais rapido que 5s sem impacto no rate limit** [vercel, deploy, poll, performance]
  O polling de 5s atrasava a deteccao de "Ready" no deploy local. Reduzir para 2s acelera o feedback sem impacto significativo no rate limit da API Vercel (max 1 deploy por execucao). Afeta: scripts de deploy local.

### Sessao 2026-06-19 — Auditoria 50 PRs + reconciliacao pos-#383

- **Causa raiz display:none permanece unknown; Cofre #382 mitiga sintoma** [loading, display-none, cofre, auditoria]
  Auditoria 50 PRs (#316–#382) confirmou: hipotese flex-colapsado foi refutada; codigo TS atual nao contem `display:block !important` de #347. Safety nets DOM persistem em `App.tsx` e `finalizeWaterfallUI.ts`, mas a origem do `display:none` no fallback estatico nunca foi isolada. PR #382 (Cofre + `useDeferredValue`) e a primeira mitigacao arquitetural real — trata freeze de 27k+ chars, nao a causa CSS/hydration original. Manter safety nets ate 7 dias Cofre estavel em producao + metricas `scout_diagnostics`. Nao remover recovery defensivo sem causa raiz comprovada. Afeta: `hooks/useCofreTransition.ts`, `docs/wiki/pages/16-depurar-painel-branco.md`, Onda 3 do plano de estabilizacao.

- **layoutTraceTelemetry removido em #381 — gap diagnostico permanente** [telemetria, debug, auditoria, pr-381]
  `utils/layoutTraceTelemetry.ts` (7200 leituras getComputedStyle, `traceFullAncestorChain`) foi removido na PR #381 como higiene pos-Sprint 2. A auditoria classificou remocao prematura: era a unica telemetria capaz de capturar recurrence de `display:none`. `blankPanelTelemetry` compensa parcialmente, mas nao substitui cadeia completa de ancestrais. Licao: nao remover instrumentacao de causa-raiz aberta sem metrica equivalente em producao ou periodo de observacao. Afeta: decisao de reintroduzir telemetria leve (sem flood) se Cofre regredir.

- **Auditoria 50 PRs: veredito parcialmente valido — reconciliar antes de agir** [auditoria, pr-review, estabilizacao]
  Cruzar auditoria externa com estado pos-#383 evita retrabalho: lockout auth (#372) ja resolvido; #377 superestimado (MAX_COMPANIES=60, deadline 45s); catch #380 ja tem scoutDiag.warn. Achados P0 remanescentes confirmados: RAF #349 sem teste re-entrancia, persist silent #358 (`useSessionStorage.ts:128`), loading fragmentado (10 useState). Policy §9 da auditoria (sem novo useState loading, sem catch {}, sem RAF sem cleanup) adotada como bloqueador de merge no fluxo do dossie ate Onda 1 fechar. Plano: `.cursor/plans/avaliação_auditoria_50_prs_f7ced8ea.plan.md`.

- **PR #384 fechada — escopo consolidado em #383** [pr, auth, e2e, reconciliacao]
  PR #384 (remove lockout pos-deadline + E2E Cofre) foi closed sem merge; conteudo absorvido por #383 mergeada. Ao documentar handoff, tratar #383 como PR canonica para auth+E2E Fase D; nao reabrir #384. Afeta: HANDOFF_AI.md, threads de review que citam #384.

### Sessao 2026-06-19 — Ship-loop LiteLLM + limite Vercel functions

- **Vercel Hobby limita a 12 serverless functions por deploy** [vercel, serverless, hobby, deploy]
  Adicionar endpoints novos (`api/llm-experiment-report.ts` etc.) estoura o limite e quebra deploy. Consolidar rotas relacionadas em um unico handler (`api/llm-experiment.ts` com `?format=markdown`) antes de abrir PR. Contar `api/*.ts` no diff antes de mergear features com novos handlers. Afeta: `api/llm-experiment.ts`, qualquer PR que adicione arquivo em `api/`.

- **SDK openai no serverless Vercel conflita com zod@4 e infla bundle** [vercel, openai, zod, bundle, npm]
  `openai@4` peer-dep em conflito com `zod@4` do projeto — `npm install` falha no Vercel (ERESOLVE). Mesmo com `.npmrc legacy-peer-deps=true`, o SDK aumenta bundle serverless. Preferir **fetch nativo** para chamadas OpenAI-compatible (`api/_llm-client.ts`) em handlers Vercel. Afeta: `api/_llm-client.ts`, `package.json` — nao reintroduzir `openai` como dep de producao sem avaliar bundle + peer deps.

- **Experimento LLM nao altera producao com default gemini** [llm, feature-flag, deploy]
  `LLM_PROVIDER=gemini` (default) mantem fluxo atual em producao; experimento LiteLLM so ativa com env explicita. Validar que patches em `gemini/` / waterfall sao no-op quando provider=gemini. Afeta: PR #386, `api/gemini.ts`, env Vercel Production.

- **Config LLM no browser exige prefixo VITE\_ espelhado** [vite, env, llm, browser]
  `process.env.LLM_*` nao existe no bundle do cliente. `readConfigEnv` em `utils/llm/modelRouter.ts` le `VITE_LLM_*` via `import.meta.env`. No Vercel Preview, espelhar cada `LLM_*` server com `VITE_LLM_*` correspondente (`LLM_PROVIDER` ↔ `VITE_LLM_PROVIDER`, `LLM_ALLOWLIST` ↔ `VITE_LLM_ALLOWLIST`, etc.). Afeta: PR #386, env Vercel, `modelRouter.ts`.

- **API de experimento LLM deve ter gate server-side** [llm, seguranca, api, vercel]
  Endpoints como `api/llm-experiment.ts` retornam 403 quando `LLM_PROVIDER !== 'litellm'`. Nao confiar so em flag no client — bots de review flagam `process.env` exposto no browser. Afeta: `api/llm-experiment.ts`, `api/_llm-client.ts`.

- **Allowlist vazia nega experimento para todos** [llm, auth, seguranca]
  `LLM_ALLOWLIST` (e `VITE_LLM_ALLOWLIST` no browser) com CSV vazio → `isOperatorAllowed` retorna false para qualquer email. Experimento so roda para operadores explicitamente listados. Afeta: `utils/llm/modelRouter.ts`, env Vercel Preview.

### Sessao 2026-06-19 — LiteLLM env Preview + freeze consolidação (link-status)

- **Budget cliente de inline-validation deve exceder N × latencia real de link-status** [timeout, link-status, waterfall, freeze, api]
  Freeze em "Consolidando informacoes..." com overlay bloqueando cliques: `scout_diagnostics` parou em `inline-validation:fetch:start` (6 URLs) sem eventos por ~116s. Causa confirmada (H3): `/api/link-status` demorava ~6.7s por chamada enquanto `VALIDATE_INLINE_TOTAL_TIMEOUT_MS` era 5s no agregado — promessas penduradas travam a main thread. PORTA reconciliation (H1) e resolvePortaScore (H2) foram refutadas com telemetria. Fix: timeout servidor link-status 2.5s, budget cliente 12s + hard-cap 14s retornando `[]`, `maxDuration` 15s no Vercel. Medicao pos-fix: ~3.5s por link-status. Anti-padrao: definir timeout agregado menor que pior caso serial (N URLs × latencia servidor). Afeta: `waterfall-orchestrator.ts`, `api/link-status.ts`, `vercel.json`.

- **Email de teste unitario na allowlist bloqueia operador real** [llm, allowlist, env, testes]
  `bruno@senior.com.br` era fixture de teste; email real do Bruno e `bruno.ferreira@senior.com.br`. Allowlist incorreta = experimento inativo para o operador mesmo com env `litellm`. Sempre validar allowlist contra conta real de preview, nao contra mocks de vitest. Afeta: `LLM_ALLOWLIST`, `VITE_LLM_ALLOWLIST`.

- **Modelos LiteLLM 404 no servidor devem sair do catalogo Preview** [llm, litellm, deploy, feature-flag]
  R1 e Kimi K2 retornam 404 no proxy LiteLLM do Bruno; manter no `LLM_EXPERIMENT_MODELS` gera falhas silenciosas ou fallback inesperado. Restringir Preview a modelos comprovadamente ativos (`huawei/deepseek-v4-flash`) ate configuracao no servidor. Afeta: env Vercel Preview, `utils/llm/modelCatalog.ts`.

- **Instrumentacao debug (agentDebugLog) nao remover antes de validacao manual no preview** [debug, freeze, handoff]
  Sessao debug `c352f8` adicionou `utils/agentDebugLog.ts` e regioes em waterfall/porta/geminiProxy. Remover antes de Bruno confirmar waterfall completo no preview d47bkguue perde evidencia se o fix regredir. Afeta: PR #386 merge checklist.

### Sessao 2026-06-21 — PR #386 Fase 2 LiteLLM paridade + deploy preview

- **Imports externos em `api/` quebram serverless functions Vercel** [vercel, serverless, api, import, deploy]
  `import { withAutoRetry } from '../utils/retry.js'` em `api/_llm-client.ts` causava `FUNCTION_INVOCATION_FAILED` no deploy — o bundle serverless da Vercel nao resolve imports relativos para fora de `api/`. Fix: implementar a funcao inline no proprio arquivo. Toda serverless route que precise de helpers (retry, timeout, formatacao) deve manter o codigo inline, nunca importar de `utils/`. Afeta: `api/_llm-client.ts`, qualquer serverless route nova.

- **Modelo LiteLLM precisa de smoke autenticado antes do waterfall** [litellm, supabase, vercel, playwright]
  UI logada/localStorage de operador nao prova que o gate LiteLLM server-side passou. Antes de gastar 6+ minutos em waterfall, fazer POST autenticado para `/api/gemini` com token Supabase real e modelo alvo. `401/403` = auth/allowlist; `400 Model not allowed for experiment` = env `LLM_EXPERIMENT_MODELS` server-side nao contem o modelo. Caso 2026-06-21: `bedrock/moonshot.kimi-k2-thinking` retornou `400 Model not allowed`, entao exige env Preview + redeploy antes de validar. Afeta: PR #386, `api/gemini.ts`, Vercel Preview.

### Sessao 2026-06-20 — PR #386 Fase 1 LiteLLM + resolve threads

- **REST `/pulls/comments/{id}/replies` retorna 404 — usar GraphQL `addPullRequestReviewThreadReply`** [github, gh, pr, graphql]
  `gh api` POST em endpoint REST de reply a comentario inline falha com 404 mesmo com token valido. `scripts/resolve-pr-threads.py` deve usar GraphQL mutation `addPullRequestReviewThreadReply` (scope `AddPullRequestReviewComment`). Token com scopes `gist, read:org, repo, workflow` e insuficiente. Afeta: `scripts/resolve-pr-threads.py`, skill `gh-resolve-pr-comments`.

- **Unset `GITHUB_TOKEN` para `gh` usar keyring apos device flow** [github, gh, auth, env]
  Variavel `GITHUB_TOKEN` no ambiente sobrescreve credencial do keyring e faz `gh` usar token antigo sem scope GraphQL. Antes de `gh auth login` ou resolve threads: `unset GITHUB_TOKEN`. Afeta: sessoes de agente, scripts PR Gate.

- **LiteLLM guest ou mismatch auth client/server = gate nao passa (tabela vazia)** [llm, supabase, auth, experimento]
  Experimento exige sessao Supabase Auth real + email na allowlist. Guest → 401; client com email local vs server Supabase Auth mismatch impede gate. `llm_experiment_runs` vazia apos waterfall pode ser gate, nao falha de persistencia. Validar login no preview antes de diagnosticar API. Afeta: `utils/llm/experimentGate.ts`, `api/_experiment-auth.ts`, PR #386.

### Sessao 2026-06-21 — PR #386 diagnostico duplo bloqueio (gate + billing)

- **Gate server-side LiteLLM exige Supabase Session — preview com OperatorContext nunca passa** [litellm, experiment, gate, supabase, auth, preview, pr386]
  O gate `experimentGate.ts` server-side verifica `hasSupabaseSession` antes de liberar o experimento. O preview Vercel usa auth local-only (OperatorContext) que nunca cria sessao Supabase. Mesmo com todas as env vars corretas (`LLM_PROVIDER=litellm`, `LLM_EXPERIMENT_MODELS` com Kimi, etc.), o gate fecha com `no_supabase_session` antes do router de modelos. A suspeita anterior de "env var errada" (sessao 2026-06-21T11-17-46) foi refutada: o bloqueio era o gate, nao a configuracao. Solucao: env `LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH=true` para bypass em preview, com guarda de producao. Afeta: `utils/llm/experimentGate.ts`, `api/gemini.ts`, PR #386.

- **Gemini prepayment credits depleted causa 429 que bloqueia ate fallback** [gemini, billing, 429, preview, fallback, pr386]
  Creditos pre-pagos do Gemini esgotados geram HTTP 429 (`"Your prepayment credits are depleted"`) em TODAS as chamadas `/api/gemini`. Nem o fallback Gemini funciona. Preview fica sem LLM ate recarregar credits OU usar LiteLLM como unico provider (que tambem esta bloqueado pelo gate). Impacto: validacao do PR #386 requer resolver ambos os bloqueios; nao ha LLM funcionando no preview. Afeta: `api/gemini.ts` (GeminiProxy), PR #386.

- **Ordem de diagnostico para experimento LiteLLM: gate -> allowlist -> catalogo -> smoke** [litellm, debug, diagnostico, gate, experiment, pr386]
  A investigacao do bloqueio Kimi no preview mostrou que a ordem correta de diagnostico e: (1) gate server-side passou? olhar logs `[ModularDossier] LiteLLM experiment gate fechado`; (2) allowlist inclui operador?; (3) modelo esta no catalogo e na env `LLM_EXPERIMENT_MODELS`?; (4) smoke autenticado funciona? Pular o passo 1 leva a diagnosticar env vars como causa quando o problema real e auth server-side. O erro `400 Model not allowed for experiment` no smoke era consequencia do gate fechado, nao causa. Afeta: fluxo de debug de PR #386.

### Sessao 2026-06-21 — PR #386 3 modelos, foundation cache gap, Brave Search

- **Foundation cache gap e o real diferencial Gemini, nao o modelo** [litellm, gemini, foundation-cache, grounding, descoberta, pr386]
  Por 3 sessoes consecutivas, a premissa do experimento LiteLLM era "substituir o Gemini por outro modelo melhor/mais barato". A validacao real com 3 modelos (DeepSeek V4 Flash, Grok 4.20, DeepSeek V4 Pro) revelou que **o modelo nao e o diferencial** — o Gemini produz dossies excelentes porque recebe foundation cache de ~43k caracteres (contexto completo do CNPJ) + Google Search grounding nativo. Modelos via LiteLLM recebem apenas ~15k chars sem web search. O resultado: dossies genericos independentemente do modelo. **Licao:** para qualquer experimento que troque provider de IA, verificar primeiro o que o provider atual oferece de infraestrutura (cache, grounding, tools) antes de comparar modelos. O modelo e apenas uma peca. Afeta: PR #386, roadmap de IA, qualquer futura troca de provider.

- **Grok 4.20 Reasoning rapido mas dossie generico sem web search** [litellm, grok, web-search, qualidade, pr386]
  Grok 4.20 completou 6/6 modulos em 12-22s cada (0 erros), melhor desempenho entre os 3 modelos testados. Mas o dossie foi generico — "Nao encontrado" em quase todos os campos, apenas 1 CNPJ descoberto. Comparacao: Gemini com foundation cache + Google Search descobriu Colombia, R$2.8Bi, 220k ha, 28 CNPJs, TOTVS Protheus+AdvPL para o mesmo CNPJ Scheffer. Velocidade sem qualidade nao serve para dossie comercial. Afeta: criterio de selecao de modelos, PR #386.

- **Web Search externo como requisito obrigatorio para modelos sem grounding nativo** [litellm, web-search, brave, grounding, arquitetura, pr386]
  Para que modelos via LiteLLM produzam dossies comparaveis ao Gemini, e necessario injetar grounding context externo. A implementacao segue: `api/open-web-search.ts` (Brave Search primario + DuckDuckGo fallback), `utils/llm/webSearchService.ts` (5 queries paralelas + curadoria), injecao via `sharedDossierModuleOptions.groundingContextBlock` no `waterfall-orchestrator.ts`. Ainda pendente de validacao — se mesmo com web search o dossie continuar generico, o experimento LiteLLM pode ser encerrado. Afeta: `api/open-web-search.ts`, `utils/llm/webSearchService.ts`, `utils/llm/modelCatalog.ts`, PR #386.

- **Modelos thinking (raciocinio) sao inviaveis para waterfall comercial** [litellm, deepseek, performance, timeout, modelo, pr386]
  DeepSeek V4 Flash e V4 Pro sao modelos de raciocinio (thinking mode) que priorizam qualidade sobre velocidade. No waterfall de 6 modulos, ambos tiveram performance inaceitavel: V4 Flash 2/6 modulos com 62-119s cada (4 timeouts), V4 Pro 1/6 modulos a 44s. Para um dossie comercial que precisa entregar 6 modulos em <3min, modelos thinking sao inviaveis. Preferir modelos de geracao direta (non-thinking) como Grok 4.20. Afeta: criterio de selecao de modelos, PR #386.

### Sessao 2026-06-21 — PR #386 validacao LiteLLM (F1-F6 completo)

- **Bypass preview local auth exige 3 camadas: cliente + servidor + proxy** [litellm, auth, preview, experiment, gateway, pattern, pr386]
  Para fazer o gate LiteLLM aceitar auth local-only (OperatorContext) em preview sem quebrar auth normal de producao, foram necessarias 3 camadas: (1) no cliente, `experimentGate.ts` com `LLM_EXPERIMENT_PREVIEW_LOCAL_AUTH=true` e `authMode=preview_local` no retorno; (2) no servidor, `_experiment-auth.ts` aceitando header `x-experiment-operator-email` como alternativa ao Bearer token; (3) no proxy, `geminiProxy.ts` com `setPreviewOperatorEmail()` module-level var para propagar o email. Cada camada tem guarda de producao (NODE_ENV=production bloqueia bypass) e cobertura de testes. Qualquer bypass de auth em preview deve seguir este padrao de 3 camadas com guardas individuais. Afeta: `utils/llm/experimentGate.ts`, `api/_experiment-auth.ts`, `services/geminiProxy.ts`, PR #386.

- **DeepSeek V4 Flash e inviavel para waterfall de dossie comercial (62-119s/modulo)** [litellm, performance, timeout, deepseek, modelo, pr386]
  Teste real com `huawei/deepseek-v4-flash` no waterfall Scheffer (04.733.767/0001-80, 6 modulos): 2/6 modulos concluidos (62s e 84s), 4/6 timeout aos 119s. DeepSeek V4 Flash e um modelo de raciocinio (thinking) que prioriza qualidade sobre velocidade — adequado para analise aprofundada, nao para waterfall comercial que precisa entregar 6 modulos em <3min. Para o caso de uso de dossie comercial, modelos de raciocinio sao inviaveis. O experimento LiteLLM deve priorizar modelos de geracao direta (non-thinking) com latencia comparavel ao Gemini (<15s/modulo). Afeta: `utils/llm/modelCatalog.ts`, criterio de selecao de modelos para PR #386.
