# Progress

Last updated: 2026-05-22

## Completed

### Melhorias pos-migracao Supabase (2026-05-22)

**Branch:** `codex/standardize-mermaid-maps`
**HEAD:** `d22fa0c`
**Commits adicionais:** 8 commits apos a migracao (12 migracao + 8 melhorias = 20 totais)

#### Cadastro restrito (@senior.com.br) — commit `5a2b35e`
- `contexts/OperatorContext.tsx`, `components/GreetingWelcomeScreen.tsx`: validacao de email `@senior.com.br` + nome completo (2+ palavras)
- `types.ts`: campos `name` e `surname` obrigatorios no register
- Testes atualizados: `tests/components/GreetingWelcomeScreen.test.tsx`

#### onConflict + view_count removido — commit `a8775d9`
- `services/storage.ts`: `addFavorite()` usa `onConflict` para upsert seguro
- `view_count` removido da tabela `dossies` (campo broken)
- Testes atualizados: `tests/services/storage.test.ts`

#### radar_alerts unique + scheduleSync + updated_at fix — commit `b58586d`
- `services/syncQueue.ts`: `scheduleSync()` apos enqueue
- `services/storage.ts`: `updated_at` gerado automaticamente no upsert
- `docs/superpowers/schema-supabase.sql`: unique constraint em `radar_alerts`
- Testes atualizados: `tests/services/syncQueue.test.ts`

#### Badge sync click: clear → force sync — commit `f74c9d0`
- `components/SyncIndicator.tsx`: clique no badge agora dispara `syncAll()` em vez de limpar notificacao

#### Docs update — commit `a4a5396`
- HANDOFF_AI.md, activeContext.md, decisions.md, progress.md, last-session-context.md atualizados apos migracao

#### Email recovery (device linking) — commit `c880566`
- `contexts/OperatorContext.tsx`: novo fluxo — se email `@senior.com.br` ja existir no Supabase, oferece vincular dispositivo ao `operator_id` existente
- `components/GreetingWelcomeScreen.tsx`: UI de recovery (botao "Vincular este dispositivo")
- Testes novos: `tests/services/storage.test.ts` (email lookup)

#### Remocao botao "Dossie de investigacao" — commit `d5f7538`
- Botao e toda a fiação removida de 14 arquivos: `ChatShell.tsx` (2x), `Composer.tsx` (2x), `Settings.tsx`, `ChatPanels.tsx`, `App.tsx`, `types.ts`, `GREETING_CONFIG.ts`, `contracts.ts`, `ChatInterface.tsx`, `MessageTimeline.tsx`, `EmptyStateHome.tsx`, `SessionsSidebar.tsx`, `ReceitaService.ts`
- Testes: `tests/App.dossierGolden.test.tsx`, `tests/components/EmptyStateHome.test.tsx` atualizados

#### Sync manual button — commit `d22fa0c`
- Novo `ManualSyncButton.tsx` (componente): pill visual com icone de sync, feedback animado de envio/recebimento
- `ChatShell.tsx`: botao adicionado no header ao lado do SyncIndicator
- `services/storage.ts`: `syncAll()` exposto publicamente, dispara evento `scout:sync-complete`
- Hook `useSyncStatus` consumido pelo botao para mostrar estado atual
- Testes: `tests/components/ManualSyncButton.test.tsx` criado

### Migracao Supabase (2026-05-22)

**Arquivos criados:**
- `lib/supabaseClient.ts` — cliente Supabase browser com graceful degradation
- `services/syncQueue.ts` — fila offline com retry e persistencia IDB
- `services/storage.ts` — interface unificada de storage (fonte unica para hooks)
- `components/SyncIndicator.tsx` — badge no header mostrando status de sync
- `docs/superpowers/schema-supabase.sql` — DDL completo das 8 tabelas
- `docs/superpowers/specs/2026-05-22-supabase-migration-design.md` — spec de design
- `docs/superpowers/plans/2026-05-22-supabase-migration.md` — plano de implementacao
- `tests/services/syncQueue.test.ts` — 5 testes
- `tests/services/storage.test.ts` — 28 testes
- `tests/integration/supabase-sync.test.ts` — 4 testes

