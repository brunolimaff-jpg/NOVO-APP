# Handoff Tecnico - Fonte Canonica

Use este arquivo como ponto de entrada rapido para qualquer nova IA trabalhando neste repositorio.

## Ordem de leitura

1. `AGENTS.md`
2. `.agents/memory/activeContext.md`
3. `.agents/memory/progress.md`
4. `.agents/memory/decisions.md`
5. `docs/SKILLS-GOVERNANCE.md`
6. `docs/ai-context/refactor/00-README.md`
7. `docs/ai-context/refactor/01-MASTER-PLAN.md`
8. `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
9. `docs/ai-context/refactor/02-BOARD.md`
10. `docs/ai-context/refactor/11-SPRINT-10-RADAR-BOUNDARY-2026-05-16.md`
11. `docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`
12. `docs/ai-context/refactor/03-OPEN-ITEMS.md`
13. `docs/ai-context/refactor/06-HANDOFF.md`
14. `docs/obsidian/00-MASTER.md` para navegacao visual (nao substitui as fontes canonicas acima)

## Contexto minimo estavel

- Projeto: **Senior Scout 360**
- Stack: React 19 + TypeScript + Vite + Tailwind + Gemini + Pinecone
- Auth: local-only via `contexts/OperatorContext.tsx`
- Runtime real para validacao manual: Vercel
- Integracao externa padrao de IA: nenhuma obrigatoria no repo

## Estado arquitetural atual

> Atualizado em 2026-05-16 — `origin/main` no commit `66591f1` apos merge da PR `#256`.

- `services/geminiService.ts` segue como fachada publica com internals em `services/gemini/*`.
- `services/warRoomService.ts` segue como fachada publica com internals em `services/war-room/*`.
- `services/exportService.ts` criado na Sprint 9 com export/email logic extraida de App.tsx.
- `features/chat/*` e `features/dossier/*` concentram os fluxos extraidos de `App.tsx`.
- Leak `features/dossier/*` -> `features/chat/*` removido na Sprint 9; helpers compartilhados vivem em `utils/*`.
- Dependência circular `chatStore` -> `message-orchestrator` resolvida: `LastAction` movido para `types.ts`.
- `features/radar/*` e o boundary oficial do Radar runtime; `useRadar` e o service foram movidos para a feature na Sprint 10.
- `hooks/useRadar.ts` e `services/radarService.ts` existem apenas como facades de compatibilidade.
- `tests/architecture/radarBoundaryImportGuard.test.ts` bloqueia novos imports de producao para os caminhos legados.
- `types.ts` permanece centralizado (agora inclui `LastAction`).
- `hooks/useChat.ts` foi removido e protegido por `tests/architecture/useChatImportGuard.test.ts`.
- `VITE_PINECONE_*` no frontend é risco aceito pelo owner para app interno/fechado; reavaliar se o app virar externo.
- Docs RAG anti-alucinacao mergeado via PR `#253` (`df1ca1e`).

## Programa de refatoracao

- Fase 1 (Sprints 1-8): concluída em `main` (PR `#241`).
- Fase 2 (Sprints 9-12): em andamento.
  - Sprint 9: concluída e mergeada via PR `#254`.
  - Onda 0+1: concluída e mergeada via PR `#255`.
  - OI-066: concluído e mergeado via PR `#256`.
  - Sprint 10: em andamento, Radar boundary completion.

## Hotspots atuais da Fase 2

| Arquivo | Linhas/estado | Sprint alvo |
|---|---|---|
| `App.tsx` | 622 | Sprint 9 concluída |
| `features/radar/useRadar.ts` + `features/radar/service.ts` | runtime movido para boundary; facades antigas preservadas | Sprint 10 em andamento |
| `components/CRMDetail.tsx` | 717 + `card: any` + sem testes dedicados | Sprint 11 |
| `components/LoadingSmart.tsx` | 766 | Sprint 11 |
| `components/WarRoom.tsx` | 552 + sem testes dedicados | Sprint 11 |
| `utils/idbStorage.ts` | warning de chunking/build | Sprint 12 |

## Entrega em curso: Sprint 10 Radar boundary

- Branch: `codex/sprint-10-radar-boundary`
- Base: `origin/main@66591f1`
- PR: `#257` — <https://github.com/brunolimaff-jpg/NOVO-APP/pull/257>
- Preview Vercel: <https://scoutagro-git-codex-sprint-10-143bdc-brunolimaff-3629s-projects.vercel.app>
- Plano: `docs/ai-context/refactor/11-SPRINT-10-RADAR-BOUNDARY-2026-05-16.md`
- Escopo:
  - mover runtime do Radar para `features/radar/useRadar.ts` e `features/radar/service.ts`;
  - manter `hooks/useRadar.ts` e `services/radarService.ts` como facades de compatibilidade;
  - fazer `App.tsx` importar `useRadar` pelo barrel `features/radar`;
  - exportar hook, service, tipos e constantes estaveis por `features/radar/index.ts`;
  - adicionar guardrail contra novos imports de producao pelos caminhos legados.
