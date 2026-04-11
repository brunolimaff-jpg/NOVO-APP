# Refactor Board

## Program Status

| Campo | Valor |
|---|---|
| Source of truth commit | `origin/main` -> `3c1412e3b19905abc843ceae36ba5399355f8d63` |
| Working branch | `codex/centralize-ai-model-config` |
| Last updated | `2026-04-11` |
| Current phase | `pre-execution` |
| Current sprint | `none` |
| Overall status | `active` |
| Current baseline | `test/typecheck/build green` |

## Current Focus

- Bootstrapar a documentacao canonica do programa de refatoracao
- Registrar baseline atual e warnings aceitos
- Deixar proximo passo seguro claramente definido para qualquer IA

## Next Up

1. Iniciar Sprint 1
2. Congelar fronteiras de `App.tsx`, `services/geminiService.ts` e `hooks/useChat.ts`
3. Garantir que nenhuma nova mudanca de produto aumente o acoplamento desses hotspots

## Blocked

- Nenhum bloqueio tecnico atual

## Validation Pending

- Nenhuma validacao de sprint pendente; baseline inicial ja registrado

## Known Accepted Warnings

- Testes de `useUpdateNotification` usam `fetch('/version.json')` e geram warning em ambiente de teste
- Testes de `App` emitem warning de `act(...)`
- Build emite warning de chunking envolvendo `utils/idbStorage.ts`

## Sprint Tracker

| Sprint | Goal | Status | Exit Criteria | Rollback Point | Primary Files/Modules |
|---|---|---|---|---|---|
| 1 | Baseline e fronteiras | planned | Nenhum novo consumidor de legado; fronteiras documentadas | `origin/main@3c1412e` | `App.tsx`, `hooks/useChat.ts`, `HANDOFF_AI.md` |
| 2 | Quebrar Gemini | planned | `services/gemini/` criado com facade estavel | `start-of-sprint-2` | `services/geminiService.ts`, `services/gemini/*` |
| 3 | Extrair chat do App | planned | `features/chat/` ativo; `App.tsx` reduzido | `start-of-sprint-3` | `App.tsx`, `features/chat/*` |
| 4 | Extrair dossie do App | planned | `features/dossier/` ativo; waterfall fora do App | `start-of-sprint-4` | `App.tsx`, `features/dossier/*` |
| 5 | Modularizar ChatInterface | planned | `components/chat/` ativo com facade em `ChatInterface.tsx` | `start-of-sprint-5` | `components/ChatInterface.tsx`, `components/chat/*` |
| 6 | Dividir megaPrompts | planned | `prompts/mega/` criado; `@ts-nocheck` removido | `start-of-sprint-6` | `prompts/megaPrompts.ts`, `prompts/mega/*` |
| 7 | Constantes e legado | planned | `hooks/useChat.ts` removido; `constants.ts` reduzido | `start-of-sprint-7` | `constants.ts`, `hooks/useChat.ts`, `services/apiConfig.ts` |
| 8 | War Room e docs finais | planned | `services/war-room/` ativo e docs consolidadas | `start-of-sprint-8` | `services/warRoomService.ts`, `docs/ai-context/*` |