**Arquivos modificados:**
- `hooks/useSessionStorage.ts` — migrado de idb-keyval para storage.ts
- `features/radar/useRadar.ts` — migrado de idb-keyval para storage.ts
- `services/extractContentService.ts` — migrado de idb-keyval para storage.ts
- `contexts/OperatorContext.tsx` — adicionado campo email + sync Supabase
- `components/GreetingWelcomeScreen.tsx` — input de email com validacao
- `components/ChatInterface.tsx` — callback de email propagado
- `components/chat/MessageTimeline.tsx` — assinatura de callback atualizada
- `components/chat/ChatShell.tsx` — SyncIndicator no header

**Schema Supabase:**
- URL: `https://vmqfcaoirjcfucvlnpig.supabase.co`
- 8 tabelas com RLS, 8 indexes, grants anon
- Tabelas: `user_context`, `dossies`, `radar_alerts`, `radar_configs`, `extract_cache`, `audit_log`, `favorites`, `shared_dossiers`

**Decisoes arquiteturais:**
1. Auth postergada (UUID local como operator_id)
2. Dados migraveis de IDB -> Supabase
3. Offline-first com sync queue
4. Conexao direta Supabase sem serverless API layer

**Pendente:**
- Configurar env vars no Vercel: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- Testar fluxo completo no preview Vercel
- Mergear em main

### Auditoria de Código Multi-Fase (2026-05-22)

**Planejamento:**
- Criado `docs/planos/auditoria-codigo-2026-05-21.md` (840 linhas) com 5 fases: auditoria paralela, falhas silenciosas, segurança, performance, verificação final.

**Fase 1 — Auditoria (3 relatórios gerados):**
- `docs/planos/audit-silent-failures.md` — 128 catch blocks, 7 P0 + 14 P1
- `docs/planos/audit-seguranca.md` — 10 vulnerabilidades (2 P0, 4 P1, 3 P2)
- `docs/planos/audit-performance.md` — 64 regras Vercel, score 2.3/5

**Fase 2 — Correção de Falhas Silenciosas (10 arquivos):**
- Adicionado `scoutDiag.warn/error` em catches que engoliam erros nos arquivos: `features/radar/useRadar.ts`, `utils/conversationHistory.ts`, `utils/linkValidation.ts`, `features/dossier/waterfall-orchestrator.ts`, `services/competitorService.ts`, `services/gemini/investigation-orchestration.ts`, `services/gemini/auxiliary.ts`, `services/gemini/recovery.ts`, `services/exportService.ts`, `hooks/useAppInitialization.ts`.
- Validacao: `npm exec vitest run tests/features/dossier/waterfall-orchestrator.test.ts tests/features/dossier/porta-reconciliation.test.ts` green (`15` testes).

**Fase 3 — Correção de Segurança (15 arquivos):**
- `api/_security-headers.ts` criado — `setSecurityHeaders(res)` com guard de compatibilidade para testes. Headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy. Aplicado em 11 API routes.
- `api/_cache-headers.ts` criado — helper `cacheHeaders(maxAgeSeconds)` para Cache-Control.
- `components/MarkdownRenderer.tsx` — `securityLevel: 'loose'` → `'strict'`, `allowRawHtml` default `true` → `false`. Regex de conversao HTML `<a href>` → `[text](url)` markdown; citações `[🟢 url]` geram markdown links.
- `index.tsx` — `VITE_PINECONE_API_KEY` e `VITE_PINECONE_INDEX_HOST` removidos de `OPTIONAL_ENV_VARS`.
- `api/link-status.ts` — `isHttpUrl()` → `isValidPublicUrl()` (bloqueia SSRF: localhost, 127.0.0.1, 169.254.169.254, redes privadas).
- `api/extract-content.ts` — `.max(13_600_000)` no campo `base64Content` do schema Zod.
- `api/comex.ts` — CORS whitelist (nao mais `*`).
- Validacao: `npm exec vitest run tests/components/MarkdownRenderer.test.tsx` green com +1 teste de conversao HTML→markdown.

