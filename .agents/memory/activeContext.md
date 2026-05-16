# Active Context

Last updated: 2026-05-16

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current refactor phase

Fase 1 (Sprints 1-8) esta concluida em `main`.

- Sprint 8 mergeada via PR `#241` (`ccd2001518367961637b1a9488c2319aa83d0a21`)
- `services/war-room/*` ativo com fachada publica preservada em `services/warRoomService.ts`
- `features/radar/*` oficializado como boundary inicial (stub)

Fase 2 (manutenibilidade) foi aberta de forma documental:

- `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
- Sprint 9-12 definidas como trilha curta de reducao de acoplamento

## Current task context

Branch local atual: `refactor/sprint-9`, criada a partir de `origin/main` (`df1ca1e`) apos merge da PR `#253`.

Tag de rollback: `pre-sprint-9`.

Escopo desta passada:

- Implementar Sprint 9: App shell decoupling + governanca.
- Tratar Pinecone via `VITE_*` como risco aceito por app interno/fechado.
- Preservar fachadas publicas congeladas.
- Nao incluir `mcp-server/`.

Estado implementado:

- `App.tsx` reduzido para `622` linhas.
- Wiring de EmailModal/FollowUpModal extraido para `hooks/useEmailModal.ts` e `hooks/useFollowUpModal.ts`.
- Lógica de export/email movida para `services/exportService.ts`.
- Leak `features/dossier` → `features/chat` removido via helpers compartilhados em `utils/*`.
- `madge` e `ts-prune` adicionados; baseline atual: 1 ciclo (`stores/chatStore.tsx` > `features/chat/message-orchestrator.ts`).
- `utils/featureFlags.ts` criado com modelo `VITE_FF_*`, fallback e `removeBy`.

## Immediate next step

1. Abrir PR da branch `refactor/sprint-9`.
2. Mergear apos review se CI remoto repetir o verde local.
3. Depois do merge, abrir Sprint 10 (Radar boundary completion).

## Session note (2026-05-05)

- Ajustado `services/geminiProxy.ts` para sanitizar erros HTTP não-OK e evitar dump de HTML inteiro (ex.: Vercel Security Checkpoint 403).
- Mensagem agora normaliza para texto curto e acionável (`blocked by Vercel Security Checkpoint (HTTP 403)` / `unexpected HTML response from proxy`).
- Validação executada: `npm run typecheck` (green).
- Skills operacionais locais foram removidas de `.agents/skills/` e copiadas para o ambiente global do usuário em `~/.agents/skills/`.
- Materiais históricos e lições aprendidas em `.agents/skills/archive/` foram preservados no repo.
- Arquivos de handoff e versionamento foram mantidos e atualizados para refletir que não há skills locais ativas nem integração externa obrigatória.

## Session note (2026-05-16)

- PR antiga `#252` foi descartada sem merge.
- Reimplementada somente a parte segura de anti-alucinacao do Docs RAG.
- Validacao local executada: `npm exec vitest run tests/api-docs-rag.test.ts tests/services/ragService.test.ts`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run lint`.
- `npm run lint` passa com warnings conhecidos, sem erros.
- PR `#253` aberta, commit `df2f232`, CI remoto verde e `mergeStateStatus: CLEAN`.
- Validacao manual no Chrome autenticado/Vercel preview:
  - Preview: `https://scoutagro-git-codex-docs-rag-a3d156-brunolimaff-3629s-projects.vercel.app`
  - CNPJ `04.733.767/0001-80` validou como `SCHEFFER & CIA LTDA`, `Sapezal/MT`.
  - Fluxo real de dossie completou; gerou score `73/100`, `Cliente Senior confirmado`, grupo `GRUPO SCHEFFER`, `74` modulos.
