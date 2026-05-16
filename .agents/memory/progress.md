# Progress

Last updated: 2026-05-16

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

## In progress

- OI-066 hotfix na branch `codex/fix-delete-icon-unicode`.
- Objetivo:
  - corrigir botão de excluir mensagem que renderizava `\uD83D\uDDD1\uFE0F` como texto cru em vermelho;
  - preservar tooltip/ação de excluir;
  - adicionar teste DOM focado para impedir regressão.

## Blockers

- Nenhum bloqueio técnico imediato.
- O workspace principal original tinha mudanças não commitadas em `refactor/code-quality`; a Onda 0+1 roda em worktree limpa para não misturar isso.

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

## Important refs

- `HANDOFF_AI.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/06-HANDOFF.md`
- `docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`

## Next checkpoint

- Abrir PR do OI-066 e validar preview no Chrome.
- Após merge do OI-066, iniciar Sprint 10: Radar boundary completion.
