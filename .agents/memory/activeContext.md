# Active Context

Last updated: 2026-05-24 — Profundidade da Teia Societaria corrigida

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/ai-context/refactor/02-BOARD.md`
7. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current operating phase

**Migracao de persistencia IDB/localStorage para Supabase CONCLUIDA na branch `codex/standardize-mermaid-maps`. Branch estendeu com melhorias adicionais de UX, consistencia e feedback conectado ao Supabase.**

- Arquitetura offline-first: Supabase (fonte de verdade) + IndexedDB (cache offline) + sync queue bidirecional.
- 20 commits totais na branch antes do feedback Supabase (12 migracao + 8 pos-migracao).
- HEAD antes do feedback Supabase: `d22fa0c` — feat: beautiful manual sync button + sync-complete event to reload dossiers.
- 873+ testes verdes, typecheck limpo.
- Lint com `0` erros.

## Current task context

**Profundidade da Teia Societaria — concluido (2026-05-24)**

Correcao completa para a teia deixar de pesquisar de forma rasa.

### Entregue

- `/api/socio-search.ts`: deep search controlado com todas as queries, Brave com mais resultados, abertura limitada de paginas publicas seguras, extracao de CNPJs, enriquecimento via `lookupCnpj` e diagnosticos opcionais (`queriesRun`, `pagesFetched`, `cacheSource`, `rejectedCount`).
- `features/dossier/waterfall-orchestrator.ts`: pacote de contexto para modulo 1a/1b com `[CONTEXTO RAG]`, `[DOCS RAG]`, `[CONCORRENTES]`, `[PORTA STATE]` e `[QSA OFICIAL]` quando houver CNPJ.
- Waterfall: derivacao deterministica de complexidade roda 1b como `MEDIA` quando o marcador falta ou vem baixo apesar de evidencia objetiva (3+ socios, 4+ CNPJs, holding ou internacional confirmado).
- UI/grafo: o mapa agora usa dados do texto completo do dossie, torna `geminiCnpjs` fonte visual efetiva, conecta empresas Gemini-only ao socio quando ha `partnerName`, liga empresas sem socio a raiz e inicia em visao "Todos".

### Validacao

- Recorte afetado Vitest: `42` testes verdes.
- `npm run typecheck` verde.
- `npm run test:dossier` verde.
- `npm run test` verde: `124` arquivos, `912` testes.

### Risco residual

- A busca continua limitada a profundidade 2: empresa raiz -> socios -> empresas ligadas aos socios.
- Qualidade real depende de `BRAVE_SEARCH_API_KEY`, paginas publicas acessiveis e disponibilidade do enriquecimento de CNPJ.
- Recomendado smoke em preview com uma empresa real antes de considerar o comportamento validado em producao.

**Historico anterior — Diagnostico e Correcao da Teia Societaria (2026-05-23)**

Sessao com 4 agentes paralelos para investigar e corrigir problemas na Teia Societaria e profundidade do dossie.

### Diagnostico (agentes)

**debugger** — `/api/socio-search` retornava `degraded: true`. Causa raiz: `performWebSearch()` usava DuckDuckGo Lite que falha em serverless Vercel. `BRAVE_SEARCH_API_KEY` nunca era usada.

**reviewer** — 7 vulnerabilidades nos prompts `teia-identity.ts` e `teia-deep.ts`: falta de restricao territorial, validacao documental CNPJ e bloqueio de siglas estrangeiras (S.A.S., B.V., GmbH, Inc./LLC, Ltd., S.L.).

**planner** — Plano de ~24h com 3 quick wins: P3.6 (teiaTextParser), P3.1 (geminiCnpjs), P3.7 (cache socios).

**rag-gemini** — Bug no `gemini-3-flash-preview`: groundingMetadata ausente desde abril/2026. 7 recomendacoes de melhoria de prompt (R1-R7). Sugeriu fallback para `gemini-2.5-flash`.

### Correcoes aplicadas (5 arquivos)

1. **`api/socio-search.ts`** — Cache volatil fallback quando Supabase ausente
2. **`utils/documentExtractor.ts`** — Brave Search como primario, DuckDuckGo como fallback. `performWebSearch()` refatorado em 3 funcoes
3. **`features/dossier/waterfall-orchestrator.ts`** — `validateTeiaCnpjsOutput()` expandido para detectar entidades internacionais sem CNPJ
4. **`features/dossier/SocietaryMap.tsx`** — Drill-down automatico para TODOS os socios ao carregar
5. **`config/localDevApiProxy.ts`** — Adicionado `/api/socio-search` ao proxy

### Documentacao

- `docs/obsidian/decisions/LICOES-APRENDIDAS.md` — 7 licoes documentadas (0 a 6)
- Deploy: `https://scoutagro-bar5evneo-brunolimaff-3629s-projects.vercel.app`

