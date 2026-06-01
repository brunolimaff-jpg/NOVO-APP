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

- **completeLoadingProgress deve resetar loadingVariant para undefined** [loading, progress, variant, stale]
  `completeLoadingProgress()` em `loading-progress.ts` setava `setIsLoading(false)` e `setProgress(100)` mas nao resetava `loadingVariant`. No proximo loading, o componente exibia o variant anterior em vez do novo. Solucao: adicionar `setLoadingVariant(undefined)` no reset.

<!-- caliber:managed:learnings -->

_Atualizado automaticamente pelo Caliber apos sessoes de agente._

<!-- /caliber:managed:learnings -->
