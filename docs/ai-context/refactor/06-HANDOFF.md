# Handoff Curto

## Current Phase

Onda 0+1 da Fase 2 em execução na branch `refactor/wave-0-1-cleanup`.

Sprint 9 está concluída e mergeada em `main` via PR `#254`:

- head da branch: `19485dc`
- merge commit: `922a403`
- data do merge: `2026-05-16`

## What Was Finished

- Fase 1 (Sprints 1-8) concluída em `main`.
- PR `#253` Docs RAG anti-alucinação mergeada em `df1ca1e`.
- Sprint 9 mergeada via PR `#254`:
  - `App.tsx` reduzido para `622` linhas.
  - hooks de Email/FollowUp extraídos.
  - `services/exportService.ts` criado.
  - leak `features/dossier` -> `features/chat` removido.
  - `madge`/`ts-prune` adicionados.
  - `utils/featureFlags.ts` criado.
  - OI-055 Pinecone via `VITE_*` aceito pelo owner para app interno/fechado.

## Active Work

Onda 0+1 combina:

1. Sincronizar docs/memória pós-PR `#254`.
2. Registrar o plano de continuação em `10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`.
3. Corrigir o bug provável de PORTA para não tratar falha parcial como hold de integridade.
4. Migrar logs cliente sensíveis para `scoutDiag` com payload truncado.

## Next Safe Step

Finalizar Onda 0+1 com gates focados e completos. Depois disso, voltar ao fluxo canônico:

1. Abrir Sprint 10 com Radar boundary completion.
2. Manter `hooks/useRadar.ts` e `services/radarService.ts` congelados durante a Sprint 10.
3. Só iniciar Sprint 11 após Radar estabilizado.

## Do Not Touch Yet

- Sprint 10 Radar boundary ainda não entra nesta Onda 0+1.
- Não refatorar `CRMDetail`, `LoadingSmart` ou `WarRoom` agora.
- Não fazer sweep global de `any`, `catch {}` ou `console.*`.
- Não mexer em PWA/chunking ou `framer-motion`.
- Não deletar branches antigas sem aprovação explícita.

## Suggested Prompt For Next AI

Leia `HANDOFF_AI.md`, `.agents/memory/activeContext.md`,
`.agents/memory/progress.md`, `docs/ai-context/refactor/02-BOARD.md` e
`docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`.
Considere a PR `#254` mergeada em `main` no commit `922a403`.
Continue a Onda 0+1 se ela ainda não estiver validada; se já estiver mergeada,
inicie Sprint 10 com foco exclusivo em Radar boundary completion.
