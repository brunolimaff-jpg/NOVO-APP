# NOVO-APP (Senior Scout 360) — CLAUDE.md

> **⚠️ ANTES DE QUALQUER AÇÃO:** executar Checkpoint 1 do `~/.claude/rules/copiloto-proativo.md` — MCPs, viabilidade, premissas, risco, lições. Se risco 🟠 ou 🔴, pedir confirmação. Não é sugestão — é barreira.

## Identidade

Senior Scout 360 — plataforma de inteligência comercial e sales intelligence para agronegócio. React 19 + TypeScript + Vite + Tailwind + Gemini + Pinecone.

## Stack

- **Frontend**: React 19, Vite 6, TypeScript 5, Tailwind CSS 3
- **AI**: Gemini API + Pinecone vector DB
- **Infra**: Vercel (SPA + serverless functions em `api/*.ts`), Firebase
- **Auth**: Local-only via `contexts/OperatorContext.tsx`
- **Testes**: 854 testes (Sprint 9), Vitest + Playwright

## Ao iniciar sessão

1. Leia `HANDOFF_AI.md` — handoff canônico
2. Leia `AGENTS.md` — protocolo principal
3. Leia `.agents/memory/activeContext.md` — contexto atual
4. Leia `.agents/memory/progress.md` — progresso

## Comandos essenciais

```bash
npm run dev        # Dev server Vite
npm run build      # Build de produção
npm test           # Testes (Vitest)
npm run typecheck  # Verificação de tipos
npm run lint       # ESLint
```

## Regras obrigatórias

1. **Fachadas públicas congeladas**: `geminiService.ts`, `warRoomService.ts`, `ChatInterface.tsx`, `constants.ts`, `megaPrompts.ts`, `types.ts` — não quebrar
2. **Nenhum `src/` directory** — código vive na raiz do projeto
3. **Prompts em `prompts/`** — nunca inline nos componentes
4. **Evitar `any`** — preferir tipos explícitos
5. **Evitar empty catches** em chamadas Gemini
6. **Search Grounding nunca cachear**
7. **Validar CNPJ antes de chamadas IA**
8. **Framework PORTA**: 5 dimensões (Porte, Operação, Retorno, Tecnologia, Adoção) — temp 0.1
9. **Trava de agentes**: NUNCA commitar, fazer push, merge, ou modificar estado do repositório enquanto houver agentes de planejamento (planner), validação (validator) ou revisão (reviewer) em execução. Sempre aguardar TODOS terminarem via `<task-notification>` e pedir confirmação explícita do usuário antes de qualquer ação de git. "Finaliza" não dispensa aguardar agentes.
10. **Trava de acúmulo de commits**: Máximo **7 commits** locais sem push/PR. Ao atingir 5, warning automático (`scripts/check-branch-health.sh`). Ao atingir 8, commit bloqueado. Abra PR cedo — PR pequeno = review rápido. Use `BRANCH_HEALTH_SKIP=1` apenas com justificativa documentada.
11. **Push diário obrigatório**: Ao final de cada sessão, commits devem estar pushados ou em PR aberta. Nunca encerrar sessão com +5 commits locais sem PR.
12. **Checkpoint de branch**: A cada 5 commits, rodar `git log main..HEAD --oneline` e verificar se já não é hora de abrir PR.
13. **Evidência de conclusão**: Antes de declarar fase/etapa/sprint como "concluída", cruzar git log + diff com escopo planejado. Para cada artefato prometido, confirmar existência com `ls`/`grep`. Gap → não declarar concluído. Ver protocolo em `~/.claude/rules/copiloto-proativo.md` 2.6 ou `.agents/rules/checkpoints.md`.
14. **Validação de base branch**: Antes de push, verificar `git merge-base` com a baseline esperada (ex: `stabilize/from-production-fe6c6f9`). Push na base errada = preview roda código velho. Se `merge-base` ≠ HEAD da baseline → 🟠 BLOQUEAR. Rebasear antes. Ver `~/.claude/rules/copiloto-proativo.md` 2.7 ou `.agents/rules/checkpoints.md`.

## Fluxo de branches

- Abrir branch nova para cada mudança fechável, partindo de `origin/main`.
- Usar prefixo por tipo: `feat/`, `fix/`, `docs/`, `refactor/`, `perf/`, `chore/` + descrição curta. Ex: `fix/cnpj-limit`.
- Não misturar objetivos diferentes na mesma PR.
- Correções de review da mesma PR continuam na mesma branch.
- Antes de abrir PR, conferir que a branch contém só os arquivos do escopo.

## Agent Dispatch

- Bug / erro → `debugger`
- Feature → `implementer`
- Review → `reviewer`
- Arquitetura → `ideator`
- Plano → `planner`
- Testes → `validator`

## Documentação complementar

- `CODEBASE_INDEX.md` (1749 linhas) — mapa completo do código
- `ARQUITETURA.md` — arquitetura em 10 seções
- `CALIBER_LEARNINGS.md` — padrões confirmados e anti-padrões
- `docs/SKILLS-GOVERNANCE.md` — governança de skills
- `docs/archive/refactor-program/` — programa de refatoração concluído (Sprints 1-11)
- `docs/obsidian/00-MASTER.md` — navegação visual
