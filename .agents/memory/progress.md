# Progress

Last updated: 2026-05-19

## Completed

- Sprints 1-8 concluídas e mergeadas em `main`.
- Sprint 8 mergeada via PR `#241`.
- PR `#253` Docs RAG anti-alucinação mergeada em `2026-05-16`:
  - merge commit `df1ca1e`
  - validação local/remota documentada
  - validação manual em Vercel preview com CNPJ `04.733.767/0001-80`
- Sprint 9 mergeada via PR `#254` em `2026-05-16`:
  - head da branch: `19485dc`
  - merge commit: `922a403`
  - `App.tsx` reduzido para `622` linhas
  - wiring de EmailModal/FollowUpModal extraído para hooks
  - export/email movido para `services/exportService.ts`
  - leak `features/dossier` -> `features/chat` removido
  - dependência circular `chatStore` -> `message-orchestrator` resolvida
  - `madge`/`ts-prune` adicionados
  - `utils/featureFlags.ts` criado
  - OI-055 Pinecone via `VITE_*` registrado como risco aceito
- Onda 0+1 mergeada via PR `#255` em `2026-05-16`:
  - merge commit `0550454`
  - docs/memória pós-Sprint 9 sincronizados
  - PORTA partial integrity hold corrigido
  - logs cliente sensíveis migrados para `scoutDiag`
  - `/api/open-web-search` corrigido para não quebrar no runtime Vercel por import ESM sem `.js`
  - review comments do Gemini Code Assist resolvidos
- OI-066 mergeado via PR `#256` em `2026-05-16`:
  - merge commit `66591f1`
  - `components/MessageRow.tsx` deixou de renderizar `\uD83D\uDDD1\uFE0F` como texto cru
  - ícone de excluir preserva `aria-label` e teste focado
- Sprint 10 mergeada via PR `#257` em `2026-05-16`:
  - merge commit `fbf5536`
  - runtime do Radar movido para `features/radar/useRadar.ts` e `features/radar/service.ts`
  - facades `hooks/useRadar.ts` e `services/radarService.ts` preservadas para compatibilidade
  - guardrail `tests/architecture/radarBoundaryImportGuard.test.ts` ativo
  - checks remotos verdes antes do merge

## In progress

- Sprint 11 Onda 1B na branch/workspace `codex/sprint-11-onda-0-5-mini-crm-local-fixes`.
- Objetivo:
  - reduzir `LoadingSmart` incrementalmente sem mudar a fachada pública;
  - manter `components/LoadingSmart.tsx` como default export;
  - isolar lógica de timeline/progresso em helper testável;
  - deixar `WarRoom` para PR separado.

## Blockers

- Nenhum bloqueio técnico imediato.
- `CODE.md` está não rastreado no workspace atual; preservar sem alteração.

## Validation history

### Sprint 9 (done, merged)

- `npm run test`: green (`114` arquivos, `854` testes)
- `npm run typecheck`: green
- `npm run build`: green (warning aceito de chunking em `utils/idbStorage.ts`)
- `npm run lint`: green com warnings conhecidos (`0` erros, `160` warnings)
- `npm run analyze:circular`: 1 ciclo existente antes do fix, depois resolvido no review da PR
- Playwright local em `http://127.0.0.1:3000/`: tela inicial e home principal carregaram sem `console.error`/`pageerror`

### Onda 0+1

- `npm exec vitest run tests/features/dossier/porta-reconciliation.test.ts tests/features/dossier/waterfall-orchestrator.test.ts` green (`15` testes)
- `npm exec vitest run tests/services/clientLookupService.test.ts tests/extraction.test.ts` green (`20` testes)
- `npm exec vitest run tests/api-open-web-search.test.ts tests/services/investigation-orchestration.test.ts tests/services/geminiProxy.test.ts tests/extraction.test.ts` green (`16` testes)
- `npm exec vitest run tests/services/clientLookupService.test.ts tests/extraction.test.ts tests/api-open-web-search.test.ts` green (`27` testes) após resolver os review comments
- `npm run typecheck` green
- `npm run test` green (`114` arquivos, `846` testes)
- `npm run build` green (warnings aceitos OI-003/OI-057)
- `npm run lint` green com `0` erros e `150` warnings conhecidos
- `npm run analyze:circular` green, sem ciclos
- `vercel build --yes` green para confirmar empacotamento serverless.
- Smoke Vercel protegido com bypass de automação:
  - `POST /api/open-web-search` com query real: `200`, `OpenWebSearch/Brave`, `degraded: false`, `5` fontes;
  - `POST /api/open-web-search` com apenas `url`: `200`, `OpenWebSearch/URL`;
  - `POST /api/open-web-search` com `{}`: `400`, esperado;
- `vercel logs --status-code 500 --since 15m`: sem ocorrências após o fix.

### OI-066

- `npm exec vitest run tests/components/MessageRow.test.tsx tests/components/chat/MessageTimeline.test.tsx` green (`18` testes)
- `npm run typecheck` green
- `npm run build` green (warnings aceitos OI-003/OI-057)
- `npm run lint` green com `0` erros e `147` warnings conhecidos
- `rg -F '\\uD83D\\uDDD1\\uFE0F' components tests` sem ocorrências

