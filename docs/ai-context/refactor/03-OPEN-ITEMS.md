# Open Items

## Known Warnings

| ID | Severidade | Status | Item | Impacto | Fechamento |
|---|---|---|---|---|---|
| OI-003 | low | open | warning de build sobre `utils/idbStorage.ts` | ruido de bundling | revisar import dinamico/estatico quando tocar `sessionExport` |
| OI-004 | medium | open | `tests/components/SessionsSidebar.test.tsx` emite `Functions are not valid as a React child` | ruido no baseline de testes | ajustar mock render-prop de `ConfirmPopover` no teste |
| OI-005 | medium | open | `npm run lint` passa, mas com backlog de warnings | reduz sinal de review | tratar warning cleanup em passada dedicada |

## Deferred Decisions

| ID | Severidade | Status | Decisao | Motivo | Reavaliar |
|---|---|---|---|---|---|
| OI-010 | low | deferred | nao dividir `services/apiConfig.ts` por dominio | arquivo pequeno e estavel apos hardening da Sprint 7 | se voltar a crescer ou gerar acoplamento novo |
| OI-011 | low | deferred | manter `types.ts` centralizado | separacao agora aumenta custo de import sem ROI claro | se ultrapassar ~600 linhas ou gerar ciclos |
| OI-060 | low | deferred | manter `mcp-server/` fora da trilha de manutenibilidade | foco atual e runtime web principal do produto | apos fechamento da Sprint 12 |

## Risk Gates

| ID | Severidade | Status | Gate | Impacto | Acao |
|---|---|---|---|---|---|
| OI-020 | high | open | facades publicas congeladas devem manter compatibilidade | quebra de imports e retrabalho em cascata | nao remover facade no mesmo sprint de nascimento de submodulo |
| OI-021 | high | open | `prompts/megaPrompts.ts` e `prompts/mega/*` nao podem quebrar markers `[[PORTA_*]]` | regressao funcional forte no parser/scoring | manter cobertura de contratos de prompts |
| OI-023 | medium | open | perfil local deve manter `operatorId` estavel e payload remoto com `userId`/`userName` | risco de regressao em rastreabilidade | preservar contrato ao tocar save/feedback remotos |

## Fase 2 - Hotspots Prioritarios

| ID | Severidade | Status | Hotspot | Sinal | Acao da fase |
|---|---|---|---|---|---|
| OI-050 | high | open | `App.tsx` | `724` linhas, `44` imports | Sprint 9: desacoplar app shell e reduzir wiring |
| OI-051 | high | open | `components/CRMDetail.tsx` | `664` linhas + `card: any` | Sprint 11: tipagem forte + extracao de componentes |
| OI-052 | high | open | `components/LoadingSmart.tsx` | `704` linhas | Sprint 11: separar timeline/modelo/render |
| OI-053 | medium | open | `components/WarRoom.tsx` | `513` linhas | Sprint 11: reduzir complexidade local de UI |
| OI-054 | high | open | Radar runtime fora do boundary | `hooks/useRadar.ts` (`248`) + `services/radarService.ts` (`200`) | Sprint 10: completar boundary `features/radar/*` |

## Historico de Itens Resolvidos (trilha S1-S8)

| ID | Severidade | Status | Item | Fechamento |
|---|---|---|---|---|
| OI-022 | medium | resolved | reintroducao de `hooks/useChat.ts` | Sprint 7 removeu arquivo e guardrail bloqueia imports |
| OI-031 | medium | resolved | mistura de responsabilidade em `constants.ts` | Sprint 7 criou `constants/market-intelligence.ts` |
| OI-032 | low | resolved | handoff antigo de auth | handoff/memory sincronizados para auth local-only |
| OI-040 | high | resolved | message-orchestrator pendente | encerrado na PR `#221` + validacao manual da Sprint 3 |
| OI-041 | high | resolved | ausencia de camada `stores/*` | resolvido na Sprint 4 Onda 2 |
| OI-042 | high | resolved | ausencia de error boundaries por feature | resolvido na Sprint 4 Onda 2 |
| OI-043 | medium | resolved | `constants.ts` misturava dados de mercado com constantes estaveis | resolvido na Sprint 7 |
| OI-044 | medium | resolved | Radar sem destino arquitetural | resolvido na Sprint 8 com `features/radar/*` stub |
| OI-046 | medium | resolved | ownership do retry no chat | consolidado em `features/chat/message-orchestrator.ts` |
