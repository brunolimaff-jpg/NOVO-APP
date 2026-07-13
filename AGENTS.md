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

- At the start of every session, read `.agents/memory/activeContext.md` and `.agents/memory/progress.md` before diagnosing, planning, or editing.
- Treat `.agents/memory/decisions.md` as durable project context.
- Use `HANDOFF_AI.md` as the canonical quick-entry handoff.
- The central Obsidian library may index this repo, but it does not override `HANDOFF_AI.md`, `.agents/memory/*`, or refactor docs.
- At task close, update memory with what changed, what validation ran, residual risks, and the immediate next step.

## Useful commands

```bash
npm run dev
npm run build
npm run test
npm run typecheck
npm run lint
```

## Known constraints

- Vercel serverless handlers live in `api/*.ts`. Local `npm run dev` does not emulate all production serverless behavior.
- Auth is local-only via `contexts/OperatorContext.tsx`.
- Skill governance: `docs/SKILLS-GOVERNANCE.md` and `.agents/skills/`.
- Canonical roles: `.agents/papeis/`; adapters: `.agents/adaptadores/`; communication contract: `.agents/governanca/contrato-comunicacao-bruno.md`.
- Orchestration (Fase 3A, concluída): `.agents/orquestracao/` — planner dry-run, 57 testes (`scripts/test-agent-orchestration.rb`).
- Execution control (Fase 3B.1, concluída): `.agents/orquestracao/executor/` — catálogo fixo, 54 testes (`scripts/test-agent-execution.rb`).
- Skills Governance: 32 testes (`scripts/test-validate-skills-governance.rb`).
- Codex harness policy (Fase 3B.1.5): `scripts/validate-codex-harness-policy.rb` + benchmark `docs/benchmarks/codex-harness-5.6.md`.
- Multi-Agent V2 do Codex **não** é tratado como roteador confiável até prova de runtime (`codex exec`/CLI). Desktop e tool-backed permanecem experimentais.
- Fronteira de autorização: Cartão de Missão + executor controlado — não depende exclusivamente de `.codex/agents/*.toml`.

## Orçamento de subagentes

- Não criar subagentes por padrão.
- Subagentes exigem solicitação explícita, Cartão de Missão ou plano aprovado.
- Máximo operacional padrão: 2 filhos por missão.
- Máximo de 1 agente com escrita ativo por vez.
- Filhos não podem criar outros filhos.
- Use o menor contexto necessário.
- Não propague o histórico completo sem necessidade explícita.
- Não use Ultra, Max ou Fast por padrão.
- Não espere CI, review bots ou MCPs em loops prolongados.
- Execute uma onda de revisão e no máximo uma rodada corretiva.
- Alterações exclusivamente documentais não reiniciam toda a cadeia de revisão.
- Modelo, reasoning, papel e sandbox do filho precisam ser confirmados no runtime.
- Falha em confirmar roteamento deve ser registrada como limitação do harness.

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
- Investigar causa raiz com evidência antes de corrigir.
- Cruzar relato com Supabase (`operator_events`, `scout_diagnostics`) e, em regressões de loading, também Sentry/Vercel.
- Entregas grandes: fases + validação por fase; handoff com pendências.
- PR focada: não misturar WIP amplo com o escopo da PR.

## Learned Workspace Facts

- Freeze/blank pós-waterfall: priorizar `scout_diagnostics` e `operator_events`.
- CNPJ no browser: `fetchCompanyByCnpj` via `/api/cnpj` (não BrasilAPI direto no cliente).
- Preview Vercel é gate obrigatório para regressões de UX/rede/performance.
- Handoff canônico: `HANDOFF_AI.md` e `.agents/memory/*`.