**Fase 4 — Correção de Performance (8 arquivos):**
- `hooks/useDebounce.ts` criado — hook generico `useDebounce<T>(value, delay)`.
- `App.tsx` — 4 componentes lazy-loaded: LoadingSmart, EmailModal, FollowUpModal, UpdateNotificationModal.
- `vite.config.ts` — chunk `vendor-anim` para framer-motion (124KB).
- `components/MessageRow.tsx` — 2x `.filter().map()` → `.flatMap()`.
- `api/gemini.ts` — 2x `.filter().map()` → `.flatMap()`.
- `components/InvestigationDashboard.tsx` — `useDebounce(searchText, 300)` no input de busca.
- `api/cnpj.ts` — Cache-Control 1h.
- `api/comex.ts` — Cache-Control 24h.
- Validacao: `npm run typecheck` green; `npm run build` green (chunk `vendor-anim` presente).

**Bug Fixes:**
- `services/clientLookupService.ts` — `formatarParaPrompt()`: match parcial (`matchType !== 'exact'`) nao inclui dados de CRM. Retorna alerta de PROSPECT. Corrige confusao entre empresas similares.
- `components/MarkdownRenderer.tsx` — hyperlinks HTML `<a href>` de resultados de pesquisa convertidos para `[text](url)` markdown.

**Testes atualizados (10 arquivos):**
- `tests/App.dossierGolden.test.tsx`, `tests/components/LoadingSmart.test.tsx`, `tests/utils/loadingSmartViewModel.test.ts`, `tests/components/MarkdownRenderer.test.tsx`, `tests/services/clientLookupService.test.ts`.
- Validacao final: `npm run test` green.

- Botão de empresa demo para Preview adicionado em `2026-05-21`:
  - `components/EmptyStateHome.tsx` mostra CTA de demo somente com `VITE_ENABLE_PREVIEW_DEMO=true` e payload mínimo completo (`VITE_PREVIEW_DEMO_COMPANY`, `VITE_PREVIEW_DEMO_CITY`, `VITE_PREVIEW_DEMO_STATE`; CNPJ opcional/normalizado).
  - Clique dispara `onStartInvestigation` diretamente com a empresa configurada, sem regra por usuário.
  - Testes cobrem exibição/acionamento com env completa e ausência com flag desligada.
  - Validações: `npm exec vitest run tests/components/EmptyStateHome.test.tsx` green (`11` testes); `npm run typecheck` green.
- Perguntas de acompanhamento corrigidas em `2026-05-21`:
  - `utils/continuitySuggestions.ts` criado para fallback contextual de sugestoes por sinais comerciais do dossie/resposta.
  - Fallback estatico ruim das quatro perguntas genericas deixou de ser emitido pela camada compartilhada.
  - Chat normal e waterfall passam `contextText` para completar perguntas; regeneracao ("Novas") evita repetir as sugestoes atuais e usa a mensagem alvo como contexto.
  - Validacoes: `npm exec vitest run tests/services/geminiService.test.ts tests/features/dossier/waterfall-orchestrator.test.ts tests/features/dossier/porta-reconciliation.test.ts` green (`51` testes); `npm run typecheck` green; `npm run lint -- --quiet` green.
  - Follow-up da PR `#268`: perguntas tecnicas demais foram bloqueadas; prompt de continuidade virou XML com foco em conversa comercial; testes cobrem rejeicao de `GATec`/`CAPEX`/`ERP`/arquitetura e preservacao de perguntas de negocio. Validacoes: recorte green (`54` testes), `typecheck` green, `lint --quiet` green.
  - Normalizacao da PR `#268`: nomes em sugestoes agora usam referencia comercial curta; remove sufixos societarios de entradas manuais/CNPJ (`LTDA`, `CIA`, `ME`, `S/A`) e reescreve sugestoes retornadas pela IA com razao social. Validacoes: recorte green (`58` testes), `typecheck` green, `lint --quiet` green.
