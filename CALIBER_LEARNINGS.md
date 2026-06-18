# Caliber Learnings — Senior Scout 360

Padroes e anti-padroes aprendidos de sessoes anteriores. Tratados como regras do projeto.

## Padroes confirmados

- **Supabase + IDB como cache offline** [react, typescript, supabase, offline] ⚠️ HISTÓRICO
  Offline-first com sync queue: IDB para leitura/escrita instantanea, Supabase como source of truth.
  Stale-while-revalidate nas leituras, fila com retry exponencial nas escritas.
  ~~Aplicado com sucesso — migracao completa de idb-keyval para Supabase.~~
  **Removido na PR #317 (31/05/2026).** Substituído por Supabase direto como fonte única.

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

- **[HISTÓRICO] Cross-device: Supabase e IDB fora de sync** [offline, supabase, indexddb, sync]
  ~~`findExistingDossier` consulta Supabase, `getDossier` so le IndexedDB. Em device B, o dossier existe no Supabase mas getDossier retorna null. Toda consulta entre fontes precisa de protocolo de sync claro.~~
  Este anti-padrão era específico da arquitetura IDB removida na PR #317. O princípio geral (não ter duas fontes de verdade) permanece válido.

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

- **[HISTÓRICO] Migracao IDB→Supabase offline conta como sucesso** [migracao, offline, falha-silenciosa]
  ~~`saveDossier` retorna void sem throw quando `!isSupabaseAvailable()`. Migracao incrementa contador e seta flag permanente sem verificar se upsert real ocorreu. Solucao: verificar `isSupabaseAvailable()` no topo da migracao, retornar sem setar flag.~~
  Migração concluída. Flag permanente já setada. Não aplicável ao código atual.

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

- **AbortSignal.timeout() cobre apenas conexao, nao leitura do body** [fetch, timeout, abort, body-read]
  `fetch(url, { signal: AbortSignal.timeout(N) })` aborta apenas a fase de conexao (TCP handshake + TLS + response headers). `response.json()` le todo o body apos os headers — e essa leitura nao tem timeout proprio. Se o servidor envia headers rapido mas o corpo demora (ou e grande), `response.json()` fica bloqueada indefinidamente. Solucao: `AbortController` explicito para timeout total + `response.text()` com race contra timeout dedicado + `JSON.parse()` manual.

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
  `validate-inline-sources`, benchmark e continuity-question nao podem bloquear todo o dossie. Timeout retorna fallback seguro.

- **Validacao final deve confirmar intencao de produto** [ux, validacao]
  Checks verdes, Supabase persistido e logs saudaveis nao bastam. Fechamento exige overlay fora, input habilitado, cards/bot visiveis e ausencia de stuck/blank.

### Sessao 2026-06-08 — resolucao PR #347 e investigacao tela branca

- **Nunca commitar codigo visual sem antes commitar as dependencias** [commit, ci, typecheck]
  `MessageTimeline.tsx` importava `debugStaticFallbackDisplay` de `layoutTraceTelemetry.ts`, mas o arquivo de util nao foi commitado. CI quebrou com typecheck. Sempre verificar `git status` antes do commit para garantir que todos os arquivos novos estao inclusos.

- **git merge com working tree sujo contamina o merge commit** [git, merge, working-tree, auto-merge]
  Ao fazer merge com `origin/main`, arquivos modificados no working tree (gemini_usage) vazaram para o merge via `--ours`. `waterfall-orchestrator.ts` ganhou `operatorId` que quebrou typecheck porque `types.ts` nao tinha o campo. Sempre fazer merge com working tree limpa ou usar `git stash`.

- **display:none em flex colapsado foi REFUTADO** [css, layout, debug, flexbox]
  A hipótese de que o browser computa `display:none` automaticamente em flex items com `flex-basis:0%` + `min-h-0` é FALSA. Reprodução mínima provou que `getComputedStyle(el).display` permanece `block`/`flex`. O `display:none` real encontrado no Supabase tem origem externa (Vercel preview, injeção de runtime, ou race condition com React hydration).

- **traceFullAncestorChain é superior a trace de culpado único** [diagnóstico, debug, layout]
  `findFirstZeroDimensionAncestor` retorna apenas um nó. `traceFullAncestorChain` captura TODOS os ancestrais com `computedStyle` completo (display, width, height, visibility), permitindo identificar exatamente onde `display:none` ou dimensão zero aparece. Preferir cadeia completa sobre busca de culpado único em diagnósticos de layout.

- **CodeQL não bloqueia merge quando não é check obrigatório** [ci, codeql, merge, pr]
  30 alertas pré-existentes em main não impediram merge porque CodeQL não está na lista de `required status checks`. Ao avaliar bloqueios de merge, verificar a configuração de branch protection, não apenas o estado do check.

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

---

## Auditoria por exploração paralela

- Dividir a auditoria por territórios aumenta a cobertura e reduz a navegação sequencial.
- Cada explorador deve informar os arquivos efetivamente lidos.
- Resultados paralelos precisam ser consolidados sem duplicidade.
- Toda auditoria deve terminar com uma etapa de autorrefutação.
- Código suspeito não é automaticamente bug.
- Uma cadeia de concorrência precisa ser alcançável, não apenas teoricamente imaginável.
- Timer sem cleanup não é defeito sem efeito colateral demonstrável.
- Documentação gerada por IA deve ser confrontada com código e testes.

## Classificação de incidentes mitigados

Não classificar automaticamente como P0 ativo um incidente que:

- ocorreu historicamente;
- possui recovery funcional;
- não reincidiu após a mitigação;
- continua apenas com causa raiz aberta.

A classificação adequada é `incidente mitigado com causa aberta`, acompanhada de gatilhos objetivos de reabertura.

## Fidelidade dos testes de interface

- jsdom não reproduz integralmente layout, CSS computado, ResizeObserver e timing do navegador.
- Virtuoso mockado não comprova comportamento do virtual scroller real.
- RAF síncrono em teste pode esconder condições temporais do navegador.
- Incidentes de geometria e renderização devem ser confirmados por E2E em navegador real quando houver reincidência.

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

<!-- caliber:managed:learnings -->

_Atualizado automaticamente pelo Caliber apos sessoes de agente._

<!-- /caliber:managed:learnings -->
# Sessao 2026-06-18 - Playbook nao bloqueante e cron fail-safe

- **Roadmap de qualidade nao pode virar trava global de trabalho** [processo, agentes, planejamento]
  Um plano prioritario deve orientar ordem e prova, sem impedir mudanca explicita de objetivo, fechamento documental ou resposta a incidentes. Decisoes substituidas ficam marcadas como `SUPERADA`, preservando o historico.

- **Cron destrutivo deve iniciar em dry-run** [vercel, cron, auth, seguranca operacional]
  Configurar apenas o segredo de autenticacao pode ativar uma versao que exclui dados imediatamente. Primeiro publicar `dry-run` como padrao, revisar candidatos e so depois habilitar uma flag destrutiva separada.