- Validação local:
  - `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/architecture/radarBoundaryImportGuard.test.ts` green (`34` testes);
  - `npm exec vitest run tests/components/chat/ChatPanels.test.tsx tests/components/EmptyStateHome.test.tsx` green (`11` testes);
  - `npm exec vitest run tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`7` testes);
  - `npm run typecheck` green;
  - `npm run test` green (`115` arquivos, `850` testes);
  - `npm run build` green com warnings aceitos OI-003/OI-057;
  - `npm run lint` green com `0` erros e `147` warnings conhecidos;
  - `npm run analyze:circular` green, sem ciclos.
- Checks remotos:
  - AI Config Quality Score, Typecheck, Build, Tests, Dossier Golden, GitGuardian, Vercel e Vercel Preview Comments verdes.
  - `mergeStateStatus: CLEAN`.
- Fora de escopo:
  - mover componentes visuais `Radar*`;
  - deletar facades de compatibilidade;
  - redesign funcional do Radar;
  - limpar warnings globais de lint.

## Entrega anterior: OI-066

- Branch: `codex/fix-delete-icon-unicode`
- PR: `#256`, merge commit `66591f1`
- Resultado:
  - botão de excluir mensagem renderiza icone de lixeira, nao o escape cru `\uD83D\uDDD1\uFE0F`;
  - `aria-label` preserva acessibilidade;
  - teste focado em `tests/components/MessageRow.test.tsx`.

## Entrega anterior: Onda 0+1

- Branch: `refactor/wave-0-1-cleanup`
- Base: `origin/main@922a403`
- PR: `#255`, merge commit `0550454`
- Plano: `docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`
- Escopo:
  - sincronizar docs/memória pós-PR `#254`;
  - registrar handoff detalhado no repo e no `claude-mem`;
  - corrigir PORTA para não transformar falha parcial em hold de integridade;
  - migrar logs cliente sensíveis para `scoutDiag`.
- Ajuste pós-validação manual:
  - corrigido crash serverless de `/api/open-web-search` causado por imports ESM sem `.js`;
  - `/api/open-web-search` agora aceita `{ url }` sem `query`, alinhado ao function calling do Gemini;
  - smoke com Vercel Protection Bypass confirmou `POST /api/open-web-search` com `200`, `source: OpenWebSearch/Brave`, `degraded: false`, `5` fontes;
  - smoke `{ url: "https://example.com/" }` confirmou `200` e `source: OpenWebSearch/URL`;
  - smoke `{}` confirmou `400` esperado;
  - logs Vercel `500` dos 15 minutos posteriores ao fix não retornaram ocorrências.
- OI-066 foi extraído para hotfix curto em `codex/fix-delete-icon-unicode`.
- Fora de escopo:
  - Radar boundary;
  - `CRMDetail`, `LoadingSmart`, `WarRoom`;
  - sweep global de lint/`any`/`catch`;
  - PWA/chunking;
  - performance sem profiling;
  - deleção de branches antigas.

## Riscos residuais imediatos

- Ainda nao ha extractor server-side seguro de URL/PDF para Docs RAG; nao implementar sem protecao SSRF.
- `VITE_PINECONE_*` permanece por decisao operacional em app interno/fechado.
- Warnings de lint/build seguem como backlog aceito.
- Workspace principal original tinha mudanças não commitadas em `refactor/code-quality`; esta Onda 0+1 foi executada em worktree limpa para não misturar escopos.

## Próximo passo seguro

1. Validar preview Vercel: configurar Radar, forçar varredura, abrir painel/configurações, marcar alerta como lido e confirmar que Chat/Home seguem recebendo contexto do Radar.
2. Depois da validação manual, mergear PR `#257`.

## Regras de continuidade

- Preservar APIs publicas congeladas:
  - `services/geminiService.ts`
  - `services/warRoomService.ts`
  - `components/ChatInterface.tsx`
  - `constants.ts`
  - `prompts/megaPrompts.ts`
  - `types.ts`
- Nao incluir `mcp-server/` no escopo sem repriorizacao explicita.
- Em qualquer sprint, bloquear promocao com gate vermelho (`test`, `typecheck`, `build`, `lint`).