- Inline follow-up do chat principal refatorado em `2026-05-21`:
  - `features/chat/message-orchestrator.ts` passa `isFollowUp` para `sendMessageToGemini`.
  - `services/gemini/runtime.ts` monta historico compacto para follow-ups em pares alternados `user/model`: pesquisa inicial + ultimo turno completo, reduzindo custo e risco de repetir a estrutura do dossie inicial.
  - `services/gemini/investigation-orchestration.ts` adiciona instrucao de resposta cirurgica para follow-up normal, nao reexecuta dossie/modulo em pergunta especifica e evita novo lookup Senior em follow-up sem CNPJ.
  - Deep Dive segue feature-flagado/desligado por padrão e ficou fora do escopo desta refatoracao.
  - Risco residual: se o recorte nao carregar contexto suficiente, o modelo deve pedir esclarecimento ao usuario.
- Sprints 1-8 concluídas e mergeadas em `main`.
- Sprint 8 mergeada via PR `#241`.
- PR `#253` Docs RAG anti-alucinação mergeada em `2026-05-16`:
  - merge commit `df1ca1e`
  - validação local/remota documentada
  - validação manual em Vercel preview com CNPJ `04.733.767/0001-80`
- Sprint 9 mergeada via PR `#254` em `2026-05-16`:
  - head da branch: `19485dc`
  - merge commit: `922a403`
  - `App.tsx` reduzido para `622` linhas
  - wiring de EmailModal/FollowUpModal extraído para hooks
  - export/email movido para `services/exportService.ts`
  - leak `features/dossier` -> `features/chat` removido
  - dependência circular `chatStore` -> `message-orchestrator` resolvida
  - `madge`/`ts-prune` adicionados
  - `utils/featureFlags.ts` criado
  - OI-055 Pinecone via `VITE_*` registrado como risco aceito
- Onda 0+1 mergeada via PR `#255` em `2026-05-16`:
  - merge commit `0550454`
  - docs/memória pós-Sprint 9 sincronizados
  - PORTA partial integrity hold corrigido
  - logs cliente sensíveis migrados para `scoutDiag`
  - `/api/open-web-search` corrigido para não quebrar no runtime Vercel por import ESM sem `.js`
  - review comments do Gemini Code Assist resolvidos
- OI-066 mergeado via PR `#256` em `2026-05-16`:
  - merge commit `66591f1`
  - `components/MessageRow.tsx` deixou de renderizar `\uD83D\uDDD1\uFE0F` como texto cru
  - ícone de excluir preserva `aria-label` e teste focado
- Sprint 10 mergeada via PR `#257` em `2026-05-16`:
  - merge commit `fbf5536`
  - runtime do Radar movido para `features/radar/useRadar.ts` e `features/radar/service.ts`
  - facades `hooks/useRadar.ts` e `services/radarService.ts` preservadas para compatibilidade
  - guardrail `tests/architecture/radarBoundaryImportGuard.test.ts` ativo
  - checks remotos verdes antes do merge

## In progress

- Merge de `codex/standardize-mermaid-maps` em `main` (20 commits — migracao Supabase + 8 melhorias pos-migracao: cadastro restrito, email recovery, sync manual, remocao dossie).
- Configuracao de env vars no Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- PR `#270` (auditoria multi-fase): aberta em `codex/contextual-continuity-suggestions`, aguardando checks remotos e merge.
- UX Redesign Phase 1: PR `#266` aberta, aguardando validacao do owner no preview Vercel.

## Blockers

