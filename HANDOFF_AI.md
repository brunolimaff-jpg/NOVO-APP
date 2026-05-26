# Handoff Tecnico - Fonte Canonica

Use este arquivo como ponto de entrada rapido para qualquer nova IA trabalhando neste repositorio.

Nota: o vault Obsidian canonico foi centralizado em `/Users/brunolima/Documents/Bruno Vault`. Referencias antigas a `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/*` foram arquivadas em `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original`; use `docs/OBSIDIAN_VAULT.md` como ponteiro local.

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
13. `docs/OBSIDIAN_VAULT.md` para navegacao visual central (nao substitui as fontes canonicas acima)
14. `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/decisions/ACHADO-P0-TEIA-CNPJ-ESCOPO-2026-05-25.md` — achado atual: QSA oficial confirma sócio -> CNPJ, não CNPJ -> grupo
15. `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/daily/INDEX.md` — histórico diário append-only; não sobrescrever entradas antigas
16. `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/decisions/LICOES-APRENDIDAS-PROMPTS-2026-05-24.md` — 13 lições aprendidas na sessão de prompts 2026-05-24
17. `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/decisions/LICOES-APRENDIDAS-TEIA-CNPJ-2026-05-24.md` — lições do hotfix P0 da Teia CNPJ, incluindo PRs #279/#280/#285 e critérios de preview
18. `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/decisions/FECHAMENTO-TEIA-CNPJ-PR285-2026-05-25.md` — fechamento atual da PR #285, validações finais, lições e pendências de reestruturação
19. `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/decisions/HANDOFF-TEIA-CNPJ-2026-05-25.md` — status detalhado da PR #285; seções antigas preservam snapshots superados
20. `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/decisions/LICOES-APRENDIDAS-BUSCA-REVERSA-2026-05-25.md` — documentação dos ciclos de tentativa de busca reversa de CNPJs por nome de sócio

## Contexto minimo estavel

- Projeto: **Senior Scout 360**
- Stack: React 19 + TypeScript + Vite + Tailwind + Gemini + Pinecone + Supabase
- Auth: local-only via `contexts/OperatorContext.tsx`
- Runtime real para validacao manual: Vercel
- Integracao externa padrao de IA: nenhuma obrigatoria no repo
- **Persistencia:** Supabase (primario) + IndexedDB (offline cache) + sync queue bidirecional

### Quick-win #1 — Gemini Foundation Cache (waterfall)

- **Status:** implementado (PR `feat/gemini-foundation-cache`); **default off** ate validacao em preview.
- **Flags:** `GEMINI_FOUNDATION_CACHE_ENABLED=1` (Vercel) + `VITE_GEMINI_FOUNDATION_CACHE_ENABLED=1` (build).
- **Guia operacional:** `docs/guias/gemini-foundation-cache.md`
- **Ideia/decisao:** `docs/ideias/gemini-context-caching-waterfall.md` + `.agents/memory/decisions.md` (2026-05-26)
- **Validacao manual pendente:** 1 dossiê Scheffer com flags on; conferir `usageMetadata.cachedContentTokenCount` e grounding.

## Estado arquitetural atual

> Atualizado em 2026-05-26 09:05 — **Rastreador da Teia implementado e preview Vercel publicado.** Nao ha PR aberta no GitHub neste momento (`gh pr list --state open` retornou vazio). O diff atual esta local em `main` e convive com varias mudancas documentais preexistentes no working tree.

### Atualizacao 2026-05-26 — Rastreador e fluxo incremental da Teia