### Sprint 10

- `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`40` testes)
- Review comments do Gemini Code Assist resolvidos (`forceScan` manual com auto-scan desligado + `scoutDiag.error` em falha de scan)
- `npm exec vitest run tests/hooks/useRadar.test.ts tests/services/radarService.test.ts tests/architecture/radarBoundaryImportGuard.test.ts` green (`35` testes)
- `npm exec vitest run tests/components/chat/ChatPanels.test.tsx tests/components/EmptyStateHome.test.tsx` green (`11` testes)
- `npm exec vitest run tests/App.layout.test.tsx tests/App.loadingVariant.test.tsx` green (`7` testes)
- `npm run typecheck` green
- `npm run test` green (`115` arquivos, `851` testes)
- `npm run build` green (warnings aceitos OI-003/OI-057)
- `npm run lint` green com `0` erros e `147` warnings conhecidos
- `npm run analyze:circular` green, sem ciclos
- Checks remotos da PR `#257` green: AI Config Quality Score, Typecheck, Build, Tests, Dossier Golden, GitGuardian, Vercel, Vercel Preview Comments

### Sprint 11 Onda 0

- Baseline inicial `npm run test` green (`115` arquivos, `851` testes) em `origin/main@fbf5536`.
- `npm exec vitest run tests/components/CRMDetail.test.tsx tests/components/WarRoom.test.tsx` green (`18` testes).
- `npx vitest run --coverage tests/components/CRMDetail.test.tsx tests/components/WarRoom.test.tsx` green:
  - `CRMDetail.tsx`: `92.35%` linhas
  - `WarRoom.tsx`: `74.21%` linhas
- `npm run typecheck` green.
- `npm run test` green (`117` arquivos, `869` testes).
- `npm run build` green (warnings aceitos OI-003/OI-057).
- `npm run lint` green com `0` erros e `147` warnings conhecidos.


### Sprint 11 Onda 0.5

- Mini CRM local removido do runtime/contratos/tipos/testes dedicados.
- `config/localDevApiProxy.ts` criado para centralizar proxies Vite de rotas serverless; `/api/open-web-search` incluído.
- `tests/config/localDevApiProxy.test.ts` criado como guardrail.
- `npm run typecheck` green.
- `npm exec vitest run tests/components/LoadingSmart.test.tsx tests/services/geminiProxy.test.ts tests/config/localDevApiProxy.test.ts tests/components/ChatInterface.test.tsx tests/components/SessionsSidebar.test.tsx tests/components/FeatureGatingUI.test.tsx tests/App.layout.test.tsx` green (`43` testes).
- `npm run test` green (`115` arquivos, `820` testes).
- `npm run build` green, com warnings aceitos de chunking (`utils/idbStorage.ts` e chunks grandes).
- `npm run lint` green com `0` erros e `141` warnings conhecidos.
- `npm run analyze:circular` green, sem ciclos.
- Smoke local: `POST /api/open-web-search` em `localhost:3000` retornou `200` com `OpenWebSearch/Brave`; `POST /api/gemini` retornou HTTP `200`, mas health remoto veio `ok:false` e deve ser acompanhado separadamente se persistir.
- Warning conhecido de `SessionsSidebar.test.tsx` sobre render-prop de `ConfirmPopover` permanece como OI-004.

### Sprint 11 Onda 1A

- Saneamento documental feito para evitar duplicação de planos vivos.
- Alvos: `HANDOFF_AI.md`, `.agents/memory/*`, `docs/ai-context/refactor/02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `sprints/00-INDEX.md`, `sprints/SPRINT-11-EXECUTION.md` e roadmap Obsidian.
- Critério: termos do Mini CRM só podem aparecer como histórico/removido, nunca como próximo trabalho.
- `npm run docs:obsidian:check` green (`14` notas).

### Sprint 11 Onda 1B

- `utils/loadingSmartViewModel.ts` criado para extrair timeline/progresso de `components/LoadingSmart.tsx`.
- `tests/utils/loadingSmartViewModel.test.ts` criado com cobertura de roadmap modular, roadmap de investigação, suavização de progresso com fila pendente, fallback incremental e normalização de labels equivalentes.
- `components/LoadingSmart.tsx` reduzido de `766` para `672` linhas e continua como fachada/default export.
- `npm exec vitest run tests/utils/loadingSmartViewModel.test.ts tests/components/LoadingSmart.test.tsx tests/App.loadingVariant.test.tsx` green (`18` testes).
- `npm exec vitest run tests/utils/loadingSmartViewModel.test.ts tests/components/LoadingSmart.test.tsx` green (`13` testes) após ajuste de nome de teste.
- `npm run typecheck` green.

## Important refs

- `HANDOFF_AI.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/06-HANDOFF.md`
- `docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`

## Next checkpoint

- Completar Onda 1B com extração do hook de curiosidades/timers ou fechar a fatia atual como PR curto.
- Depois seguir para Onda 1C `WarRoom`, em PR separado.
- Não reintroduzir Mini CRM/`CRMDetail`.
