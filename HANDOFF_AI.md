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
14. `docs/obsidian/decisions/LICOES-APRENDIDAS-PROMPTS-2026-05-24.md` — 13 lições aprendidas na sessão de prompts 2026-05-24

## Contexto minimo estavel

- Projeto: **Senior Scout 360**
- Stack: React 19 + TypeScript + Vite + Tailwind + Gemini + Pinecone + Supabase
- Auth: local-only via `contexts/OperatorContext.tsx`
- Runtime real para validacao manual: Vercel
- Integracao externa padrao de IA: nenhuma obrigatoria no repo
- **Persistencia:** Supabase (primario) + IndexedDB (offline cache) + sync queue bidirecional

## Estado arquitetural atual

> Atualizado em 2026-05-24 — **Sessao de consolidacao de prompts (PR #282, PR #283) e correcao de anti-alucinacao concluidas.** Branch principal `codex/prompt-consolidation-v6` (PR #282), branch anti-alucinacao `fix/war-room-rag-antialucinacao`, PR unificada #283.

### O que foi feito nesta sessao (2026-05-24)

#### Fase 1: Diagnostico e Analise (4 agentes em paralelo)
- **Debugger** encontrou bugs criticos: A2 feeds silenciosamente ignorados, decimal quebra parsing, output_contract conflitante com especialistas
- **RAG-Gemini** identificou que temperature NAO estava sendo passada (API default 1.0), recomendou 0.1, system instruction separada, JSON estruturado
- **UI-UX** mostrou 18 gatilhos repetidos, dossier ilegivel em 30s, abordagem comercial diluida
- **Explore** mapeou pipeline completo: waterfall repete foundation 7-9x (~109K tokens), golden dossier 452 linhas

#### Fase 2: Consolidacao de Prompts
- 5 blocos de traducao -> 1 (`SHARED_COMMERCIAL_INTELLIGENCE_ENGINE`)
- `MASTER_INVESTIGATION_ORCHESTRATOR_V5` removido -> causou REGRESSAO no mapa societario -> RESTAURADO
- Criado `PROMPT_CAMINHO_DE_VENDA` (novo modulo)
- Contrato de output V2: modulos sem gatilhos individuais
- Mermaid classDef removido dos especialistas

#### Fase 3: Regressao e Correcao
- CNPJs ficticios, Evermat usado como exemplo real nos prompts, "Safra 2024" em 2026
- Adicionado `<anti_fabrication_rules>`, `<refusal_protocol>`, `<evidence_scope_protocol>`, `<fact_vs_inference_examples>`
- Temperature 0.1 adicionada ao `proxyChatSendMessage`
- Queries de bioinsumos, mineracao, mercado de capitais

#### Fase 4: Bug do Mapeamento
- CAMINHO DE VENDA estava mapeado para `PROMPT_RH_SINDICATOS_GOD_MODE` (prompt de RH/SST!) no waterfall-orchestrator.ts
- Corrigido para `PROMPT_CAMINHO_DE_VENDA` — 1 linha resolveu Mermaid + formato correto
- MegaPrompts.ts perdia exports a cada branch switch

#### Fase 5: Automacao de testes E2E para validacao de preview
- Criado `tests-e2e/cnpj-investigation-flow.spec.ts` — teste Playwright E2E do fluxo completo CNPJ: preenche CNPJ Scheffer `04.733.767/0001-80`, valida via BrasilAPI, inicia investigacao, aguarda dossie Gemini, valida resposta > 50 chars, rejeita CNPJ invalido. Timeout global 180s, Gemini 120s.
- Criado `scripts/validate-preview.sh` — script curl para validacao rapida sem browser: health check GET /, CNPJ lookup GET /api/cnpj, valida JSON com companyName/city/state/cnae, print PASS/FAIL colorido com latencia.
- Modificado `package.json` — scripts `test:e2e:cnpj` e `validate:preview` adicionados.
- Modificado `playwright.config.ts` — aceita `BASE_URL` env var (aponta para preview Vercel), pula `webServer` quando URL externa, timeout global 180s.
- Abordagem dual: `validate:preview` (curl, segundos) para smoke rapido em CI/pre-merge; `test:e2e:cnpj` (Playwright, ~2-3 min) para validacao completa com interacao real.

### Problemas Residuais
1. **CNPJs dos socios no mapa societario** — resolvido na PR #285 (`codex/cnpj-socios-todos-cnpjs`) com `relationshipScope=partner_other_cnpj` para CNPJs laterais sem prova de grupo economico; `/api/socio-search` tem budget interno e `lookupCnpj` aceita timeout/maxSources nesse fluxo. Hotfix `b238f25` bloqueia raiz/filiais de mesmo radical como empresa relacionada, exige CNPJ valido para empresa vinda do Gemini e adiciona `scripts/validate-prompts.sh` como gate de prompt/parser/grafo. Preview Scheffer `04.733.767/0001-80` validado apos 5 min de Vercel sem `Matriz + 2 filiais` nem filiais `04.733.767/0023-96` / `04.733.767/0014-03` no mapa.
2. **Entidades internacionais sem link de auditoria** — "Conexoes internacionais exigem comprovacao documental... Se nao houver evidencia concreta, a conexao e INFERIDA" (P1)
3. **Mermaid no contrato ainda e condicional** ("quando houver dados"), deveria ser obrigatorio (P2)

## Programa de refatoracao

- Fase 1 (Sprints 1-8): concluida em `main` (PR `#241`).
- Fase 2 (Sprints 9-12): **concluida**.
  - Sprint 9: concluida via PR `#254`.
  - Onda 0+1: concluida via PR `#255`.
  - OI-066: concluido via PR `#256`.
  - Sprint 10: concluida via PR `#257`.
  - Sprint 11 Onda 0: concluida via PR `#258`.
  - Sprint 11 Onda 0.5: concluida via PR `#259`.
  - Sprint 11 Onda 1A: concluida.
  - Sprint 11 Onda 1B: concluida via PR `#260`.
  - Sprint 11 Onda 1C: concluida via PR `#261`.
  - Sprint 12: concluida via PR `#262` (OI-004), PR `#263` (OI-005), PR `#264` (LoadingSmart fix).

## Hotspots atuais da Fase 2

| Arquivo | Linhas/estado | Sprint alvo |
|---|---|---|
| `App.tsx` | 622 | Sprint 9 concluida |
| `features/radar/useRadar.ts` + `features/radar/service.ts` | runtime movido para boundary; facades antigas preservadas | Sprint 10 concluida |
| Mini CRM local / `components/CRMDetail.tsx` | removido por decisao de produto; nao refatorar nem reintroduzir | Sprint 11 Onda 0.5 |
| `components/LoadingSmart.tsx` | 672 apos Onda 1B; fachada preservada | Sprint 12 avalia se precisa nova fatia |
| `components/WarRoom.tsx` | 283 apos Onda 1C; props publicas preservadas | Sprint 11 concluida |
| `services/storage.ts` | 198 — interface unificada Supabase + IDB offline | — migracao concluida |
| `services/syncQueue.ts` | ~150 — fila offline com retry e dead-letter | — migracao concluida |
| `lib/supabaseClient.ts` | ~90 — cliente Supabase browser com degradacao graciosa | — migracao concluida |
| `components/SyncIndicator.tsx` | ~80 — badge de status de sync no header | — migracao concluida |

## Fase 2 (Manutenibilidade) — CONCLUIDA

- Commit final: `0694997` em `main`.
- Validacao manual em Vercel aceita pelo owner em `2026-05-20`.
- Gates finais: `test` (117 arq, 834 testes), `typecheck`, `build`, `lint --quiet`, `analyze:circular` — todos verdes.
- PRs da Sprint 12: `#262` (OI-004/003/057/062), `#263` (OI-005 lint), `#264` (LoadingSmart progress bar fix).
- Metricas de sucesso atingidas:
  - `App.tsx`: 772 -> 622 linhas (target < 400 nao atingido; funcional)
  - Componentes > 500 linhas: 3 -> 0 (LoadingSmart 672, WarRoom 283)
  - `any` em producao: reduzido significativamente
  - Radar boundary: 0% -> 100%
  - Boundary leak dossier->chat: 4 -> 0
  - Warnings operacionais: OI-003/004/005/057/062 todos fechados
  - Circulares: zero
  - Lint: `0` erros, `0` warnings

## UX Redesign Phase 1 — CONCLUIDA

- Branch: `ux/redesign-phase1-v1`
- PR: `#266`, commit `d84b643`
- Escopo:
  - AdminDash + useAdminMetrics removidos (268 linhas + hook + testes)
  - Breadcrumb no header: `Scout 360` -> `Scout 360 -> [sessao]`; clicar em "Scout 360" volta pra home
  - Sidebar: preview da ultima mensagem do bot, indicador ativo com `bg-emerald-500/15` + bolinha verde, botoes mobile sempre visiveis
  - MessageRow: indicadores visuais de status (verde CONFIRMADO, vermelho OFF-LINE, amarelo ANALISE INFERIDA, cinza AUDITORIA EM CURSO)
  - EmptyStateHome: cartao estilizado com icone para feedback de erro/sucesso CNPJ
  - `getLastMessagePreview` usa loop reverso em vez de `filter().pop()` (review do Gemini Code Assist)
- Gates: `test` (116 arq, 824 testes), `typecheck`, `lint` — todos verdes.
- Design System (Sprints 17-20) descartado por decisao do owner: app interno, custo/beneficio nao justifica.

## Auditoria de Codigo Multi-Fase (PR #270)

- **Branch:** `codex/contextual-continuity-suggestions`
- **Commit final:** `bdf80f4`
- **PR:** `#270`
- **Data:** 2026-05-22

### Planejamento
- Criado `docs/planos/auditoria-codigo-2026-05-21.md` (840 linhas) com 5 fases:
  - Fase 1: Auditoria paralela (debugger, react-next-ts, reviewer)
  - Fase 2: Correcao de Falhas Silenciosas
  - Fase 3: Correcao de Seguranca
  - Fase 4: Correcao de Performance
  - Fase 5: Verificacao Final

### Fase 1 — Auditoria (3 relatorios)
- `docs/planos/audit-silent-failures.md` — 128 catch blocks, 7 P0 + 14 P1
- `docs/planos/audit-seguranca.md` — 10 vulnerabilidades (2 P0, 4 P1, 3 P2)
- `docs/planos/audit-performance.md` — 64 regras Vercel, score 2.3/5

### Fase 2 — Falhas Silenciosas (10 arquivos)
Adicionado `scoutDiag.warn/error` em todos os catches que engoliam erros:
- `features/radar/useRadar.ts` — 5 operacoes IDB centralizadas em `persistToIDB`
- `utils/conversationHistory.ts` — parse JSON com log + cleanup localStorage
- `utils/linkValidation.ts` — verificacao de links com log
- `features/dossier/waterfall-orchestrator.ts` — fontes do dossier
- `services/competitorService.ts` — deteccao de concorrente
- `services/gemini/investigation-orchestration.ts` — catch "silencioso" removido
- `services/gemini/auxiliary.ts` — 3 catches com log
- `services/gemini/recovery.ts` — 2 catches com log
- `services/exportService.ts` — exportacao com log
- `hooks/useAppInitialization.ts` — `.catch(() => {})` com log

### Fase 3 — Seguranca (15 arquivos)
- **Criado `api/_security-headers.ts`** — funcao `setSecurityHeaders(res)` com guard `typeof res.setHeader !== 'function'` para compatibilidade com testes. Headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy. Aplicado em 11 API routes.
- **Criado `api/_cache-headers.ts`** — helper `cacheHeaders(maxAgeSeconds)` para Cache-Control
- `index.tsx` — removido `VITE_PINECONE_API_KEY` e `VITE_PINECONE_INDEX_HOST` do `OPTIONAL_ENV_VARS` (variaveis VITE_ sao inlineadas no bundle)
- `components/MarkdownRenderer.tsx`:
  - `securityLevel: 'loose'` -> `'strict'`
  - `allowRawHtml` default `true` -> `false`
  - Regex que converte `<a href>` HTML -> `[text](url)` markdown (links de pesquisa funcionam sem rehypeRaw)
  - Regex de citacoes `[url]` gera markdown links em vez de HTML
- `api/link-status.ts` — `isHttpUrl()` -> `isValidPublicUrl()` (bloqueia localhost, 127.0.0.1, 169.254.169.254, redes privadas)
- `api/extract-content.ts` — `.max(13_600_000)` no campo `base64Content` do schema Zod (~10MB)
- `api/comex.ts` — CORS com whitelist (nao mais `*`), seguindo padrao `api/cnpj.ts`

### Fase 4 — Performance (8 arquivos)
- **Criado `hooks/useDebounce.ts`** — hook generico `useDebounce<T>(value, delay)`
- `App.tsx` — 4 componentes com `React.lazy()`: LoadingSmart, EmailModal, FollowUpModal, UpdateNotificationModal
- `vite.config.ts` — `vendor-anim` chunk (framer-motion 124KB isolado)
- `components/MessageRow.tsx` — 2x `.filter().map()` -> `.flatMap()`
- `api/gemini.ts` — 2x `.filter().map()` -> `.flatMap()`
- `components/InvestigationDashboard.tsx` — `useDebounce(searchText, 300)` no input de busca
- `api/cnpj.ts` — Cache-Control 1h
- `api/comex.ts` — Cache-Control 24h

### Bug Fixes adicionais
- `services/clientLookupService.ts` — `formatarParaPrompt()`: quando `matchType !== 'exact'`, NAO inclui dados detalhados de CRM (modulos, gaps). Retorna apenas alerta instruindo o modelo a tratar como PROSPECT. Corrige confusao entre empresas similares (ex: "Pampa" vs "Pampafoods").
- `components/MarkdownRenderer.tsx` — hyperlinks em resultados de pesquisa que vinham como `<a href>` HTML bruto agora sao convertidos para `[text](url)` markdown e renderizam corretamente.

### Testes atualizados (10 arquivos)
- `tests/App.dossierGolden.test.tsx` — nomes de modulos atualizados, golden validation flexivel
- `tests/components/LoadingSmart.test.tsx` — labels atualizados para MODULAR_DOSSIER_STAGES
- `tests/utils/loadingSmartViewModel.test.ts` — labels + estagios consecutivos
- `tests/components/MarkdownRenderer.test.tsx` — +1 teste para conversao HTML->markdown
- `tests/services/clientLookupService.test.ts` — assercoes atualizadas para novo formato

## Proximo passo seguro

1. Finalizar PR da branch `codex/cnpj-socios-todos-cnpjs`.
2. Aguardar preview Vercel e validar com CNPJ Scheffer `04.733.767/0001-80`: QSA, drill-down por socio, CNPJs laterais como "Outro CNPJ do socio", Scheffer Colombia S.A.S. com fonte, fallback textual.
3. Configurar no Vercel `SUPABASE_SERVICE_ROLE_KEY` para `/api/socio-search`; manter `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para o app browser.
4. Mergear a branch `codex/standardize-mermaid-maps` em `main` — migracao Supabase concluida **com 8 commits adicionais** (cadastro restrito, email recovery, sync manual, remocao dossie).
5. Testar fluxo completo: registrar com `@senior.com.br` (nome+sobrenome obrigatorio) -> criar dossier -> verificar dados no dashboard Supabase -> testar sync manual -> testar email recovery em segundo dispositivo.
6. Mergear PR `#270` em `main` (auditoria multi-fase, se ainda aberta).
7. Validar UX no preview Vercel do PR `#266` e mergear em `main`.
8. **Problemas residuais da sessao de prompts:**
   - (Resolvido nesta branch) CNPJs dos socios aparecem como "Outro CNPJ do socio" quando nao ha prova de grupo economico
   - (P1) Entidades internacionais sem link de auditoria — "Conexao INFERIDA" sem comprovacao documental
   - (P2) Mermaid no contrato e condicional ("quando houver dados"), deveria ser obrigatorio
9. Quando houver demanda, planejar Fase 3 (Sprints 13-16: Modularizacao de Prompts).
10. Pre-requisito para Sprints 13+: golden test baseline ja criado em `tests/prompts/megaPrompts.test.ts`.
11. Repriorizar itens deferred: `mcp-server/`, observability (Sprints 21-24).

## Entrega anterior: Sprint 11 Onda 1C WarRoom

- PR: `#261`
- Merge commit: `9fe0821`
- Resultado:
  - `components/WarRoom.tsx` reduzido de `552` para `283` linhas;
  - blocos visuais extraidos para `components/war-room/*`;
  - `WarRoomModelMessage` e `WarRoomSources` extraidos apos review do Gemini;
  - `key={hint}` aplicado nas sugestoes;
  - `scripts/smoke-preview.mjs` simplificado para usar apenas `x-vercel-protection-bypass`;
  - props publicas e `services/warRoomService.ts` preservados.

Licao aprendida:

- O erro no check GitHub `Smoke (preview)` da PR `#261` foi causado por eu ter enviado o header opcional `x-vercel-set-bypass-cookie` junto do bypass em todas as requisicoes. Para smoke automatizado no GitHub Actions, manter somente `x-vercel-protection-bypass`; o cookie e para navegacao/sessao e nao e necessario quando cada `fetch` ja carrega o bypass.

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
  - CRM interno Senior preservado em prompts/evidencias/fixtures/dossies.

## Entrega anterior: Sprint 11 Onda 1A

- Resultado:
  - canonicos reconciliados para evitar duplicacao de planos vivos;
  - `CRMDetail` mantido apenas como historico/removido;
  - `LoadingSmart` e `WarRoom` mantidos como PRs separados;
  - `npm run docs:obsidian:check` green (`14` notas).

## Entrega anterior: Sprint 10 Radar boundary

- Branch: `codex/sprint-10-radar-boundary`
- PR: `#257`, merge commit `fbf5536`
- Resultado:
  - runtime do Radar movido para `features/radar/useRadar.ts` e `features/radar/service.ts`;
  - `hooks/useRadar.ts` e `services/radarService.ts` preservados作为 facades de compatibilidade;
  - `App.tsx` passou a importar `useRadar` pelo barrel `features/radar`;
  - `tests/architecture/radarBoundaryImportGuard.test.ts` bloqueia novos imports de producao pelos caminhos legados.

## Entrega anterior: OI-066

- Branch: `codex/fix-delete-icon-unicode`
- PR: `#256`, merge commit `66591f1`
- Resultado:
  - botao de excluir mensagem renderiza icone de lixeira, nao o escape cru `🗑️`;
  - `aria-label` preserva acessibilidade;
  - teste focado em `tests/components/MessageRow.test.tsx`.

## Entrega anterior: Onda 0+1

- Branch: `refactor/wave-0-1-cleanup`
- Base: `origin/main@922a403`
- PR: `#255`, merge commit `0550454`
- Plano: `docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`
- Escopo:
  - sincronizar docs/memoria pos-PR `#254`;
  - registrar handoff detalhado no repo e no `claude-mem`;
  - corrigir PORTA para nao transformar falha parcial em hold de integridade;
  - migrar logs cliente sensiveis para `scoutDiag`.
- Ajuste pos-validacao manual:
  - corrigido crash serverless de `/api/open-web-search` causado por imports ESM sem `.js`;
  - `/api/open-web-search` agora aceita `{ url }` sem `query`, alinhado ao function calling do Gemini;
  - smoke com Vercel Protection Bypass confirmou `POST /api/open-web-search` com `200`, `source: OpenWebSearch/Brave`, `degraded: false`, `5` fontes;
  - smoke `{ url: "https://example.com/" }` confirmou `200` e `source: OpenWebSearch/URL`;
  - smoke `{}` confirmou `400` esperado;
  - logs Vercel `500` dos 15 minutos posteriores ao fix nao retornaram ocorrencias.
- OI-066 foi extraido para hotfix curto em `codex/fix-delete-icon-unicode`.
- Fora de escopo:
  - Radar boundary;
  - `CRMDetail`, `LoadingSmart`, `WarRoom`;
  - sweep global de lint/`any`/`catch`;
  - PWA/chunking;
  - performance sem profiling;
  - delecao de branches antigas.

## Riscos residuais imediatos

- Ainda nao ha extractor server-side seguro de URL/PDF para Docs RAG; nao implementar sem protecao SSRF.
- `VITE_PINECONE_*` removido do bundle frontend (PR #270) — agora usado exclusivamente em serverless functions (`api/rag.ts`, `api/docs-rag.ts`).
- Warning de build por chunks grandes mitigado: framer-motion isolado em `vendor-anim`, 4 componentes lazy-loaded.
- `mcp-server/` permanece fora do escopo ate repriorizacao explicita.
- CORS em `api/comex.ts` agora usa whitelist (nao mais `*`); `api/link-status.ts` bloqueia SSRF (localhost, 169.254.169.254, redes privadas).
- MarkdownRenderer com `allowRawHtml=false` e `securityLevel='strict'` — links HTML de pesquisa sao convertidos para markdown, sem reabilitar rehypeRaw.
- **Supabase anon key exposta no bundle:** risco aceito para app interno (mesmo padrao do `VITE_PINECONE_*`). RLS por `operator_id` mitiga acesso indevido. Reavaliar se app virar externo.
- **Sync queue pode acumular:** se o operador ficar offline por periodo prolongado, a fila IDB pode crescer. Dead-letter queue trata falhas irrecoveraveis.
- **Migracao de dados IDB -> Supabase:** operadores existentes perdem dados locais se o storage IDB for limpo antes da sync. A sync queue mitiga isso, mas nao ha migracao retroativa de dados legados.
- **Email recovery experimental:** o fluxo de vinculacao de dispositivo por email ainda nao foi testado em producao. Pode haver conflitos se dois dispositivos tentarem sync simultaneamente com o mesmo `operator_id`.
- **Restricao `@senior.com.br`:** impede registro de usuarios externos, mas blocagens manuais (ex-vendedores, parceiros) exigiriam uma lista de allow/block.
- **CNPJs dos socios no mapa societario:** corrigido na branch `codex/cnpj-socios-todos-cnpjs`; CNPJs laterais aparecem com escopo explicito e sem aresta raiz -> empresa.
- **Entidades internacionais sem link de auditoria:** "conexao INFERIDA" sem comprovacao documental concreta. (P1) — descoberto nesta sessao.
- **Mermaid no contrato condicional:** o contrato de output diz "quando houver dados" para o grafo Mermaid, mas deveria ser obrigatorio para todo dossier. (P2) — descoberto nesta sessao.

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
