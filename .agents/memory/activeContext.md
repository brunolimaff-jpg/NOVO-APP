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
- Sprint atual: Sprint 11 Onda 0.5 — correções locais + remoção do Mini CRM local.

## Current task context

Branch/workspace atual: `refactor/code-quality` em `/Users/brunolima/Documents/NOVO-APP`.

Escopo da Onda 0.5:

- Corrigir divergência local/Vercel no runtime Vite adicionando proxies serverless faltantes, especialmente `/api/open-web-search`.
- Remover Mini CRM local do código: `CRMProvider`, `useCRM`, `CRMView`, `CRMDetail`, `CRMPipeline`, props/botões de CRM, tipos locais e testes dedicados.
- Remover Revenue Intelligence local acoplada ao Mini CRM.
- Preservar referências ao **CRM interno Senior** em prompts, evidências, fixtures e dossiês.
- Atualizar docs/memória para impedir reintrodução de `CRMDetail` como hotspot de refatoração.

## Workspace note

O workspace já possuía mudanças não commitadas antes desta Onda 0.5 em arquivos como `.gitignore`, `components/chat/MessageTimeline.tsx`, `package.json`, `services/geminiProxy.ts`, testes relacionados, `vite.config.ts` e scripts locais. Essas mudanças devem ser preservadas e não revertidas sem confirmação explícita.

## Immediate next step

1. Revisar diff final e abrir PR/merge da Onda 0.5.
2. Acompanhar separadamente o health remoto de `/api/gemini` se continuar retornando `ok:false` apesar de HTTP `200`.
3. Próxima onda: `LoadingSmart` ou `WarRoom`; não reintroduzir Mini CRM/`CRMDetail`.
