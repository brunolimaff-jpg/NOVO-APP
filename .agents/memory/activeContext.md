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

Branch local atual: `codex/docs-rag-anti-hallucination`, criada a partir de `origin/main` (`b2c67db`).

Escopo desta passada:

- PR pequena de anti-alucinacao para `api/docs-rag.ts`.
- Sem extractor server-side de URL/PDF.
- Sem lazy-loading de prompts.
- Sem refactor amplo de fachadas publicas.
- Ajuste minimo adicional em `utils/webVerification.ts` para remover um erro de lint preexistente (`no-useless-assignment`) e permitir gate verde.

Estado implementado:

- `api/docs-rag.ts` agora usa corte `0.60` para Docs RAG.
- Quando nao ha matches fortes/textuais, retorna sinal explicito:
  `[SEM DOCUMENTAÇÃO ENCONTRADA — NÃO complete com suposições. Informe que não há dados verificados disponíveis.]`
- Matches fortes sem `metadata.text`/`metadata.content` nao viram evidencia textual.
- `tests/api-docs-rag.test.ts` cobre GET, body invalido, matches vazios, score baixo, match textual, match URL-only, mix textual+URL-only e namespace invalido.

## Immediate next step

1. Abrir PR da branch `codex/docs-rag-anti-hallucination`.
2. Validar no preview/Vercel um fluxo real de dossie com Docs RAG ausente e com Docs RAG textual.
3. Depois do merge, seguir para a proxima PR pequena: remover `VITE_PINECONE_API_KEY` do frontend ou modelar extractor seguro com protecao SSRF.

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
