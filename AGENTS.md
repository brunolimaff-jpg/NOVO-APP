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
- Entregas grandes: implementar em fases, validar por fase (`validator`), e fechar com doc-handoff (`HANDOFF_AI.md`, `CALIBER_LEARNINGS.md`, Bruno Vault, `.agents/memory/*`) listando pendências para análise posterior.
- Auditoria externa ou review em lote: reconciliar achados com `origin/main` e PRs mergeadas recentes antes de implementar P0; evita retrabalho em branches superseded.
- Subagentes no modelo da sessão (Composer); não sugerir troca de modelo no chat.
- PR focada: escopo único na PR canônica existente; WIP amplo em branch/PR separada; validar pelo diff líquido contra `main` — não abrir PR paralela sem checar overlap.
- Responder cada thread de review com a tratativa antes de marcar resolvida (`gh-resolve-pr-comments`); GraphQL exige scope `AddPullRequestReviewComment` no token `gh`; REST reply a inline pode 404 — usar `scripts/resolve-pr-threads.py` ou renovar scope.
- Uso real é no preview Vercel: respostas de review e validação de UX devem citar comportamento no preview, não só localhost do CI.
- Validação visual/manual usa viewport desktop por padrão; mobile/375px só é obrigatório quando o escopo envolver responsividade ou o pedido citar mobile.
- Pipeline `/ship-loop` (`.agents/skills/ship-loop/SKILL.md`): plano → gates locais → PR → CI → PR Gate IA 16/16 no preview (`critical-ux` 11/11 + Onda 1 5/5); merge só com token **MERGE** na mensagem.
- Testing Trophy no CI: vitest + coverage bloqueiam merge; E2E critical-ux fica fora do blocking — specs no repo para agente ou `workflow_dispatch`.
- Bruno autoriza correção de hooks globais (ex. `checkpoint-proativo.sh`) quando bloqueiam `StrReplace`/edições — pedir ou usar liberação explícita antes de alterar.

## Learned Workspace Facts

- Travamento, painel branco ou spinner pós-waterfall em produção: priorizar `scout_diagnostics` e `operator_events`; Sentry costuma não capturar freeze de main thread nesse fluxo.
- LoadingSmart pós-waterfall: `health-check` no flush imediato pode registrar `overlay=true` com `domBodyLen` baixo (H-U3); critério de recuperação do overlay é evento `PostCompletion` em `scout_diagnostics`, não só o health-check.
- CNPJ no browser: `fetchCompanyByCnpj` via `/api/cnpj`; não usar `lib/cnpjLookup` com fetch direto à BrasilAPI no cliente (CORS no preview/prod Vercel).
- Contrato de loading/timeline/blank panel: `docs/ai-context/refactor/loading-panel-contract.md` (preview durante waterfall, static handoff, telemetria PostCompletion). Safety nets DOM (`App.tsx`, `finalizeWaterfallUI.ts`): não remover até 7 dias Cofre estável em produção + métricas `scout_diagnostics`; causa `display:none` permanece unknown (CALIBER T-A.1).
- Handoff e memória canônica: `HANDOFF_AI.md`, `.agents/memory/*` e `CALIBER_LEARNINGS.md` prevalecem sobre vault Obsidian para implementação; sessões grandes também registram lições no Bruno Vault.
- Branch com checkpoint WIP no histórico pode inflar a aba Files da PR no GitHub; o que entra em `main` é o diff líquido contra `main`, não a lista bruta de commits intermediários.
- Policy pós-auditoria §9 (fluxo dossiê): sem novo `useState` loading, sem `catch {}`, sem RAF sem cleanup; persist flush usa toast+retry+`scoutDiag` (DI-2026-06-19-02 Opção B, sem cache read-only).
- LiteLLM experimento: no preview Vercel, `VITE_LLM_*` deve espelhar `LLM_*`; `llm_experiment_runs` vazio = env/allowlist/email do operador inativos; produção permanece `LLM_PROVIDER=gemini` até ativação explícita.
- LiteLLM persistência: migration `20260620_llm_experiment.sql` aplicada no Supabase (`vmqfcaoirjcfucvlnpig`); escrita só via `api/llm-experiment.ts` (service role); RLS `deny_anon_all`.
- Vercel Hobby: limite 12 serverless functions — consolidar handlers em `api/`; `api/_llm-client.ts` usa fetch nativo (SDK `openai` removido do bundle serverless).
- E2E: `critical-ux` usa stubs Gemini; LiteLLM live = `tests-e2e/litellm-live-parallel.spec.ts` (timeout 150s default, 3 workers mais estável que 5); Scheffer/Cofre — helper inicia nova investigação com dossiê salvo, stop via "Interromper", breadcrumb parcial; CI E2E não blocking — gate = PR Gate IA no preview.
- PR #385 mergeada (Ondas 1–3 estabilização pós-auditoria); PR #386 `feat/litellm-experiment` — adapter LiteLLM com fallback Gemini pós-#385.
