# Active Context

Last updated: 2026-05-22

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

## Current refactor phase

**Auditoria de Código Multi-Fase CONCLUÍDA (PR #270).**

- Fase 1: Sprints 1-8 concluída.
- Fase 2: Manutenibilidade (Sprints 9-12) concluída em `2026-05-20`.
- Fase 3: Auditoria de Falhas Silenciosas, Segurança e Performance concluída em `2026-05-22` na branch `codex/contextual-continuity-suggestions`.
- Commit final da auditoria: `bdf80f4`.
- 33+ arquivos alterados entre Fases 2, 3 e 4 da auditoria.

## Current task context

**Auditoria de Código Multi-Fase concluída em `codex/contextual-continuity-suggestions` (2026-05-22).**
- PR `#270` aberta, commit final `bdf80f4`, 33+ arquivos alterados.
- Plano em `docs/planos/auditoria-codigo-2026-05-21.md` (840 linhas).
- **Fase 2 (Falhas Silenciosas):** 10 arquivos com `scoutDiag.warn/error` adicionado em catches que engoliam erros. Destaque: `useRadar.ts` (5 operações IDB), `investigation-orchestration.ts` (catch silencioso removido), `hooks/useAppInitialization.ts` (`.catch(() => {})` com log).
- **Fase 3 (Segurança):** 15 arquivos. Criado `api/_security-headers.ts` e `api/_cache-headers.ts` como helpers serverless reutilizáveis. Security headers aplicados em 11 API routes. MarkdownRenderer com `allowRawHtml=false`, `securityLevel='strict'`, HTML links convertidos para markdown. `index.tsx` sem Pinecone env vars no frontend. `api/link-status.ts` com proteção SSRF. `api/extract-content.ts` com `.max(13_600_000)` no schema Zod. CORS whitelist em `api/comex.ts`.
- **Fase 4 (Performance):** 8 arquivos. Criado `hooks/useDebounce.ts` genérico. 4 componentes lazy-loaded em `App.tsx`. `vendor-anim` chunk (framer-motion 124KB) em `vite.config.ts`. Cache-Control 1h em `api/cnpj.ts`, 24h em `api/comex.ts`. `.filter().map()` substituído por `.flatMap()` em 3 locais.
- **Bug fixes:** `clientLookupService.ts` — match parcial não inclui dados CRM (evita alucinação de empresas similares). `MarkdownRenderer.tsx` — links HTML convertidos corretamente para markdown.
- **Testes:** 10 arquivos de teste atualizados para refletir as mudanças.
- **Gates:** pendente confirmação de checks remotos na PR `#270`.

**UX Redesign Phase 1 em progresso (PR `#266`).**
- Branch: `ux/redesign-phase1-v1`, commit `d84b643`.
- AdminDash removido, breadcrumb, sidebar melhorada, indicadores de status no MessageRow, feedback CNPJ estilizado.
- Aguardando validação do owner no preview Vercel antes do merge.

**Inline follow-up do chat principal refatorado em `main` (2026-05-21).**
- Follow-ups apos a primeira pesquisa agora entram em modo cirurgico via `GeminiRequestOptions.isFollowUp`.

## Workspace note

`CODE.md` é instrução local para Codex e está ignorado via `.git/info/exclude`.

## Immediate next step

1. Mergear PR `#270` em `main` (auditoria multi-fase concluída).
2. Validar UX no preview Vercel do PR `#266` e mergear em `main`.
3. Quando houver demanda, planejar Fase 3 (Sprints 13-16: Modularização de Prompts).
4. Repriorizar itens deferred: `mcp-server/`, observability (Sprints 21-24).
