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

> Números atualizados em 2026-05-19 após Sprint 11 Onda 0.5.

| ID | Severidade | Status | Hotspot | Sinal | Acao da fase |
|---|---|---|---|---|---|
| OI-050 | high | resolved | `App.tsx` | `622` linhas; wiring de modais/export extraido para hooks/services | Sprint 9 validada com gates e browser |
| OI-051 | high | resolved | Mini CRM local / `components/CRMDetail.tsx` | Mini CRM removido por decisão de produto; CRM interno Senior preservado como evidência comercial | Sprint 11 Onda 0.5: remoção completa do runtime local |
| OI-052 | high | open | `components/LoadingSmart.tsx` | `766` linhas; timeline/modelo/render acoplados | Sprint 11 Onda 1B: extrair lógica pura primeiro, mantendo fachada |
| OI-053 | medium | open | `components/WarRoom.tsx` | `552` linhas; teste de caracterização criado na Onda 0 | Sprint 11 Onda 1C: extrair UI estática antes de hook de sessão |
| OI-054 | high | resolved | Radar runtime fora do boundary | runtime movido para `features/radar/useRadar.ts` e `features/radar/service.ts`; facades antigas preservadas | resolvido na Sprint 10; componentes visuais Radar ficam fora desta PR |

## Fase 2 - Novos Riscos Identificados (auditoria 2026-04-30)

| ID | Severidade | Status | Item | Evidência | Sprint |
|---|---|---|---|---|---|
| OI-055 | low | accepted | `VITE_PINECONE_API_KEY` em `index.tsx` permanece no bundle Vite por decisao operacional | app interno/fechado; risco aceito pelo owner em 2026-05-16 | Reavaliar se o app virar externo |
| OI-057 | medium | open | OI-003 (idbStorage chunking) tem risco de PWA — mudança de chunk invalida SW em produção | `vite.config.ts`: `skipWaiting: true`, `cleanupOutdatedCaches: true` | Sprint 12 (protocolo de deploy) |
| OI-059 | medium | open | Cobertura de testes concentrada nas áreas estabilizadas (Fase 1); `WarRoom` ainda precisa ampliar casos de borda | `CRMDetail` saiu do escopo por remoção do Mini CRM; `WarRoom` mantém testes da Onda 0, mas ainda falta clipboard/retry real/onClose abort/mobile | Sprint 11 |
| OI-060 | low | open | Branches paralelas ativas durante ~9 semanas de Fase 2 sem política de integração | 5 branches ativas além da principal | Política documentada em `PLANO_COMPLETO_SPRINTS.md` |
| OI-062 | medium | open | Golden tests de prompts precisam ser criados *antes* da Sprint 13 (migração de strings → `.md`) | Testes em `tests/prompts/` existem mas não têm baseline de output do LLM | Sprint 12 (Onda 4) |

## Onda 0+1 - Cleanup pós-Sprint 9

| ID | Severidade | Status | Item | Contexto | Próxima ação |
|---|---|---|---|---|---|
| OI-063 | high | resolved | PORTA partial integrity hold | Falha parcial de dimensões não deve bloquear `ensureWaterfallScorePorta` como se todas as dimensões estivessem ausentes | resolvido na PR `#255` |
| OI-064 | medium | resolved | Logs cliente sensíveis | `clientLookupService`, `extractContentService`, `feedbackService` e `App.tsx` ainda tinham `console.*` com potencial de expor query/URL/feedback | resolvido na PR `#255` com `scoutDiag` e payload truncado |
| OI-065 | medium | resolved | Docs/memória pós-PR `#254` stale | Canônicos ainda diziam que Sprint 9 estava em review/aguardando merge | resolvido na PR `#255` |
| OI-066 | medium | resolved | Botão excluir mensagem renderiza escape Unicode cru | Preview mostrou `\uD83D\uDDD1\uFE0F` em vermelho no lugar do ícone de lixeira, com tooltip "Excluir esta mensagem" | corrigido em `components/MessageRow.tsx` com entidade renderizável, `aria-label` e teste focado |

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
| OI-056 | high | resolved | Boundary leak `features/dossier` → `features/chat` | Sprint 9 moveu helpers compartilhados para `utils/*`; `rg` retorna 0 imports |
| OI-058 | medium | resolved | `madge` e `ts-prune` ausentes | Sprint 9 adicionou devDeps/scripts e registrou baseline de 1 ciclo |
| OI-061 | low | resolved | Feature flags sem modelo runtime/TTL | Sprint 9 criou `utils/featureFlags.ts`, testes e documentacao em `ARQUITETURA.md` |
