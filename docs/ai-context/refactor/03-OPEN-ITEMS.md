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

> Números atualizados em 2026-04-30 (HEAD `49068ff`, branch `codex/piccini-dossier-pdf`).

| ID | Severidade | Status | Hotspot | Sinal | Acao da fase |
|---|---|---|---|---|---|
| OI-050 | high | open | `App.tsx` | `772` linhas, `46` imports, 16+ hooks de estado | Sprint 9: extrair wiring de modais + lógica de export |
| OI-051 | high | open | `components/CRMDetail.tsx` | `717` linhas + `card: any` + **sem testes** | Sprint 11: Onda 0 (testes) + tipagem forte + extração |
| OI-052 | high | open | `components/LoadingSmart.tsx` | `766` linhas | Sprint 11: separar timeline/modelo/render |
| OI-053 | medium | open | `components/WarRoom.tsx` | `552` linhas + **sem testes** | Sprint 11: Onda 0 (testes) + redução de UI |
| OI-054 | high | open | Radar runtime fora do boundary | `hooks/useRadar.ts` (`291`) + `services/radarService.ts` (`234`) + 29 refs diretas | Sprint 10: completar boundary `features/radar/*` |

## Fase 2 - Novos Riscos Identificados (auditoria 2026-04-30)

| ID | Severidade | Status | Item | Evidência | Sprint |
|---|---|---|---|---|---|
| OI-055 | high | open | `VITE_PINECONE_API_KEY` em `index.tsx` expõe chave no bundle Vite | `index.tsx:17` — lookup via `import.meta.env` | Sprint 9 |
| OI-056 | high | open | Boundary leak: `features/dossier` importa internos de `features/chat` | 4 imports em `waterfall-orchestrator`, `porta-reconciliation`, `benchmark-stage` | Sprint 9 |
| OI-057 | medium | open | OI-003 (idbStorage chunking) tem risco de PWA — mudança de chunk invalida SW em produção | `vite.config.ts`: `skipWaiting: true`, `cleanupOutdatedCaches: true` | Sprint 12 (protocolo de deploy) |
| OI-058 | medium | open | `madge` e `ts-prune` não instalados — circulares nunca medidos | `package.json` sem essas devDeps | Sprint 9 (instalar + baseline) |
| OI-059 | medium | open | Cobertura de testes concentrada nas áreas estabilizadas (Fase 1); alvos de Sprint 11 praticamente sem cobertura | `find tests -name "CRMDetail*" -o -name "WarRoom*"` retorna vazio | Sprint 11 (Onda 0 obrigatória) |
| OI-060 | low | open | Branches paralelas ativas durante ~9 semanas de Fase 2 sem política de integração | 5 branches ativas além da principal | Política documentada em `PLANO_COMPLETO_SPRINTS.md` |
| OI-061 | low | open | Feature flags planejadas sem definição de modelo runtime/override/TTL | Sprint 9 propõe `utils/featureFlags.ts` mas modelo não está especificado | Sprint 9 (modelagem antes de criar módulo) |
| OI-062 | medium | open | Golden tests de prompts precisam ser criados *antes* da Sprint 13 (migração de strings → `.md`) | Testes em `tests/prompts/` existem mas não têm baseline de output do LLM | Sprint 12 (Onda 4) |

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
