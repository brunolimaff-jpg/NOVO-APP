# Handoff Curto

## Current Phase

Sprint 10 da Fase 2 em execução na branch `codex/sprint-10-radar-boundary`.

Baseline atual de `main`:

- Sprint 9 concluída via PR `#254` (`922a403`)
- Onda 0+1 concluída via PR `#255` (`0550454`)
- OI-066 concluído via PR `#256` (`66591f1`)

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
- Onda 0+1 mergeada via PR `#255`:
  - docs/memória pós-Sprint 9 sincronizados.
  - PORTA partial integrity hold corrigido.
  - logs cliente sensíveis migrados para `scoutDiag`.
  - `/api/open-web-search` corrigido no runtime Vercel.
- OI-066 mergeado via PR `#256`:
  - botão de excluir mensagem renderiza icone de lixeira em vez de escape Unicode cru.

## Active Work

Sprint 10 combina:

1. Mover `hooks/useRadar.ts` para `features/radar/useRadar.ts`.
2. Mover `services/radarService.ts` para `features/radar/service.ts`.
3. Manter os dois caminhos antigos como facades de compatibilidade.
4. Fazer novos imports de produção usarem `features/radar`.
5. Adicionar guardrail arquitetural para bloquear novos imports diretos dos caminhos legados.

## Next Safe Step

Abrir PR da Sprint 10 e validar preview.

Validação manual mínima no preview:

1. Configurar Radar.
2. Forçar varredura.
3. Abrir painel/configurações.
4. Marcar alerta como lido.
5. Confirmar que Chat/Home continuam recebendo contexto do Radar.

## Do Not Touch Yet

- Não mover componentes `Radar*` nesta PR.
- Não deletar facades `hooks/useRadar.ts` e `services/radarService.ts` nesta PR.
- Não refatorar `CRMDetail`, `LoadingSmart` ou `WarRoom` agora.
- Não fazer sweep global de `any`, `catch {}` ou `console.*`.
- Não mexer em PWA/chunking ou `framer-motion`.
- Não deletar branches antigas sem aprovação explícita.

## Suggested Prompt For Next AI

Leia `HANDOFF_AI.md`, `.agents/memory/activeContext.md`,
`.agents/memory/progress.md`, `docs/ai-context/refactor/02-BOARD.md` e
`docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`.
Considere a PR `#254` mergeada em `main` no commit `922a403`.
Considere a PR `#255` mergeada em `main` no commit `0550454`.
Considere a PR `#256` mergeada em `main` no commit `66591f1`.
Continue a Sprint 10 com foco exclusivo em Radar boundary runtime.
