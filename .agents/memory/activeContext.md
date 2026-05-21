# Active Context

Last updated: 2026-05-21

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/ai-context/refactor/02-BOARD.md`
7. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current refactor phase

**Fase 2 (Manutenibilidade) CONCLUÍDA.**

- Fase 1 (Sprints 1-8): concluída.
- Fase 2 (Sprints 9-12): concluída em `2026-05-20`.
- Commit final: `0694997` em `main`.
- Validação manual em Vercel aceita pelo owner.
- Gates finais verdes: `test` (117 arq, 834 testes), `typecheck`, `build`, `lint --quiet`, `analyze:circular`.

## Current task context

**Inline follow-up do chat principal refatorado em `main` (2026-05-21).**
- Follow-ups apos a primeira pesquisa agora entram em modo cirurgico via `GeminiRequestOptions.isFollowUp`.
- `features/chat/message-orchestrator.ts` marca follow-up real para o Gemini.
- `services/gemini/runtime.ts` compacta historico de follow-up em pares alternados `user/model`, preservando a pesquisa inicial como contexto ancora e reduzindo custo.
- `services/gemini/investigation-orchestration.ts` adiciona instrucao de resposta curta para follow-up normal, nao reexecuta dossie/modulo e reaproveita dados Senior do historico quando disponivel.
- Deep Dive segue feature-flagado/desligado por padrão; esta refatoracao nao reativa nem redesenha o fluxo legado.
- Validacoes: `npm exec vitest run tests/features/chat/message-orchestrator.test.ts tests/services/geminiService.test.ts` green (`44` testes); `npm run typecheck` green.
- Risco residual: historico compactado pode omitir detalhe antigo; nesse caso a IA deve perguntar ao usuario em vez de inferir.

**Perguntas de acompanhamento com fallback contextual corrigidas em `codex/chat-inline-followup-refactor` (2026-05-21).**
- `utils/continuitySuggestions.ts` centraliza normalizacao, deduplicacao e fallback contextual por sinais do dossie/resposta.
- `features/chat/message-orchestrator.ts` e `features/dossier/waterfall-orchestrator.ts` passam o texto real da resposta/dossie para completar sugestoes.
- Botao "Novas" usa a mensagem alvo como contexto recente e evita repetir sugestoes antigas.
- Validacoes: `npm exec vitest run tests/services/geminiService.test.ts tests/features/dossier/waterfall-orchestrator.test.ts tests/features/dossier/porta-reconciliation.test.ts` green (`51` testes); `npm run typecheck` green; `npm run lint -- --quiet` green.
- Risco residual: fallback ainda e heuristico quando a IA falha, mas agora fica ancorado em temas detectados e bloqueia o conjunto legado ruim.
- Ajuste posterior na PR `#268`: sugestoes agora devem soar como pergunta de vendedor e falar de negocio; filtro bloqueia jargao tecnico como `GATec`, `CAPEX`, `ERP`, arquitetura, nativamente, modulos Senior e nome do vendedor. Validacoes: recorte de sugestoes/dossie green (`54` testes), `typecheck` green e `lint --quiet` green.

**UX Redesign Phase 1 em progresso.**
- PR `#266` aberta em `ux/redesign-phase1-v1`.
- Branch: `ux/redesign-phase1-v1`, commit `d84b643`.
- AdminDash removido, breadcrumb, sidebar melhorada, indicadores de status no MessageRow, feedback CNPJ estilizado.
- Gates verdes: `test` (116 arq, 824 testes), `typecheck`, `lint`.
- Aguardando validação do owner no preview Vercel antes do merge.

Próximos passos possíveis:
- Mergear PR `#266` após validação.
- Sprints 13–16: Modularização de Prompts (pré-requisito: golden test baseline já criado).
- Sprints 21–24: Observability & Monitoring.
- Design System (17-20) descartado: app interno, custo/benefício não justifica.
- Repriorizar `mcp-server/` e itens deferred.

## Workspace note

`CODE.md` é instrução local para Codex e está ignorado via `.git/info/exclude`.

## Immediate next step

1. Quando houver demanda, planejar Fase 3.
2. Repriorizar itens deferred.