### Estado

**Funcionando:** Brave Search API + cache volatil, validador internacional de entidades, mapa carrega todos os socios automaticamente. Em 2026-05-24, P3.6 (`teiaTextParser`) e P3.1 (`geminiCnpjs` visual efetivo) foram entregues junto com deep search controlado.
**Pendente prompt:** R1-R7 do rag-gemini, temperatura modulo 1b para 0.1.
**Pendente modelo:** Avaliar `gemini-2.5-flash` como fallback.

## Sessao anterior — Plano de Melhorias no Dossie (RAG + Contexto)

### Diagnostico

O fluxo de geracao de dossie (waterfall de 5 modulos) tem uma **lacuna de contexto**: RAG Pinecone, Docs RAG, concorrentes regionais e PORTA state chegam ao `sendMessageToGemini` mas NAO aos modulos individuais do waterfall (`generateDossierModule`).

### Causa raiz

`generateDossierModule` nao chama `buscarContextoPinecone` nem `buscarContextoDocsPinecone`. O waterfall passa apenas: `dossierSeedContext` + `waterfallLookupContext` + `seniorEvidenceContext` + `accumulatedTextSnapshot`.

### Plano completo

Documentado em `docs/obsidian/decisions/MELHORIAS-DOSSIE-RAG.md`.

**Sprint 1 (8-10h):** Quick wins — RAG + concorrentes + PORTA no waterfall, temperatura por modulo, marcador de falha, `linhas_produto` no CRM.
**Sprint 2 (8-12h):** Estruturais — RAG per-modulo, foundation reduzido, cache RAG, benchmark contextualizado, web fallback inteligente.

## Sessao anterior — Teia Societaria Interativa (Brainstorming + Mockup)

Componente visual de estrutura societaria. Mockup concluido em `polished.html` com 14 iteracoes. Implementacao nao iniciada.

### Artefatos
- `.superpowers/brainstorm/93190-1779565087/content/polished.html` — versao final multi-expansao
- `docs/obsidian/decisions/TEIA-SOCIETARIA-ENRIQUECIMENTO.md` — documento de decisao

### Pendentes para implementacao
- `lib/cnpjLookup.ts` — precisa expor QSA
- `api/cnpj.ts` — Vercel endpoint precisa propagar QSA
- `services/brasilApiService.ts` — frontend wrapper precisa expor QSA

## Immediate next step

1. Rodar smoke em preview com uma empresa real e confirmar: socios -> empresas ligadas, CNPJs enriquecidos e mapa em "Todos".
2. **Mergear PR `#278` em `main`** (version 1.0.0 + aviso migracao + bug fix).
3. **Aplicar melhorias de prompt R1-R7** do rag-gemini.
4. **Avaliar fallback de modelo:** `gemini-2.5-flash` vs `gemini-3-flash-preview`.
5. Mergear PR `#270` (auditoria multi-fase) e PR `#266` (UX Redesign Phase 1).
6. Configurar env vars Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
7. Testar fluxo completo: registrar com `@senior.com.br` -> criar dossie -> sync manual -> email recovery.
