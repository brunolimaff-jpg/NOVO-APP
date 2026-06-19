# AGENTS.md

## Overview

Senior Scout 360 is a React 19 + TypeScript + Vite web app for commercial intelligence in agribusiness.

## Repo layout

- `App.tsx` is the main app orchestrator.
- `components/`, `contexts/`, `hooks/`, `services/`, `prompts/`, `utils/`, `api/`, and `tests/` live at the repo root.
- Do not assume a `src/` directory for application code in this repository.
- `services/geminiService.ts` is the stable public AI façade; internal orchestration modules live under `services/gemini/`.
- `hooks/useChat.ts` is legacy and must not gain new production consumers.

## Persistent memory protocol

Repo-local memory is the canonical cross-session handoff for agents in this project.

## Central Obsidian library

This project is indexed by Bruno's central Obsidian library:

`~/Documents/Senior IA/docs/obsidian`

- Project card: `docs/PROJECT-CARD.md`
- Central project note: `~/Documents/Senior IA/docs/obsidian/Projects/NOVO-APP.md`
- Ingestion contract: `~/Documents/Senior IA/docs/obsidian/Library/contrato-ingestao-multi-ia.md`

Codex, Claude Code, DeepSeek, Z.ai, and other agents must keep this repo's canonical sources current. The central library may index this repo, but it does not override `HANDOFF_AI.md`, `.agents/memory/*`, or refactor docs.

- At the start of every session, read `.agents/memory/activeContext.md` and `.agents/memory/progress.md` before diagnosing, planning, or editing.
- Treat `.agents/memory/decisions.md` as durable project context for decisions that should survive beyond the current sprint.
- Use `HANDOFF_AI.md` as the canonical quick-entry handoff, then follow any source-of-truth docs it references.
- Use `docs/obsidian/00-MASTER.md` as the visual navigation layer for architecture + roadmap after reading the canonical handoff sources above. Do not treat it as a higher-priority source than `HANDOFF_AI.md`, `.agents/memory/*`, or `docs/ai-context/refactor/*`.
- Before planning implementation work, use `plan-work` when available in the global environment.
- At task close, update memory with what changed, what validation ran, residual risks, and the immediate next step.
- Do not treat root `PLAN.md` as canonical unless one of the memory files or handoff docs explicitly references it.

## Useful commands

```bash
npm run dev
npm run build
npm run test
npm run typecheck
npm run lint
```

## Known constraints

- Vercel serverless handlers live in `api/*.ts`.
- Vercel is the real runtime environment for production validation; local `npm run dev` is only a frontend convenience and does not emulate all production serverless behavior.
- Auth in this repo is local-only via `contexts/OperatorContext.tsx`; Clerk is not active in runtime.
- No standard external AI integration is required for this repo.
- Skill governance for this repo lives in `docs/SKILLS-GOVERNANCE.md`.
- Do not assume any specific global skill set is available or required.

## Working rules

- Read the current code before editing.
- Keep prompts in `prompts/`.
- Keep secrets out of frontend code.
- Avoid empty catches.
- Prefer typed solutions over `any`.
- Do not revert unrelated local changes.
- **Merge guard**: NEVER run `gh pr merge` or any PR merge/squash/auto-merge unless the user's message contains the word **MERGE** (case-insensitive). Push branch and open/edit PR are allowed without it. When uncertain, ask: "Confirma com MERGE se quiser mergear."

## Learned User Preferences

- Comunicação com o Bruno em pt-BR (chat, PRs e handoff).
- Investigar causa raiz com evidência (código + telemetria ordenada) antes de corrigir; evitar planos só com hipóteses soltas, mitigação de sintoma sem contrato, ou watchdog sem fechar a cadeia causal.
- Cruzar relato com Supabase (`operator_events`, `scout_diagnostics`, `user_context`) e, em regressões de loading/overlay em produção, também Sentry e logs Vercel; não fechar diagnóstico só com snapshot instantâneo de health-check.
- Entregas grandes: implementar em fases, validar por fase (`validator`), e fechar com handoff listando pendências para análise posterior.
- Subagentes no modelo da sessão (Composer); não sugerir troca de modelo no chat.
- PR focada: não misturar WIP local amplo (checkpoint em branch) com escopo da PR; tratar WIP em branch/PR separada e validar merge pelo diff líquido contra `main`.
- Trabalho relacionado ao escopo aberto deve consolidar na PR canônica existente; não abrir PR paralela sem checar overlap de escopo.
- Responder cada thread de review de PR com a tratativa aplicada antes de marcar como resolvida (fluxo `gh-resolve-pr-comments`); não deixar comentários abertos sem resposta.
- Uso real é no preview Vercel: respostas de review e validação de UX devem citar comportamento no preview, não só localhost do CI.
- Merge de PR com E2E exige Playwright verde no preview Vercel de deploy; CI E2E em localhost/Docker não substitui essa validação.
- E2E no CI: manter gate enxuto (Testing Trophy) — poucos fluxos críticos de UX (painel, cofre, Scheffer); evitar inflar specs, jobs ou timeouts além do necessário.

## Learned Workspace Facts

- Travamento, painel branco ou spinner pós-waterfall em produção: priorizar `scout_diagnostics` e `operator_events`; Sentry costuma não capturar freeze de main thread nesse fluxo.
- LoadingSmart pós-waterfall: `health-check` no flush imediato pode registrar `overlay=true` com `domBodyLen` baixo (H-U3); critério de recuperação do overlay é evento `PostCompletion` em `scout_diagnostics`, não só o health-check.
- CNPJ no browser: `fetchCompanyByCnpj` via `/api/cnpj`; não usar `lib/cnpjLookup` com fetch direto à BrasilAPI no cliente (CORS no preview/prod Vercel).
- Contrato de loading/timeline/blank panel: `docs/ai-context/refactor/loading-panel-contract.md` (preview durante waterfall, static handoff, telemetria PostCompletion).
- Preview Vercel é gate obrigatório para regressões de UX, rede e performance; testes unitários e E2E localhost não substituem Playwright no preview de deploy.
- Handoff e memória canônica: `HANDOFF_AI.md` e `.agents/memory/*` prevalecem sobre vault Obsidian para implementação.
- Branch com checkpoint WIP no histórico pode inflar a aba Files da PR no GitHub; o que entra em `main` é o diff líquido contra `main`, não a lista bruta de commits intermediários.
- CI E2E Playwright: usar container Docker `mcr.microsoft.com/playwright:v1.59.1-noble` (browsers pré-instalados); `microsoft/playwright-github-action@v1` quebra no Ubuntu 24.04 com `Cannot install dependencies for this linux distribution`.
- Job CI `E2E Critical UX (painel, cofre, Scheffer)` com project Playwright `critical-ux`; substitui labels genéricos tipo "E2E P0".
- E2E Scheffer/Cofre: helper de onboarding deve iniciar nova investigação quando houver dossiê salvo (modal "Dossiê existente"); evita falha por estado duplicado no Supabase.
