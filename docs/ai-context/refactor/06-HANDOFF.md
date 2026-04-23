# Handoff Curto

## Current Phase

Planning. Sprints 1-8 estao `done` em `main`, com Sprint 8 mergeada via PR `#241`.
A nova trilha de manutenibilidade (Sprints 9-12) foi aberta de forma documental em
`08-PHASE2-MAINTAINABILITY-PLAN.md`.

## What Was Finished

- Fechamento efetivo da Sprint 8 em `main`:
  - `services/war-room/*` ativo com fachada publica preservada em `services/warRoomService.ts`
  - parser do War Room consolidado em `services/war-room/intent.ts`
  - `features/radar/*` criado como boundary oficial inicial
- Sync documental para baseline pos-Sprint 8:
  - board, open-items, handoff e sprint log atualizados
  - nova trilha (Fase 2) registrada no pacote canonico de refactor

## Next Safe Step

1. Abrir Sprint 9 com escopo fechado de App shell decoupling e governanca.
2. Preservar APIs publicas congeladas durante a fase.
3. Executar gates completos (`test`, `typecheck`, `build`, `lint`) antes de promover qualquer sprint.

## Files Most Relevant Now

- `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/07-SPRINT-LOG.md`
- `ARQUITETURA.md`
- `docs/ai-context/ARCHITECTURE_MAP.md`
- `docs/obsidian/roadmap/ROADMAP-Refactor-Track.md`

## Do Not Touch Yet

- Nao quebrar:
  - `services/geminiService.ts`
  - `services/warRoomService.ts`
  - `components/ChatInterface.tsx`
  - `constants.ts`
  - `prompts/megaPrompts.ts`
  - `types.ts`
- Nao incluir `mcp-server/` na trilha sem repriorizacao explicita.

## Validation History

### Sprint 8 (concluida e mergeada em 2026-04-23)

- focused suites de War Room/Radar: green
- `npm run test`: green (`102` arquivos, `785` testes)
- `npm run typecheck`: green
- `npm run build`: green (com warning aceito de chunking em `utils/idbStorage.ts`)
- `npm run lint`: green (`0` erros, warnings em backlog)
- validacao manual em preview/Vercel: aceita

### Sprint 7 e anteriores

- Sprint 7: concluida e mergeada (`#239` + closeout `#240`)
- Sprint 6: concluida e mergeada (`#236`)
- Sprint 5: concluida e mergeada (`#229`) com validacao manual aceita
- Sprint 4: concluida e mergeada (`#227` + `#228`)
- Sprint 3: concluida e validada (PRs `#216`-`#222`)

## Suggested Prompt For Next AI

Leia `docs/ai-context/refactor/00-README.md`, depois `01-MASTER-PLAN.md`,
`08-PHASE2-MAINTAINABILITY-PLAN.md`, `02-BOARD.md`, `03-OPEN-ITEMS.md` e
`07-SPRINT-LOG.md`. Considere a Fase 1 (Sprints 1-8) encerrada em `main`.
Inicie a Sprint 9 sem quebrar as fachadas publicas congeladas e sem puxar
`mcp-server/` para o escopo.
