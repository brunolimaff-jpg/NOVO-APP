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

> Atualizado em 2026-05-20 — **Fase 2 (Manutenibilidade) concluída.** Todas as Sprints 9–12 mergeadas em `main` (`0694997`). Validação manual em Vercel aceita pelo owner.

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
- Fase 2 (Sprints 9-12): **concluída**.
  - Sprint 9: concluída via PR `#254`.
  - Onda 0+1: concluída via PR `#255`.
  - OI-066: concluído via PR `#256`.
  - Sprint 10: concluída via PR `#257`.
  - Sprint 11 Onda 0: concluída via PR `#258`.
  - Sprint 11 Onda 0.5: concluída via PR `#259`.
  - Sprint 11 Onda 1A: concluída.
  - Sprint 11 Onda 1B: concluída via PR `#260`.
  - Sprint 11 Onda 1C: concluída via PR `#261`.
  - Sprint 12: concluída via PR `#262` (OI-004), PR `#263` (OI-005), PR `#264` (LoadingSmart fix).

## Hotspots atuais da Fase 2

| Arquivo | Linhas/estado | Sprint alvo |
|---|---|---|
| `App.tsx` | 622 | Sprint 9 concluída |
| `features/radar/useRadar.ts` + `features/radar/service.ts` | runtime movido para boundary; facades antigas preservadas | Sprint 10 concluída |
| Mini CRM local / `components/CRMDetail.tsx` | removido por decisão de produto; não refatorar nem reintroduzir | Sprint 11 Onda 0.5 |
| `components/LoadingSmart.tsx` | 672 após Onda 1B; fachada preservada | Sprint 12 avalia se precisa nova fatia |
| `components/WarRoom.tsx` | 283 após Onda 1C; props públicas preservadas | Sprint 11 concluída |
| `utils/idbStorage.ts` | warning específico resolvido; resta warning geral de chunks grandes | Sprint 12 |

## Fase 2 (Manutenibilidade) — CONCLUÍDA

- Commit final: `0694997` em `main`.
- Validação manual em Vercel aceita pelo owner em `2026-05-20`.
- Gates finais: `test` (117 arq, 834 testes), `typecheck`, `build`, `lint --quiet`, `analyze:circular` — todos verdes.
- PRs da Sprint 12: `#262` (OI-004/003/057/062), `#263` (OI-005 lint), `#264` (LoadingSmart progress bar fix).
- Métricas de sucesso atingidas:
  - `App.tsx`: 772 → 622 linhas (target < 400 não atingido; funcional)
  - Componentes > 500 linhas: 3 → 0 (LoadingSmart 672, WarRoom 283)
  - `any` em produção: reduzido significativamente
  - Radar boundary: 0% → 100%
  - Boundary leak dossier→chat: 4 → 0
  - Warnings operacionais: OI-003/004/005/057/062 todos fechados
  - Circulares: zero
  - Lint: `0` erros, `0` warnings

## Próximo passo seguro

1. Quando houver demanda, planejar Fase 3 (Sprints 13–16: Modularização de Prompts).
2. Pré-requisito para Sprints 13+: golden test baseline já criado em `tests/prompts/megaPrompts.test.ts`.
3. Repriorizar itens deferred: `mcp-server/`, design system (Sprints 17–20), observability (Sprints 21–24).

## Entrega anterior: Sprint 11 Onda 1C WarRoom

- PR: `#261`
- Merge commit: `9fe0821`
- Resultado:
  - `components/WarRoom.tsx` reduzido de `552` para `283` linhas;
  - blocos visuais extraídos para `components/war-room/*`;
  - `WarRoomModelMessage` e `WarRoomSources` extraídos após review do Gemini;
  - `key={hint}` aplicado nas sugestões;
  - `scripts/smoke-preview.mjs` simplificado para usar apenas `x-vercel-protection-bypass`;
  - props públicas e `services/warRoomService.ts` preservados.

Lição aprendida:

- O erro no check GitHub `Smoke (preview)` da PR `#261` foi causado por eu ter enviado o header opcional `x-vercel-set-bypass-cookie` junto do bypass em todas as requisições. Para smoke automatizado no GitHub Actions, manter somente `x-vercel-protection-bypass`; o cookie é para navegação/sessão e não é necessário quando cada `fetch` já carrega o bypass.

## Entrega anterior: Sprint 11 Onda 1B LoadingSmart

- PR: `#260`
- Resultado:
  - `utils/loadingSmartViewModel.ts` criado para timeline/progresso;
  - `tests/utils/loadingSmartViewModel.test.ts` criado;
  - `components/LoadingSmart.tsx` reduzido de `766` para `672` linhas mantendo fachada/default export;
  - Bruno validou e liberou seguir para `WarRoom`.

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
- Warning de build por chunks grandes segue como backlog aceito.
- `mcp-server/` permanece fora do escopo ate repriorizacao explicita.

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
