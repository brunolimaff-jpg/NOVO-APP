# NOVO-APP (Senior Scout 360) — CLAUDE.md

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
9. **Trava de agentes**: NUNCA commitar, push ou merge enquanto planner/validator/reviewer estiverem rodando em background. Aguardar `<task-notification>` de conclusão de TODOS antes de qualquer ação de git. "Finaliza" não dispensa aguardar.
10. **Gate de validação obrigatório**: Antes de declarar qualquer tarefa de prompt concluída, rodar EM SEQUÊNCIA: (1) `npx tsc --noEmit` (2) `npx vitest run tests/prompts/ tests/features/dossier/waterfall-orchestrator.test.ts` (3) `./scripts/validate-preview.sh http://localhost:5173 04.733.767/0001-80` (4) Validar output no navegador com dossiê Scheffer. Se qualquer gate falhar, a tarefa NÃO está concluída.

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
- `docs/ai-context/refactor/` — programa de refatoração (Sprints 1-12)
- `docs/obsidian/00-MASTER.md` — navegação visual
