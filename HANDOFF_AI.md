# Handoff Tecnico - Fonte Canonica

Para continuidade entre IAs neste repositorio, leia primeiro:

1. `docs/ai-context/refactor/00-README.md`
2. `docs/ai-context/refactor/01-MASTER-PLAN.md`
3. `docs/ai-context/refactor/02-BOARD.md`
4. `docs/ai-context/refactor/03-OPEN-ITEMS.md`
5. `docs/SKILLS-GOVERNANCE.md`
6. `docs/ai-context/refactor/06-HANDOFF.md`

## Contexto Minimo Estavel

- Projeto: **Senior Scout 360**
- Stack principal: React 19 + TypeScript + Vite + Tailwind + Clerk + Gemini + Pinecone
- Integracao externa padrao para IA: `GitHub`
- Entrypoints principais:
  - `index.tsx`
  - `App.tsx`
  - `components/ChatInterface.tsx`
  - `services/geminiService.ts`
- Scripts principais:
  - `npm run dev`
  - `npm run test`
  - `npm run typecheck`
  - `npm run build`

## Regra de Continuidade

Nao confie em contexto de chat antigo, paths locais antigos ou working trees descritos
fora do repositorio. O estado atual do programa de refatoracao vive em
`docs/ai-context/refactor/02-BOARD.md`.

O estado atual do ambiente de skills e integracoes vive em
`docs/SKILLS-GOVERNANCE.md`.
