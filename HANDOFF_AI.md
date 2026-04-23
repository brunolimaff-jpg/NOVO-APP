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
10. `docs/ai-context/refactor/03-OPEN-ITEMS.md`
11. `docs/ai-context/refactor/06-HANDOFF.md`
12. `docs/obsidian/00-MASTER.md` para navegacao visual (nao substitui as fontes canonicas acima)

## Contexto minimo estavel

- Projeto: **Senior Scout 360**
- Stack: React 19 + TypeScript + Vite + Tailwind + Gemini + Pinecone
- Auth: local-only via `contexts/OperatorContext.tsx`
- Runtime real para validacao manual: Vercel
- Integracao externa padrao de IA: `GitHub`

## Estado arquitetural (baseline atual)

- `services/geminiService.ts` segue como fachada publica com internals em `services/gemini/*`.
- `services/warRoomService.ts` segue como fachada publica com internals em `services/war-room/*`.
- `features/chat/*` e `features/dossier/*` concentram os fluxos extraidos de `App.tsx`.
- `features/radar/*` existe como boundary oficial (stub); runtime atual ainda passa por `hooks/useRadar.ts` e `services/radarService.ts`.
- `types.ts` permanece centralizado.
- `hooks/useChat.ts` foi removido e protegido por `tests/architecture/useChatImportGuard.test.ts`.

## Programa de refatoracao

- Fase 1 (Sprints 1-8): concluida em `main`.
- Fechamento da Sprint 8: PR `#241` mergeada em `origin/main` (`ccd2001518367961637b1a9488c2319aa83d0a21`).
- Fase 2 (Sprints 9-12): aberta como trilha de manutenibilidade em
  `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`.

## Hotspots atuais da Fase 2

- `App.tsx` (`724` linhas, `44` imports)
- `components/CRMDetail.tsx` (`664`)
- `components/LoadingSmart.tsx` (`704`)
- `components/WarRoom.tsx` (`513`)
- Radar runtime fora de `features/radar/*` (`hooks/useRadar.ts` + `services/radarService.ts`)

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
