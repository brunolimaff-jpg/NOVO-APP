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
10. `docs/ai-context/refactor/sprints/SPRINT-11-EXECUTION.md`
11. `docs/ai-context/refactor/03-OPEN-ITEMS.md`
12. `docs/ai-context/refactor/06-HANDOFF.md`
13. `docs/obsidian/00-MASTER.md` para navegacao visual (nao substitui as fontes canonicas acima)

## Contexto minimo estavel

- Projeto: **Senior Scout 360**
- Stack: React 19 + TypeScript + Vite + Tailwind + Gemini + Pinecone
- Auth: local-only via `contexts/OperatorContext.tsx`
- Runtime real para validacao manual: Vercel
- Integracao externa padrao de IA: nenhuma obrigatoria no repo

## Estado arquitetural atual

> Atualizado em 2026-05-19 — Sprint 11 Onda 1B `LoadingSmart` em andamento na branch `codex/sprint-11-onda-0-5-mini-crm-local-fixes`.

- `services/geminiService.ts` segue como fachada publica com internals em `services/gemini/*`.
- `services/warRoomService.ts` segue como fachada publica com internals em `services/war-room/*`.
- `services/exportService.ts` criado na Sprint 9 com export/email logic extraida de App.tsx.
- `features/chat/*` e `features/dossier/*` concentram os fluxos extraidos de `App.tsx`.
- Leak `features/dossier/*` -> `features/chat/*` removido na Sprint 9; helpers compartilhados vivem em `utils/*`.
- Dependência circular `chatStore` -> `message-orchestrator` resolvida: `LastAction` movido para `types.ts`.
- `features/radar/*` e o boundary oficial do Radar runtime; `useRadar` e o service foram movidos para a feature na Sprint 10.
- `hooks/useRadar.ts` e `services/radarService.ts` existem apenas como facades de compatibilidade.
- `tests/architecture/radarBoundaryImportGuard.test.ts` bloqueia novos imports de producao para os caminhos legados.
- `types.ts` permanece centralizado (inclui `LastAction`); tipos do Mini CRM local foram removidos.
- `hooks/useChat.ts` foi removido e protegido por `tests/architecture/useChatImportGuard.test.ts`.
- `VITE_PINECONE_*` no frontend é risco aceito pelo owner para app interno/fechado; reavaliar se o app virar externo.
- Mini CRM local foi removido por decisão de produto; preservar apenas referências ao CRM interno Senior usadas como evidência em dossiês/prompts.
- Docs RAG anti-alucinacao mergeado via PR `#253` (`df1ca1e`).

## Programa de refatoracao

- Fase 1 (Sprints 1-8): concluída em `main` (PR `#241`).
- Fase 2 (Sprints 9-12): em andamento.
  - Sprint 9: concluída e mergeada via PR `#254`.
  - Onda 0+1: concluída e mergeada via PR `#255`.
  - OI-066: concluído e mergeado via PR `#256`.
  - Sprint 10: concluída e mergeada via PR `#257`.
  - Sprint 11 Onda 0: concluída e mergeada via PR `#258`.
  - Sprint 11 Onda 0.5: concluída via PR `#259` na branch de trabalho.
  - Sprint 11 Onda 1A: concluída para saneamento de planos duplicados/stale.
  - Sprint 11 Onda 1B: em andamento em `LoadingSmart`.

## Hotspots atuais da Fase 2

| Arquivo | Linhas/estado | Sprint alvo |
|---|---|---|
| `App.tsx` | 622 | Sprint 9 concluída |
| `features/radar/useRadar.ts` + `features/radar/service.ts` | runtime movido para boundary; facades antigas preservadas | Sprint 10 concluída |
| Mini CRM local / `components/CRMDetail.tsx` | removido por decisão de produto; não refatorar nem reintroduzir | Sprint 11 Onda 0.5 |
| `components/LoadingSmart.tsx` | 766 | Sprint 11 |
| `components/WarRoom.tsx` | 552; teste de caracterização criado na Onda 0 | Sprint 11 |
| `utils/idbStorage.ts` | warning de chunking/build | Sprint 12 |

## Entrega em curso: Sprint 11 Onda 1B LoadingSmart

- Branch/workspace atual: `codex/sprint-11-onda-0-5-mini-crm-local-fixes` em `/Users/brunolima/Documents/NOVO-APP`.
- Escopo:
  - reduzir `components/LoadingSmart.tsx` sem mudar a fachada/default export;
  - extrair primeiro a lógica pura de timeline/progresso para helper testável;
  - manter `App.tsx` sem alteração;
  - manter `WarRoom` fora deste PR.
