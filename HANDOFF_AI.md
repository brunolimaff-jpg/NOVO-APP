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

> Atualizado em 2026-05-20 — Sprint 12 hardening em `main` após merge da Sprint 11 Onda 1C.

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
  - Sprint 11 Onda 1B: concluída e mergeada via PR `#260`.
  - Sprint 11 Onda 1C: concluída e mergeada via PR `#261`.
  - Sprint 12: próxima fase de hardening final.

## Hotspots atuais da Fase 2

| Arquivo | Linhas/estado | Sprint alvo |
|---|---|---|
| `App.tsx` | 622 | Sprint 9 concluída |
| `features/radar/useRadar.ts` + `features/radar/service.ts` | runtime movido para boundary; facades antigas preservadas | Sprint 10 concluída |
| Mini CRM local / `components/CRMDetail.tsx` | removido por decisão de produto; não refatorar nem reintroduzir | Sprint 11 Onda 0.5 |
| `components/LoadingSmart.tsx` | 672 após Onda 1B; fachada preservada | Sprint 12 avalia se precisa nova fatia |
| `components/WarRoom.tsx` | 283 após Onda 1C; props públicas preservadas | Sprint 11 concluída |
| `utils/idbStorage.ts` | warning específico resolvido; resta warning geral de chunks grandes | Sprint 12 |

## Entrega em curso: Sprint 12 hardening

- Branch/workspace atual: `codex/sprint-12-oi-005-lint-warnings` em `/Users/brunolima/Documents/NOVO-APP`.
- Escopo:
  - fechar warnings operacionais e guardrails finais da Fase 2;
  - OI-003/OI-004/OI-057/OI-062 resolvidos localmente;
  - OI-005 resolvido: `npm run lint` passa com `0` warnings;
  - preservar facades públicas e não reintroduzir Mini CRM local;
  - manter `mcp-server/` fora do escopo salvo repriorização explícita.
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
- Validação da Onda 1C:
  - `npm exec vitest run tests/components/WarRoom.test.tsx` green (`6` testes);
  - `npm run typecheck` green;
  - `npm run build` green com warnings aceitos OI-003/OI-057;
  - `npm run lint -- --quiet` green;
  - `npm run test` green (`116` arquivos, `826` testes);
  - `npm run analyze:circular` green, sem ciclos.
  - checks remotos da PR `#261` green: Build, Dossier Golden, GitGuardian, Smoke Preview, Tests, Typecheck, Vercel, Vercel Preview Comments.
- Validação inicial da Sprint 12:
  - `npm exec vitest run tests/components/SessionsSidebar.test.tsx tests/utils/sessionExport.test.ts tests/utils/idbStorage.test.ts` green (`23` testes);
  - `npm run typecheck` green;
  - `npm run build` green; warning específico de dynamic import de `utils/idbStorage.ts` removido, permanecendo apenas warning geral de chunks grandes;
  - `npm run lint -- --quiet` green;
  - `npm run test` green (`117` arquivos, `830` testes);
  - `npm exec vitest run tests/components/SessionsSidebar.test.tsx tests/utils/sessionExport.test.ts tests/utils/idbStorage.test.ts tests/prompts/megaPrompts.test.ts` green (`39` testes);
  - `npm run analyze:circular` green, sem ciclos;
  - `npm run docs:obsidian:check` green (`14` notas);
  - `npm exec vitest run tests/prompts/megaPrompts.test.ts -u` green (`16` testes; snapshot inline criado para baseline de hashes).
- Validação da OI-005:
  - `npm run lint` green com `0` warnings;
  - `npm run typecheck` green;
  - `npm exec vitest run tests/api-gemini.test.ts tests/gemini-integration.test.ts` green (`9` testes);
  - `npm run test` green (`117` arquivos, `833` testes);
  - `npm run build` green, com warning conhecido de chunks grandes;
  - `npm run analyze:circular` green, sem ciclos;
  - `npm run docs:obsidian:check` green (`14` notas).
- Fora de escopo:
  - mudanças funcionais em `LoadingSmart`/`WarRoom` sem novo escopo;
  - refatorar `mcp-server/` sem repriorização.

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
- Warning de build por chunks grandes segue como backlog aceito; warnings de lint foram zerados na OI-005.
- Workspace principal original tinha mudanças não commitadas em `refactor/code-quality`; esta Onda 0+1 foi executada em worktree limpa para não misturar escopos.

## Próximo passo seguro

1. Abrir PR da OI-005 na branch `codex/sprint-12-oi-005-lint-warnings`.
2. Acompanhar checks remotos e mergear se ficarem verdes.
3. Depois do merge, fechar Fase 2 ou repriorizar itens deferred.

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
