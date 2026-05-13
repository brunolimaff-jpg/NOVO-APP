# Active Context

Last updated: 2026-05-13

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current refactor phase

Fase 1 (Sprints 1-8) concluida em `main`. Fase 2 documental aberta.

## Current task context

**Onda 1 — Críticos de IA concluída (2026-05-13):**

- `api/docs-rag.ts`: score mínimo 0.35 → 0.60, extração web via `universalExtract` quando metadata vazio, sinal `[SEM DOCUMENTAÇÃO ENCONTRADA]`, tag `[FONTE VERIFICADA]` no texto extraído, stats de extração no response.
- `api/rag.ts`: score mínimo 0.35 → 0.55, sinal `[SEM DADOS DE PROPOSTAS ENCONTRADOS]`.
- `services/gemini/investigation-orchestration.ts`: `buildExtraContext` exportada, guard anti-alucinação quando docs-rag retorna vazio (`[AVISO DE SEGURANÇA]` + `⚠️ [DOCS RAG]`).
- Testes criados: `tests/api-docs-rag.test.ts` (6 casos), `tests/api-rag.test.ts` (4 casos), `tests/services/investigation-anti-hallucination.test.ts` (5 casos).
- Bateria completa: **851/851 testes passando**, zero regressões.

**Roadmap das próximas ondas:** `.agents/memory/roadmap.md`

## Immediate next step

1. Deploy da Onda 1 para Vercel e validação em produção.
2. Iniciar Onda 2.1 — extrair `services/gemini/shared.ts` com utilitários duplicados.
