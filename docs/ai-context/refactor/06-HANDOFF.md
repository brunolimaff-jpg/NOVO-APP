# Handoff Curto

## Current Phase

Pre-execucao. O pacote de documentacao do programa de refatoracao ja foi criado.
Sprint 1 ainda nao comecou.

## What Was Finished

- Fonte canonica de documentacao criada em `docs/ai-context/refactor/`
- Roadmap de 8 sprints definido
- Board inicial preenchido
- Baseline e warnings conhecidos registrados
- Ponteiros em `HANDOFF_AI.md` e `PLAN.md` atualizados

## What Is In Progress

- Nada em execucao no codigo da refatoracao

## Next Safe Step

Iniciar Sprint 1:

1. Confirmar que nenhum novo consumidor de producao usa `hooks/useChat.ts`
2. Documentar fronteiras reais de `App.tsx`, `services/geminiService.ts` e `components/ChatInterface.tsx`
3. Registrar no board que Sprint 1 mudou de `planned` para `active`

## Files Most Relevant Now

- `docs/ai-context/refactor/01-MASTER-PLAN.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `App.tsx`
- `services/geminiService.ts`
- `hooks/useChat.ts`

## Do Not Touch Yet

- Nao quebrar `services/apiConfig.ts` por dominio
- Nao dividir `types.ts` sem gatilho real
- Nao remover facades futuras no mesmo sprint em que os submodulos nascerem

## Validation Last Run

- `npm run test`: green
- `npm run typecheck`: green
- `npm run build`: green

## Suggested Prompt For Next AI

Leia `docs/ai-context/refactor/00-README.md`, depois `01-MASTER-PLAN.md`,
`02-BOARD.md`, `03-OPEN-ITEMS.md` e `05-VALIDATION.md`. Em seguida, execute
somente o Sprint 1, atualize o board, registre warnings novos e deixe o proximo
passo seguro em `06-HANDOFF.md`.