- Nenhum bloqueio tecnico.

## Sprint 12 closure (2026-05-20)

- PR `#262` (OI-004/003/057/062): mergeada em `5a3309d`.
- PR `#263` (OI-005 lint): mergeada em `958e731`. `npm run lint` passa com `0` warnings.
- PR `#264` (LoadingSmart progress bar fix): mergeada em `0694997`.
- Gates finais: `test` (117 arq, 834 testes), `typecheck`, `build`, `lint --quiet`, `analyze:circular` — todos verdes.
- Validação manual em Vercel aceita pelo owner.
- **Fase 2 (Manutenibilidade) declarada CONCLUÍDA.**

## Validation history

### Inline follow-up do chat principal

- `npm exec vitest run tests/features/chat/message-orchestrator.test.ts tests/services/geminiService.test.ts` green (`44` testes)
- `npm run typecheck` green

### Sprint 9 (done, merged)

- `npm run test`: green (`114` arquivos, `854` testes)
- `npm run typecheck`: green
- `npm run build`: green (warning aceito de chunking em `utils/idbStorage.ts`)
- `npm run lint`: green com warnings conhecidos (`0` erros, `160` warnings)
- `npm run analyze:circular`: 1 ciclo existente antes do fix, depois resolvido no review da PR
- Playwright local em `http://127.0.0.1:3000/`: tela inicial e home principal carregaram sem `console.error`/`pageerror`

### Onda 0+1

- `npm exec vitest run tests/features/dossier/porta-reconciliation.test.ts tests/features/dossier/waterfall-orchestrator.test.ts` green (`15` testes)
- `npm exec vitest run tests/services/clientLookupService.test.ts tests/extraction.test.ts` green (`20` testes)
- `npm exec vitest run tests/api-open-web-search.test.ts tests/services/investigation-orchestration.test.ts tests/services/geminiProxy.test.ts tests/extraction.test.ts` green (`16` testes)
- `npm exec vitest run tests/services/clientLookupService.test.ts tests/extraction.test.ts tests/api-open-web-search.test.ts` green (`27` testes) após resolver os review comments
- `npm run typecheck` green
- `npm run test` green (`114` arquivos, `846` testes)
- `npm run build` green (warnings aceitos OI-003/OI-057)
- `npm run lint` green com `0` erros e `150` warnings conhecidos
- `npm run analyze:circular` green, sem ciclos
- `vercel build --yes` green para confirmar empacotamento serverless.
- Smoke Vercel protegido com bypass de automação:
  - `POST /api/open-web-search` com query real: `200`, `OpenWebSearch/Brave`, `degraded: false`, `5` fontes;
  - `POST /api/open-web-search` com apenas `url`: `200`, `OpenWebSearch/URL`;
  - `POST /api/open-web-search` com `{}`: `400`, esperado;
- `vercel logs --status-code 500 --since 15m`: sem ocorrências após o fix.

### OI-066

- `npm exec vitest run tests/components/MessageRow.test.tsx tests/components/chat/MessageTimeline.test.tsx` green (`18` testes)
- `npm run typecheck` green
- `npm run build` green (warnings aceitos OI-003/OI-057)
- `npm run lint` green com `0` erros e `147` warnings conhecidos
- `rg -F '\\uD83D\\uDDD1\\uFE0F' components tests` sem ocorrências

### Sprint 10

- `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`40` testes)
- Review comments do Gemini Code Assist resolvidos (`forceScan` manual com auto-scan desligado + `scoutDiag.error` em falha de scan)
- `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/architecture/radarBoundaryImportGuard.test.ts` green (`35` testes)
- `npm exec vitest run tests/components/chat/ChatPanels.test.tsx tests/components/EmptyStateHome.test.tsx` green (`11` testes)
- `npm exec vitest run tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`7` testes)
- `npm run typecheck` green
- `npm run test` green (`115` arquivos, `851` testes)
- `npm run build` green (warnings aceitos OI-003/OI-057)
- `npm run lint` green com `0` erros e `147` warnings conhecidos
- `npm run analyze:circular` green, sem ciclos
- Checks remotos da PR `#257` green: AI Config Quality Score, Typecheck, Build, Tests, Dossier Golden, GitGuardian, Vercel, Vercel Preview Comments

