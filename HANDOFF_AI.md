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
10. `docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`
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

> Atualizado em 2026-05-16 — PR `#254` mergeada em `main` no commit `922a403`.

- `services/geminiService.ts` segue como fachada publica com internals em `services/gemini/*`.
- `services/warRoomService.ts` segue como fachada publica com internals em `services/war-room/*`.
- `services/exportService.ts` criado na Sprint 9 com export/email logic extraida de App.tsx.
- `features/chat/*` e `features/dossier/*` concentram os fluxos extraidos de `App.tsx`.
- Leak `features/dossier/*` -> `features/chat/*` removido na Sprint 9; helpers compartilhados vivem em `utils/*`.
- Dependência circular `chatStore` -> `message-orchestrator` resolvida: `LastAction` movido para `types.ts`.
- `features/radar/*` existe como boundary oficial (stub); runtime atual ainda passa por `hooks/useRadar.ts` e `services/radarService.ts`.
- `types.ts` permanece centralizado (agora inclui `LastAction`).
- `hooks/useChat.ts` foi removido e protegido por `tests/architecture/useChatImportGuard.test.ts`.
- `VITE_PINECONE_*` no frontend é risco aceito pelo owner para app interno/fechado; reavaliar se o app virar externo.
- Docs RAG anti-alucinacao mergeado via PR `#253` (`df1ca1e`).

## Programa de refatoracao

- Fase 1 (Sprints 1-8): concluída em `main` (PR `#241`).
- Fase 2 (Sprints 9-12): em andamento.
  - Sprint 9: concluída e mergeada via PR `#254`.
  - Onda 0+1: cleanup base + primeira correção técnica.
  - Sprint 10: próxima sprint canônica, Radar boundary completion.

## Hotspots atuais da Fase 2

| Arquivo | Linhas/estado | Sprint alvo |
|---|---|---|
| `App.tsx` | 622 | Sprint 9 concluída |
| `hooks/useRadar.ts` + `services/radarService.ts` | runtime fora de `features/radar/*` | Sprint 10 |
| `components/CRMDetail.tsx` | 717 + `card: any` + sem testes dedicados | Sprint 11 |
| `components/LoadingSmart.tsx` | 766 | Sprint 11 |
| `components/WarRoom.tsx` | 552 + sem testes dedicados | Sprint 11 |
| `utils/idbStorage.ts` | warning de chunking/build | Sprint 12 |

## Entrega em curso: OI-066

- Branch: `codex/fix-delete-icon-unicode`
- Base: `origin/main@0550454`
- PR anterior: `#255`, merge commit `0550454`
- Plano: `docs/ai-context/refactor/10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`
- Escopo:
  - corrigir botão de excluir mensagem que renderizava `\uD83D\uDDD1\uFE0F` como texto cru em vermelho;
  - manter ação `handleDeleteWithUndo`;
  - garantir acessibilidade com `aria-label`;
  - adicionar teste focado em `tests/components/MessageRow.test.tsx`.
- Validação local:
  - `npm exec vitest run tests/components/MessageRow.test.tsx tests/components/chat/MessageTimeline.test.tsx` green (`18` testes);
  - `npm run typecheck` green;
  - `npm run build` green;
  - `npm run lint` green com `0` erros e warnings conhecidos;
  - `rg -F '\\uD83D\\uDDD1\\uFE0F' components tests` sem ocorrências.

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

1. Abrir PR do OI-066 e validar no preview que o botão de excluir mensagem mostra ícone de lixeira, não `\uD83D\uDDD1\uFE0F`.
2. Após merge do OI-066, abrir Sprint 10 a partir de `main` atualizado.

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
