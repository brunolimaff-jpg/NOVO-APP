# Open Items

## Known Warnings

| ID | Severidade | Status | Item | Impacto | Fechamento |
|---|---|---|---|---|---|
| OI-001 | medium | open | `fetch('/version.json')` gera warning em testes | Ruido no baseline de testes | Mockar ou adaptar hook de update no ambiente de teste |
| OI-002 | medium | open | warnings de `act(...)` em testes de `App` | Reduz confianca como alarme de regressao | Ajustar testes que disparam updates assincronos |
| OI-003 | low | open | warning de build sobre `utils/idbStorage.ts` | Ruido de bundling | Revisar import dinamico/estatico quando tocar `sessionExport` |

## Deferred Decisions

| ID | Severidade | Status | Decisao | Motivo | Reavaliar |
|---|---|---|---|---|---|
| OI-010 | low | deferred | Nao dividir `services/apiConfig.ts` por dominio | Arquivo pequeno, ROI baixo | Sprint 7 se crescer ou gerar acoplamento novo |
| OI-011 | low | deferred | Manter `types.ts` centralizado | Separacao agora aumenta imports sem ganho claro | Reavaliar se passar de ~600 linhas ou gerar ciclos |

## Risk Gates

| ID | Severidade | Status | Gate | Impacto | Acao |
|---|---|---|---|---|---|
| OI-020 | high | open | Facades temporarias precisam manter compatibilidade | Quebra de imports e retrabalho em cascata | Nao remover facade no mesmo sprint em que submodulo nascer |
| OI-021 | high | open | `prompts/megaPrompts.ts` nao pode quebrar markers `[[PORTA_*]]` | Regressao funcional forte em parser e scoring | Cobrir com testes e sprint dedicado |
| OI-022 | medium | open | `hooks/useChat.ts` nao pode ganhar novos consumidores | Duplica fluxo e confunde manutencao | Bloquear uso a partir do Sprint 1 |

## Cross-Cutting Concerns

| ID | Severidade | Status | Item | Impacto | Acao |
|---|---|---|---|---|---|
| OI-030 | medium | open | `App.tsx` e `geminiService.ts` continuam hotspots ate o Sprint 4 | Todo ajuste de produto tende a encostar neles | Mudancas de produto nesses arquivos devem ser minimas |
| OI-031 | medium | open | `constants.ts` ja iniciou extracao com `constants/loadingStages.ts` | Boa base para Sprint 7 | Seguir extracoes por grupo sem pulverizar demais |
| OI-032 | low | open | `HANDOFF_AI.md` antigo continha contexto de maquina obsoleto | Pode confundir outras IAs | Corrigir imediatamente no bootstrap documental |
