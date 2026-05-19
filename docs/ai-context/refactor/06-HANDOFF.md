# Handoff Curto

## Current Phase

Sprint 11 da Fase 2 em execução. A Onda 1B está ativa em `LoadingSmart`, depois do saneamento documental da Onda 1A.

Baseline local observado:

- Sprint 10 concluída via PR `#257` (`fbf5536`)
- Sprint 11 Onda 0 concluída via PR `#258` (`423f821`)
- Sprint 11 Onda 0.5 concluída via PR `#259` na branch `codex/sprint-11-onda-0-5-mini-crm-local-fixes`
- Sprint 11 Onda 1A documental concluída na branch de trabalho

## What Was Finished

- Mini CRM local removido do runtime/contratos/tipos/testes dedicados.
- Proxy local Vite centralizado em `config/localDevApiProxy.ts`, incluindo `/api/open-web-search`.
- `WarRoom` já tem teste de caracterização criado na Onda 0.
- `LoadingSmart` teve timeline/progresso extraídos para `utils/loadingSmartViewModel.ts`, com teste dedicado.
- Referências ao CRM interno Senior continuam válidas em prompts, evidências, fixtures e dossiês.

## Active Work

Onda 1B combina:

1. Manter `components/LoadingSmart.tsx` como fachada/default export.
2. Reduzir o componente em fatias pequenas e testadas.
3. Preservar comportamento coberto por `tests/components/LoadingSmart.test.tsx`.
4. Manter `WarRoom` fora deste PR.

## Next Safe Step

Completar a Onda 1B com extração do hook de curiosidades/timers, ou fechar a fatia atual como PR curto se o objetivo for review menor. Depois:

1. Onda 1C: `WarRoom`, mantendo props públicas e `services/warRoomService.ts` estável.
2. Sprint 12: hardening final de OI-003, OI-004, OI-005 e OI-062.

## Do Not Touch Yet

- Não reintroduzir `CRMDetail`, `CRMProvider`, `useCRM`, `CRMView` ou `CRMPipeline`.
- Não misturar `LoadingSmart` e `WarRoom` no mesmo PR.
- Não alterar `services/geminiService.ts`, `services/warRoomService.ts`, `components/ChatInterface.tsx`, `constants.ts`, `prompts/megaPrompts.ts` ou `types.ts` sem escopo explícito.
- Não incluir `mcp-server/` antes do fechamento da Sprint 12.
- Não mexer em `CODE.md` não rastreado salvo pedido explícito.

## Suggested Prompt For Next AI

Leia `HANDOFF_AI.md`, `.agents/memory/activeContext.md`, `.agents/memory/progress.md`, `docs/ai-context/refactor/02-BOARD.md`, `docs/ai-context/refactor/03-OPEN-ITEMS.md` e `docs/ai-context/refactor/sprints/SPRINT-11-EXECUTION.md`.

Considere a Onda 1A documental como a tarefa ativa. Depois dela, seguir para `LoadingSmart` e `WarRoom` em PRs separados, sem reintroduzir Mini CRM local.
