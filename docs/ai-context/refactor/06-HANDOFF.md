# Handoff Curto

## Current Phase

Sprint 12 da Fase 2 é o próximo passo após merge da Onda 1C `WarRoom`.

Baseline local observado:

- Sprint 10 concluída via PR `#257` (`fbf5536`)
- Sprint 11 Onda 0 concluída via PR `#258` (`423f821`)
- Sprint 11 Onda 0.5 concluída via PR `#259` na branch `codex/sprint-11-onda-0-5-mini-crm-local-fixes`
- Sprint 11 Onda 1A documental concluída na branch de trabalho
- Sprint 11 Onda 1B `LoadingSmart` concluída e mergeada via PR `#260`
- Sprint 11 Onda 1C `WarRoom` concluída e mergeada via PR `#261` (`9fe0821`)

## What Was Finished

- Mini CRM local removido do runtime/contratos/tipos/testes dedicados.
- Proxy local Vite centralizado em `config/localDevApiProxy.ts`, incluindo `/api/open-web-search`.
- `WarRoom` já tem teste de caracterização criado na Onda 0.
- `LoadingSmart` teve timeline/progresso extraídos para `utils/loadingSmartViewModel.ts`, com teste dedicado.
- `WarRoom` teve UI estática extraída para `components/war-room/*`, reduzindo `components/WarRoom.tsx` para `283` linhas.
- Review comments do Gemini e Smoke Preview da PR `#261` foram resolvidos antes do merge.
- Lição aprendida do erro remoto: no smoke Vercel automatizado, usar apenas `x-vercel-protection-bypass`. O header opcional `x-vercel-set-bypass-cookie` não é necessário quando cada request já envia o bypass e pode fazer o `fetch` do GitHub Actions falhar antes de receber HTTP.
- Referências ao CRM interno Senior continuam válidas em prompts, evidências, fixtures e dossiês.

## Active Work

Sprint 12 combina:

1. Fechar warnings operacionais e guardrails finais.
2. Priorizar OI-003/OI-004/OI-005/OI-062.
3. Preservar facades públicas.
4. Não reintroduzir Mini CRM local.

## Next Safe Step

Abrir branch curta para Sprint 12 hardening e escolher o primeiro item entre OI-003/OI-004/OI-005/OI-062.

## Do Not Touch Yet

- Não reintroduzir `CRMDetail`, `CRMProvider`, `useCRM`, `CRMView` ou `CRMPipeline`.
- Não misturar novas mudanças de `LoadingSmart`/`WarRoom` sem escopo explícito.
- Não alterar `services/geminiService.ts`, `services/warRoomService.ts`, `components/ChatInterface.tsx`, `constants.ts`, `prompts/megaPrompts.ts` ou `types.ts` sem escopo explícito.
- Não incluir `mcp-server/` antes do fechamento da Sprint 12.
- Não mexer em `CODE.md` não rastreado salvo pedido explícito.

## Suggested Prompt For Next AI

Leia `HANDOFF_AI.md`, `.agents/memory/activeContext.md`, `.agents/memory/progress.md`, `docs/ai-context/refactor/02-BOARD.md`, `docs/ai-context/refactor/03-OPEN-ITEMS.md` e `docs/ai-context/refactor/sprints/SPRINT-11-EXECUTION.md`.

Considere Sprint 12 hardening como a tarefa ativa. Comece por OI-003/OI-004/OI-005/OI-062 em PRs pequenos, sem reintroduzir Mini CRM local.