### Sprint 11 Onda 0

- Baseline inicial `npm run test` green (`115` arquivos, `851` testes) em `origin/main@fbf5536`.
- `npm exec vitest run tests/components/CRMDetail.test.tsx tests/components/WarRoom.test.tsx` green (`18` testes).
- `npx vitest run --coverage tests/components/CRMDetail.test.tsx tests/components/WarRoom.test.tsx` green:
  - `CRMDetail.tsx`: `92.35%` linhas
  - `WarRoom.tsx`: `74.21%` linhas
- `npm run typecheck` green.
- `npm run test` green (`117` arquivos, `869` testes).
- `npm run build` green (warnings aceitos OI-003/OI-057).
- `npm run lint` green com `0` erros e `147` warnings conhecidos.


### Sprint 11 Onda 0.5

- Mini CRM local removido do runtime/contratos/tipos/testes dedicados.
- `config/localDevApiProxy.ts` criado para centralizar proxies Vite de rotas serverless; `/api/open-web-search` incluído.
- `tests/config/localDevApiProxy.test.ts` criado como guardrail.
- `npm run typecheck` green.
- `npm exec vitest run tests/components/LoadingSmart.test.tsx tests/services/geminiProxy.test.ts tests/config/localDevApiProxy.test.ts tests/components/ChatInterface.test.tsx tests/components/SessionsSidebar.test.tsx tests/components/FeatureGatingUI.test.tsx tests/App.layout.test.tsx` green (`43` testes).
- `npm run test` green (`115` arquivos, `820` testes).
- `npm run build` green, com warnings aceitos de chunking (`utils/idbStorage.ts` e chunks grandes).
- `npm run lint` green com `0` erros e `141` warnings conhecidos.
- `npm run analyze:circular` green, sem ciclos.
- Smoke local: `POST /api/open-web-search` em `localhost:3000` retornou `200` com `OpenWebSearch/Brave`; `POST /api/gemini` retornou HTTP `200`, mas health remoto veio `ok:false` e deve ser acompanhado separadamente se persistir.
- Warning conhecido de `SessionsSidebar.test.tsx` sobre render-prop de `ConfirmPopover` permaneceu como OI-004 até ser resolvido na Sprint 12.

### Sprint 11 Onda 1A

- Saneamento documental feito para evitar duplicação de planos vivos.
- Alvos: `HANDOFF_AI.md`, `.agents/memory/*`, `docs/ai-context/refactor/02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `sprints/00-INDEX.md`, `sprints/SPRINT-11-EXECUTION.md` e roadmap Obsidian.
- Critério: termos do Mini CRM só podem aparecer como histórico/removido, nunca como próximo trabalho.
- `npm run docs:obsidian:check` green (`14` notas).

### Sprint 11 Onda 1B

- `utils/loadingSmartViewModel.ts` criado para extrair timeline/progresso de `components/LoadingSmart.tsx`.
- `tests/utils/loadingSmartViewModel.test.ts` criado com cobertura de roadmap modular, roadmap de investigação, suavização de progresso com fila pendente, fallback incremental e normalização de labels equivalentes.
- `components/LoadingSmart.tsx` reduzido de `766` para `672` linhas e continua como fachada/default export.
- PR `#260` mergeada; Bruno validou e liberou seguir para a próxima onda.
- `npm exec vitest run tests/utils/loadingSmartViewModel.test.ts tests/components/LoadingSmart.test.tsx tests/App.loadingVariant.test.tsx` green (`18` testes).
- `npm exec vitest run tests/utils/loadingSmartViewModel.test.ts tests/components/LoadingSmart.test.tsx` green (`13` testes) após ajuste de nome de teste.
- `npm run typecheck` green.

