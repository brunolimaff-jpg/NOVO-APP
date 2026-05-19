# Active Context

Last updated: 2026-05-19

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

Fase 2 (manutenibilidade) está em andamento.

- Fase 1 (Sprints 1-8) concluída em `main`.
- Sprint 9 concluída e mergeada via PR `#254`.
- Sprint 10 mergeada via PR `#257` em `2026-05-16`.
- Sprint 11 Onda 0 de testes foi mergeada via PR `#258`.
- Sprint atual: Sprint 11 Onda 1B — refatoração incremental de `LoadingSmart`.

## Current task context

Branch/workspace atual: `codex/sprint-11-onda-0-5-mini-crm-local-fixes` em `/Users/brunolima/Documents/NOVO-APP`.

Estado pós-PR `#259`:

- Corrigir divergência local/Vercel no runtime Vite adicionando proxies serverless faltantes, especialmente `/api/open-web-search`.
- Remover Mini CRM local do código: `CRMProvider`, `useCRM`, `CRMView`, `CRMDetail`, `CRMPipeline`, props/botões de CRM, tipos locais e testes dedicados.
- Remover Revenue Intelligence local acoplada ao Mini CRM.
- Preservar referências ao **CRM interno Senior** em prompts, evidências, fixtures e dossiês.
- Atualizar docs/memória para impedir reintrodução de `CRMDetail` como hotspot de refatoração.

Onda 1A documental:

- Reconciliar `02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `sprints/00-INDEX.md`, `SPRINT-11-EXECUTION.md`, `HANDOFF_AI.md`, memória local e roadmap Obsidian.
- Marcar planos antigos/stale como históricos ou superseded quando ainda tratam Sprint 8/10/CRMDetail como trabalho ativo.
- Preparar a sequência limpa: Onda 1B `LoadingSmart`, Onda 1C `WarRoom`, Sprint 12 hardening.

Onda 1B atual:

- `utils/loadingSmartViewModel.ts` criado para isolar timeline/progresso de `components/LoadingSmart.tsx`.
- `tests/utils/loadingSmartViewModel.test.ts` criado para cobrir regras que antes ficavam dentro do JSX.
- `components/LoadingSmart.tsx` permanece como fachada/default export; `App.tsx` não mudou.
- Próximo corte seguro: extrair hook de curiosidades/timers ou fechar PR se a fatia precisar ficar pequena.

## Workspace note

O workspace atual tem `CODE.md` não rastreado. Preservar sem alteração salvo pedido explícito.

## Immediate next step

1. Completar Onda 1B com hook de curiosidades/timers ou fechar esta fatia como PR curto.
2. Antes de fechar, rodar gate ampliado conforme risco (`test`, `typecheck`, `build`, `lint` se necessário).
3. Depois seguir para Onda 1C `WarRoom`, em PR separado.
