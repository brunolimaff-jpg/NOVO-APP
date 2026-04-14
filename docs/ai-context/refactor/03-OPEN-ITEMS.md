# Open Items

## Known Warnings

| ID | Severidade | Status | Item | Impacto | Fechamento |
|---|---|---|---|---|---|
| OI-003 | low | open | warning de build sobre `utils/idbStorage.ts` | Ruido de bundling | Revisar import dinamico/estatico quando tocar `sessionExport` |
| OI-004 | medium | open | `tests/components/SessionsSidebar.test.tsx` emite `Functions are not valid as a React child` | Ruido no baseline de testes | Ajustar o mock render-prop de `ConfirmPopover` no teste |
| OI-005 | high | open | `npm run lint` falha por backlog historico do repo (`37` erros, `217` warnings em `2026-04-11`) | `lint` nao serve hoje como gate confiavel de merge/sprint | Tratar em passada dedicada, sem misturar com a congelacao dos hotspots |

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
| OI-022 | medium | resolved | `hooks/useChat.ts` nao pode ganhar novos consumidores | Duplica fluxo e confunde manutencao | Guardrail estrutural ativo; manter vigilancia em reviews |
| OI-023 | medium | open | Perfil local deve manter `operatorId` estavel e payload remoto com `userId`/`userName` | Regressao em rastreabilidade e compatibilidade com backend | Preservar contrato ao tocar `saveRemoteSession` e `sendFeedbackRemote` |

## Cross-Cutting Concerns

| ID | Severidade | Status | Item | Impacto | Acao |
|---|---|---|---|---|---|
| OI-030 | medium | open | `App.tsx` e `geminiService.ts` continuam hotspots ate o Sprint 4 | Todo ajuste de produto tende a encostar neles | Mudancas de produto nesses arquivos devem ser minimas |
| OI-031 | medium | open | `constants.ts` ja iniciou extracao com `constants/loadingStages.ts` | Boa base para Sprint 7 | Seguir extracoes por grupo sem pulverizar demais |
| OI-032 | low | resolved | `HANDOFF_AI.md` antigo continha contexto de auth desatualizado | Pode confundir outras IAs | Handoff sincronizado com auth local-only e arquitetura Gemini extraida |
