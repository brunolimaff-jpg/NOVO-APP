# Handoff Curto

## Current Phase

Sprint 11 da Fase 2 em execução. A Onda 1C está ativa em `WarRoom`, depois da PR `#260` de `LoadingSmart`.

Baseline local observado:

- Sprint 10 concluída via PR `#257` (`fbf5536`)
- Sprint 11 Onda 0 concluída via PR `#258` (`423f821`)
- Sprint 11 Onda 0.5 concluída via PR `#259` na branch `codex/sprint-11-onda-0-5-mini-crm-local-fixes`
- Sprint 11 Onda 1A documental concluída na branch de trabalho
- Sprint 11 Onda 1B `LoadingSmart` concluída e mergeada via PR `#260`

## What Was Finished

- Mini CRM local removido do runtime/contratos/tipos/testes dedicados.
- Proxy local Vite centralizado em `config/localDevApiProxy.ts`, incluindo `/api/open-web-search`.
- `WarRoom` já tem teste de caracterização criado na Onda 0.
- `LoadingSmart` teve timeline/progresso extraídos para `utils/loadingSmartViewModel.ts`, com teste dedicado.
- `WarRoom` teve UI estática extraída para `components/war-room/*`, reduzindo `components/WarRoom.tsx` para `279` linhas.
- Referências ao CRM interno Senior continuam válidas em prompts, evidências, fixtures e dossiês.

## Active Work

Onda 1C combina:

1. Manter props públicas de `WarRoom`: `isOpen`, `onClose`, `isDarkMode`, `defaultCompetitorTarget`.
2. Manter `services/warRoomService.ts` estável.
3. Reduzir o componente em fatias pequenas e testadas.
4. Manter `LoadingSmart` fora deste PR.

## Next Safe Step

Fechar a primeira fatia da Onda 1C como PR curto ou continuar com extração de hook local de sessão em `WarRoom`. Depois:

1. Sprint 12: hardening final de OI-003, OI-004, OI-005 e OI-062.

## Do Not Touch Yet

- Não reintroduzir `CRMDetail`, `CRMProvider`, `useCRM`, `CRMView` ou `CRMPipeline`.
- Não misturar novas mudanças de `LoadingSmart` neste PR de `WarRoom`.
- Não alterar `services/geminiService.ts`, `services/warRoomService.ts`, `components/ChatInterface.tsx`, `constants.ts`, `prompts/megaPrompts.ts` ou `types.ts` sem escopo explícito.
- Não incluir `mcp-server/` antes do fechamento da Sprint 12.
- Não mexer em `CODE.md` não rastreado salvo pedido explícito.

## Suggested Prompt For Next AI

Leia `HANDOFF_AI.md`, `.agents/memory/activeContext.md`, `.agents/memory/progress.md`, `docs/ai-context/refactor/02-BOARD.md`, `docs/ai-context/refactor/03-OPEN-ITEMS.md` e `docs/ai-context/refactor/sprints/SPRINT-11-EXECUTION.md`.

Considere a Onda 1A documental como a tarefa ativa. Depois dela, seguir para `LoadingSmart` e `WarRoom` em PRs separados, sem reintroduzir Mini CRM local.
