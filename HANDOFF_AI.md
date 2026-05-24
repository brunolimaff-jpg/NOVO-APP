# Handoff Tecnico - Fonte Canonica

Use este arquivo como ponto de entrada rapido para qualquer nova IA trabalhando neste repositorio.

## Ordem de leitura

1. `AGENTS.md`
2. `.agents/memory/activeContext.md`
3. `.agents/memory/progress.md`
4. `.agents/memory/decisions.md`
5. `docs/SKILLS-GOVERNANCE.md`
6. `docs/ai-context/refactor/00-README.md`
7. `docs/ai-context/refactor/01-MASTER-PLAN.md`
8. `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
9. `docs/ai-context/refactor/02-BOARD.md`
10. `docs/ai-context/refactor/sprints/SPRINT-11-EXECUTION.md`
11. `docs/ai-context/refactor/03-OPEN-ITEMS.md`
12. `docs/ai-context/refactor/06-HANDOFF.md`
13. `docs/obsidian/00-MASTER.md` para navegacao visual (nao substitui as fontes canonicas acima)

## Contexto minimo estavel

- Projeto: **Senior Scout 360**
- Stack: React 19 + TypeScript + Vite + Tailwind + Gemini + Pinecone + Supabase
- Auth: local-only via `contexts/OperatorContext.tsx`
- Runtime real para validacao manual: Vercel
- Integracao externa padrao de IA: nenhuma obrigatoria no repo
- **Persistencia:** Supabase (primario) + IndexedDB (offline cache) + sync queue bidirecional

## Estado arquitetural atual

> Atualizado em 2026-05-22 — **Migracao de persistencia IDB/localStorage para Supabase concluida na branch `codex/standardize-mermaid-maps`.** Projeto agora usa arquitetura offline-first: Supabase como fonte de verdade, IDB como cache offline, sync queue para reconciliacao bidirecional. **Branch com 8 commits adicionais apos a migracao:** cadastro restrito (`@senior.com.br` + nome completo), email recovery (vincular dispositivo a operador existente), botao de sync manual no header, e remocao do botao "Dossie de investigacao" de 14 arquivos.

> Atualizado em 2026-05-23 — **Teia Societaria Tipo 5 implementada na branch `codex/teia-societaria-tipo5`.** O dossie agora pode trocar o mapa societario estatico por Mermaid LR dinamico com QSA real, drill-down server-side por socio, evidencias visiveis e fallback textual. Em producao, `/api/socio-search` exige `SUPABASE_SERVICE_ROLE_KEY` para cache persistente de 7 dias; sem cache persistente, degrada sem scraping.

- `services/geminiService.ts` segue como fachada publica com internals em `services/gemini/*`.
- `services/warRoomService.ts` segue como fachada publica com internals em `services/war-room/*`.
- `services/exportService.ts` criado na Sprint 9 com export/email logic extraida de App.tsx.
- `features/chat/*` e `features/dossier/*` concentram os fluxos extraidos de `App.tsx`.
- Follow-up inline do chat principal usa `GeminiRequestOptions.isFollowUp`, historico compacto em pares alternados `user/model` e instrucao de resposta cirurgica para nao repetir a estrutura do dossie inicial em perguntas especificas.
- Deep Dive permanece feature-flagado/desligado por padrão (`VITE_ENABLE_DEEP_DIVE`); a refatoracao do follow-up normal nao reativa nem redesenha esse fluxo legado.
- Leak `features/dossier/*` -> `features/chat/*` removido na Sprint 9; helpers compartilhados vivem em `utils/*`.
- Dependência circular `chatStore` -> `message-orchestrator` resolvida: `LastAction` movido para `types.ts`.
- `features/radar/*` e o boundary oficial do Radar runtime; `useRadar` e o service foram movidos para a feature na Sprint 10.
- `hooks/useRadar.ts` e `services/radarService.ts` existem apenas como facades de compatibilidade.
- `tests/architecture/radarBoundaryImportGuard.test.ts` bloqueia novos imports de producao para os caminhos legados.
- `types.ts` permanece centralizado (inclui `LastAction`); tipos do Mini CRM local foram removidos.
- `hooks/useChat.ts` foi removido e protegido por `tests/architecture/useChatImportGuard.test.ts`.
- `VITE_PINECONE_*` no frontend é risco aceito pelo owner para app interno/fechado; reavaliar se o app virar externo.
- Mini CRM local foi removido por decisão de produto; preservar apenas referências ao CRM interno Senior usadas como evidência em dossiês/prompts.
- Docs RAG anti-alucinacao mergeado via PR `#253` (`df1ca1e`).
- **Supabase** integrado como camada de persistencia: `lib/supabaseClient.ts` + `services/storage.ts` (interface unificada) + `services/syncQueue.ts` (fila offline) + `components/SyncIndicator.tsx` (badge de status). 8 tabelas com RLS por `operator_id`, 8 indexes, grants anon. Conexao direta browser → Supabase via anon key; sem camada serverless intermediaria. Offline-first: IDB cache + sync fila com retry. 873 testes verdes, typecheck limpo.
- **Teia Societaria Tipo 5:** `features/dossier/SocietaryMap.tsx` injeta Mermaid LR nas secoes de Teia/Poder Societario; `features/dossier/societaryGraph.ts` e a fonte unica para UI/export Mermaid; `/api/socio-search` faz drill-down por socio com cache persistente, bloqueio de homonimo e metadados de evidencia; `lib/cnpjLookup.ts`/`services/brasilApiService.ts` propagam QSA.

### Melhorias pos-migracao (8 commits adicionais na branch)

- **Cadastro restrito** (commit `5a2b35e`): apenas emails `@senior.com.br` sao aceitos no registro. Nome completo obrigatorio (pelo menos 2 palavras com 2+ caracteres cada).
- **Email recovery** (commit `c880566`): quando usuario tenta registrar com email `@senior.com.br` ja existente, oferece vincular o dispositivo ao `operator_id` existente. Permite recuperar dados em dispositivo novo sem perder historico.
- **Sync manual** (commit `d22fa0c`): botao pill no header com feedback visual (+N enviados, Baixados N). Dispara `scout:sync-complete` para hooks recarregarem dados automaticamente. Clique no badge SyncIndicator mudou de "limpar notificacao" para "forcar sync" (commit `f74c9d0`).
- **Dossie de investigacao removido** (commit `d5f7538`): botao removido de 14 arquivos (ChatShell, Composer, Settings, ChatPanels, App, types, testes). Feature nao utilizada.
- **Consistencia Supabase** (commits `b58586d`, `a8775d9`): `radar_alerts` com unique constraint, `scheduleSync` apos enqueue, fix `updated_at`, `onConflict` para addFavorite, `view_count` removido (broken).

## Programa de refatoracao

- Fase 1 (Sprints 1-8): concluída em `main` (PR `#241`).
- Fase 2 (Sprints 9-12): **concluída**.
  - Sprint 9: concluída via PR `#254`.
  - Onda 0+1: concluída via PR `#255`.
  - OI-066: concluído via PR `#256`.
  - Sprint 10: concluída via PR `#257`.
  - Sprint 11 Onda 0: concluída via PR `#258`.
  - Sprint 11 Onda 0.5: concluída via PR `#259`.
  - Sprint 11 Onda 1A: concluída.
  - Sprint 11 Onda 1B: concluída via PR `#260`.
  - Sprint 11 Onda 1C: concluída via PR `#261`.
  - Sprint 12: concluída via PR `#262` (OI-004), PR `#263` (OI-005), PR `#264` (LoadingSmart fix).

## Hotspots atuais da Fase 2

| Arquivo | Linhas/estado | Sprint alvo |
|---|---|---|
| `App.tsx` | 622 | Sprint 9 concluída |
| `features/radar/useRadar.ts` + `features/radar/service.ts` | runtime movido para boundary; facades antigas preservadas | Sprint 10 concluída |
| Mini CRM local / `components/CRMDetail.tsx` | removido por decisão de produto; não refatorar nem reintroduzir | Sprint 11 Onda 0.5 |
| `components/LoadingSmart.tsx` | 672 após Onda 1B; fachada preservada | Sprint 12 avalia se precisa nova fatia |
| `components/WarRoom.tsx` | 283 após Onda 1C; props públicas preservadas | Sprint 11 concluída |
| `services/storage.ts` | 198 — interface unificada Supabase + IDB offline | — migracao concluida |
| `services/syncQueue.ts` | ~150 — fila offline com retry e dead-letter | — migracao concluida |
| `lib/supabaseClient.ts` | ~90 — cliente Supabase browser com degradacao graciosa | — migracao concluida |
| `components/SyncIndicator.tsx` | ~80 — badge de status de sync no header | — migracao concluida |

## Fase 2 (Manutenibilidade) — CONCLUÍDA

- Commit final: `0694997` em `main`.
- Validação manual em Vercel aceita pelo owner em `2026-05-20`.
- Gates finais: `test` (117 arq, 834 testes), `typecheck`, `build`, `lint --quiet`, `analyze:circular` — todos verdes.
- PRs da Sprint 12: `#262` (OI-004/003/057/062), `#263` (OI-005 lint), `#264` (LoadingSmart progress bar fix).
- Métricas de sucesso atingidas:
  - `App.tsx`: 772 → 622 linhas (target < 400 não atingido; funcional)
  - Componentes > 500 linhas: 3 → 0 (LoadingSmart 672, WarRoom 283)
  - `any` em produção: reduzido significativamente
  - Radar boundary: 0% → 100%
  - Boundary leak dossier→chat: 4 → 0
  - Warnings operacionais: OI-003/004/005/057/062 todos fechados
  - Circulares: zero
  - Lint: `0` erros, `0` warnings

## UX Redesign Phase 1 — CONCLUÍDA

- Branch: `ux/redesign-phase1-v1`
- PR: `#266`, commit `d84b643`
- Escopo:
  - AdminDash + useAdminMetrics removidos (268 linhas + hook + testes)
  - Breadcrumb no header: `Scout 360` → `Scout 360 → [sessão]`; clicar em "Scout 360" volta pra home
  - Sidebar: preview da última mensagem do bot, indicador ativo com `bg-emerald-500/15` + bolinha verde, botões mobile sempre visíveis
  - MessageRow: indicadores visuais de status (✓ verde CONFIRMADO, ✕ vermelho OFF-LINE, ○ amarelo ANÁLISE INFERIDA, ◌ cinza AUDITORIA EM CURSO)
  - EmptyStateHome: cartão estilizado com ícone para feedback de erro/sucesso CNPJ
  - `getLastMessagePreview` usa loop reverso em vez de `filter().pop()` (review do Gemini Code Assist)
- Gates: `test` (116 arq, 824 testes), `typecheck`, `lint` — todos verdes.
- Design System (Sprints 17-20) descartado por decisão do owner: app interno, custo/benefício não justifica.

## Auditoria de Código Multi-Fase (PR #270)

- **Branch:** `codex/contextual-continuity-suggestions`
- **Commit final:** `bdf80f4`
- **PR:** `#270`
- **Data:** 2026-05-22

### Planejamento
- Criado `docs/planos/auditoria-codigo-2026-05-21.md` (840 linhas) com 5 fases:
  - Fase 1: Auditoria paralela (debugger, react-next-ts, reviewer)
  - Fase 2: Correção de Falhas Silenciosas
  - Fase 3: Correção de Segurança
  - Fase 4: Correção de Performance
  - Fase 5: Verificação Final

### Fase 1 — Auditoria (3 relatórios)
- `docs/planos/audit-silent-failures.md` — 128 catch blocks, 7 P0 + 14 P1
- `docs/planos/audit-seguranca.md` — 10 vulnerabilidades (2 P0, 4 P1, 3 P2)
- `docs/planos/audit-performance.md` — 64 regras Vercel, score 2.3/5

### Fase 2 — Falhas Silenciosas (10 arquivos)
Adicionado `scoutDiag.warn/error` em todos os catches que engoliam erros:
- `features/radar/useRadar.ts` — 5 operações IDB centralizadas em `persistToIDB`
- `utils/conversationHistory.ts` — parse JSON com log + cleanup localStorage
- `utils/linkValidation.ts` — verificação de links com log
- `features/dossier/waterfall-orchestrator.ts` — fontes do dossiê
- `services/competitorService.ts` — detecção de concorrente
- `services/gemini/investigation-orchestration.ts` — catch "silencioso" removido
- `services/gemini/auxiliary.ts` — 3 catches com log
- `services/gemini/recovery.ts` — 2 catches com log
- `services/exportService.ts` — exportação com log
- `hooks/useAppInitialization.ts` — `.catch(() => {})` com log

### Fase 3 — Segurança (15 arquivos)
- **Criado `api/_security-headers.ts`** — função `setSecurityHeaders(res)` com guard `typeof res.setHeader !== 'function'` para compatibilidade com testes. Headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy. Aplicado em 11 API routes.
- **Criado `api/_cache-headers.ts`** — helper `cacheHeaders(maxAgeSeconds)` para Cache-Control
- `index.tsx` — removido `VITE_PINECONE_API_KEY` e `VITE_PINECONE_INDEX_HOST` do `OPTIONAL_ENV_VARS` (variáveis VITE_ são inlineadas no bundle)
- `components/MarkdownRenderer.tsx`:
  - `securityLevel: 'loose'` → `'strict'`
  - `allowRawHtml` default `true` → `false`
  - Regex que converte `<a href>` HTML → `[text](url)` markdown (links de pesquisa funcionam sem rehypeRaw)
  - Regex de citações `[🟢 url]` gera markdown links em vez de HTML
- `api/link-status.ts` — `isHttpUrl()` → `isValidPublicUrl()` (bloqueia localhost, 127.0.0.1, 169.254.169.254, redes privadas)
- `api/extract-content.ts` — `.max(13_600_000)` no campo `base64Content` do schema Zod (~10MB)
- `api/comex.ts` — CORS com whitelist (não mais `*`), seguindo padrão `api/cnpj.ts`

### Fase 4 — Performance (8 arquivos)
- **Criado `hooks/useDebounce.ts`** — hook genérico `useDebounce<T>(value, delay)`
- `App.tsx` — 4 componentes com `React.lazy()`: LoadingSmart, EmailModal, FollowUpModal, UpdateNotificationModal
- `vite.config.ts` — `vendor-anim` chunk (framer-motion 124KB isolado)
- `components/MessageRow.tsx` — 2x `.filter().map()` → `.flatMap()`
- `api/gemini.ts` — 2x `.filter().map()` → `.flatMap()`
- `components/InvestigationDashboard.tsx` — `useDebounce(searchText, 300)` no input de busca
- `api/cnpj.ts` — Cache-Control 1h
- `api/comex.ts` — Cache-Control 24h

### Bug Fixes adicionais
- `services/clientLookupService.ts` — `formatarParaPrompt()`: quando `matchType !== 'exact'`, NÃO inclui dados detalhados de CRM (módulos, gaps). Retorna apenas alerta instruindo o modelo a tratar como PROSPECT. Corrige confusão entre empresas similares (ex: "Pampa" vs "Pampafoods").
- `components/MarkdownRenderer.tsx` — hyperlinks em resultados de pesquisa que vinham como `<a href>` HTML bruto agora são convertidos para `[text](url)` markdown e renderizam corretamente.

### Testes atualizados (10 arquivos)
- `tests/App.dossierGolden.test.tsx` — nomes de módulos atualizados, golden validation flexível
- `tests/components/LoadingSmart.test.tsx` — labels atualizados para MODULAR_DOSSIER_STAGES
- `tests/utils/loadingSmartViewModel.test.ts` — labels + estágios consecutivos
- `tests/components/MarkdownRenderer.test.tsx` — +1 teste para conversão HTML→markdown
- `tests/services/clientLookupService.test.ts` — asserções atualizadas para novo formato

## Próximo passo seguro

1. Abrir/validar PR da branch `codex/teia-societaria-tipo5`.
2. Configurar no Vercel `SUPABASE_SERVICE_ROLE_KEY` para `/api/socio-search`; manter `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para o app browser.
3. Validar preview com CNPJ Scheffer `04.733.767/0001-80`: QSA, drill-down por socio, Scheffer Colombia S.A.S. com fonte, fallback textual.
4. Mergear a branch `codex/standardize-mermaid-maps` em `main` — migracao Supabase concluida **com 8 commits adicionais** (cadastro restrito, email recovery, sync manual, remocao dossie).
5. Testar fluxo completo: registrar com `@senior.com.br` (nome+sobrenome obrigatorio) -> criar dossie -> verificar dados no dashboard Supabase -> testar sync manual -> testar email recovery em segundo dispositivo.
6. Mergear PR `#270` em `main` (auditoria multi-fase, se ainda aberta).
7. Validar UX no preview Vercel do PR `#266` e mergear em `main`.
8. Quando houver demanda, planejar Fase 3 (Sprints 13-16: Modularizacao de Prompts).
9. Pre-requisito para Sprints 13+: golden test baseline ja criado em `tests/prompts/megaPrompts.test.ts`.
10. Repriorizar itens deferred: `mcp-server/`, observability (Sprints 21-24).

## Entrega anterior: Sprint 11 Onda 1C WarRoom

- PR: `#261`
- Merge commit: `9fe0821`
- Resultado:
  - `components/WarRoom.tsx` reduzido de `552` para `283` linhas;
  - blocos visuais extraídos para `components/war-room/*`;
  - `WarRoomModelMessage` e `WarRoomSources` extraídos após review do Gemini;
  - `key={hint}` aplicado nas sugestões;
  - `scripts/smoke-preview.mjs` simplificado para usar apenas `x-vercel-protection-bypass`;
  - props públicas e `services/warRoomService.ts` preservados.

Lição aprendida:

- O erro no check GitHub `Smoke (preview)` da PR `#261` foi causado por eu ter enviado o header opcional `x-vercel-set-bypass-cookie` junto do bypass em todas as requisições. Para smoke automatizado no GitHub Actions, manter somente `x-vercel-protection-bypass`; o cookie é para navegação/sessão e não é necessário quando cada `fetch` já carrega o bypass.

## Entrega anterior: Sprint 11 Onda 1B LoadingSmart

- PR: `#260`
- Resultado:
  - `utils/loadingSmartViewModel.ts` criado para timeline/progresso;
  - `tests/utils/loadingSmartViewModel.test.ts` criado;
  - `components/LoadingSmart.tsx` reduzido de `766` para `672` linhas mantendo fachada/default export;
  - Bruno validou e liberou seguir para `WarRoom`.

## Entrega anterior: Sprint 11 Onda 0.5

- Branch: `codex/sprint-11-onda-0-5-mini-crm-local-fixes`
- PR: `#259`
- Resultado:
  - proxy local Vite centralizado em `config/localDevApiProxy.ts`, incluindo `/api/open-web-search`;
  - Mini CRM local removido (`CRMProvider`, `CRMView`, `CRMDetail`, `CRMPipeline`, contratos e testes dedicados);
  - Revenue Intelligence local acoplada ao Mini CRM removida;
  - CRM interno Senior preservado em prompts/evidências/fixtures/dossiês.

## Entrega anterior: Sprint 11 Onda 1A

- Resultado:
  - canônicos reconciliados para evitar duplicação de planos vivos;
  - `CRMDetail` mantido apenas como histórico/removido;
  - `LoadingSmart` e `WarRoom` mantidos como PRs separados;
  - `npm run docs:obsidian:check` green (`14` notas).

## Entrega anterior: Sprint 10 Radar boundary

- Branch: `codex/sprint-10-radar-boundary`
- PR: `#257`, merge commit `fbf5536`
- Resultado:
  - runtime do Radar movido para `features/radar/useRadar.ts` e `features/radar/service.ts`;
  - `hooks/useRadar.ts` e `services/radarService.ts` preservados como facades de compatibilidade;
  - `App.tsx` passou a importar `useRadar` pelo barrel `features/radar`;
  - `tests/architecture/radarBoundaryImportGuard.test.ts` bloqueia novos imports de produção pelos caminhos legados.

## Entrega anterior: OI-066

- Branch: `codex/fix-delete-icon-unicode`
- PR: `#256`, merge commit `66591f1`
- Resultado:
  - botão de excluir mensagem renderiza icone de lixeira, nao o escape cru `\uD83D\uDDD1\uFE0F`;
  - `aria-label` preserva acessibilidade;
  - teste focado em `tests/components/MessageRow.test.tsx`.

## Entrega anterior: Onda 0+1

- Branch: `refactor/wave-0-1-cleanup`
- Base: `origin/main@922a403`
- PR: `#255`, merge commit `0550454`
- Plano: `docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`
- Escopo:
  - sincronizar docs/memória pós-PR `#254`;
  - registrar handoff detalhado no repo e no `claude-mem`;
  - corrigir PORTA para não transformar falha parcial em hold de integridade;
  - migrar logs cliente sensíveis para `scoutDiag`.
- Ajuste pós-validação manual:
  - corrigido crash serverless de `/api/open-web-search` causado por imports ESM sem `.js`;
  - `/api/open-web-search` agora aceita `{ url }` sem `query`, alinhado ao function calling do Gemini;
  - smoke com Vercel Protection Bypass confirmou `POST /api/open-web-search` com `200`, `source: OpenWebSearch/Brave`, `degraded: false`, `5` fontes;
  - smoke `{ url: "https://example.com/" }` confirmou `200` e `source: OpenWebSearch/URL`;
  - smoke `{}` confirmou `400` esperado;
  - logs Vercel `500` dos 15 minutos posteriores ao fix não retornaram ocorrências.
- OI-066 foi extraído para hotfix curto em `codex/fix-delete-icon-unicode`.
- Fora de escopo:
  - Radar boundary;
  - `CRMDetail`, `LoadingSmart`, `WarRoom`;
  - sweep global de lint/`any`/`catch`;
  - PWA/chunking;
  - performance sem profiling;
  - deleção de branches antigas.

## Riscos residuais imediatos

- Ainda nao ha extractor server-side seguro de URL/PDF para Docs RAG; nao implementar sem protecao SSRF.
- `VITE_PINECONE_*` removido do bundle frontend (PR #270) — agora usado exclusivamente em serverless functions (`api/rag.ts`, `api/docs-rag.ts`).
- Warning de build por chunks grandes mitigado: framer-motion isolado em `vendor-anim`, 4 componentes lazy-loaded.
- `mcp-server/` permanece fora do escopo ate repriorizacao explicita.
- CORS em `api/comex.ts` agora usa whitelist (nao mais `*`); `api/link-status.ts` bloqueia SSRF (localhost, 169.254.169.254, redes privadas).
- MarkdownRenderer com `allowRawHtml=false` e `securityLevel='strict'` — links HTML de pesquisa são convertidos para markdown, sem reabilitar rehypeRaw.
- **Supabase anon key exposta no bundle:** risco aceito para app interno (mesmo padrao do `VITE_PINECONE_*`). RLS por `operator_id` mitiga acesso indevido. Reavaliar se app virar externo.
- **Sync queue pode acumular:** se o operador ficar offline por periodo prolongado, a fila IDB pode crescer. Dead-letter queue trata falhas irrecoveraveis.
- **Migracao de dados IDB -> Supabase:** operadores existentes perdem dados locais se o storage IDB for limpo antes da sync. A sync queue mitiga isso, mas nao ha migracao retroativa de dados legados.
- **Email recovery experimental:** o fluxo de vinculacao de dispositivo por email ainda nao foi testado em producao. Pode haver conflitos se dois dispositivos tentarem sync simultaneamente com o mesmo `operator_id`.
- **Restricao `@senior.com.br`:** impede registro de usuarios externos, mas blocagens manuais (ex-vendedores, parceiros) exigiriam uma lista de allow/block.

## Regras de continuidade

- Preservar APIs publicas congeladas:
  - `services/geminiService.ts`
  - `services/warRoomService.ts`
  - `components/ChatInterface.tsx`
  - `constants.ts`
  - `prompts/megaPrompts.ts`
  - `types.ts`
- Nao incluir `mcp-server/` no escopo sem repriorizacao explicita.
- Em qualquer sprint, bloquear promocao com gate vermelho (`test`, `typecheck`, `build`, `lint`).
