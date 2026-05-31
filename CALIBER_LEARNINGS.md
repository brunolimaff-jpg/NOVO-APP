# Caliber Learnings — Senior Scout 360

Padrões e anti-padrões aprendidos de sessões anteriores. Tratados como regras do projeto.

## Padrões confirmados

- **Supabase + IDB como cache offline** [react, typescript, supabase, offline]
  Offline-first com sync queue: IDB para leitura/escrita instantanea, Supabase como source of truth.
  Stale-while-revalidate nas leituras, fila com retry exponencial nas escritas.
  Aplicado com sucesso — migracao completa de idb-keyval para Supabase.

- **Validar intencao de produto alem do evento tecnico** [ux, feedback, supabase, produto]
  Ao validar fluxos de produto, confirmar se o comportamento real representa a intencao esperada, nao apenas se o evento chegou no destino tecnico.
  Exemplo: feedback chegou no Supabase, mas cliques repetidos revelaram duplicacao e o clique negativo dependia de motivo + confirmacao.
  Validacao boa cruza banco, UX e semantica esperada antes de concluir que "funcionou".

- Prompts Gemini com XML delimiters têm menor taxa de alucinação
- Score PORTA deve sempre ser gerado com temperatura 0.1 (factual)
- Search Grounding nunca deve ser cacheado — dados de empresa mudam
- Skeleton screens com dimensões fixas eliminam layout shift no streaming
- Validar CNPJ antes de qualquer chamada IA evita desperdício de tokens
- Pool de fontes cumulativo entre módulos do waterfall reduz alucinação de links em módulos sem grounding
- Pipeline único de integridade ao final (não por módulo) é idempotente e evita duplicação de fontes
- Três categorias de fontes (citadas, consultadas, inferidas) dão transparência completa ao usuário

## Anti-padrões identificados

- Prompt inline no componente: dificulta versionamento e teste
- catch vazio em chamadas Gemini: vendedor vê tela travada sem saber o motivo
- `any` em tipos de resposta da IA: propaga erros silenciosos para o dossiê
- Cache de Search Grounding: dossiê com dados desatualizados compromete credibilidade na reunião
- `break` em fallback de busca web: um módulo degradado não deve abortar o pipeline inteiro; `continue` preserva resiliência e fontes de módulos anteriores
- `?? 'hero'` em `loadingVariant`: coerção de `undefined` para valor padrão ignora semântica do nulo; comparar explicitamente com `=== 'hero'`
- `useMemo` para strings primitivas: desnecessário e mais complexo que concatenação direta de string — React já compara `===` em deps de useEffect

- **Benchmark timeout reduzido para 20s** [performance, benchmark, timeout]
  `MODULAR_BENCHMARK_TIMEOUT_MS` de 45000 para 20000. Benchmark e etapa opcional — timeout curto evita travamento do loading.

- **completeLoadingProgress() no finally** [loading, react, safe]
  `setIsLoading(false)` no finally nao basta: o progress tracker interno do LoadingSmart precisa ser resetado com `completeLoadingProgress()`. Sem isso, o proximo request herda estado zumbi.

- **Timeout aninhado multiplica tempo real** [api, timeout, anti-pattern]
  Camadas de retry (fetchWithRetry 3x, cold-start, withAutoRetry 3x) acumulam delay mesmo com timeout externo. Cada camada adiciona seu proprio tempo de execucao. Para etapas opcionais, 1 tentativa com timeout curto e melhor que multiplos retries.

- **Preview Vercel revela bugs de rede que testes nao pegam** [testing, deploy, vercel]
  Travamento do LoadingSmart so apareceu no preview Vercel. Testes unitarios nao cobrem comportamento real de HTTP (benchmark lento, cold-start). Preview deploy e gate obrigatorio antes de merge.

- **Evento + cleanup no mesmo ciclo destroi estado** [react, useEffect, evento]
  useEffect cleanup que limpa `completedDossier` roda antes da proxima render, mas se o event listener esta no mesmo ciclo, o cleanup executa antes do consumo. O componente nunca ve o estado.

- **Catch silencioso em consulta cria duplicata no Supabase** [supabase, catch, duplicata]
  `findExistingDossier` retorna `null` no catch. O caller interpreta null como "nao existe" e cria novo registro. Nunca usar `return null` em catch de funcao de consulta sem log ou fallback.

- **Cross-device: Supabase e IDB fora de sync** [offline, supabase, indexddb, sync]
  `findExistingDossier` consulta Supabase, `getDossier` so le IndexedDB. Em device B, o dossie existe no Supabase mas getDossier retorna null. Toda consulta entre fontes precisa de protocolo de sync claro.

- **Componente condicional sem `key` causa estado stale** [react, key, componente]
  `DossierShareBar` sem `key={dossierId}` faz React reutilizar a instancia do componente, exibindo dados do dossie anterior. Toda renderizacao condicional que depende de props mutaveis precisa de key.

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

<!-- caliber:managed:learnings -->

_Atualizado automaticamente pelo Caliber após sessões de agente._

<!-- /caliber:managed:learnings -->