### Sprint 11 Onda 1C

- Branch `codex/sprint-11-war-room-refactor` criada a partir de `origin/main@cb52fc1`.
- PR `#261` mergeada em `main` com merge commit `9fe0821`.
- `components/WarRoom.tsx` reduzido de `552` para `283` linhas.
- Extraídos contratos/config/tema e blocos visuais para `components/war-room/*`: `WarRoomSidebar`, `WarRoomHeader`, `WarRoomEmptyState`, `WarRoomComposer`, `WarRoomMessages`, `WarRoomModelMessage`, `WarRoomSources`.
- Props públicas preservadas: `isOpen`, `onClose`, `isDarkMode`, `defaultCompetitorTarget`.
- `services/warRoomService.ts` não foi alterado.
- Review comments do Gemini resolvidos (`key={hint}` em sugestões e extração de `WarRoomModelMessage`/`WarRoomSources`).
- Smoke Preview corrigido removendo header opcional `x-vercel-set-bypass-cookie` e mantendo `x-vercel-protection-bypass`.
- Lição aprendida: o erro remoto do GitHub Actions foi introduzido por excesso de header no bypass Vercel. Como o smoke automatizado envia o bypass a cada request, `x-vercel-set-bypass-cookie` é desnecessário e pode fazer o `fetch` falhar antes de retornar HTTP; usar só `x-vercel-protection-bypass`.
- `npm exec vitest run tests/components/WarRoom.test.tsx` green (`6` testes).
- `npm run typecheck` green.
- `npm run build` green, com warnings aceitos de chunking.
- `npm run lint -- --quiet` green.
- `npm run test` green (`116` arquivos, `826` testes).
- `npm run analyze:circular` green, sem ciclos.
- Checks remotos da PR `#261` green: Build, Dossier Golden, GitGuardian, Smoke Preview, Tests, Typecheck, Vercel, Vercel Preview Comments.

### Sprint 12 hardening

- Branch `codex/sprint-12-hardening-oi-004` criada a partir de `origin/main@3e4e155`.
- OI-004 resolvido:
  - `tests/components/SessionsSidebar.test.tsx` mocka `ConfirmPopover` com contrato render-prop.
  - teste de exclusão cobre `onDeleteSession`.
- OI-003 resolvido:
  - `utils/sessionExport.ts` usa import estático de `storageGet`/`storageSet`.
  - leitura do storage v2 parseia JSON antes de validar array de sessões.
  - `tests/utils/sessionExport.test.ts` cobre export/import no storage v2.
- `npm exec vitest run tests/components/SessionsSidebar.test.tsx tests/utils/sessionExport.test.ts tests/utils/idbStorage.test.ts` green (`23` testes).
- `npm run typecheck` green.
- `npm run build` green; warning específico de dynamic import de `utils/idbStorage.ts` removido. Permanece warning geral de chunks grandes.
- `npm run lint -- --quiet` green.
- `npm run test` green (`117` arquivos, `830` testes).
- `npm exec vitest run tests/components/SessionsSidebar.test.tsx tests/utils/sessionExport.test.ts tests/utils/idbStorage.test.ts tests/prompts/megaPrompts.test.ts` green (`39` testes).
- `npm run analyze:circular` green, sem ciclos.
- `npm run docs:obsidian:check` green (`14` notas).
- OI-057 resolvido com protocolo PWA/chunking em `docs/ai-context/refactor/05-VALIDATION.md`.
- OI-062 resolvido com golden baseline determinístico em `tests/prompts/megaPrompts.test.ts`.
- OI-005 medido: `npm run lint` passa com `140` warnings; mantido como cleanup dedicado para evitar sweep global nesta PR.

### Sprint 12 OI-005 lint warnings

