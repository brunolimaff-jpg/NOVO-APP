# Decisions

Last updated: 2026-05-31 — Vercel Features Exploradas (plano cancelado)

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