- Ativacao do trace: abrir preview com `?scoutTrace=teia`; desligar com `?scoutTrace=off`.
- Trace persiste em `localStorage` e nao depende de env var/redeploy para ligar/desligar.
- Logs novos aparecem como `[Scout360][Trace:teia]` e cobrem `SectionalBotMessage`, `SocietaryMap`, `SocietaryMatrix` e `/api/socio-search`.
- `/api/socio-search` aceita `trace: true` e retorna diagnostico ampliado apenas nesse modo.
- A matriz/grafo agora recebem resultados incrementalmente por socio, sem esperar a ultima chamada pendente.
- O card principal da matriz mostra `CNPJs encontrados`; `empresas do grupo` so aparece quando houver vinculo de grupo confirmado.
- Labels visuais foram encurtadas: `QSA`, `Lateral`, `CNPJ lateral`; filtros do grafo usam o mesmo pill visual da tabela.
- Preview publicado: `https://scoutagro-hxq9vmrpw-brunolimaff-3629s-projects.vercel.app/?scoutTrace=teia`.
- Validacoes: recortes `SocietaryMap`, `societaryGraph`, `api-socio-search`, `diagnosticLog`; `npm run typecheck`.
- Documentacao central: `/Users/brunolima/Documents/Bruno Vault/10-PROJETOS/NOVO-APP.md`.

> Atualizado em 2026-05-25 20:36 — **PR #285 e PR #286 foram mergeadas em `main`.** A Teia CNPJ saiu do bloqueio funcional, links inline auditaveis tambem foram fechados, e nao ha PR aberta no GitHub neste momento.

### Achado P0 atual — Teia CNPJ

- Fonte oficial (`QSA Oficial`, CNPJ Aberto, Receita/BrasilAPI) qualifica o vinculo do socio com o CNPJ.
- O CNPJ so vira `group_link` quando houver prova independente de vinculo com a raiz/grupo.
- CNPJ lateral deve aparecer como `CNPJs laterais`; a matriz nao exibe mais coluna/badge textual de relacao lateral.
- Proibido usar lateral como `Proprias`, `Side business`, veiculo operacional do grupo, bioinsumos, verticalizacao, enterprise ou wedge Senior.
- Fechamento atual: `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/decisions/FECHAMENTO-TEIA-CNPJ-PR285-2026-05-25.md`.
- Historico completo: `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/daily/INDEX.md`.
- Merges finais: #285 em `ed5c825`; #286 em `0eb2935`.
- Validacao local final: recorte Vitest da teia (`88`), `validate-prompts.sh` (`59`), `typecheck`, `lint` com 5 warnings preexistentes, `build`; Browser local confirmou ausencia de `Outros CNPJs`, `Alertas`, `Vinculo...`, `Relação` e badge lateral na matriz.
- Complemento pos-push: Vite proxy injeta `x-vercel-protection-bypass` quando `VERCEL_AUTOMATION_BYPASS_SECRET` existir no `.env.local`; API via proxy local retornou `15` empresas para `GUILHERME MOGNON SCHEFFER`, `degraded: false`, todas na amostra como `partner_other_cnpj`/`rootContext: false`. Browser local confirmou `18` CNPJs laterais na matriz apos alternar `Grafo -> Tabela`.

> As secoes abaixo sobre CNPJ Aberto/SocietaryMatrix preservam snapshots anteriores da PR #285. Em caso de divergencia, usar o fechamento de 17:05 como fonte atual.

### O que foi feito nesta sessao (2026-05-25)

#### Fase A: CNPJ Aberto API Integration

**Problema resolvido:** Nenhuma fonte de busca societaria funcionava consistentemente em todos os ambientes. consultasocio.com bloqueava na Vercel. Gemini Search alucinava CNPJs. DuckDuckGo retornava `empty_result`.