- Branch `codex/sprint-12-oi-005-lint-warnings` criada a partir de `origin/main@5a3309d` após merge da PR `#262`.
- `eslint.config.js` ajustado para tratar scripts CLI, testes, `vite.config.ts` e `utils/diagnosticLog.ts` como contextos intencionais de console/mocks.
- Warnings simples de `no-unused-vars`, `no-explicit-any` e `no-console` removidos em runtime/API/componentes/utilitários sem alterar facades públicas.
- `npm run lint` green com `0` warnings.
- `npm run typecheck` green.
- `npm exec vitest run tests/api-gemini.test.ts tests/gemini-integration.test.ts` green (`9` testes).
- `npm run test` green (`117` arquivos, `833` testes).
- `npm run build` green; permanece apenas warning conhecido de chunks grandes.
- `npm run analyze:circular` green, sem ciclos.
- `npm run docs:obsidian:check` green (`14` notas).

### LoadingSmart progress bar hotfix

- Branch `codex/fix-loading-smart-progress-bar` criada a partir de `main@958e731`.
- Causa raiz: `LoadingSmart` renderizava checks de etapas a partir de `processing.completedStages`, mas a barra usava apenas `displayedCompleted`, que pode ficar atrasado pela fila visual.
- Fix: `utils/loadingSmartViewModel.ts` calcula `percent` usando o maior valor entre etapas visualmente reveladas e etapas reais concluídas no roadmap.
- Regressão coberta em `tests/utils/loadingSmartViewModel.test.ts` para cenário com etapas reais concluídas antes da fila visual revelar.
- Validação local:
  - `npm exec vitest run tests/utils/loadingSmartViewModel.test.ts tests/components/LoadingSmart.test.tsx tests/App.loadingVariant.test.tsx` green (`20` testes).
  - `npm run typecheck` green.
  - `npm run lint` green.
  - `npm run build` green; permanece warning conhecido de chunks grandes.

## Important refs

- `HANDOFF_AI.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/06-HANDOFF.md`
- `docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`

### UX Redesign Phase 1 (PR `#266`, branch `ux/redesign-phase1-v1`)

- Branch `ux/redesign-phase1-v1` criada a partir de `main@0694997`.
- AdminDash + useAdminMetrics removidos (268 linhas + hook + testes).
- Breadcrumb `Scout 360 → [sessão]` no header via `ChatShell.tsx`.
- Sidebar: preview da última mensagem do bot, indicador ativo com `bg-emerald-500/15` + bolinha verde, botões mobile sempre visíveis.
- MessageRow: indicadores visuais de status (✓ CONFIRMADO, ✕ OFF-LINE, ○ ANÁLISE INFERIDA, ◌ AUDITORIA EM CURSO).
- EmptyStateHome: cartão estilizado com ícone para feedback CNPJ.
- `getLastMessagePreview`: loop reverso em vez de `filter().pop()` após review do Gemini Code Assist.
- `onOpenAdminDash` removido de `ChatInterface`, `contracts.ts` e `App.tsx`.
- Teste `SessionsSidebar` atualizado para novo seletor de sessão ativa (`bg-emerald-500`).
- `npm run typecheck` green.
- `npm run test` green (`116` arquivos, `824` testes).
- `npm run lint` green.
- `npm run build` green.

## Next checkpoint

- Mergear `codex/standardize-mermaid-maps` em `main` (20 commits — migracao Supabase + 8 melhorias pos-migracao).
- Configurar env vars Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Testar fluxo completo: registrar com `@senior.com.br` -> criar dossie -> sync manual -> email recovery em segundo dispositivo.
- Mergear PR `#270` (auditoria multi-fase) em `main`.
- Mergear PR `#266` (UX Redesign Phase 1) apos validacao do owner.
- Nao reintroduzir Mini CRM/`CRMDetail` nem botao "Dossie de investigacao".
- Quando houver demanda, iniciar Sprints 13-16 (Modularizacao de Prompts).
