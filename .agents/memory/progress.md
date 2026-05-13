# Progress

Last updated: 2026-05-13

## Completed

- Sprints 1-8 concluída e mergeadas em `main`.
- Sprint 8 mergeada via PR `#241` em `origin/main`.
- `services/war-room/*` ativo com fachada pública preservada.
- `features/radar/*` criado como boundary oficial inicial.
- Kickoff documental da Fase 2 concluído.
- PR `#243` (`fix/cnpj-proxy-fallback`) validada localmente.
- Skills operacionais locais removidas e migradas para `~/.agents/skills/`.

### Ondas 1+2+3 — concluídas (2026-05-13)

**Onda 1 — Críticos de IA:**
- Loop RAG fechado com extração web (`universalExtract`), sinal de contexto vazio, score elevado (0.60/0.55), guard anti-alucinação.
- `extractWithTimeout` com `Promise.race` real.
- Testes: `api-docs-rag.test.ts` (6), `api-rag.test.ts` (4), `anti-hallucination.test.ts` (5).

**Onda 2 — Refatoração:**
- `services/gemini/shared.ts` e `rag-shared.ts` criados. ~100 linhas de duplicação removidas.
- Modelo centralizado em `config/models.ts` (6 arquivos).
- Zero `any` nos handlers de API (`GenerateContentResponse`, `Chat`, `RadarAlert[]`, `CategoryStats[]`).

**Onda 3 — Bundle:**
- `prompts/megaPrompts.ts` → barrel assíncrono (`loadFoundationBlocks`, `loadSpecialistPrompts`, `loadBuilders`).
- 4 consumidores migrados para `await import()`.
- `RevenueIntelligence` → `React.lazy()` em `CRMDetail.tsx`.
- `megaPrompts.test.ts` → 15/15 com async loaders.
- `npm run build`: `foundation-*.js` (48.92 KB gzip 19.24) + `specialist-prompts-*.js` (66.89 KB gzip 23.29) em chunks separados. ~116 KB removidos do bundle inicial.

## Validation history

### Ondas 1+2+3 (2026-05-13)

- `npx vitest run`: **113 arquivos, 849/851 passando**.
  - 2 falhas pré-existentes (não causadas pelas ondas): `waterfall-orchestrator.test.ts` (race condition do renderHook no último caso) e `App.loadingVariant.test.tsx` (timing flaky).
- `npm run build`: green — chunks extraídos corretamente.
- `.env` configurado com Gemini + Pinecone keys.
- `dev.sh` criado como launcher (`vercel dev --listen 3000`).

## Blockers

- Nenhum bloqueio técnico. 2 testes flaky pré-existentes fora do escopo.

## Important refs

- `.agents/memory/roadmap.md` — Ondas 1, 2, 3 concluídas + backlog
- `HANDOFF_AI.md` — handoff canônico

### Code review fixes (2026-05-13)

- **shared.ts**: Encapsulado em objeto `geminiShared` (MINOR #1)
- **megaPrompts.ts**: Adicionado `invalidatePromptCaches()` (MINOR #2)
- **docs-rag.ts**: `EXTRACTION_TIMEOUT_MS` agora lê de `process.env.RAG_EXTRACTION_TIMEOUT_MS` (MINOR #3)
- **DeepDiveTopics.tsx**: Estado `loadError` + fallback UI quando prompts falham ao carregar (MINOR #4)
- MAJOR #1: `.env` confirmado em `.gitignore` — verificar no `git status` antes do push
- MAJOR #2: `process.env` direto já era usado por `api/gerar-dossie.ts` original — falso positivo, Vercel suporta nativamente
