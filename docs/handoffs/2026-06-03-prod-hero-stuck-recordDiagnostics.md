# Handoff — travamento hero produção (03/06/2026)

Espelho do bloco topo em `HANDOFF_AI.md`.

## Goal próxima sessão

Implementar P0 (se autorizado) ou validar smoke Scheffer em prod.

## State of play

| Item      | Valor                                                                        |
| --------- | ---------------------------------------------------------------------------- |
| Prod      | `eab12e20` (#331 merged)                                                     |
| Sintoma   | Hero ~2min+ "Finalizando cards…"; `/api/gemini` pendente `recordDiagnostics` |
| Backend   | `waterfall:end`, `processMessage:finally` presentes no Supabase              |
| Gap       | PostCompletion ausente nas sessões travadas                                  |
| Recuperou | `448a3802-27d1-4ed2-ae75-741c384a7f23` — static fallback ~78s                |

## Open decisions

- Aprovar PR P0 diagnostics (rota separada / beacon + `force` flush)?
- Aprovar PR P0 handoff UI (`latestLoadingRef` no `finally`, meta <5s)?

## Artifacts

- `features/chat/message-orchestrator.ts`, `utils/diagnosticLog.ts`, `api/gemini.ts`, `components/ChatInterface.tsx`
- `docs/ai-context/refactor/loading-panel-contract.md`
- Supabase: `scout_diagnostics`, projeto `vmqfcaoirjcfucvlnpig`

## PRs sugeridos (não implementados)

1. **P0** — Diagnostics fora de `/api/gemini`; `flushDiagnosticsNow(..., force: true)` no `finally`
2. **P0** — Handoff panel: refs no `finally`, telemetria `panel:snapshot`
3. **P1** — UI "Consolidando…" na etapa CONSOLIDATION
4. **P1** — Semáforo `generateContent` no pico final

**WIP local** — não misturar com fix prod.
