# Active Context

Last updated: 2026-04-28

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current refactor phase

Fase 1 (Sprints 1-8) esta concluida em `main`.

- Sprint 8 mergeada via PR `#241` (`ccd2001518367961637b1a9488c2319aa83d0a21`)
- `services/war-room/*` ativo com fachada publica preservada em `services/warRoomService.ts`
- `features/radar/*` oficializado como boundary inicial (stub)

Fase 2 (manutenibilidade) foi aberta de forma documental:

- `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
- Sprint 9-12 definidas como trilha curta de reducao de acoplamento

## Current task context

Validacao local e alinhamento da PR `#243` (`fix/cnpj-proxy-fallback`):

- checkout local sincronizado com a cabeca da PR no GitHub:
  - branch: `fix/cnpj-proxy-fallback`
  - head: `f059ff28e284accb0c2ca68c834b4992f9cfdcdd`
- `origin/main` estava em `d2649a67cb79f4a57d46b8db3e48744d8d3147dd` no momento da investigacao
- escopo mantido so na PR `#243`, sem expandir para `components/CRMDetail.tsx`
- validacao local correta do proxy CNPJ aconteceu em `vercel dev`, ligado ao projeto `scoutagro`
- resultados confirmados em `2026-04-28`:
  - `GET /api/cnpj?cnpj=04252011000110` -> `200` com `companyName`, `city`, `state`, `cnae` e `cnaeDescricao`
  - `GET /api/cnpj?cnpj=11111111111111` -> `400` com erro de CNPJ invalido
  - `GET /api/comex?cnpj=04252011000110` -> `200`
  - `npm exec vitest run tests/services/brasilApiService.test.ts` -> green
  - `npm exec vitest run tests/components/EmptyStateHome.test.tsx` -> green
- segunda rodada em `2026-04-28` adicionou instrumentacao para debug do preview:
  - `services/brasilApiService.ts` agora preserva `error/detail` de respostas HTTP nao-OK
  - o cliente loga endpoint resolvido, sucesso e falha via `scoutDiag`
  - `api/cnpj.ts` agora loga request start/success/not-found/error no runtime serverless
  - `components/EmptyStateHome.tsx` mostra orientacao explicita para `localhost` sem proxy em vez de mascarar como indisponibilidade generica
- observacao importante:
  - `npm run dev` / `vite` puro nao valida `api/cnpj.ts` neste repo; `/api/cnpj` cai no HTML da app sem proxy dedicado
  - para esse caso, o cliente agora mostra: `Ambiente local sem proxy para consulta de CNPJ. Rode via vercel dev ou configure o proxy.`
- risco residual fora de escopo desta passada:
  - `components/CRMDetail.tsx` continua chamando `https://brasilapi.com.br/api/cnpj/v1/*` diretamente

## Immediate next step

1. Reproduzir o bug no browser somente em runtime serverless (`vercel dev` ou deploy), nao em `vite` puro.
2. No preview da PR, abrir o console do browser e conferir os logs `🦅 [Scout360][CnpjLookup]` junto com os logs de `api/cnpj.ts` na Vercel.
3. Avaliar em outra passada se o fix do proxy deve ser expandido para `components/CRMDetail.tsx`.
