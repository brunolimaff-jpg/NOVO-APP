# Active Context

Last updated: 2026-05-23 — Plano de Melhorias no Dossiê (RAG + Contexto)

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

**Sessao de Brainstorming — Teia Societaria Interativa**

Componente visual de estrutura societaria (ownership structure) para o dossie de CNPJ. Evoluimos de Mermaid estatico para SVG interativo com drill-down.

### Fonte de dados
- **BrasilAPI** `/api/cnpj/v1/{cnpj}` → `qsa[]` com nome e qualificacao
- **consultasocio.com** `/q/sa/{nome}` → busca reversa de empresas por socio
- Sem API paga disponivel para percentual de participacao → classificacao por faixa (controlador/minoritario) via qualificacao + numero de socios

### Tecnologia
- **Mockup:** SVG customizado com bezier curves + JS vanilla (arquivos HTML em `.superpowers/brainstorm/93190-1779565087/content/`)
- **Implementacao real (futuro):** React component + dagre (6KB, mesma lib do Mermaid) + framer-motion

### Design final — 14 iteracoes ate polished.html
- Tema claro (#f8fafc), fonte system-ui
- Layout: CNPJ raiz (azul) → 6 socios (roxo) → empresas expandem inline na linha do socio
- Bezier curves em vez de linhas retas
- Linhas verdes pontilhadas (#22c55e) com animacao pulse conectando socios que compartilham empresas
- Badges verdes com contagem de socios compartilhados
- Drill-down multiplo: pode expandir varios socios ao mesmo tempo
- Animacao spring nos cards (cubic-bezier 0.34,1.56,0.64,1)
- Socios nao conectados ficam opacos (14%) com grayscale
- viewBox 1200x680 com bastante respiro

### Estado
- Mockup completo em `polished.html` com todos os 6 socios Scheffer funcionando
- Dados mockados (nao chamadas reais de API)
- Implementacao NAO iniciada — apenas mockups HTML

### Artefatos
- `.superpowers/brainstorm/93190-1779565087/content/polished.html` — versao final multi-expansao
- `.superpowers/brainstorm/93190-1779565087/content/index.html` — catalogo de 14 iteracoes
- `.superpowers/brainstorm/93190-1779565087/content/tres-cenarios-v2.html` — versao "boa" com 4 cenarios em abas
- `.superpowers/brainstorm/93190-1779565087/content/conexoes-cruzadas.html` — versao alternativa com accordion
- `docs/obsidian/decisions/TEIA-SOCIETARIA-ENRIQUECIMENTO.md` — documento de decisao

### Bugs corrigidos nos mockups
- Linhas verdes pontilhadas invisiveis: conflito `style="opacity:0"` CSS inline vs `setAttribute('opacity','1')` no JS. Fix: remover style inline, usar atributo SVG + `.pulse` CSS animation.
- Badges de compartilhamento invisiveis: mesmo problema de opacidade.
- Layout muito compacto: viewBox 1000x540 → 1200x680, cards maiores, mais distancia.
- Expansao centralizada → inline por socio: empresas expandem na linha do socio clicado.

### Pendentes para implementacao
- `lib/cnpjLookup.ts` — precisa expor QSA
- `api/cnpj.ts` — Vercel endpoint precisa propagar QSA
- `services/brasilApiService.ts` — frontend wrapper precisa expor QSA

## Workspace note

`CODE.md` e instrucao local para Codex e esta ignorado via `.git/info/exclude`.

## Sessao de Diagnostico — Melhorias no Dossie (RAG + Contexto)

**Branch atual:** `feat/migration-notice-supabase`

### Diagnostico

O fluxo de geracao de dossie (waterfall de 5 modulos) tem uma **lacuna de contexto**: RAG Pinecone, Docs RAG, concorrentes regionais e PORTA state chegam ao `sendMessageToGemini` mas NAO aos modulos individuais do waterfall (`generateDossierModule`).

### Causa raiz

`generateDossierModule` nao chama `buscarContextoPinecone` nem `buscarContextoDocsPinecone`. O waterfall passa apenas: `dossierSeedContext` + `waterfallLookupContext` + `seniorEvidenceContext` + `accumulatedTextSnapshot`.

### Plano completo

Documentado em `docs/obsidian/decisions/MELHORIAS-DOSSIE-RAG.md`.

**Sprint 1 (8-10h):** Quick wins — RAG + concorrentes + PORTA no waterfall, temperatura por modulo, marcador de falha, `linhas_produto` no CRM.
**Sprint 2 (8-12h):** Estruturais — RAG per-modulo, foundation reduzido, cache RAG, benchmark contextualizado, web fallback inteligente.

### Artefatos

- `docs/obsidian/decisions/MELHORIAS-DOSSIE-RAG.md` — documento de decisao com plano completo

## Immediate next step

**Iniciar Sprint 1 do plano de melhorias do dossie** pelo item C2 (`linhas_produto` no CRM context) — independente e baixissimo risco.

Em paralelo: iniciar Fase 1 da Teia Societaria (`features/dossier/SocietaryTree.tsx`, hook `hooks/useSocietaryTree.ts`, modificar `lib/cnpjLookup.ts` para expor QSA).