- Validação herdada da Onda 0/0.5:
  - baseline inicial `npm run test` green (`115` arquivos, `851` testes);
  - Onda 0 anterior: `npm exec vitest run tests/components/CRMDetail.test.tsx tests/components/WarRoom.test.tsx` green (`18` testes);
  - Onda 0 anterior: `npx vitest run --coverage tests/components/CRMDetail.test.tsx tests/components/WarRoom.test.tsx` green (`CRMDetail.tsx` `92.35%` linhas; `WarRoom.tsx` `74.21%` linhas);
  - Onda 0.5: `npm exec vitest run tests/components/LoadingSmart.test.tsx tests/services/geminiProxy.test.ts tests/config/localDevApiProxy.test.ts tests/components/ChatInterface.test.tsx tests/components/SessionsSidebar.test.tsx tests/components/FeatureGatingUI.test.tsx tests/App.layout.test.tsx` green (`43` testes);
  - Onda 0.5: `npm run typecheck` green;
  - Onda 0.5: `npm run test` green (`115` arquivos, `820` testes);
  - Onda 0.5: `npm run build` green com warnings aceitos de chunking;
  - Onda 0.5: `npm run lint` green com `0` erros e `141` warnings conhecidos;
  - Smoke local: `/api/open-web-search` em `localhost:3000` retornou `200` com `OpenWebSearch/Brave`; `/api/gemini` retornou HTTP `200`, mas health remoto veio `ok:false`;
  - `npm run typecheck` green;
  - `npm run test` green (`117` arquivos, `869` testes);
  - `npm run build` green com warnings aceitos OI-003/OI-057;
  - `npm run lint` green com `0` erros e `147` warnings conhecidos;
- Validação da Onda 1A:
  - busca textual em docs/memória deve confirmar Mini CRM apenas como histórico/removido;
  - nenhum código de runtime deve ser alterado nesta onda.
- Validação da Onda 1B:
  - `npm exec vitest run tests/utils/loadingSmartViewModel.test.ts tests/components/LoadingSmart.test.tsx tests/App.loadingVariant.test.tsx` green (`18` testes);
  - `npm run typecheck` green.
- Fora de escopo:
  - refatorar `LoadingSmart` ou `WarRoom`;
  - remover `card: any`;
  - limpar warnings globais de lint.

## Entrega anterior: Sprint 11 Onda 0.5

- Branch: `codex/sprint-11-onda-0-5-mini-crm-local-fixes`
- PR: `#259`
- Resultado:
  - proxy local Vite centralizado em `config/localDevApiProxy.ts`, incluindo `/api/open-web-search`;
  - Mini CRM local removido (`CRMProvider`, `CRMView`, `CRMDetail`, `CRMPipeline`, contratos e testes dedicados);
  - Revenue Intelligence local acoplada ao Mini CRM removida;
  - CRM interno Senior preservado em prompts/evidências/fixtures/dossiês.

## Entrega anterior: Sprint 11 Onda 1A

- Resultado:
  - canônicos reconciliados para evitar duplicação de planos vivos;
  - `CRMDetail` mantido apenas como histórico/removido;
  - `LoadingSmart` e `WarRoom` mantidos como PRs separados;
  - `npm run docs:obsidian:check` green (`14` notas).

## Entrega anterior: Sprint 10 Radar boundary

- Branch: `codex/sprint-10-radar-boundary`
- PR: `#257`, merge commit `fbf5536`
- Resultado:
  - runtime do Radar movido para `features/radar/useRadar.ts` e `features/radar/service.ts`;
  - `hooks/useRadar.ts` e `services/radarService.ts` preservados como facades de compatibilidade;
  - `App.tsx` passou a importar `useRadar` pelo barrel `features/radar`;
  - `tests/architecture/radarBoundaryImportGuard.test.ts` bloqueia novos imports de produção pelos caminhos legados.

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

1. Completar a Onda 1B com hook de curiosidades/timers ou fechar a fatia atual como PR curto.
2. Iniciar Onda 1C em `WarRoom`, mantendo props públicas e `services/warRoomService.ts` estável.
3. Sprint 12 fica para hardening de OI-003/OI-004/OI-005/OI-062.

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
