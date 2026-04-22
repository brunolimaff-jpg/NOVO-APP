# Open Items

## Known Warnings

| ID | Severidade | Status | Item | Impacto | Fechamento |
|---|---|---|---|---|---|
| OI-003 | low | open | warning de build sobre `utils/idbStorage.ts` | Ruido de bundling | Revisar import dinamico/estatico quando tocar `sessionExport` |
| OI-004 | medium | open | `tests/components/SessionsSidebar.test.tsx` emite `Functions are not valid as a React child` | Ruido no baseline de testes | Ajustar o mock render-prop de `ConfirmPopover` no teste |
| OI-005 | high | open | `npm run lint` falha por backlog historico do repo (`37` erros, `217` warnings em `2026-04-11`) | `lint` nao serve hoje como gate confiavel de merge/sprint | Tratar em passada dedicada antes do Sprint 7; nao misturar com hotspots |

## Deferred Decisions

| ID | Severidade | Status | Decisao | Motivo | Reavaliar |
|---|---|---|---|---|---|
| OI-010 | low | deferred | Nao dividir `services/apiConfig.ts` por dominio | Arquivo pequeno, ROI baixo | Sprint 7 se crescer ou gerar acoplamento novo |
| OI-011 | low | deferred | Manter `types.ts` centralizado | Separacao agora aumenta imports sem ganho claro | Reavaliar se passar de ~600 linhas ou gerar ciclos |

## Risk Gates

| ID | Severidade | Status | Gate | Impacto | Acao |
|---|---|---|---|---|---|
| OI-020 | high | open | Facades temporarias precisam manter compatibilidade | Quebra de imports e retrabalho em cascata | Nao remover facade no mesmo sprint em que submodulo nascer |
| OI-021 | high | open | A facade `prompts/megaPrompts.ts` e os modulos `prompts/mega/*` nao podem quebrar markers `[[PORTA_*]]` | Regressao funcional forte em parser e scoring | Manter cobertura de contratos na suite de prompts; reavaliar validacao Zod em `contracts.ts` apenas se houver ganho real |
| OI-022 | medium | resolved | `hooks/useChat.ts` nao pode ganhar novos consumidores | Duplica fluxo e confunde manutencao | Guardrail estrutural ativo; manter vigilancia em reviews |
| OI-023 | medium | open | Perfil local deve manter `operatorId` estavel e payload remoto com `userId`/`userName` | Regressao em rastreabilidade e compatibilidade com backend | Preservar contrato ao tocar `saveRemoteSession` e `sendFeedbackRemote` |

## Cross-Cutting Concerns

| ID | Severidade | Status | Item | Impacto | Acao |
|---|---|---|---|---|---|
| OI-030 | medium | open | `App.tsx` e `geminiService.ts` continuam hotspots apos o fechamento da Sprint 6 | Ajustes de produto ainda tendem a encostar neles | Manter mudancas de produto minimas nesses arquivos enquanto a Sprint 7 trabalha `constants.ts`, `hooks/useChat.ts` e higiene leve |
| OI-031 | medium | open | `constants.ts` ja iniciou extracao com `constants/loadingStages.ts` | Boa base para Sprint 7 | Seguir extracoes por grupo; priorizar `market-intelligence.ts` antes de `app.ts` |
| OI-032 | low | resolved | `HANDOFF_AI.md` antigo continha contexto de auth desatualizado | Pode confundir outras IAs | Handoff sincronizado com auth local-only e arquitetura Gemini extraida |

## Novos Itens - Identificados na revisao Board Room (2026-04-14)

| ID | Severidade | Status | Item | Impacto | Acao |
|---|---|---|---|---|---|
| OI-040 | high | resolved | `message-orchestrator` (ultimo corte Sprint 3) estava pendente | Risco de conflito de estado se nova feature abrisse sobre `App.tsx` antes deste corte fechar | Encerrado com a PR `#221` e com a validacao manual integrada da Sprint 3 em `2026-04-15` |
| OI-041 | high | resolved | Ausencia de camada `stores/` forcava `App.tsx` a segurar estado de sessao e score PORTA mesmo apos extracao das features | Features pos-Sprint 4 herdavam estado por props em cascata | Resolvido pela Onda 2 da Sprint 4 com `stores/chatStore.tsx` e `stores/dossierStore.tsx`, mergeada via PR `#228` |
| OI-042 | high | resolved | Ausencia de Error Boundaries por feature | Gemini 429/500/offline quebrava tela silenciosamente sem fallback visual | Resolvido pela Onda 2 da Sprint 4 com `ChatErrorBoundary.tsx` e `DossierErrorBoundary.tsx`, mergeada via PR `#228` |
| OI-043 | medium | open | `constants.ts` mistura inteligencia de mercado (muda com frequencia) com constantes de UI (quase nunca mudam) | IA que edita dados de mercado pode causar efeito colateral em comportamento de loading | Sprint 7: extrair `market-intelligence.ts` ANTES de `app.ts` |
| OI-044 | medium | open | Radar nao tem destino arquitetural definido; sem pre-esqueleto a feature nascera ad hoc dentro de `App.tsx` | Retrabalho de relocacao quando Radar for implementado | Criar `features/radar/` (stub com tipos e README) no Sprint 8 antes de qualquer implementacao |
| OI-045 | medium | open | `mobile-responsive.css` continua separado de `index.css` apos o fechamento da Sprint 5 | Pode gerar drift ou duplicacao de estilos mobile em futuras extracoes do chat | Tratar em passada dedicada de higiene visual, fora da Sprint 6 de prompts |
| OI-046 | medium | resolved | Responsabilidade do retry no `message-orchestrator` precisava ficar explicita | Retry podia ficar no componente pai ou no service, criando dois caminhos ativos | Consolidado na PR `#221`: retry de envio vive em `features/chat/message-orchestrator.ts`, nao no componente |