**Solucao:** Integracao com [CNPJ Aberto](https://cnpjaberto.com.br) — API gratuita (1000 queries/dia) com endpoint dedicado `GET /api/socio/empresas?nome={name}&limit=50`.

**Mudancas:**
- `utils/documentExtractor.ts` — nova funcao `searchCnpjAberto()` (linhas 324-381)
- `api/socio-search.ts` — CNPJ Aberto como primeira fonte no pipeline
- `tests/api-socio-search.test.ts` — `searchFailureCount: 2 → 3`
- Env var: `CNPJABERTO_API_KEY` configurada na Vercel preview

**Pipeline de busca atual (HEAD `2e1e986`):**
```
/api/socio-search (runSearch)
  |
  +-> searchCnpjAberto(socioName)              [Primaria: CNPJ Aberto API, funciona local + Vercel]
  |
  +-> searchConsultasocioDirect(socioName)      [Fallback 1: funciona local, BLOQUEIA Vercel]
  |
  +-> performGeminiSearch(query, apiKey)         [Fallback 2: Gemini URL-only + scrape direto]
  |
  +-> performDuckDuckGoSearch(query)             [Fallback 3: pode retornar empty_result na Vercel]
```

#### Fase B: SocietaryMatrix (Tabela Societaria)

**Novos arquivos:**
- `features/dossier/SocietaryMatrix.tsx` (376 linhas) — componente de tabela completo
- `features/dossier/societaryCategories.ts` (~60 linhas) — classificacao de empresas

**Modificado:**
- `features/dossier/SocietaryMap.tsx` — toggle Tabela | Grafo, CNAE enrichment via `lookupCnpj()` batch de 5
- `tests/features/dossier/SocietaryMap.test.tsx` — clique "Grafo" antes de testes Mermaid

**Funcionalidades da tabela:**
- Layout 5 colunas: Empresa | Grupo | CNPJ | CNAE | dots de socios
- Classificacao: Estrategico (3+ socios), Operacoes (2 socios), Proprias (1 socio)
- Filtro toolbar: Todos + pills de categoria + pills de socio (AND logic)
- Filtros condicionais: mostra apenas categorias com >0 empresas
- CNAE enrichment: batch background de 5 via `lookupCnpj()`, fire-and-forget (nao bloqueia UI)
- Dots de socio: preenchido = compartilhado, borda tracejada = side business, vazio = sem conexao
- Dark mode support
- Legenda com cores dos socios
- Empresas inativas ("Baixada") excluidas

#### Fase C: Email autocomplete e Mockup

- `components/GreetingWelcomeScreen.tsx` — carrega ultimo email usado do IndexedDB ao montar
- `mockups-mermaid.html` — validado design da tabela com usuario (16 empresas ativas, 5 socios Scheffer)

#### Decisoes arquiteturais desta sessao
1. **CNPJ Aberto como fonte primaria** — funciona em ambos ambientes (local e Vercel)
2. **Mermaid + Table complementares** — toggle entre visualizacoes
3. **CNAE enrichment frontend-only** — batch de 5, fire-and-forget
4. **View padrao: Table** — preferencia do usuario validada
5. **Empresas inativas excluidas** — "Baixada" filtradas da tabela
6. **Sem mudancas no backend** — todas as features sao frontend-only

#### Licoes Aprendidas nesta sessao

1. **API dedicada vence generic scraping para dados societarios brasileiros.** CNPJ Aberto (API com endpoint especifico para buscar por nome de socio) funciona onde 4 abordagens genericas falharam. A licao: antes de tentar scraping complexo ou LLM para dados estruturados, verificar se existe API especializada. O dado publico brasileiro tem APIs cada vez mais disponiveis.

2. **Pipeline com fallbacks ordenados e resiliente.** A arquitetura em cascata (CNPJ Aberto → consultasocio → Gemini → DDG) significa que se uma fonte falha, a proxima tenta. Nao precisamos de uma unica fonte perfeita — precisamos de fontes suficientes que, juntas, cubram todos os ambientes. CNPJ Aberto cobre Vercel, consultasocio cobre local, Gemini URL-only cobre casos de borda.

3. **LLM nao deve extrair dados estruturados de paginas web.** Ja sabiamos que LLM alucina CNPJs (Ciclo 6). A confirmação adicional: mesmo com temperature 0, instrucao explicita e `isValidCnpj()`, o Gemini inventou CNPJs com formato valido. A regra "LLM so descobre URLs, scraper extrai texto" e definitiva.

4. **Validacao visual com mockup HTML economiza iteracao.** O `mockups-mermaid.html` permitiu validar o design da tabela com o usuario antes de codificar o componente React completo. O usuario pode ver, clicar e opinar em minutos, nao horas. O custo de mudar um HTML estatico e muito menor que refatorar um componente.

5. **Fire-and-forget para dados nao criticos e padrao seguro.** CNAE enrichment poderia bloquear a UI ou ser feito no backend. A abordagem frontend batch (5 lookups, fire-and-forget) da o melhor equilibrio: tabela renderiza instantaneamente, CNAEs aparecem conforme chegam. O usuario ve progresso, nao um spinner infinito.

6. **Toggle entre visualizacoes e melhor que substituir.** Em vez de substituir o grafo Mermaid pela tabela (ou vice-versa), manter ambos com toggle permite ao usuario escolher a ferramenta certa para cada analise. Tabela para distribuicao quantitativa, grafo para relacoes de aresta. O custo de implementar o toggle foi baixo comparado ao valor de ter ambas.

7. **Sem backend changes = ship mais rapido.** Toda a SocietaryMatrix foi construida sem alterar uma unica rota de API. Os dados ja estavam disponiveis no response de `/api/socio-search` — so precisavam de um novo componente frontend para renderizar. Quando possivel,优先 solucoes frontend-only.

8. **Validacao de preview e o verdadeiro gate.** Testes locais verdes (128 arquivos, 1086 testes), typecheck e lint limpos nao substituem uma validacao no ambiente real (Vercel). O deploy pode ter problemas de env var, CORS, ou runtime que so aparecem na preview. O gate real e a preview, nao os checks locais.

#### Validacao local
- `npm run typecheck` — verde
- `npm run test` — verde (128 arquivos, 1086 testes)
- `npm run lint` — verde
- `npm run build` — verde (preview buildando na Vercel)

### Contexto historico: 7 ciclos de busca reversa (anterior)

Para referencia, foram executados 7 ciclos de tentativa entre os commits `b8b9058` e `6d49b28` antes do CNPJ Aberto. Detalhamento completo em `/Users/brunolima/Documents/Bruno Vault/_archive/source-vaults/2026-05-25/novo-app-docs-obsidian-original/decisions/LICOES-APRENDIDAS-BUSCA-REVERSA-2026-05-25.md`.

| Ciclo | O que foi tentado | Resultado | Commit |
|-------|-------------------|-----------|--------|
| 1 | DuckDuckGo GET -> POST | Funciona local, Vercel pode bloquear | b8b9058 |
| 2 | consultasocio.com scraping direto | PERFEITO local, BLOQUEIA Vercel | b8b9058, 3e0058e |
| 3 | Mermaid batch render | Flickering resolvido | e46f2d8 |
| 4 | sourceTitle default + confidence upgrade | Mermaid renderiza empresas Gemini | 42ca221 |
| 5 | isValidCnpj() no parser/grafo | Bloqueia CNPJ com digito invalido | e46f2d8 |
| 6 | Gemini Search Grounding v1 (LLM extrai CNPJ) | FALHA — alucina CNPJs falsos | f2d9500 |
| 7 | Gemini Search Grounding v2 (URL-only) | Zero alucinacao, nao validado na preview | 6d49b28 |

### Problemas Residuais
1. **Cache persistente da Teia** — `SUPABASE_SERVICE_ROLE_KEY` ainda precisa ser configurada na Preview geral/branch para cache server-side.
2. **Smoke de preview mais forte** — automatizar falha quando todos os socios voltarem `companies: 0` ou payload degradado sem inventario util.
3. **Reestruturacao da Teia** — consolidar tipos/contratos de API, parser, grafo, tabela e narrativa em um boundary de dominio.
4. **Ordenacao por coluna e painel de evidencia** — funcionalidades futuras para SocietaryMatrix.
5. **Bundle/chunk Mermaid** — warning conhecido no build, sem bloquear a #285/#286.

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

### PR #286 — Links inline auditaveis (2026-05-25)

- **Branch:** `codex/inline-links-auditaveis`
- **PR:** `#286`, commit `de32664`
- **Estado:** Aberta, mergeable, aguardando revisao/merge

**Problema:** Links e referencias se concentravam no bloco "Fontes" no final do texto, sem distribuicao inline durante os paragrafos. Isso reduzia a auditabilidade e credibilidade do conteudo gerado por IA.

**Mudancas (7 arquivos, +207/-54):**

| Arquivo | O que |
|---------|-------|
| `prompts/mega/foundation.ts` | `<citation_protocol>` reforcado com 5 regras de distribuicao inline obrigatoria |
| `prompts/mega/builders.ts` | Contrato de output exige URL inline no campo Evidencia dos cards |
| `prompts/mega/specialist-prompts.ts` | `<inline_citation_rule>` adicionado nos 8 especialistas |
| `utils/linkFixer.ts` | Nova funcao `deduplicateSourcesBlock()` preserva fontes complementares, removendo apenas URLs duplicadas ou falsas |
| `components/MarkdownRenderer.tsx` | Icone ↗ em links externos, estado `visited` (purple), tooltip com nome real da fonte, remocao de dead code |
| `components/SectionalBotMessage.tsx` | Fontes filtradas por secao com badge "N fontes", fallback seguro |
| `tests/components/MarkdownRenderer.test.tsx` | Atualizado para novos icones/classes |

**Validacao:** `npm run typecheck` ✅, 1044 testes passam ✅ (8 falhas pre-existentes, nao relacionadas).

## Proximo passo seguro

1. Configurar `SUPABASE_SERVICE_ROLE_KEY` na Vercel Preview para cache persistente de `/api/socio-search`.
2. Criar smoke de preview que falhe quando todos os socios voltarem `companies: 0` ou payload degradado sem inventario util.
3. Planejar a reestruturacao da Teia CNPJ como boundary de dominio unico.
4. Refinar heuristica lateral com dados reais de outras empresas alem de Scheffer.
5. Iteracoes futuras na SocietaryMatrix: ordenacao por coluna, clique na linha para expandir detalhes de evidencia.
6. Mergear branch `codex/standardize-mermaid-maps` em `main` quando voltar ao escopo Supabase.
7. Testar fluxo completo: registrar com `@senior.com.br` (nome+sobrenome obrigatorio) -> criar dossier -> verificar dados no dashboard Supabase -> testar sync manual -> testar email recovery.
8. **Problemas residuais (P2) de sessoes anteriores:**
   - Entidades internacionais sem link de auditoria — "Conexao INFERIDA" sem comprovacao documental
   - Mermaid no contrato e condicional ("quando houver dados"), deveria ser obrigatorio
9. Quando houver demanda, planejar Fase 3 (Sprints 13-16: Modularizacao de Prompts).
10. Pre-requisito para Sprints 13+: golden test baseline ja criado em `tests/prompts/megaPrompts.test.ts`.
12. Repriorizar itens deferred: `mcp-server/`, observability (Sprints 21-24).

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

- **Teia CNPJ pos-merge:** PR #285 e PR #286 foram mergeadas; risco atual e regressao futura sem smoke funcional forte.
- **Heuristica lateral sem validacao cross-company:** a regra foi validada em Scheffer, mas precisa de segundo grupo economico.
- **SocietaryMatrix sem ordenacao ou expand:** funcionalidades de UX postergadas para iteracoes futuras.
- Ainda nao ha extractor server-side seguro de URL/PDF para Docs RAG; nao implementar sem protecao SSRF.
- `VITE_PINECONE_*` removido do bundle frontend (PR #270) — agora usado exclusivamente em serverless functions.
- Warning de build por chunks grandes mitigado: framer-motion isolado em `vendor-anim`, 4 componentes lazy-loaded.
- `mcp-server/` permanece fora do escopo ate repriorizacao explicita.
- CORS em `api/comex.ts` agora usa whitelist; `api/link-status.ts` bloqueia SSRF.
- **Supabase anon key exposta no bundle:** risco aceito para app interno. RLS por `operator_id` mitiga.
- **Sync queue pode acumular:** se operador ficar offline prolongado, fila IDB pode crescer.
- **Email recovery experimental:** fluxo de vinculacao de dispositivo ainda nao testado em producao.
- **PR #285 com CNPJ Aberto estruturado:** bloqueio funcional superado em 2026-05-25 17:05; risco residual agora e reestruturacao/gate automatizado, nao o contrato atual da PR.
- **Entidades internacionais sem link de auditoria:** "conexao INFERIDA" sem comprovacao documental. (P2)
- **Mermaid no contrato condicional:** contrato diz "quando houver dados" para o grafo, deveria ser obrigatorio. (P2)

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
